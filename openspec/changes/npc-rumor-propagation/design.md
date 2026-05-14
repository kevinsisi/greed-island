## Context

NPCs currently interact via `NPC_INTERACT` commands and accumulate memory in `SqliteNpcMemoryStore`. The runtime's `runTick()` loop already fans out accepted events into multiple projections (e.g. `PredatorHungerProjection`). The AI dialog prompt builder receives NPC state but has no awareness of what the NPC has overheard or been told. Phase 3 Slice 1 grafts a rumor layer onto the existing Command/Event pipeline without breaking deterministic replay.

Relevant existing components:
- `packages/server/src/kernel/npcMemory.ts` — `SqliteNpcMemoryStore`, `NpcMemoryType` enum
- `packages/server/src/sim/runtime.ts` — fan-out loops projecting accepted events; `runTick()` cadence
- `packages/server/src/projections/predatorHunger.ts` — pattern to follow for new projection
- `NPC_INTERACT` — existing command/event for NPC-to-NPC conversation

## Goals / Non-Goals

**Goals:**
- Rumors created from world events (ecosystem deaths, construction completions) reach nearby NPCs through the Command/Event pipeline
- Rumors spread NPC-to-NPC during `NPC_INTERACT`, with accuracy decreasing per hop
- A `RumorProjection` (in-memory, replay-safe) tracks each NPC's active rumors
- AI dialog prompt receives the NPC's rumors so generated lines can reference them
- `NPC_RUMOR_SPREAD` accepted events produce `event`-type NPC memory entries

**Non-Goals:**
- Player-sourced rumors or player-injected misinformation
- Rumor verification, dispute, or correction mechanics
- Cross-tile rumor seeding radius (V1: same tile only)
- Persistent rumor storage beyond in-memory projection + EventLog replay
- Rumor UI beyond GM `/admin/world` inspection

## Decisions

### 1. Commands and events follow the existing pipeline
`NPC_RUMOR_HEARD` and `NPC_RUMOR_SPREAD` are full commands emitted by the runtime and accepted by the rule engine — not direct state mutations. This preserves deterministic replay: replaying the EventLog from tick 0 always reconstructs identical rumor state.

**Alternative considered**: Write directly to `SqliteNpcMemoryStore` in the runtime. Rejected because it bypasses the EventLog and breaks replay determinism.

### 2. RumorProjection is in-memory (same pattern as PredatorHungerProjection)
`Map<string, RumorRow[]>` keyed by `npcId`. Rebuilt from EventLog on boot via `rebuildFromEvents`. No SQLite table required — EventLog is the source of truth.

**Alternative considered**: Persist to a `rumors` SQLite table. Rejected because projection data is derivable from events; adding a second truth source risks drift.

### 3. Accuracy represented as an integer (0–100)
Each spread step multiplies accuracy by a fixed factor (`RUMOR_ACCURACY_DECAY = 85`, applied as `Math.round(accuracy * 85 / 100)`). Rumors with `accuracy < 10` are treated as expired and excluded from `getActiveRumors()`.

**Why integer**: Avoids float rounding drift across spread hops; easier to assert in tests.

### 4. Seeder fires in the accepted-event fan-out loop
The rumor seeder is not a separate tick process — it reacts to accepted events already flowing through the fan-out loop in `runTick()`. When `ANIMAL_STARVED` or `SETTLEMENT_CONSTRUCTION_COMPLETED` is accepted, the seeder checks which NPCs are on the same tile and enqueues `NPC_RUMOR_HEARD` commands for them.

**Why not cadence-gated**: Rumors should be timely. Seeding in the fan-out ensures the rumor appears in the same tick the event occurred.

### 5. At most one rumor transferred per NPC_INTERACT
When the `NPC_INTERACT` planner detects that at least one participant has active rumors, it picks the single highest-accuracy rumor from the first participant and emits one `NPC_RUMOR_SPREAD`. This caps event volume and prevents exponential rumor proliferation.

### 6. NPC rumor cap: 5 active rumors per NPC
When `NPC_RUMOR_HEARD` or `NPC_RUMOR_SPREAD` would push an NPC above 5 active rumors, the oldest (by `heardAtTick`) is evicted from the projection. Eviction is handled by `RumorProjection.project()` without emitting an additional event — the projection simply drops the oldest entry.

## Risks / Trade-offs

- **EventLog growth**: Every seeded and spread rumor adds events. Mitigation: same-tile seeding only; 5-rumor NPC cap; minimum player-count gate (do not seed if tile has zero NPCs).
- **Boot replay cost**: `rebuildFromEvents` must scan all NPC_RUMOR_HEARD and NPC_RUMOR_SPREAD events at boot. For large worlds with many interactions over time, this scales linearly with EventLog length — acceptable for Phase 3.
- **Rumor content accuracy floor**: Accuracy degrades to zero eventually, but never becomes negative. The projection filters at `< 10`, so low-accuracy rumors disappear gracefully without a separate expiry command.
- **NPC_INTERACT spread coupling**: The interaction planner must know about rumors to emit `NPC_RUMOR_SPREAD`. This couples the planner to `RumorProjection`. Mitigation: pass `rumorProjection` as an argument to the planner function, keeping the dependency explicit.

## Migration Plan

No migration required. The new event types start accumulating from the current tick. Existing EventLog data is unaffected. On deploy:
1. New binary includes `RumorProjection` and rumor-aware fan-out.
2. Boot replay processes existing events; since no `NPC_RUMOR_HEARD`/`NPC_RUMOR_SPREAD` events exist yet, projection starts empty.
3. First cadence tick with an eligible event seeds the first rumors.

Rollback: revert binary; old binary ignores unknown event types in the fan-out (no-op).

## Open Questions

- Should rumors from `ANIMAL_KILLED` (prey death) also be seeded, or only `ANIMAL_STARVED` for V1?
- What is the NPC dialog prompt format for rumors — inline sentence or structured JSON block passed to the AI?

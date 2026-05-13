## Why

The simulation kernel and the living-world runtime already exist as separate ideas (kernel + tick loop), but in the current code path the runtime bypasses the Rule Engine: `SimulationRuntime` builds `EventDraft`s directly and appends them to `event_log`, with no Command intake, no rule validation, and no actor memory. That works for "narrative log of what the engine decided" but it does not deliver the user's vision of a **Living Deterministic World** where:

- The world is a single source of truth that any actor (player, NPC, system rule) can submit *intent* into.
- Actors only ever describe what they *want* to do; the Rule Engine is the only authority that turns intent into reality.
- NPCs *remember* past interactions and form *relationships* that change how they behave next time.
- "Emotional simulation" is a deterministic projection over the memory + relationship event streams, not a hand-tuned scalar.
- Any player can leave for a week, come back, and replay-derive a coherent "while you were gone" summary because every change is a committed Event with a tick number.
- Two servers given the same EventLog + same ruleset version + same world config produce identical WorldState (deterministic replay), even after thousands of NPC interactions and emotional shifts.

Today none of that holds. NPC moves, area-pressure events, weather changes, and building enter/leave deltas are emitted directly as `FACT_SET` events from the runtime; the Rule Engine only knows the generic `SET_FACT` command and never sees domain commands. NPCs have no memory beyond `lastActedTick`, and there is no relationship graph at all. Building this layer now keeps every later feature (AI dialog with persona drift, off-island summaries, faction power balance, quest system) on top of one append-only EventLog instead of five disconnected stores.

## What Changes

- Define a **Command catalog** for the living world (`NPC_MOVE`, `NPC_ACTIVITY_CHANGE`, `NPC_INTERACT`, `AREA_PRESSURE`, `WEATHER_CHANGE`, `SEASON_CHANGE`, `WORLD_EVENT_SPAWN`, `WORLD_EVENT_END`, `BUILDING_ENTER`, `BUILDING_LEAVE`, `RARE_WINDOW_OPEN`, `RARE_WINDOW_CLOSE`, `WORLD_TICK`) — each Command names a single intent, an actor, and a payload.
- Extend the **Rule Engine** to validate each domain Command and compile it into a typed Event with a deterministic key, a tick number, and a ruleset version. The current `SET_FACT` / `FACT_SET` path stays as a low-level escape hatch for state projection but world behavior MUST go through domain commands.
- Make the **EventLog the only write path**: `SimulationRuntime` collects Commands from NPC policy, area-state engine, world-rule generator, and building runtime, then submits them through `processCommand`. Direct `appendEvents` from runtime is removed.
- Add a **WorldState Projector** for living-world facets (NPC state, area state, building occupants, weather/season, active world events, rare windows) that derives from the event stream rather than from in-memory mutation.
- Add an **NPC Memory** projection: every accepted `NPC_INTERACT` and salient `NPC_*` event creates rows in `npc_memory` (npc_id, memory_type, content_json, tick, importance). NPC policies read recent + high-importance memories when deciding, so that an NPC who fought with another yesterday is more likely to argue today.
- Add an **NPC Relationships** projection: every accepted `NPC_INTERACT` updates `npc_relationships` (npc_a, npc_b, relationship_type, trust 0–100, history_json). Trust drifts up on `chat`, down on `argue`; relationship_type promotes/demotes on threshold cross.
- Add an **emotional simulation derivation**: per-NPC `attachment / tension / trust / loss` is a pure function of memory + relationship rows + recent area pressure, computed on demand from the projections — not stored as a separate hand-edited scalar.
- Add an **offline catch-up summary** endpoint that, given a player id and a `since_tick`, replays the EventLog window and produces a deterministic "while you were gone" summary grouped by area, NPC, and faction.
- Add a **deterministic replay validation** test that takes a fixture EventLog, replays it through the projector, and asserts identical WorldState + identical NPC memory + identical NPC relationship rows. This is the contract that prevents silent drift.

## Capabilities

### New Capabilities
- `living-deterministic-world`: Domain Command catalog, Rule Engine extensions, NPC Memory projection, NPC Relationships projection, emotional simulation derivation, offline catch-up summary, deterministic replay validation across the full living-world surface.

### Modified Capabilities
- `simulation-kernel`: Rule Engine accepts a registered set of domain commands; existing `SET_FACT` behavior is unchanged.
- `living-world-runtime`: Runtime emits Commands (not Events) for NPC, area, building, weather, season, world-event, and rare-window changes; `AdvanceTick` resolves them through the Rule Engine.

## Impact

- Backend: new SQLite tables `npc_memory` and `npc_relationships`; new domain command modules; runtime refactored to a Command-collect → Rule-Engine-validate → Event-commit loop.
- Frontend: `/api/world/snapshot` payload gains optional `npcMemory` and `npcRelationships` slices for NPC profile / relationship debug views; existing fields keep their shape.
- Operational: bump app version to v0.11.0, push image, redeploy on the desktop host so the Tailscale-only endpoint reflects the new schema. The new tables are created additively by `initializeKernelSchema`, so existing dev databases keep working — the projections are rebuilt by replaying the existing EventLog on first boot.
- Non-goals for this change: full AI persona prompt that consumes memory/relationships (a later change will wire it), a relationship-aware quest system, multi-server distributed sequencer, or web UI for relationship graphs.

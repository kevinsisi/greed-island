## Why

`NPC_CHILD_BORN` events are recorded but children never become real NPC entities — they have no `presence` (tile/buildingId/activity), no `BeliefProjection`, no `IntentProjection`, no `RelationshipGraph`, no dialog availability. `runtime.getNpcs()` returns only the 50 base profiles loaded from config; born children remain abstract IDs inside `LifeExpansionState.households[].childIds`.

WORLD_CAPABILITIES.md §43.1 first criterion — 「當某個 NPC 死亡，後代會記得他」— **cannot be verified** because descendants do not exist as runtime entities capable of holding memories or speaking dialog. Animal ecosystems already work this way (`ANIMAL_REPRODUCED` produces real `Animal` entities) but the human population is asymmetric: human births fire events without spawning runtime entities. Without this gap closed, the civilization layer cannot generate cross-generational behavior, the population is frozen at config size, and the "world existed before them / survives without them" claim (§12.5.16) is hollow.

## What Changes

- Add `NPC_MATURED` event type: emitted when a born NPC reaches the maturity tick threshold (`NPC_MATURATION_TICKS`)
- Add `BornNpcsProjection`: derives a runtime `NpcProfile` for every matured born NPC from `NPC_CHILD_BORN` + `NPC_MATURED` events (deterministic personality + role + faction lean from `hashSeed(childId)`)
- Add `MaturationPlanner`: cadence-gated check (`MATURATION_CADENCE_TICKS`) that emits `NPC_MATURED` for born children past the maturity threshold whose parents are still alive
- Extend `NpcEngine` API: `registerDynamicNpc(profile)` method to admit matured NPCs into the cognition runtime alongside config-loaded profiles
- Extend `SimulationRuntime.getNpcs()`: include matured born NPCs alongside the base profile list; expose `getAllProfiles()` for downstream consumers
- Wire matured NPCs into existing projections: `NpcStateProjection`, `BeliefProjection`, `IntentProjection`, `npc_memory`, `npc_relationships` — all receive the new id on `NPC_MATURED`
- Extend boot hydration: `BORN_NPC_BOOT_EVENT_TYPES = ['NPC_CHILD_BORN', 'NPC_MATURED']` — restores matured NPC roster from EventLog after restart
- Replace the hardcoded `nameZh: '潮生'` child name in `planHouseholdCommands` with deterministic name generation seeded by `childId` (avoids 100 identical-named children)
- Chronicle narration for `NPC_MATURED`: "{childName} 在 {tileName} 長成獨立的人。"
- **BREAKING**: `runtime.getNpcs()` now returns more rows than `runtime.getNpcIds()` did historically (snapshot consumers expecting fixed roster size must adapt)

## Capabilities

### New Capabilities

- `born-npc-maturation`: deterministic child-NPC maturation pipeline (`NPC_MATURED` event, `BornNpcsProjection`, `MaturationPlanner`), `NpcEngine.registerDynamicNpc`, boot hydration of dynamic NPCs, deterministic personality + role derivation
- `npc-naming`: deterministic child-name generation seeded by NPC id; replaces hardcoded `潮生`

### Modified Capabilities

- `npc-life-goals-and-expansion`: the `LifeExpansionState.households[].childIds` list now feeds the maturation planner; `withChildBorn` still records the event but matured children are projected by `BornNpcsProjection`, not by this state
- `npc-humanity-ai-memory`: dialog grounding extends to matured born NPCs — they now hold `npc_memory` rows and can be referenced by name in dialog context
- `gm-npc-dashboard`: `/admin/npcs` "自我誕生 NPC" stat reflects the matured roster (not 0) once children mature

## Impact

**Affected runtime modules:**
- `packages/server/src/sim/runtime.ts` — `getNpcs()`, boot hydration, fan-out, cadence block
- `packages/server/src/sim/npcEngine.ts` — `registerDynamicNpc` method, internal profile registry mutability
- `packages/server/src/kernel/livingWorldCommands.ts` — `NPC_MATURED` registration + validator
- `packages/server/src/config/world.ts` — `NPC_MATURATION_TICKS`, `MATURATION_CADENCE_TICKS` constants
- `packages/server/src/sim/lifeExpansion.ts` — kept unchanged (still records households + births)
- All NPC-touching projections — receive matured NPC ids without code changes (event-sourced)

**Affected APIs:**
- `GET /api/world/state` — `npcs[]` array grows over time
- `GET /admin/npc-stats` — `byOrigin.born` count now reflects matured NPCs

**Affected docs:**
- WORLD_CAPABILITIES.md §27 — add "Born NPC entity runtime ✅" line
- WORLD_CAPABILITIES.md §43.1 — first criterion verification path now closeable
- PROGRESS.md handoff entry

**Performance:**
- Long-running worlds will accumulate NPCs slowly (current cadence ~90 ticks per family → ~1 birth per ~4 in-game days per household). The simulation budget gate (`MAX_COMMANDS_PER_TICK_HARD_CAP`) already protects per-tick load; the partition system handles the larger roster.

**Non-goals (out of scope):**
- Multi-dimensional NPC↔NPC emotional relationships (separate OpenSpec change)
- Pregnancy state / gestation period (separate OpenSpec change)
- Inheritance of skills / wealth from parents to matured children (separate)
- Child NPCs being visible as "minors" before maturation (children remain abstract in `LifeExpansionState` until matured)
- Player-triggered NPC creation

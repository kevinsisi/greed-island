## Context

Phase E2 established civilization→ecosystem feedback (pressure, extinction, fishery collapse). Animal types already carry optional `ownerSettlementId` and `domesticatedBy` fields on the `Animal` row, and the `Species` type already defines `category: 'livestock'`. No livestock species exists in the catalog yet and no `LivestockRegistryProjection` exists.

Domestication must follow the same Command→Rule Engine→Event→Projection pipeline as every other state change. Pure planners emit intents; the runtime submits them as commands; Rule Engine validates; Events are the facts.

## Goals / Non-Goals

**Goals:**
- Add `marsh_yak` as first domesticable livestock species.
- Commands: `ANIMAL_DOMESTICATED`, `LIVESTOCK_BRED`, `MOUNT_ASSIGNED`, `LIVESTOCK_SLAUGHTERED`.
- `LivestockRegistryProjection` — per-settlement count of owned animals by role (livestock / mount).
- `DomesticationPlanner` — emits domestication intents when wild population ≥ threshold and ranch capacity allows.
- `BreedingPlanner` — emits breed intents at cadence when settlement holds ≥ 2 same-species animals.
- `SlaughterPlanner` — emits slaughter intents when livestock count exceeds ranch capacity.
- `MountPlanner` — emits mount-assign intents when unmounted carrier NPC + mountable animal coexist at same settlement.
- Ranch building added to construction catalog; capacity drives max livestock.
- Domesticated animals excluded from wild population counts and predation targets.
- Mount status wired into a travel-speed modifier (NPC logistics).
- Admin UI section and chronicle narration.

**Non-Goals:**
- No animal combat for livestock (Phase 5 / E4 scope).
- No player-driven domestication commands (Phase 6).
- No multi-species ranch buildings (first ranch supports `marsh_yak` only).
- No goods-chain processing (milk→cheese, wool→cloth) — raw byproducts only in this phase.

## Decisions

**Planner architecture (pure functions returning intents)**
Same pattern as `extinctionPlanner`, `pressurePlanner`, `fishery.ts`. Each planner is a pure function that receives projected state and returns typed intents; runtime submits as commands. This keeps planners unit-testable without runtime state.

**Domestication condition: proximity + population threshold**
`DomesticationPlanner` considers only animals on the same tile as the settlement (not adjacent). Threshold: wild population of the species on that tile ≥ `DOMESTICATION_MIN_WILD_POP` (constant, default 5). Ranch capacity check: current livestock count < `ranchCapacity` of the settlement. Emits one `ANIMAL_DOMESTICATED` intent per cadence at most.

**Breeding rate: cadence-based, not event-driven**
`BreedingPlanner` runs on `BREEDING_CADENCE_TICKS`. If settlement has ≥ 2 adults of the same species, emits `LIVESTOCK_BRED`. One new animal per cycle (single offspring model keeps population growth controllable).

**Slaughter threshold: ranch capacity overflow**
`SlaughterPlanner` triggers when `livestockCount > ranchCapacity`. It emits `LIVESTOCK_SLAUGHTERED` + corresponding `GOODS_EXTRACTED` events (meat + hide byproducts from species definition). Slaughter is deterministic — oldest animal first.

**Mount assignment: greedy single pass**
`MountPlanner` assigns one mount per unmounted NPC carrier at most. Mount eligibility: `ownerSettlementId` matches the settlement, animal is not yet a mount (`mountedBy === null`). Emits `MOUNT_ASSIGNED` linking animal id to NPC id.

**Travel speed modifier**
When an NPC has `mountedAnimalId`, the runtime looks up the animal's species and applies a `mountSpeedMultiplier` (default 1.5×). This is a read-only projection lookup at travel-time, not a new event.

**Ranch as a building type**
Ranch is added to the existing CivEvo construction catalog (`buildingTypes.ts` or equivalent). Construction follows the standard `BUILDING_COMPLETED` path. Ranch capacity: first-tier ranch = 8 livestock.

**Boot hydration**
`LivestockRegistryProjection` added to `ECOSYSTEM_BOOT_EVENT_TYPES` (same pattern as Phase E2). Both small-log (all events) and large-log else-branch get the new projection wired in.

**Excluding domesticated animals from wild counts**
`AnimalPopulationProjection` already tracks `ownerSettlementId`. Spawning and predation planners receive a `isWild` filter: `ownerSettlementId === null`. No schema change needed — filter is applied in planner input preparation, not the projection itself.

## Risks / Trade-offs

- **Population double-counting** — If domesticated animals aren't excluded from wild counts, extinction warnings can fire prematurely. Mitigation: filter at planner input site, add test asserting domesticated animals are excluded.
- **Ranch capacity mismatch** — If a ranch is destroyed, livestock count may exceed capacity permanently. Mitigation: `SlaughterPlanner` runs on every cadence; it re-evaluates capacity after each structural event.
- **Mount persistence across restarts** — Mount assignment is stored as event (`MOUNT_ASSIGNED`); projection rebuilds correctly from replay. No stale mounts.
- **First-species coupling** — `marsh_yak` is the only livestock species. Planner logic must be species-agnostic (loop all livestock-category species) so future species require only catalog addition.

## Why

Civilization has learned to exploit wild ecosystems (Phase E2) but not yet harness them. Phase E3 closes the loop: settlements domesticate herbivores into livestock, breed them for goods output, and assign trained animals as mounts — making animal populations an active economic input rather than a passive harvest target.

## What Changes

- Add `marsh_yak` as the first **livestock** species to SPECIES_CATALOG (domesticable herbivore of `t_salt_marsh`).
- Introduce four new commands: `ANIMAL_DOMESTICATED`, `LIVESTOCK_BRED`, `MOUNT_ASSIGNED`, `LIVESTOCK_SLAUGHTERED`.
- Add `LivestockRegistryProjection` per settlement: tracks owned animals, their role (livestock / mount), age/yield state.
- Add `DomesticationPlanner` — pure function that scans wild animal population near a settlement and emits domestication intents when conditions are met (low pressure, sufficient population, settlement has ranch capacity).
- Add `BreedingPlanner` — pure function that emits LIVESTOCK_BRED intents at cadence intervals when a settlement holds ≥ 2 breeding-age animals of same species.
- Add `SlaughterPlanner` — pure function that emits LIVESTOCK_SLAUGHTERED when livestock count exceeds ranch capacity, producing `GOODS_EXTRACTED` for meat/hide byproducts.
- Add `MountPlanner` — pure function that emits MOUNT_ASSIGNED when a settlement has a domesticated animal eligible for mounting and an NPC carrier/traveler without a mount.
- Wire mount status into NPC travel speed (logistics capacity modifier) via `NpcTravelProjection` query path.
- Add **Ranch** building type to the CivEvo construction catalog; ranch capacity governs max livestock count per settlement.
- Chronicle narration for domestication and slaughter events.
- Admin UI: "馴養登記" section showing livestock registry per settlement.

## Capabilities

### New Capabilities

- `ecosystem-domestication`: Domestication commands, planners, livestock registry projection, breeding/slaughter lifecycle, mount assignment, and ranch building type.

### Modified Capabilities

- `ecosystem-runtime`: Animal spawning and population rules must exclude already-domesticated animals (`ownerSettlementId != null`) from wild population counts and predation targets.
- `living-world`: Four new command types and their payload shapes.

## Impact

- `packages/server/src/ecosystem/species.ts` — add `marsh_yak` livestock species
- `packages/server/src/ecosystem/domesticationPlanner.ts` — new pure planner
- `packages/server/src/ecosystem/breedingPlanner.ts` — new pure planner
- `packages/server/src/ecosystem/slaughterPlanner.ts` — new pure planner
- `packages/server/src/ecosystem/mountPlanner.ts` — new pure planner
- `packages/server/src/projections/livestockRegistry.ts` — new projection
- `packages/server/src/kernel/livingWorldCommands.ts` — 4 new command payload types
- `packages/server/src/sim/runtime.ts` — E3 cadence block, boot hydration, mount modifier hook
- `packages/server/src/ecosystem/animalSpawning.ts` / `predation.ts` — exclude domesticated animals
- `packages/server/src/kernel/chronicleRenderer.ts` — narration for new events
- `packages/web/src/pages/AdminWorldPage.tsx` — "馴養登記" UI section

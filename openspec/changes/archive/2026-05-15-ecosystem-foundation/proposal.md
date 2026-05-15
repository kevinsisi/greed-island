## Why

`docs/WORLD_CAPABILITIES.md` makes the dependency rule explicit: Phase E0 must
land before Phase 2 goods/logistics/market, otherwise civilization metabolism
is fake. Right now Layer 2.5 is still 0% implemented — there is no species
catalog, no animal entity type, and no ecosystem lookup surface in code.

The smallest honest first slice is E0.1: define the initial species catalog and
the `Animal` domain type so future wildlife, fishery, migration, and hunting
work has a canonical substrate.

## What Changes

- Add `packages/server/src/ecosystem/species.ts` with the initial 22-species
  catalog from `docs/WORLD_CAPABILITIES.md` §6.4.
- Define the base Layer 2.5 domain types:
  - `Species`
  - `Animal`
  - supporting enums/unions for category, region, activity window, pack
    behavior, rarity, lifecycle stage, and animal state.
- Add read-only lookup helpers:
  - `listSpecies()`
  - `getSpecies(id)`
  - `requireSpecies(id)`
  - `listSpeciesByRegion(region)`
  - `listSpeciesByCategory(category)`

## Impact

- Server-only additive groundwork for Phase E0.
- No commands, no reducers, no runtime tick behavior yet. `ANIMAL_SPAWNED` and
  `animal_population` projection remain E0.2.
- Establishes the canonical ids and metadata that later slices will use for:
  - wildlife spawning
  - predator/prey links
  - hunting/fishery
  - ecological narration grounding

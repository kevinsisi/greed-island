# Tasks — Ecosystem Simple Hunting (Phase E0.3)

## 1. Command Catalog

- [x] 1.1 Add `ANIMAL_HUNT_STARTED`, `ANIMAL_HUNT_RESOLVED`, `ANIMAL_KILLED`, `CARCASS_CREATED`, and `MEAT_HARVESTED` to `LIVING_WORLD_COMMAND_TYPES`.
- [x] 1.2 Add typed payloads and validators for all five commands.
- [x] 1.3 Add command catalog tests.

## 2. Hunting Policy

- [x] 2.1 Add deterministic simple hunting planner.
- [x] 2.2 Require hunter-role NPC and elevated food pressure.
- [x] 2.3 Choose same-tile edible prey from `animal_population`.
- [x] 2.4 Derive stable hunt id and carcass id from canonical hashes.

## 3. Projections + State Reduction

- [x] 3.1 Extend `AnimalPopulationProjection` so `ANIMAL_KILLED` removes one animal id.
- [x] 3.2 Add replay/canonical-hash tests covering spawn then kill.
- [x] 3.3 Add `withMeatHarvestedRecorded` to credit NPC civic gold from accepted `MEAT_HARVESTED`.

## 4. Runtime Integration

- [x] 4.1 Runtime plans simple hunting from hunter productive actions.
- [x] 4.2 Accepted `MEAT_HARVESTED` updates `LifeExpansionState` and persists the life expansion fact.
- [x] 4.3 Accepted `ANIMAL_KILLED` fans out to `AnimalPopulationProjection`.

## 5. Verification

- [x] 5.1 Focused tests pass: `npm run test -w @greed-island/server -- ecosystem/hunting projections/animalPopulation kernel/livingWorld sim/cityLife` (75 tests).
- [x] 5.2 `npm test` passes (292 server + 34 web tests).
- [x] 5.3 `npm run build:server` and `npm run build:web` pass (web only known Vite chunk-size warning).
- [x] 5.4 `npx openspec validate ecosystem-simple-hunting --strict` passes.
- [x] 5.5 `npx openspec validate --all --strict` passes (22 passed, 0 failed).
- [x] 5.6 Commit `1e2c188`, push, verify CI `25797518715` + Deploy Dev `25797518707`, and update handoff docs.

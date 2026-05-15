# Tasks — Ecosystem Animal Spawning (Phase E0.2)

## 1. Command Catalog

- [x] 1.1 Add `ANIMAL_SPAWNED` to `LIVING_WORLD_COMMAND_TYPES`.
- [x] 1.2 Add `AnimalSpawnedCmd` payload type carrying an `Animal` and `spawnedAtTick`.
- [x] 1.3 Add Rule Engine validation for `ANIMAL_SPAWNED`.
- [x] 1.4 Keep `ANIMAL_SPAWNED` out of public narrative/SSE surfaces.

## 2. Spawn Policy

- [x] 2.1 Add deterministic tile-to-ecosystem-region mapping.
- [x] 2.2 Add fixed-cadence active-tile throttling.
- [x] 2.3 Select spawn species and animal position from canonical hashes.
- [x] 2.4 Skip undocumented generic `water`/`grass` regions and legendary species.

## 3. Projection

- [x] 3.1 Add `packages/server/src/projections/animalPopulation.ts`.
- [x] 3.2 Project `ANIMAL_SPAWNED` into rows keyed by `(speciesId, tileId)`.
- [x] 3.3 Add rebuild + incremental projection APIs.
- [x] 3.4 Add canonical-hash replay test.

## 4. Runtime Integration

- [x] 4.1 Rebuild `AnimalPopulationProjection` on boot from EventLog.
- [x] 4.2 Runtime plans spawn commands each cadence using current population caps.
- [x] 4.3 Accepted spawn events fan out to the projection.
- [x] 4.4 `WorldSnapshot.facts.animalPopulation` exposes current rows.

## 5. Verification

- [x] 5.1 `npm run test -w @greed-island/server -- ecosystem/animalSpawning projections/animalPopulation kernel/livingWorld sim/runtimeAnimalSpawning` passes (49 tests).
- [x] 5.2 `npm run build:server` passes.
- [x] 5.3 `npx openspec validate ecosystem-animal-spawning --strict` passes.
- [x] 5.4 `npx openspec validate --all --strict` passes (21 passed, 0 failed).
- [x] 5.5 `npm test` passes (287 server + 34 web tests); `npm run build:web` passes with the known Vite chunk-size warning.

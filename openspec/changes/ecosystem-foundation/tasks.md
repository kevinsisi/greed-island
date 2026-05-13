## 1. Species Catalog

- [x] 1.1 Create `packages/server/src/ecosystem/species.ts`.
- [x] 1.2 Define `EcosystemRegionId`, `SpeciesCategory`, `SpeciesDietType`, `SpeciesPackBehavior`, `SpeciesActivityWindow`, `SpeciesMigrationPattern`, `SpeciesRarity`.
- [x] 1.3 Encode the 22 initial species from `docs/WORLD_CAPABILITIES.md` §6.4 with stable ids and region/biome affinity.

## 2. Animal Domain Model

- [x] 2.1 Define `AnimalLifecycleStage`, `AnimalState`, and `Animal` type matching the Phase E0 substrate in `docs/WORLD_CAPABILITIES.md` §6.3.
- [x] 2.2 Keep the domain read-only and additive; no runtime engine or commands in this slice.

## 3. Lookup Helpers + Tests

- [x] 3.1 Add `listSpecies()`, `getSpecies(id)`, `requireSpecies(id)`, `listSpeciesByRegion(region)`, `listSpeciesByCategory(category)`.
- [x] 3.2 Add focused tests covering unique ids, expected per-region counts, lookup-by-id, category filtering, and immutable canonical order.

## 4. Verification

- [x] 4.1 `npm run test -w @greed-island/server -- ecosystem/species` passes.
- [x] 4.2 `npm test` passes.
- [x] 4.3 `npm run build:server` and `npx tsc -p packages/server/tsconfig.json --noEmit` pass.
- [x] 4.4 `npx openspec validate ecosystem-foundation --strict` and `npx openspec validate --all --strict` pass.
- [ ] 4.5 Update `PROGRESS.md` / `ROADMAP.md`, commit, push, and verify CI + Deploy Dev.

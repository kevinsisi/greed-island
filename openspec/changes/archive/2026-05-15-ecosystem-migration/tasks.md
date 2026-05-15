## 1. Config + Command/Event Primitives

- [x] 1.1 Add `ECOSYSTEM_MIGRATION_PRESSURE_THRESHOLD = 0.8` constant to `packages/server/src/config/world.ts`
- [x] 1.2 Add `ANIMAL_MIGRATED` command and event type with payload `{ animalId, speciesId, fromTileId, toTileId, migratedAtTick, migrationType, waveId }` and validator to `packages/server/src/kernel/livingWorldCommands.ts`
- [x] 1.3 Add `MIGRATION_WAVE_STARTED` command and event type with payload `{ waveId, speciesId, fromTileId, toTileId, startedAtTick, migrationType }` and validator (reject invalid `migrationType`, reject `fromTileId === toTileId`)

## 2. Migration Planner

- [x] 2.1 Create `packages/server/src/ecosystem/migration.ts` with `planAnimalMigration(input)` returning `AnimalMigrationPlan | null`
- [x] 2.2 Implement cadence gate: return null when `tick % ECOSYSTEM_REPRODUCTION_CADENCE_TICKS !== 0`
- [x] 2.3 Implement pressure candidates: species with `migrationPattern = 'pressure'` where `count / capacity >= ECOSYSTEM_MIGRATION_PRESSURE_THRESHOLD`
- [x] 2.4 Implement seasonal candidates: species with `migrationPattern = 'seasonal'` where an eligible destination exists (no occupancy threshold required)
- [x] 2.5 Skip `migrationPattern = 'none'` and `'event_driven'` species entirely
- [x] 2.6 Implement destination selection: adjacent ecosystem tiles via `getMapAdjacency`, capacity check, biome-affinity preference, deterministic hash tiebreak
- [x] 2.7 Derive `waveId` from `hashCanonicalJson({scheme:'migration-wave.v1', speciesId, fromTileId, toTileId, startedAtTick: tick})`
- [x] 2.8 Select `animalId` deterministically from source tile's sorted animal id list using canonical hash

## 3. Projections

- [x] 3.1 Extend `AnimalPopulationProjection.project()` to handle `ANIMAL_MIGRATED`: remove `animalId` from `fromTileId` row, upsert on `toTileId` row with `biomeRegion` from `ecosystemRegionForTile`
- [x] 3.2 Create `packages/server/src/projections/animalMigration.ts` with `AnimalMigrationProjection` class: `rebuildFromEvents`, `project`, `list`, `canonicalHash`
- [x] 3.3 `AnimalMigrationProjection.project(MIGRATION_WAVE_STARTED)` creates wave row with `count = 0` (first-write-wins)
- [x] 3.4 `AnimalMigrationProjection.project(ANIMAL_MIGRATED)` increments wave row `count`

## 4. Runtime Integration

- [x] 4.1 Import `AnimalMigrationProjection` in `packages/server/src/sim/runtime.ts`; hydrate on boot from EventLog
- [x] 4.2 In `runTick()`: call `planAnimalMigration` with current population snapshot; if plan is non-null, push `MIGRATION_WAVE_STARTED` command then `ANIMAL_MIGRATED` command through the Rule Engine
- [x] 4.3 In accepted-event fan-out: project accepted `MIGRATION_WAVE_STARTED` and `ANIMAL_MIGRATED` events into both `animalPopulation` and `animalMigration` projections
- [x] 4.4 Suppress `ANIMAL_MIGRATED` and `MIGRATION_WAVE_STARTED` from public recent-event list and SSE narrative surfaces

## 5. Snapshot + API

- [x] 5.1 Add `migrationRoutes` to `WorldSnapshot.facts` type in `packages/server/src/sim/snapshot.ts`
- [x] 5.2 Populate `facts.migrationRoutes` from `animalMigrationProjection.list()` in the snapshot builder
- [x] 5.3 Update `/admin/world` page to render migration wave rows (speciesId, fromTile, toTile, type, count, startedAtTick), labeled as Phase E1.3 abstract migration

## 6. Tests

- [x] 6.1 `packages/server/src/ecosystem/migration.test.ts`: cadence gate, pressure threshold, seasonal no-threshold, no-migrate for `'none'`/`'event_driven'`, destination biome preference, determinism across two calls
- [x] 6.2 `packages/server/src/projections/animalMigration.test.ts`: wave created on `MIGRATION_WAVE_STARTED`, count increments on `ANIMAL_MIGRATED`, first-write-wins on duplicate wave, rebuild/canonical-hash
- [x] 6.3 `packages/server/src/projections/animalPopulation.test.ts`: extend with `ANIMAL_MIGRATED` cases (animal moves tile, source row shrinks, destination row grows, replay canonical-hash)
- [x] 6.4 `packages/server/src/sim/runtimeMigration.test.ts`: runtime emits `MIGRATION_WAVE_STARTED` + `ANIMAL_MIGRATED` at cadence tick; neither appears in public recent events; `facts.migrationRoutes` populated

## 7. Documentation + Spec Verification

- [x] 7.1 Run focused tests: `npm run test -w @greed-island/server -- ecosystem/migration projections/animalMigration projections/animalPopulation sim/runtimeMigration kernel/livingWorld`
- [x] 7.2 Run `npm run build:server` and `npm run build:web`
- [x] 7.3 Run full `npm test` and confirm counts
- [x] 7.4 Run `npx openspec validate ecosystem-migration --strict`
- [x] 7.5 Run `npx openspec validate --all --strict`
- [x] 7.6 Update `PROGRESS.md` with implementation summary, honest scope, verification evidence
- [x] 7.7 Update `ROADMAP.md` with E1.3 slice entry
- [x] 7.8 Commit and push; confirm CI and Deploy Dev pass; verify live `/healthz` and `/api/world.facts.migrationRoutes`

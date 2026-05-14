## 1. Config Constant

- [x] 1.1 Add `PREDATOR_STARVATION_THRESHOLD_TICKS = 5 * ECOSYSTEM_REPRODUCTION_CADENCE_TICKS` constant to `packages/server/src/config/world.ts`
- [x] 1.2 ~~Add `ANIMAL_KILLED` command~~ — already exists in catalog and runtime (NPC hunting format, `killedByNpcId`); projection already handles it
- [x] 1.3 ~~Add `ANIMAL_DIED_STARVATION` command~~ — `ANIMAL_STARVED` already exists in catalog with correct payload `{ starvationId, predatorAnimalId, predatorSpeciesId, tileId, starvationStage, starvedAtTick }`; runtime already emits it (but projection does not handle it yet)

## 2. Projections

- [x] 2.1 Extend `AnimalPopulationProjection.project()` to handle `ANIMAL_KILLED`: remove `preyAnimalId` from `(preySpeciesId, tileId)` row; no-op if id absent — already handled; no change needed
- [x] 2.2 Extend `AnimalPopulationProjection.project()` to handle `ANIMAL_STARVED` (= `ANIMAL_DIED_STARVATION`): remove `predatorAnimalId` from `(predatorSpeciesId, tileId)` row; no-op if id absent
- [x] 2.3 Create `packages/server/src/projections/predatorHunger.ts` with `PredatorHungerProjection` class: `project(ANIMAL_KILLED)` sets `lastKillAtTick` for `(predatorSpeciesId, tileId)`; `getLastKillAtTick(speciesId, tileId)` returns `number | null`; `rebuildFromEvents`, `list`, `canonicalHash`

## 3. Runtime Integration

- [x] 3.1 Import `PredatorHungerProjection` in `packages/server/src/sim/runtime.ts`; hydrate on boot from EventLog
- [x] 3.2 In `runTick()` at cadence ticks: gate `ANIMAL_STARVED` on `hungerDuration >= PREDATOR_STARVATION_THRESHOLD_TICKS`; kill plan was already wired (emits `ANIMAL_KILLED`)
- [x] 3.3 In accepted-event fan-out: project accepted events into `predatorHunger` (both fan-out loops)
- [x] 3.4 `ANIMAL_KILLED` and `ANIMAL_STARVED` already suppressed from narrative surfaces (no change needed)

## 4. Snapshot + API

- [x] 4.1 Add `predatorHunger` to `WorldSnapshot.facts` type — facts is `Record<string, unknown>`, no separate snapshot.ts; key added inline
- [x] 4.2 Populate `facts.predatorHunger` from `predatorHungerProjection.list()` in the snapshot builder
- [x] 4.3 Update `/admin/world` page to render predator hunger rows (speciesId, tileId, lastKillAtTick), labeled as Phase E1.4 predator mortality

## 5. Tests

- [x] 5.1 `packages/server/src/projections/predatorHunger.test.ts`: `lastKillAtTick` set on `ANIMAL_KILLED`, unchanged on other events, rebuild/canonical-hash stability, `getLastKillAtTick` returns null for unknown key
- [x] 5.2 `packages/server/src/projections/animalPopulation.test.ts`: extend with `ANIMAL_STARVED` cases (predator id removed, predator row shrinks, no-op for unknown id, replay hash)
- [x] 5.3 `packages/server/src/sim/runtimePredation.test.ts`: runtime emits `ANIMAL_KILLED` when predator and prey share a tile; neither event in `getRecentEvents()`; `facts.predatorHunger` populated; starvation NOT emitted before threshold; starvation emitted at threshold and removes predator

## 6. Documentation + Spec Verification

- [x] 6.1 Run focused tests: `npm run test -w @greed-island/server -- ecosystem/predation projections/predatorHunger projections/animalPopulation sim/runtimePredation kernel/livingWorld`
- [x] 6.2 Run `npm run build:server` and `npm run build:web`
- [x] 6.3 Run full `npm test` and confirm counts
- [x] 6.4 Run `npx openspec validate predator-mortality --strict`
- [x] 6.5 Run `npx openspec validate --all --strict`
- [x] 6.6 Update `PROGRESS.md` with implementation summary, honest scope, verification evidence
- [x] 6.7 Update `ROADMAP.md` with E1.4 slice entry
- [ ] 6.8 Commit and push; confirm CI and Deploy Dev pass; verify live `/healthz` and `/api/world.facts.predatorHunger`

## Why

Predators exist in the world but never remove prey or die — the ecosystem has no population pressure from predation. `predation.ts` already plans kill and starvation decisions deterministically; wiring it into the Command/Event pipeline completes the predator–prey feedback loop and unblocks future starvation-driven migration and extinction warnings.

## What Changes

- Add `ANIMAL_KILLED` command and event: a predator kills one prey animal on the same tile.
- Add `ANIMAL_DIED_STARVATION` command and event: a predator animal dies after spending too many consecutive cadence ticks without prey on its tile.
- Extend `AnimalPopulationProjection` to handle both events (remove the dead animal id from the relevant row).
- Add `PredatorHungerProjection` tracking per `(speciesId, tileId)` when the last successful kill occurred; starvation only fires once the hunger threshold is exceeded.
- Add `PREDATOR_CADENCE_TICKS` and `PREDATOR_STARVATION_THRESHOLD_TICKS` constants to `config/world.ts`.
- Wire `planPredation` into `runTick()`: emit `ANIMAL_KILLED` on kill plans; check `PredatorHungerProjection` before emitting `ANIMAL_DIED_STARVATION` on starvation plans.
- Suppress both event types from public recent-event and chronicle surfaces.
- Expose `predatorHunger` rows in `WorldSnapshot.facts` and render them in `/admin/world`.

## Capabilities

### New Capabilities

- `predator-mortality`: kill–starvation cycle: predator kills prey on cadence tick; predator starves after `PREDATOR_STARVATION_THRESHOLD_TICKS` with no prey on tile.

### Modified Capabilities

- `living-deterministic-world`: adds `ANIMAL_KILLED` and `ANIMAL_DIED_STARVATION` to the event vocabulary; extends `AnimalPopulationProjection` replay contract.

## Impact

- `packages/server/src/config/world.ts` — two new constants
- `packages/server/src/kernel/livingWorldCommands.ts` — two new command/event type + validator entries
- `packages/server/src/ecosystem/predation.ts` — no logic change; used as-is
- `packages/server/src/projections/animalPopulation.ts` — handle `ANIMAL_KILLED` and `ANIMAL_DIED_STARVATION`
- `packages/server/src/projections/predatorHunger.ts` — new file
- `packages/server/src/sim/runtime.ts` — integration, fan-out, snapshot
- `packages/server/src/sim/snapshot.ts` — add `predatorHunger` to facts type
- `packages/web/src/pages/AdminWorldPage.tsx` — render predator hunger table
- New test files: `predatorHunger.test.ts`, `runtimePredation.test.ts`; extend `animalPopulation.test.ts`

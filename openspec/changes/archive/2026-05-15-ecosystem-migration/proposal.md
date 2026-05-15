# Proposal — Ecosystem Migration Engine (Phase E1.3)

## Why

Predation (E1.1) and reproduction/carrying capacity (E1.2) let populations fall and
rise on a single tile, but animals have no way to move when a tile becomes
overcrowded or under-pressured. Without migration, predator starvation cannot
become predator death or range expansion, and the ecosystem remains siloed
per tile instead of dynamically balanced across the map. This is the final
prerequisite for predator mortality in a later slice.

## What Changes

- Add `ANIMAL_MIGRATED` as a typed living-world command/event.
- Add `MIGRATION_WAVE_STARTED` as a typed living-world command/event.
- Add a deterministic migration planner (`packages/server/src/ecosystem/migration.ts`)
  driven by species `migrationPattern` (`'pressure'` | `'seasonal'`; `'none'` and
  `'event_driven'` are skipped in this slice).
- Update `AnimalPopulationProjection` to handle `ANIMAL_MIGRATED` — removes
  the animal id from the source tile row and upserts it on the destination tile row.
- Add `AnimalMigrationProjection` that tracks active/completed migration waves from
  `MIGRATION_WAVE_STARTED` events (`migration_routes` per §30.16).
- Wire runtime to plan at most one migration per cadence tick, emit
  `MIGRATION_WAVE_STARTED` + `ANIMAL_MIGRATED` through the Rule Engine only.
- Suppress routine migration events from public recent-event and chronicle surfaces.

## Capabilities

### New Capabilities

- `ecosystem-migration`: deterministic animal migration between adjacent ecosystem
  tiles, driven by population pressure and seasonal cadence, tracked through the
  `migration_routes` projection.

### Modified Capabilities

- `living-deterministic-world`: adds two new event types
  (`ANIMAL_MIGRATED`, `MIGRATION_WAVE_STARTED`) to the living-world command/event
  vocabulary.

## Impact

- `packages/server/src/ecosystem/migration.ts`: new migration planner.
- `packages/server/src/kernel/livingWorldCommands.ts`: add `ANIMAL_MIGRATED` and
  `MIGRATION_WAVE_STARTED` payload definitions and validators.
- `packages/server/src/projections/animalPopulation.ts`: handle `ANIMAL_MIGRATED`
  (move animal id between tile rows).
- `packages/server/src/projections/animalMigration.ts`: new `AnimalMigrationProjection`
  for `migration_routes` read model.
- `packages/server/src/sim/runtime.ts`: plan and emit migration through the Rule Engine,
  fan-out to both projections, suppress from public surfaces.
- `packages/server/src/sim/snapshot.ts` / `packages/server/src/routes/world.ts`:
  expose `WorldSnapshot.facts.migrationRoutes`.
- `/admin/world` admin page: render migration wave rows.
- `PROGRESS.md`, `ROADMAP.md`, and OpenSpec tasks document scope and verification.

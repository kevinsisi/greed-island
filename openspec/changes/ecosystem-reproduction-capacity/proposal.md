# Proposal — Ecosystem Reproduction + Carrying Capacity (Phase E1.2)

## Why

Predation now lets animal populations decrease for ecosystem reasons, but
populations can only recover through generic biome spawning. `docs/WORLD_CAPABILITIES.md`
Phase E1.2 requires species reproduction and carrying-capacity caps so local
wildlife populations can breathe deterministically.

## What Changes

- Add `ANIMAL_REPRODUCED` as a typed living-world command/event.
- Add a deterministic reproduction planner using `animal_population` rows,
  species `reproductionRate`, and existing per-tile carrying-capacity policy.
- Increase animal population from accepted `ANIMAL_REPRODUCED` facts through the
  `AnimalPopulationProjection`, not direct mutation.
- Wire runtime reproduction on a bounded cadence with at most one reproduction
  per tick.
- Keep this slice local and population-only; migration, extinction warnings,
  gestation, pair tracking, genetics, and predator starvation death remain later
  work.

## Capabilities

### New Capabilities

- `ecosystem-reproduction-capacity`: deterministic animal reproduction and
  carrying-capacity enforcement.

### Modified Capabilities

- None.

## Impact

- `packages/server/src/ecosystem/`: new reproduction policy/planner.
- `packages/server/src/kernel/livingWorldCommands.ts`: add `ANIMAL_REPRODUCED`
  payload and validation.
- `packages/server/src/projections/animalPopulation.ts`: project
  `ANIMAL_REPRODUCED` as a population-increasing animal fact.
- `packages/server/src/sim/runtime.ts`: emit reproduction through accepted Rule
  Engine commands and suppress routine reproduction events from public narrative.
- `PROGRESS.md`, `ROADMAP.md`, and OpenSpec tasks document the shipped scope and
  verification evidence.

# Proposal — Ecosystem Predation (Phase E1.1)

## Why

E0 animal spawning and simple NPC hunting made wildlife visible and consumable,
but animals still do not affect one another. `docs/WORLD_CAPABILITIES.md` Phase
E1.1 requires predator/prey pressure so local populations can begin changing for
ecosystem reasons instead of only NPC extraction.

## What Changes

- Add a deterministic predation planner that reads `animal_population` rows and
  species `preyTargets`.
- Resolve one same-tile predator-on-prey hunt per eligible tick, producing typed
  living-world events through the Rule Engine.
- Reuse `ANIMAL_KILLED` for prey removal so `animal_population` remains the
  authoritative population projection.
- Add `ANIMAL_STARVED` as a starvation-pressure event when a predator species has
  no same-tile prey available.
- Keep this slice same-tile only; migration, reproduction, predator death, and
  carrying-capacity balancing remain later E1 work.

## Capabilities

### New Capabilities

- `ecosystem-predation`: deterministic predator/prey hunt planning and
  starvation-pressure events.

### Modified Capabilities

- None.

## Impact

- `packages/server/src/ecosystem/`: new predation policy/planner.
- `packages/server/src/kernel/livingWorldCommands.ts`: add `ANIMAL_STARVED`
  payload and validation; widen `ANIMAL_KILLED` actor support for system
  predators if needed.
- `packages/server/src/projections/animalPopulation.ts`: continue projecting
  `ANIMAL_KILLED` as the single population-removal fact.
- `packages/server/src/sim/runtime.ts`: plan and emit predation commands through
  the Rule Engine during ticks.
- Public narrative filters may suppress routine predation/starvation events to
  avoid chronicle noise.

# Tasks — Ecosystem Predation (Phase E1.1)

## 1. Command Catalog

- [x] 1.1 Add `ANIMAL_STARVED` to `LIVING_WORLD_COMMAND_TYPES`.
- [x] 1.2 Add typed payload and validation for `ANIMAL_STARVED`.
- [x] 1.3 Add command catalog tests for accepted and rejected starvation payloads.

## 2. Predation Policy

- [x] 2.1 Add deterministic predation planner using `animal_population` rows and species `preyTargets`.
- [x] 2.2 Plan at most one same-tile predator/prey kill per tick with stable hunt and actor ids.
- [x] 2.3 Plan starvation pressure when a predator has no same-tile target prey.
- [x] 2.4 Add focused planner tests for prey selection, non-target species, and starvation pressure.

## 3. Runtime Integration

- [x] 3.1 Wire predation planning into the tick runtime after animal population projection is current.
- [x] 3.2 Emit `ANIMAL_HUNT_STARTED`, `ANIMAL_HUNT_RESOLVED`, `ANIMAL_KILLED`, and `ANIMAL_STARVED` only through accepted Rule Engine commands.
- [x] 3.3 Fan accepted events into existing projections without direct state mutation.
- [x] 3.4 Suppress routine predation/starvation facts from public narrative surfaces if they create chronicle noise.

## 4. Verification + Docs

- [x] 4.1 Validate `ecosystem-predation` and all OpenSpec changes in strict mode.
- [x] 4.2 Run focused server tests for predation, living-world commands, runtime, and animal population.
- [x] 4.3 Run full server/web tests and builds required by the repo.
- [x] 4.4 Update `PROGRESS.md`, `ROADMAP.md`, and task checkboxes with verification evidence.
- [ ] 4.5 Commit, push, verify CI/CD, and smoke live `/healthz` plus relevant `/api/world` facts.

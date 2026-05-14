# Tasks — Ecosystem Reproduction + Carrying Capacity (Phase E1.2)

## 1. Command Catalog

- [x] 1.1 Add `ANIMAL_REPRODUCED` to `LIVING_WORLD_COMMAND_TYPES`.
- [x] 1.2 Add typed payload and validation for `ANIMAL_REPRODUCED`.
- [x] 1.3 Add command catalog tests for accepted and rejected reproduction payloads.

## 2. Reproduction Policy

- [x] 2.1 Add deterministic reproduction planner using `animal_population`, `Species.reproductionRate`, and per-tile carrying capacity.
- [x] 2.2 Require at least two same-species animal ids and below-capacity population.
- [x] 2.3 Create stable newborn animal ids and parent id pairs from canonical hashes.
- [x] 2.4 Add focused planner tests for eligible reproduction, lone animal, and capacity cap.

## 3. Projection + Runtime Integration

- [x] 3.1 Extend `AnimalPopulationProjection` so `ANIMAL_REPRODUCED` adds newborn animal ids with replay safety.
- [x] 3.2 Wire reproduction planning into runtime on a bounded cadence with at most one accepted plan per tick.
- [x] 3.3 Emit `ANIMAL_REPRODUCED` only through accepted Rule Engine commands.
- [x] 3.4 Suppress routine reproduction facts from public narrative and chronicle surfaces.

## 4. Verification + Docs

- [x] 4.1 Validate `ecosystem-reproduction-capacity` and all OpenSpec changes in strict mode.
- [x] 4.2 Run focused server tests for reproduction, living-world commands, runtime, and animal population.
- [x] 4.3 Run full server/web tests and builds required by the repo.
- [x] 4.4 Update `PROGRESS.md`, `ROADMAP.md`, and task checkboxes with verification evidence.
- [ ] 4.5 Commit, push, verify CI/CD, and smoke live `/healthz` plus relevant `/api/world` facts.

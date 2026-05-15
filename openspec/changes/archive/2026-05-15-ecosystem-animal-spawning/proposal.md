# Proposal — Ecosystem Animal Spawning (Phase E0.2)

## Why

`docs/WORLD_CAPABILITIES.md` §34 defines E0.2 as the first runtime behavior for
Layer 2.5: `ANIMAL_SPAWNED`, deterministic per-biome spawning, and an
`animal_population` projection. E0.1 intentionally stopped at the species catalog
and `Animal` type, so the world still has no living wildlife in EventLog.

This slice turns the species substrate into replayable animal population state
without adding hunting, migration, reproduction, fishery depletion, or ecosystem
narration yet.

## What Changes

- Add `ANIMAL_SPAWNED` to the living-world command/event catalog.
- Add a deterministic spawn planner that:
  - evaluates only on a fixed cadence,
  - maps tiles to documented ecosystem regions,
  - skips tiles with no documented species region (`grass`, generic `water`),
  - evaluates one active tile per cadence tick to stay within the Phase 1 budget
    gate,
  - derives animal id and position from `hashSeed(speciesId, tileId, tick)`.
- Add `AnimalPopulationProjection` over typed `ANIMAL_SPAWNED` events, keyed by
  `(speciesId, tileId)` with replay + canonical hash coverage.
- Wire the runtime to emit spawn commands through the Rule Engine and expose the
  read projection on the world snapshot facts.

## Out Of Scope

- Hunting / fishery / carcass / goods extraction (`E0.3+`).
- Migration, predator-prey balancing, starvation, reproduction, extinction.
- Legendary/mythic emergence behavior such as `white_marsh_leviathan`.
- Public chronicle or SSE narration for routine spawn events.

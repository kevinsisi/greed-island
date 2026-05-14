# Design — Ecosystem Predation (Phase E1.1)

## Context

Wildlife currently enters the world through `ANIMAL_SPAWNED` and can be removed
by NPC simple hunting through `ANIMAL_KILLED`. Species already declare
`preyTargets`, and `animal_population` stores deterministic same-tile animal ids.
This slice uses those existing substrates to add animal-on-animal pressure while
preserving Command → Rule Engine → Event → Projection authority.

## Goals / Non-Goals

**Goals:**

- Plan deterministic same-tile predator hunts from existing population rows.
- Emit all predation facts as typed living-world events accepted by the Rule
  Engine.
- Remove prey through the existing `ANIMAL_KILLED` projection path.
- Record starvation pressure when predators have no same-tile prey.

**Non-Goals:**

- Migration, pathfinding, seasonal movement, or off-tile hunting.
- Reproduction, carrying capacity, or extinction balancing.
- Predator death from starvation.
- Meat/carcass/goods generation from animal-on-animal kills.

## Decisions

- Use a pure planner in `packages/server/src/ecosystem/` instead of embedding
  ranking logic directly in runtime. This keeps deterministic selection testable
  and consistent with `animalSpawning.ts` and `hunting.ts`.
- Treat predation as system-authored ecosystem activity. `ANIMAL_KILLED` remains
  the population-removal fact; `killedByNpcId` can carry a stable system actor id
  such as `ecosystem.predator.<speciesId>` for this slice rather than introducing
  a second death event that would duplicate projection semantics.
- Emit `ANIMAL_STARVED` only as a pressure signal. Predator mortality requires a
  later E1 policy so this slice does not accidentally create runaway extinctions.
- Suppress routine predation/starvation events from public narrative surfaces if
  they create chronicle noise. GM-visible projections remain authoritative.

## Risks / Trade-offs

- [Risk] Same-tile-only predation can be sparse before migration exists. → Keep
  the planner deterministic and small; E1.3 migration can expand encounter range.
- [Risk] Immediate predator death would overfit this slice. → Record starvation
  pressure now and leave mortality thresholds to a future spec.
- [Risk] Reusing `ANIMAL_KILLED.killedByNpcId` for system predators is
  semantically imperfect. → Use a stable system actor id and document that this
  is an ecosystem kill source, not a real NPC.

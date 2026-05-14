# Design — Ecosystem Reproduction + Carrying Capacity (Phase E1.2)

## Context

The ecosystem layer has a species catalog, deterministic biome spawning,
same-tile NPC hunting, fishery density, and E1.1 predator/prey pressure. Animal
population is currently a projection over typed EventLog facts. The next bounded
step is local reproduction: existing animals can create new animals when species
policy and carrying capacity allow it.

## Goals / Non-Goals

**Goals:**

- Plan deterministic reproduction from `animal_population` rows.
- Use `Species.reproductionRate` as the species-specific eligibility input.
- Enforce per-tile carrying capacity before emitting reproduction.
- Persist newborn animals only through `ANIMAL_REPRODUCED` accepted by the Rule
  Engine and projected into `animal_population`.

**Non-Goals:**

- Migration, off-tile mate search, seasonality, pair genealogy, genetics, or
  lifecycle aging.
- Extinction warnings, predator death, or overpopulation mortality.
- Goods/carcass generation or economy changes.

## Decisions

- Add `ANIMAL_REPRODUCED` instead of reusing `ANIMAL_SPAWNED`. Spawning means
  biome/background introduction; reproduction means local population growth from
  existing population. Keeping events distinct gives GM/replay tools better
  causal evidence.
- Store the full newborn `Animal` in `ANIMAL_REPRODUCED`, mirroring
  `ANIMAL_SPAWNED`. This lets `AnimalPopulationProjection` remain replay-only
  without needing species/tile lookup side channels.
- Require at least two same-species animals on a tile before reproduction. The
  current projection does not track sex or pair state, so count-based pairing is
  the smallest deterministic substrate that avoids lone animals multiplying.
- Evaluate on a named cadence and emit at most one reproduction plan per tick.
  This keeps command volume bounded under the Phase 1 budget gate.
- Use `carryingCapacityForTile(species)` from the spawning policy so spawning and
  reproduction share one population cap.

## Risks / Trade-offs

- [Risk] Requiring two animals delays recovery in sparse populations. → Biome
  spawning can still seed populations until pairs exist; future migration can
  create additional pair opportunities.
- [Risk] ReproductionRate as a direct hash threshold is a simple model. → It is
  deterministic and testable now; later E2 pressure and seasonality can modify
  the input threshold through new specs.
- [Risk] Population can still oscillate sharply with predation. → This is
  acceptable for E1.2; later carrying-capacity and predator/prey balancing can
  smooth it with migration and reproduction modifiers.

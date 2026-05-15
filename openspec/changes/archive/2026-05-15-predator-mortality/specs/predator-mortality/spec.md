## ADDED Requirements

### Requirement: Predation planner runs at cadence ticks

The system SHALL invoke `planPredation` at most once per `ECOSYSTEM_REPRODUCTION_CADENCE_TICKS` boundary. On non-cadence ticks no predation plan is evaluated.

#### Scenario: No predation on non-cadence tick
- **WHEN** `tick % ECOSYSTEM_REPRODUCTION_CADENCE_TICKS !== 0`
- **THEN** the runtime MUST NOT call `planPredation` or emit any predation command

#### Scenario: At most one predation event per cadence tick
- **WHEN** multiple predator-species-tile combinations are eligible at the same cadence tick
- **THEN** the planner MUST select exactly one `(predatorAnimalId, preyAnimalId, tileId)` tuple (or one starvation candidate) and emit at most one command

### Requirement: ANIMAL_KILLED removes prey from population

When `planPredation` returns a `kill` plan, the runtime SHALL emit an `ANIMAL_KILLED` command. On acceptance, `AnimalPopulationProjection` MUST remove `preyAnimalId` from the source `(preySpeciesId, tileId)` row. `PredatorHungerProjection` MUST update `lastKillAtTick` for `(predatorSpeciesId, tileId)` to the event tick.

#### Scenario: Prey animal id removed from population row
- **WHEN** an `ANIMAL_KILLED` event is accepted with `preySpeciesId = 'forest_deer'`, `preyAnimalId = 'deer-3'`, `tileId = 't_forest'`
- **THEN** the `AnimalPopulationRow` for `(forest_deer, t_forest)` MUST no longer contain `'deer-3'` and `count` MUST decrease by 1

#### Scenario: Predator hunger clock resets on kill
- **WHEN** an `ANIMAL_KILLED` event is accepted for `(predatorSpeciesId, tileId)`
- **THEN** `PredatorHungerProjection.getLastKillAtTick(predatorSpeciesId, tileId)` MUST return the tick of that event

#### Scenario: Kill ignored for unknown prey id
- **WHEN** an `ANIMAL_KILLED` event names a `preyAnimalId` not present in the prey row
- **THEN** `AnimalPopulationProjection` MUST ignore the event (no-op, no crash)

### Requirement: ANIMAL_DIED_STARVATION removes predator from population

When `planPredation` returns a `starvation` plan AND `tick - lastKillAtTick(predatorSpeciesId, tileId) >= PREDATOR_STARVATION_THRESHOLD_TICKS`, the runtime SHALL emit an `ANIMAL_DIED_STARVATION` command. On acceptance, `AnimalPopulationProjection` MUST remove `predatorAnimalId` from the `(predatorSpeciesId, tileId)` row.

#### Scenario: Starvation fires only after threshold
- **WHEN** `planPredation` returns a starvation plan for `(fog_wolf, t_forest)` at tick `t`
- **AND** `t - lastKillAtTick('fog_wolf', 't_forest') < PREDATOR_STARVATION_THRESHOLD_TICKS`
- **THEN** the runtime MUST NOT emit `ANIMAL_DIED_STARVATION`

#### Scenario: Starvation fires at threshold
- **WHEN** `t - lastKillAtTick('fog_wolf', 't_forest') >= PREDATOR_STARVATION_THRESHOLD_TICKS`
- **AND** there is at least one `fog_wolf` on `t_forest`
- **THEN** the runtime MUST emit exactly one `ANIMAL_DIED_STARVATION` for one wolf animal id

#### Scenario: Predator animal id removed from population row
- **WHEN** an `ANIMAL_DIED_STARVATION` event is accepted with `predatorSpeciesId = 'fog_wolf'`, `predatorAnimalId = 'wolf-1'`, `tileId = 't_forest'`
- **THEN** the `AnimalPopulationRow` for `(fog_wolf, t_forest)` MUST no longer contain `'wolf-1'` and `count` MUST decrease by 1

### Requirement: Starvation events are suppressed from public surfaces

`ANIMAL_KILLED` and `ANIMAL_DIED_STARVATION` events MUST NOT appear in `getRecentEvents()` or any SSE narrative surface.

#### Scenario: Neither event type in recent events
- **WHEN** the runtime processes a cadence tick that produces `ANIMAL_KILLED` or `ANIMAL_DIED_STARVATION`
- **THEN** `getRecentEvents()` MUST NOT include either event type

### Requirement: Predator hunger state exposed in snapshot

`WorldSnapshot.facts.predatorHunger` SHALL expose all rows from `PredatorHungerProjection`. Each row contains `predatorSpeciesId`, `tileId`, and `lastKillAtTick`.

#### Scenario: Snapshot includes predatorHunger
- **WHEN** `getSnapshot()` is called after at least one `ANIMAL_KILLED` event
- **THEN** `facts.predatorHunger` MUST be an array with at least one row matching the killing predator species and tile

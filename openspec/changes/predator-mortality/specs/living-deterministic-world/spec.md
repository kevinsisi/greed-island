## ADDED Requirements

### Requirement: ANIMAL_KILLED command and event are defined

The system SHALL define `ANIMAL_KILLED` as a command and event type in the living-world command catalog. The payload MUST include `huntId`, `predatorSpeciesId`, `predatorAnimalId`, `preySpeciesId`, `preyAnimalId`, `tileId`, and `killedAtTick`.

#### Scenario: Validator rejects mismatched tile
- **WHEN** an `ANIMAL_KILLED` command payload has `tileId` that is empty or missing
- **THEN** the Rule Engine MUST reject with `INVALID_PAYLOAD`

#### Scenario: Validator rejects same predator and prey animal id
- **WHEN** `predatorAnimalId === preyAnimalId`
- **THEN** the Rule Engine MUST reject with `INVALID_PAYLOAD`

### Requirement: ANIMAL_DIED_STARVATION command and event are defined

The system SHALL define `ANIMAL_DIED_STARVATION` as a command and event type in the living-world command catalog. The payload MUST include `starvationId`, `predatorSpeciesId`, `predatorAnimalId`, `tileId`, and `diedAtTick`.

#### Scenario: Validator rejects empty starvationId
- **WHEN** an `ANIMAL_DIED_STARVATION` command payload has an empty or missing `starvationId`
- **THEN** the Rule Engine MUST reject with `INVALID_PAYLOAD`

### Requirement: AnimalPopulationProjection handles predation events

`AnimalPopulationProjection.project()` MUST handle `ANIMAL_KILLED` (remove prey animal id from prey row) and `ANIMAL_DIED_STARVATION` (remove predator animal id from predator row). Both operations MUST be no-ops if the named animal id is not present in the row.

#### Scenario: Replay is idempotent for predation events
- **WHEN** the same EventLog containing `ANIMAL_KILLED` and `ANIMAL_DIED_STARVATION` events is replayed twice
- **THEN** `AnimalPopulationProjection.canonicalHash()` MUST return the same value both times

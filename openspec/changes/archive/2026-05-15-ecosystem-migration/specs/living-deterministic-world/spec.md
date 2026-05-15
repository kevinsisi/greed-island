## ADDED Requirements

### Requirement: Catalog covers ecosystem migration events
The living-world command catalog SHALL include `ANIMAL_MIGRATED` and
`MIGRATION_WAVE_STARTED` as typed commands with validated payloads.
`ANIMAL_MIGRATED` MUST declare `animalId`, `speciesId`, `fromTileId`, `toTileId`,
`migratedAtTick`, and `migrationType` (`'pressure' | 'seasonal'`).
`MIGRATION_WAVE_STARTED` MUST declare `waveId`, `speciesId`, `fromTileId`,
`toTileId`, `startedAtTick`, and `migrationType`.

#### Scenario: ANIMAL_MIGRATED with missing fromTileId is rejected
- **WHEN** an `ANIMAL_MIGRATED` command is submitted without `fromTileId`
- **THEN** the Rule Engine MUST reject it with code `INVALID_PAYLOAD`

#### Scenario: ANIMAL_MIGRATED with identical fromTileId and toTileId is rejected
- **WHEN** an `ANIMAL_MIGRATED` command has `fromTileId === toTileId`
- **THEN** the Rule Engine MUST reject it with code `INVALID_PAYLOAD`

#### Scenario: MIGRATION_WAVE_STARTED with invalid migrationType is rejected
- **WHEN** a `MIGRATION_WAVE_STARTED` command carries `migrationType` outside
  `['pressure', 'seasonal']`
- **THEN** the Rule Engine MUST reject it with code `INVALID_PAYLOAD`

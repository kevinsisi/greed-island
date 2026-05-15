# ecosystem-reproduction-capacity Specification

## Purpose
TBD - created by archiving change ecosystem-reproduction-capacity. Update Purpose after archive.
## Requirements
### Requirement: Animal reproduction SHALL be deterministic per species policy

The ecosystem runtime SHALL plan reproduction from `animal_population` rows using
species `reproductionRate`, species id, tile id, animal ids, and tick as
deterministic inputs. A species/tile row MUST be eligible only when it has at
least two animal ids and is below its per-tile carrying capacity.

#### Scenario: Eligible population reproduces deterministically

- **GIVEN** a species/tile population row has at least two animal ids
- **AND** its count is below per-tile carrying capacity
- **WHEN** reproduction is planned for an eligible cadence tick
- **THEN** the planner MUST either produce no plan or produce one newborn animal
  using deterministic selection from species id, tile id, animal ids, and tick

#### Scenario: Lone animal does not reproduce

- **GIVEN** a species/tile population row has exactly one animal id
- **WHEN** reproduction is planned
- **THEN** no reproduction plan MUST be emitted for that row

### Requirement: Carrying capacity SHALL cap reproduction

The reproduction planner MUST NOT emit `ANIMAL_REPRODUCED` for a species/tile row
whose count is greater than or equal to the same per-tile carrying capacity used
by biome animal spawning.

#### Scenario: Full population is capped

- **GIVEN** a species/tile population row count is equal to per-tile carrying
  capacity
- **WHEN** reproduction is planned
- **THEN** no reproduction plan MUST be emitted for that row

### Requirement: Reproduction SHALL flow through typed EventLog facts

The runtime MUST represent a newborn animal as an `ANIMAL_REPRODUCED` command
accepted by the Rule Engine. The accepted event payload MUST identify newborn
animal id, species id, tile id, parent animal ids, reproducedAtTick, and optional
motivation/narration.

#### Scenario: Runtime emits reproduction through Rule Engine

- **GIVEN** a valid reproduction plan exists
- **WHEN** the runtime applies the plan
- **THEN** the EventLog MUST contain an accepted `ANIMAL_REPRODUCED` fact for the
  newborn animal
- **AND** the runtime MUST NOT mutate `animal_population` directly

### Requirement: Animal population SHALL include reproduced animals on replay

The `animal_population` projection MUST add newborn animal ids from accepted
`ANIMAL_REPRODUCED` events. Replaying the same EventLog MUST produce the same
population rows and canonical projection hash.

#### Scenario: Reproduced animal increases population

- **GIVEN** two `ANIMAL_SPAWNED` events created a species/tile population row
- **AND** a later `ANIMAL_REPRODUCED` event creates a newborn animal in the same
  species/tile
- **WHEN** `animal_population` rebuilds from EventLog
- **THEN** the species/tile row count MUST include the newborn animal id
- **AND** duplicate reproduction events for the same newborn id MUST NOT double
  count the animal


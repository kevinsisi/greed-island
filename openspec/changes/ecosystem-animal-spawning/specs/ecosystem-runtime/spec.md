# Spec — ecosystem-runtime capability (Animal Spawning)

## ADDED Requirements

### Requirement: Wildlife spawning SHALL flow through Command -> Rule Engine -> Event

The runtime MUST create animals only by submitting an `ANIMAL_SPAWNED` Command,
having it accepted by the living-world Rule Engine, and committing the resulting
typed Event to EventLog. No projection or runtime path may directly invent an
animal population row without a source event.

#### Scenario: Spawn event carries a concrete Animal

- **WHEN** the Rule Engine accepts an `ANIMAL_SPAWNED` command
- **THEN** the payload MUST include `animal.id`, `animal.speciesId`,
  `animal.tileId`, `animal.biomeRegion`, deterministic `animal.position`, and
  `spawnedAtTick`

### Requirement: Wildlife spawning SHALL be deterministic and budget-throttled

The spawn planner MUST evaluate on a fixed cadence and only evaluate one active
eligible tile per cadence tick. Species choice, animal id, and animal position
MUST derive from canonical hashes of species id, tile id, and tick so identical
EventLog state produces identical spawn events across replays.

#### Scenario: Generic map biomes do not invent species regions

- **GIVEN** a tile has biome `grass` or generic `water`
- **WHEN** the spawn planner evaluates that tile
- **THEN** it MUST emit no spawn unless the tile is explicitly mapped to a
  documented ecosystem region such as `salt_marsh`

#### Scenario: Active tile throttling bounds work

- **GIVEN** multiple eligible tiles exist
- **WHEN** a spawn cadence tick is evaluated
- **THEN** the planner MUST evaluate at most one active eligible tile

### Requirement: Animal population SHALL be replayable from EventLog

The `animal_population` projection MUST rebuild entirely from `ANIMAL_SPAWNED`
events and expose deterministic rows keyed by `(speciesId, tileId)`.

#### Scenario: Rebuild produces identical canonical hash

- **GIVEN** two projection instances
- **WHEN** both rebuild from the same EventLog
- **THEN** their canonical row hashes MUST match

#### Scenario: Duplicate animal ids do not double-count

- **GIVEN** two `ANIMAL_SPAWNED` events with the same `animal.id`
- **WHEN** the projection rebuilds
- **THEN** the population count for that `(speciesId, tileId)` MUST increase only once

### Requirement: Routine spawn events SHALL NOT become public narration

Routine `ANIMAL_SPAWNED` events are internal ecosystem truth and MUST NOT be
pushed to public SSE/recent-event/chronicle surfaces by default.

#### Scenario: Spawn event has no public narrative record

- **WHEN** an `ANIMAL_SPAWNED` event is committed
- **THEN** the runtime's public narrative event builder MUST return no narrative event

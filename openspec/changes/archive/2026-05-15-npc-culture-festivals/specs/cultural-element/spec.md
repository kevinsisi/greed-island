## ADDED Requirements

### Requirement: Three cultural event types are registered and validated

The system SHALL register `CULTURAL_FESTIVAL_FORMED`, `CULTURAL_RITUAL_PERFORMED`, and `CULTURAL_NORM_ESTABLISHED` as valid command types in `LivingWorldRuleEngine`. Each SHALL have a validator that checks required string fields and non-negative integer tick fields.

#### Scenario: CULTURAL_FESTIVAL_FORMED accepted with valid payload

- **WHEN** `CULTURAL_FESTIVAL_FORMED` is submitted with `{ windowId: 'tide_festival', tileId: 't_dock', occurrenceCount: 3, formedAtTick: 100, narration: '...' }`
- **THEN** the rule engine accepts it and emits the event

#### Scenario: CULTURAL_NORM_ESTABLISHED rejected with missing skillId

- **WHEN** `CULTURAL_NORM_ESTABLISHED` is submitted without `skillId`
- **THEN** the rule engine rejects with a validation error

### Requirement: CulturalElementProjection tracks all three element types

The system SHALL maintain a `CulturalElementProjection` that maps `(tileId, elementId)` to `{ elementType, formedAtTick, detail: string }`. It MUST implement `rebuildFromEvents(events)` and `canonicalHash()`. It SHALL also track internal `festivalCounters` per `windowId` to accumulate `RARE_WINDOW_OPEN` occurrences before a festival is formed.

#### Scenario: festival counter increments on each RARE_WINDOW_OPEN projection

- **WHEN** `RARE_WINDOW_OPEN` is projected 2 times for `windowId='tide_festival'`
- **THEN** `getFestivalCounter('tide_festival')` returns 2
- **AND** no `CULTURAL_FESTIVAL_FORMED` row exists yet

#### Scenario: festival row added when CULTURAL_FESTIVAL_FORMED is projected

- **WHEN** `CULTURAL_FESTIVAL_FORMED` is projected
- **THEN** `getByTile('t_dock')` returns a row with `elementType: 'festival'`

#### Scenario: norm row added when CULTURAL_NORM_ESTABLISHED is projected

- **WHEN** `CULTURAL_NORM_ESTABLISHED` is projected for tileId=`t_salt_marsh`, skillId=`fishing`
- **THEN** `getByTile('t_salt_marsh')` returns a row with `elementType: 'norm'`

#### Scenario: ritual row added when CULTURAL_RITUAL_PERFORMED is projected

- **WHEN** `CULTURAL_RITUAL_PERFORMED` is projected
- **THEN** `getByTile` for the building's tile returns a row with `elementType: 'ritual'`

#### Scenario: rebuildFromEvents is idempotent

- **WHEN** `rebuildFromEvents` is called twice with the same event list
- **THEN** `canonicalHash()` returns the same value both times

### Requirement: SimulationRuntime exposes getCulturalElements accessor

`SimulationRuntime` SHALL expose `getCulturalElements(tileId: string): Array<{ elementType: string; elementId: string; formedAtTick: number; detail: string }>` returning all cultural element rows for the given tile.

#### Scenario: returns empty for tile with no cultural elements

- **WHEN** `getCulturalElements('t_central')` is called on a fresh runtime
- **THEN** result is `[]`

## ADDED Requirements

### Requirement: BuildingDef supports optional tags field

`BuildingDef` SHALL include an optional field `tags?: readonly string[]`. Existing buildings without this field compile unchanged. Temple and monastery buildings in the catalog SHALL be tagged with `['ritual_site']`.

#### Scenario: ritual_site tag present on temple buildings

- **WHEN** the building catalog is loaded
- **THEN** buildings `b_temple_shrine` and `b_mountain_monastery` (or equivalent temple-type buildings) have `tags` containing `'ritual_site'`

#### Scenario: buildings without tags compile cleanly

- **WHEN** `BuildingDef` objects are created without a `tags` field
- **THEN** TypeScript compiles without error (field is optional)

### Requirement: CULTURAL_FESTIVAL_FORMED and CULTURAL_NORM_ESTABLISHED surface in the chronicle

Cultural event commands SHALL include a non-empty `narration` string field. `readNarrativeFromAnyEvent` SHALL treat these events as chronicle-eligible (narration non-null), so they appear in `TimelinePage`.

#### Scenario: festival narration reaches the chronicle

- **WHEN** `CULTURAL_FESTIVAL_FORMED` is accepted and its event is committed
- **THEN** the event's `narration` field is non-null and non-empty
- **AND** the event appears in the `TimelinePage` event stream

### Requirement: Constants CULTURAL_FESTIVAL_THRESHOLD and CULTURAL_NORM_NPC_THRESHOLD are in world config

Both SHALL be exported from `config/world.ts` as named constants. No magic numbers in seeder or projection logic.

#### Scenario: constants used in festival seeder

- **WHEN** the festival seeder compares the counter to the threshold
- **THEN** it uses `CULTURAL_FESTIVAL_THRESHOLD` (not a hardcoded literal)

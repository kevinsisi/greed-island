## ADDED Requirements

### Requirement: Migration planner selects one migration per cadence tick
The system SHALL evaluate eligible animal migrations at most once per
`ECOSYSTEM_REPRODUCTION_CADENCE_TICKS` cadence boundary. A migration is eligible
when the source tile has at least one animal of a species whose `migrationPattern`
is `'pressure'` or `'seasonal'`. Species with `migrationPattern = 'none'` or
`'event_driven'` MUST NOT be selected by the planner in this slice.

#### Scenario: No-migration species are skipped
- **WHEN** the migration planner runs on a tick
- **THEN** species with `migrationPattern = 'none'` or `'event_driven'` MUST NOT
  produce any migration plan

#### Scenario: At most one migration per cadence tick
- **WHEN** multiple species and tiles are migration-eligible at the same cadence tick
- **THEN** the planner MUST select exactly one `(speciesId, fromTileId, animalId,
  toTileId)` tuple and emit a single `ANIMAL_MIGRATED` event (preceded by
  `MIGRATION_WAVE_STARTED` if no wave is already active for that
  species+route+tick)

#### Scenario: No migration on non-cadence ticks
- **WHEN** `tick % ECOSYSTEM_REPRODUCTION_CADENCE_TICKS !== 0`
- **THEN** the migration planner MUST return null and emit nothing

### Requirement: Pressure migration triggers above occupancy threshold
For species with `migrationPattern = 'pressure'`, the system SHALL trigger
migration when a tile's population count for that species exceeds
`ECOSYSTEM_MIGRATION_PRESSURE_THRESHOLD` (80%) of its carrying capacity.

#### Scenario: Population at threshold triggers migration
- **WHEN** `population.count / carryingCapacityForTile(species) >= ECOSYSTEM_MIGRATION_PRESSURE_THRESHOLD`
  at a cadence tick
- **THEN** the planner MUST consider this `(speciesId, tileId)` as a pressure
  migration candidate

#### Scenario: Population below threshold is skipped
- **WHEN** `population.count / carryingCapacityForTile(species) < ECOSYSTEM_MIGRATION_PRESSURE_THRESHOLD`
- **THEN** the planner MUST NOT select any animal from this tile as a pressure
  migration candidate

### Requirement: Seasonal migration triggers on cadence regardless of occupancy
For species with `migrationPattern = 'seasonal'`, the system SHALL trigger
migration on every cadence tick as long as an adjacent ecosystem destination with
available capacity exists, without requiring the source tile to be over threshold.

#### Scenario: Seasonal species migrate even at low occupancy
- **WHEN** a seasonal species has at least one animal on a tile and an adjacent
  ecosystem tile has capacity below its carrying cap at a cadence tick
- **THEN** the planner MUST consider this `(speciesId, tileId)` as a seasonal
  migration candidate

### Requirement: Destination tile must be adjacent and have capacity
The system SHALL only select destination tiles that (a) appear in
`MAP_ADJACENCY` / `getMapAdjacency` as a neighbor of the source tile, (b) have an
`EcosystemRegionId` (i.e., pass `ecosystemRegionForTile`), and (c) have
`destinationCount < carryingCapacityForTile(species)`. Destination ranking MUST
prefer tiles whose biome matches the species' `biomeAffinity` and break ties by
deterministic hash.

#### Scenario: Non-ecosystem adjacent tiles are excluded
- **WHEN** the only adjacent tiles are water or grass biome (e.g., `t_central`,
  `t_dock`, `t_temple`)
- **THEN** the migration planner MUST return null for that candidate

#### Scenario: Full-capacity destination is excluded
- **WHEN** every adjacent ecosystem tile is at or above carrying capacity for the
  species
- **THEN** the migration planner MUST return null for that candidate

#### Scenario: Biome-matched tile is preferred over non-matched
- **WHEN** two adjacent ecosystem tiles both have capacity, one matches species
  `biomeAffinity` and one does not
- **THEN** the planner MUST rank the biome-matched tile higher

### Requirement: ANIMAL_MIGRATED payload is deterministic
The system SHALL derive `waveId` from
`hashCanonicalJson({scheme:'migration-wave.v1', speciesId, fromTileId, toTileId, startedAtTick})`.
The selected `animalId` MUST be chosen deterministically from the source tile's
animal id list.

#### Scenario: Same inputs produce same migration plan
- **WHEN** `planAnimalMigration` is called twice with identical `tick`,
  `animalPopulation`, and `reservedAnimalIds`
- **THEN** both calls MUST return structurally identical plans (same animalId,
  toTileId, waveId)

### Requirement: AnimalPopulationProjection tracks ANIMAL_MIGRATED
The `AnimalPopulationProjection` SHALL update on `ANIMAL_MIGRATED` by removing
the `animalId` from the source tile row and adding it to the destination tile row
(creating the row if absent). The destination row's `biomeRegion` MUST be derived
from `ecosystemRegionForTile(destinationTile)`.

#### Scenario: Animal appears on destination tile after migration
- **WHEN** an `ANIMAL_MIGRATED` event is projected
- **THEN** `getBySpeciesAndTile(speciesId, toTileId)` MUST include the `animalId`

#### Scenario: Animal removed from source tile after migration
- **WHEN** an `ANIMAL_MIGRATED` event is projected
- **THEN** `getBySpeciesAndTile(speciesId, fromTileId)` MUST NOT include the
  `animalId`

#### Scenario: Replay is deterministic
- **WHEN** the same EventLog containing `ANIMAL_MIGRATED` events is replayed twice
- **THEN** `canonicalHash()` MUST be identical between the two replays

### Requirement: AnimalMigrationProjection tracks active migration waves
The system SHALL maintain an `AnimalMigrationProjection` that records each
`MIGRATION_WAVE_STARTED` event as an active wave row containing
`(waveId, speciesId, fromTileId, toTileId, startedAtTick, migrationType, count)`.
Each subsequent `ANIMAL_MIGRATED` event for the same `waveId` SHALL increment the
wave's `count`. The projection MUST support `rebuildFromEvents`,
`canonicalHash`, and `list`.

#### Scenario: Wave created on MIGRATION_WAVE_STARTED
- **WHEN** a `MIGRATION_WAVE_STARTED` event is projected
- **THEN** `list()` MUST include an entry for that `waveId` with `count = 0`

#### Scenario: Wave count increments on ANIMAL_MIGRATED
- **WHEN** an `ANIMAL_MIGRATED` event with a known `waveId` is projected
- **THEN** the corresponding wave row's `count` MUST increment by 1

#### Scenario: Projection is replay-safe
- **WHEN** a duplicate `MIGRATION_WAVE_STARTED` event with an existing `waveId`
  is projected
- **THEN** the projection MUST ignore it (first-write-wins)

### Requirement: Migration events are hidden from public narrative surfaces
Routine `ANIMAL_MIGRATED` and `MIGRATION_WAVE_STARTED` events MUST NOT appear in
the public recent-events list, SSE stream, or chronicle narrative.

#### Scenario: Migration does not appear in public recent events
- **WHEN** `ANIMAL_MIGRATED` is emitted through the Rule Engine
- **THEN** `GET /api/events/recent` MUST NOT include that event

### Requirement: WorldSnapshot exposes migrationRoutes
`WorldSnapshot.facts.migrationRoutes` SHALL be populated from
`AnimalMigrationProjection.list()` and exposed via `/api/world`.

#### Scenario: migrationRoutes present in world snapshot
- **WHEN** at least one `MIGRATION_WAVE_STARTED` has been accepted
- **THEN** `GET /api/world` MUST return `facts.migrationRoutes` as a non-empty array

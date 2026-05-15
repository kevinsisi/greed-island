# ecosystem-runtime Specification

## Purpose
TBD - created by archiving change ecosystem-foundation. Update Purpose after archive.
## Requirements
### Requirement: Layer 2.5 SHALL define a canonical initial species catalog

The server codebase SHALL define a canonical initial ecosystem species catalog
covering the 22 species listed in `docs/WORLD_CAPABILITIES.md` §6.4 across the
regions `salt_marsh`, `forest`, `mountain`, `desert`, and `ruin`.

#### Scenario: Catalog covers the documented initial regions
- **WHEN** the server loads the ecosystem species catalog
- **THEN** the catalog MUST contain exactly the documented region groups
- **AND** each species MUST have a stable `id`, `category`, `biomeAffinity`, and
  `rarity`

#### Scenario: Species ids are unique and deterministic
- **WHEN** the catalog is loaded twice in two independent processes
- **THEN** the species list order and species ids MUST be identical
- **AND** no duplicate species id may exist

### Requirement: Layer 2.5 SHALL define the Animal substrate type

The server codebase SHALL define a read-only `Animal` domain type matching the
Phase E0 substrate: `id`, `speciesId`, `tileId`, `biomeRegion`, `position`,
`state`, `hunger`, `health`, `fear`, `aggression`, optional `packId`, optional
`migrationTarget`, optional `currentTarget`, `reproductionCooldown`,
`lifecycleStage`, optional `ownerSettlementId`, optional `domesticatedBy`.

#### Scenario: Animal references a species from the catalog
- **WHEN** an `Animal` value is created in future slices
- **THEN** its `speciesId` MUST refer to a species present in the canonical
  ecosystem catalog

### Requirement: Ecosystem lookup helpers SHALL be read-only and deterministic

The ecosystem module SHALL provide deterministic read-only helpers for listing
the full catalog, looking up a species by id, and filtering by region or
category.

#### Scenario: Lookup by region is stable
- **WHEN** a caller requests `listSpeciesByRegion('forest')`
- **THEN** the returned species ids MUST be the same across repeated calls
- **AND** every returned species MUST include `forest` in its `biomeAffinity`

#### Scenario: Unknown species is rejected by requireSpecies
- **WHEN** a caller requests `requireSpecies('missing_species')`
- **THEN** the helper MUST throw an explicit error instead of returning a fake
  fallback species

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

### Requirement: Simple hunting SHALL flow through typed ecosystem events

The runtime MUST represent a successful simple hunt as typed living-world events:
`ANIMAL_HUNT_STARTED`, `ANIMAL_HUNT_RESOLVED`, `ANIMAL_KILLED`,
`CARCASS_CREATED`, and `MEAT_HARVESTED`. These events MUST be produced by
Commands accepted by the Rule Engine, not by direct projection mutation.

#### Scenario: Successful hunt emits the event chain

- **GIVEN** a hunter-role NPC has a valid prey animal on the same tile
- **WHEN** the runtime plans a simple hunt
- **THEN** the accepted event chain MUST identify the hunt id, NPC id, target
  animal id, species id, tile id, carcass id, harvested quantity, and tick

### Requirement: Hunting SHALL require hunter role, food pressure, and prey

The simple hunting planner MUST only emit a hunt when the NPC role is a hunter,
the NPC's food need is elevated, and `animal_population` has at least one edible
same-tile animal id available.

#### Scenario: Non-hunter does not hunt

- **GIVEN** a non-hunter NPC has high food pressure and prey exists on the tile
- **WHEN** hunting is planned
- **THEN** no hunting commands MUST be emitted

#### Scenario: No prey does not hunt

- **GIVEN** a hunter NPC has high food pressure
- **AND** no same-tile edible animal population exists
- **WHEN** hunting is planned
- **THEN** no hunting commands MUST be emitted

### Requirement: Animal population SHALL decrease when an animal is killed

The `animal_population` projection MUST reduce the population row count when an
`ANIMAL_KILLED` event references an existing animal id in that row. Replaying the
same EventLog MUST produce the same canonical hash.

#### Scenario: Spawn then kill leaves zero population

- **GIVEN** an `ANIMAL_SPAWNED` event for `animal-a`
- **AND** a later `ANIMAL_KILLED` event for `animal-a`
- **WHEN** `animal_population` rebuilds from EventLog
- **THEN** the row for that species and tile MUST have count `0`
- **AND** duplicate kill events MUST NOT reduce count below `0`

### Requirement: Meat harvest SHALL credit NPC civic economy

Accepted `MEAT_HARVESTED` events MUST update the NPC civic record with a
deterministic gold gain. This is a placeholder bridge toward Phase 2 goods
inventory, not a full goods/storage implementation.

#### Scenario: Meat harvest adds civic gold

- **GIVEN** an accepted `MEAT_HARVESTED` command with `goldValue = 4`
- **WHEN** the runtime reduces accepted commands for the tick
- **THEN** the hunter's `lifeExpansion.npcCivicRecords[npcId].gold` MUST increase by `4`

### Requirement: Fishery density SHALL be a replayable ecosystem projection

The runtime MUST maintain `fisheryDensity` as a projection over typed fishery
events, keyed by coastal tile id. Rebuilding from the same EventLog MUST produce
the same canonical hash.

#### Scenario: Harvest reduces density

- **GIVEN** a coastal tile has default density `100`
- **WHEN** a `FISHERY_HARVESTED` event reduces density by `12`
- **THEN** the projection row MUST report density `88`

### Requirement: Fisher work SHALL reduce local fishery density

Fisher-like NPC productive work on coastal water tiles MUST emit
`FISHERY_HARVESTED` through the Rule Engine. Non-fisher roles and non-coastal
tiles MUST NOT reduce fishery density.

#### Scenario: Fisher on coastal tile harvests

- **GIVEN** an NPC role includes fisher/fishmonger/net mender semantics
- **AND** the NPC productive action is on a coastal water tile
- **WHEN** fishery planning runs
- **THEN** a `FISHERY_HARVESTED` command MUST be planned with deterministic
  `densityAfter`

### Requirement: Fishery collapse SHALL be emitted at low density

Fishery collapse MUST be represented by a typed `FISHERY_COLLAPSED` event.
When a fishery harvest crosses the configured collapse threshold, the runtime
MUST emit one `FISHERY_COLLAPSED` warning event for that tile until density is
recovered by a future slice.

#### Scenario: Crossing collapse threshold emits warning

- **GIVEN** a fishery tile has density above the collapse threshold
- **WHEN** a harvest lowers density to or below the threshold
- **THEN** `FISHERY_COLLAPSED` MUST be emitted for that tile

### Requirement: Fishery density SHALL be visible to GM observers

The web client MUST provide a GM/admin-only world observer route that renders
`WorldSnapshot.facts.fisheryDensity` in a human-readable form, including tile,
density, harvested total, collapse/stress/stable status, and last updated tick.

#### Scenario: GM views fishery density

- **GIVEN** an authenticated GM or admin opens the world observer page
- **WHEN** `facts.fisheryDensity` contains one or more rows
- **THEN** the page MUST display each fishery row with density and status rather
  than requiring the GM to inspect raw JSON


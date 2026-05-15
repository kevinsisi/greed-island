# Spec — ecology-visibility capability

First slice of the `ecology-visibility` capability. Player-facing
surfaces (Hub map, AreaScene, AI dialog) gain access to the
server-authoritative ecology projections that Phases E0 + E1 shipped
(animal population, migration routes, fishery density, predator hunger)
so the world feels like a living substrate per Part I §6.2.

## ADDED Requirements

### Requirement: A per-tile ecology rollup endpoint SHALL exist

The runtime MUST expose `GET /api/area/:tileId/ecology` that returns a
synchronous snapshot of the four ecology projections scoped to the
given tile. The endpoint MUST be read-only — it MUST NOT emit any
Command or Event.

#### Scenario: Known populated tile returns the rollup

- **GIVEN** the EventLog has committed `ANIMAL_SPAWNED` events placing
  three `forest_deer` on tile `t_forest`
- **WHEN** a caller queries `GET /api/area/t_forest/ecology`
- **THEN** the response status MUST be `200`
- **AND** `body.animals` MUST contain a row with `speciesId='forest_deer'`,
  `count=3`, and `animalIds` of length 3

#### Scenario: Known empty tile returns an empty rollup

- **GIVEN** the EventLog has no animal / migration / fishery / predator
  rows touching tile `t_central`
- **WHEN** a caller queries `GET /api/area/t_central/ecology`
- **THEN** the response status MUST be `200`
- **AND** `body.animals`, `body.migrationsArriving`,
  `body.migrationsDeparting`, and `body.predatorWarnings` MUST all be
  empty arrays
- **AND** `body.fishery` MUST be `null`

#### Scenario: Unknown tile id returns a 404

- **GIVEN** the id `t_does_not_exist` is not in the map graph
- **WHEN** a caller queries `GET /api/area/t_does_not_exist/ecology`
- **THEN** the response status MUST be `404`
- **AND** `body.error` MUST be `'unknown tile'`

### Requirement: AnimalGroupRow SHALL expose both count and animal ids

Each row in `body.animals` MUST carry both an aggregate `count: number`
and the underlying `animalIds: string[]`, so clients can choose between
cluster-level and per-individual rendering deterministically.

#### Scenario: Row contains aggregate and individual fields

- **GIVEN** five `forest_deer` exist on `t_forest`
- **WHEN** a caller queries the rollup
- **THEN** the matching row MUST satisfy `count === animalIds.length === 5`

### Requirement: Hub map SHALL paint up to two ecology badges per district

`MapScene` MUST render a deterministic top-2 ecology badge set on every
district that has any animals. Ordering is `count desc`, with `speciesId`
ascending as a tiebreak. A district with zero animals MUST render no
badge.

#### Scenario: Top-2 selection is deterministic

- **GIVEN** a tile with `(wolf=4, deer=4, heron=1)` rows
- **WHEN** the Hub renders ecology badges for that tile
- **THEN** exactly two badges MUST appear
- **AND** they MUST be `deer` and `wolf` (lex tiebreak puts `deer`
  before `wolf`)

#### Scenario: Predator-hunger tile shows a warning ring

- **GIVEN** a tile has at least one row in `predatorHunger` projection
- **WHEN** the Hub renders that tile
- **THEN** a dimmed warning ring MUST be drawn over the district color

### Requirement: AreaScene SHALL switch between individual and cluster rendering

For each `AnimalGroupRow` on the current tile, `AreaScene` MUST render
individual per-id sprites when `animalIds.length <= 5`, and a single
cluster sprite with a count label when `animalIds.length >= 6`.

#### Scenario: Five animals render as five sprites

- **GIVEN** the rollup returns one row with `animalIds.length === 5`
- **WHEN** the AreaScene renders
- **THEN** exactly five sprites MUST appear, each anchored at a sub-cell
  derived from `hashSeed(animalId, tileId, 'ecology-placement')`

#### Scenario: Six animals collapse into a cluster

- **GIVEN** the rollup returns one row with `animalIds.length === 6`
- **WHEN** the AreaScene renders
- **THEN** exactly one cluster sprite MUST appear with a `×6` label

### Requirement: Water-biome tiles SHALL display a fishery density bar

The AreaScene MUST render a horizontal fishery density bar at the bottom
edge of any water-biome tile whose rollup returns a non-null `fishery`
row. The bar's width MUST be proportional to `fishery.density / 100` of
the available bar slot.

#### Scenario: Density bar matches projection value

- **GIVEN** `fisheryDensity` projection has tile `t_dock` density `64`
- **WHEN** the player enters `t_dock` AreaScene
- **THEN** a density bar MUST render at the bottom edge with width
  representing `64 / 100` of the available bar slot

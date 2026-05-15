# district-subtile-terrain Specification

## Purpose

Defines the per-sub-cell terrain mask layer for water-biome districts so the
client renders visual honesty between land, pier, shore, shallow water, and
open water inside a district. Closes the visual-honesty gap where human
sprites in `t_dock`, `t_temple`, and `t_salt_marsh` appeared to stand on
open water. The mask drives three observable behaviours: AreaScene paints
each sub-cell with the appropriate tint, player movement is gated so the
player cannot walk onto open-water cells, and NPCs that occupy open-water
cells render with a boat-hint overlay so the visual reads as "fishing from
a small boat" rather than "standing on the sea". The macro-tile walkability
graph (`MAP_ADJACENCY`) and server-side NPC sub-cell selection are
unchanged by this capability — it is a client-side rendering plus
player-movement gate over an existing district grid.

## Requirements

### Requirement: Water-biome districts SHALL carry a sub-cell terrain mask

`packages/web/src/game/terrainMask.ts` MUST export
`terrainMaskForDistrict(districtId)` returning a
`SubcellTerrain[][]` of exactly `AREA_GRID_ROWS` rows by
`AREA_GRID_COLS` columns for each of `t_dock`, `t_temple`,
`t_salt_marsh`. The module MUST return `null` for districts without
a hand-authored mask so AreaScene preserves the legacy single-color
rendering path.

#### Scenario: Land district returns no mask

- **WHEN** a caller invokes `terrainMaskForDistrict('t_central')`
- **THEN** the result MUST be `null`

#### Scenario: Water district returns a fully-sized mask

- **WHEN** a caller invokes `terrainMaskForDistrict('t_dock')`
- **THEN** the result MUST be an array of length `AREA_GRID_ROWS`
- **AND** every row MUST have length `AREA_GRID_COLS`

### Requirement: Open-water cells SHALL block player movement

`AreaScene.isAreaWalkable(x, y)` MUST return `false` for pixel coords
that map to a sub-cell whose terrain is `'open_water'`. The player's
physics update and pointer-target handler MUST consult this gate;
when it returns `false`, the player's velocity on the offending
axis MUST be zeroed and the pointer target MUST be cleared.

#### Scenario: Player cannot walk onto open water

- **GIVEN** the player attempts to move into a sub-cell whose mask
  is `'open_water'`
- **WHEN** AreaScene's physics update runs
- **THEN** the player's position MUST NOT enter that sub-cell

### Requirement: NPCs on open water SHALL render with a boat hint

AreaScene MUST render any NPC whose sub-cell maps to `'open_water'`
with `alpha = 0.85` and MUST attach a small `⛵` text overlay above
the NPC's name label so the player reads the NPC as "fishing from a
boat", not "standing on the sea".

#### Scenario: NPC at a pier cell renders without boat hint

- **GIVEN** an NPC whose sub-cell is `'pier'`
- **WHEN** AreaScene renders the NPC sprite
- **THEN** the sprite MUST render with the default alpha and no boat
  overlay

#### Scenario: NPC at an open-water cell gets the boat overlay

- **GIVEN** an NPC whose sub-cell is `'open_water'`
- **WHEN** AreaScene renders the NPC sprite
- **THEN** the sprite alpha MUST be approximately 0.85
- **AND** a `⛵` glyph MUST render above its name label

### Requirement: Every building anchor in a water district SHALL be walkable

The mask MUST keep every catalogued building in `t_dock`, `t_temple`,
or `t_salt_marsh` on a walkable sub-cell (`land`, `pier`, `shore`, or
`shallow_water`) — never `open_water`. A test pass MUST regress when
a mask edit strands a building so the player never sees a building
they cannot reach.

#### Scenario: All water-district building anchors resolve to a walkable terrain

- **WHEN** the test suite iterates the buildings catalog and looks up
  each water-district building's `(placement.col, placement.row)` in
  its district mask
- **THEN** the terrain at every such cell MUST satisfy
  `isWalkableTerrain(terrain) === true`

#### Scenario: Salt-marsh field station is reachable (regression v0.24.2)

- **GIVEN** `b_salt_marsh_field_station` is placed at `(col 7, row 4)`
- **WHEN** the `t_salt_marsh` mask is consulted at that cell
- **THEN** the terrain MUST be walkable

### Requirement: Hub predator-hunger warning SHALL carry a readable label

`MapScene.drawEcologyBadges` MUST attach a human-readable cue to the
predator-hunger red ring (an icon glyph plus a localized caption)
whenever the tile has any `predatorHunger` projection row. A bare
ring is insufficient.

#### Scenario: Warning ring is accompanied by glyph + caption

- **GIVEN** a tile has at least one `predatorHunger` projection row
- **WHEN** the Hub map renders ecology badges for that tile
- **THEN** a `⚠️` glyph MUST appear at the tile's anchor area
- **AND** a Chinese caption (`掠食者飢餓` or equivalent) MUST render
  near the ring

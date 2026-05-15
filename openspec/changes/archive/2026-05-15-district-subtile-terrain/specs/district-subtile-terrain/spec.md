# Spec — district-subtile-terrain capability

First slice of the `district-subtile-terrain` capability. Closes the
visual-honesty gap that made human sprites appear to stand on open
water. The three water-biome districts (`t_dock`, `t_temple`,
`t_salt_marsh`) gain a per-sub-cell terrain mask. AreaScene renders
each sub-cell with its mask color and gates player movement so the
player cannot step onto open water. NPC sprites that land on open
water render with a `⛵` overlay so the visual reads as "fishing
from a small boat".

## ADDED Requirements

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

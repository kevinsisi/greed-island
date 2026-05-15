# Proposal — District Sub-tile Terrain (Sprint 4)

## Why

The user observed in this conversation: 「人類可以直接去水域是正常的嗎?」
Today the three "water-biome" districts (`t_dock` 碼頭區, `t_temple`
霓港區, `t_salt_marsh` 鹽沼外環) render as **flat colored blocks** in
both `MapScene` (Hub) and `AreaScene` (inside the district), so when a
human sprite is placed anywhere in the district, it visually appears to
stand on open water. The macro-tile graph is correct — these are
coastal districts that any villager can naturally walk into — but the
**visual fidelity** is too coarse to reflect that.

This slice introduces a per-district sub-tile terrain mask for the
three water-biome districts so:
- the `AreaScene` background paints a mix of pier / boardwalk / shore /
  open water cells instead of a uniform blue rectangle;
- player movement is gated by the mask — the player cannot walk onto
  an open-water cell;
- NPC sprites that happen to land on an open-water cell get an
  unobtrusive visual hint (small boat emoji + slight transparency) so
  the player can read "she's fishing from a small boat" instead of
  "she's standing on the sea".

The macro-tile walkability graph (`MAP_ADJACENCY`) and the
server-side NPC sub-cell state are **unchanged** — this is a pure
client-side visual + player-movement slice. Future work can extend
the mask to gate server-side NPC sub-cell selection.

## What Changes

### Client-side terrain mask
- New module `packages/web/src/game/terrainMask.ts`:
  - `SubcellTerrain` union: `'land' | 'pier' | 'shore' | 'shallow_water' | 'open_water'`.
  - `terrainMaskForDistrict(districtId)` returns a `SubcellTerrain[][]`
    sized to `AREA_GRID_ROWS × AREA_GRID_COLS` for the three water
    districts; returns `null` for land districts (full-area `land`
    by convention).
  - `isWalkableTerrain(terrain)`: `land | pier | shore | shallow_water`
    are walkable; `open_water` is not.

### AreaScene
- `AreaScene.drawBackground()` consults the terrain mask. For each
  sub-cell it paints the appropriate color tint (pier = sandy beige,
  shore = damp gray-blue, shallow_water = lighter blue, open_water =
  the existing district base color). Land districts continue to use
  the existing single-color path.
- New walkability gate: `AreaScene.isAreaWalkable(x, y)` checks the
  mask. Player physics and pointer-target processing call this gate;
  open-water cells block movement (slide along the boundary).
- NPC sprite render: when an NPC's sub-cell maps to `open_water`, the
  sprite is rendered with `alpha = 0.85` and an extra `⛵` emoji
  overlay above its name label.

### Constant tuning
- `packages/web/src/game/terrainMask.ts` carries the masks inline as
  literal `string[]` blueprints to keep the file readable; one row
  per `AREA_GRID_ROWS`, one char per cell.

## Out Of Scope

- Server-side enforcement of sub-cell walkability. NPC engine still
  picks sub-cell coords without the mask. (Sprint 2A/2B placed
  ecology sprites via FNV hash and may land on water — that is
  acceptable for the slice; clients with the new mask will visually
  treat those as "fish near the surface" rather than land.)
- Land districts gaining their own per-cell masks (forests,
  mountains, ruins, central). Out of scope; this slice covers the
  three water-biome districts that triggered the user's question.
- Building entrance gating by terrain. Buildings continue to be
  placed at their existing fixed anchors.
- Sprite art for boats. The `⛵` emoji is the prototype-style
  placeholder consistent with the rest of the Phaser layer.

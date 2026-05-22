// Sprint 4 — district-subtile-terrain
//
// Per-sub-cell terrain mask for the three water-biome districts. The
// macro-tile graph (MAP_ADJACENCY) and server-side NPC sub-cell state
// remain unchanged; this module exists purely so AreaScene renders
// honest geography (pier + boardwalk + shallow water + open water)
// instead of a flat blue rectangle, and so player movement stops at
// the open-water boundary.
//
// Masks are hand-authored as string blueprints — one char per
// sub-cell. The glyphs:
//
//   L = land
//   P = pier / boardwalk
//   S = shore / wet sand
//   s = shallow water (knee-deep; walkable)
//   . = open water (NOT walkable)

import { AREA_GRID_COLS, AREA_GRID_ROWS } from './areaGrid'
import type { DistrictId } from './districts'

export type SubcellTerrain = 'land' | 'pier' | 'shore' | 'shallow_water' | 'open_water'

const GLYPH_TO_TERRAIN: Readonly<Record<string, SubcellTerrain>> = {
  L: 'land',
  P: 'pier',
  S: 'shore',
  s: 'shallow_water',
  '.': 'open_water',
}

/** Display color for each terrain. AreaScene paints these per sub-cell. */
export const COLOR_FOR_TERRAIN: Readonly<Record<SubcellTerrain, number>> = {
  land: 0x6b8a4b, // muted moss for shore-side ground
  // v0.24.2 — pier toned down from 0xc6a06b. Original was too bright
  // and the user reported large "wood" patches dominating water
  // districts. The new shade keeps the cedar feel but blends into
  // the surrounding shore/water palette.
  pier: 0x8a6d40,
  shore: 0x8a9aa6, // damp gray-blue sand
  shallow_water: 0x6fb8d7, // matches the existing t_dock light blue
  open_water: 0x356a80, // darker blue — visibly different from a walkable cell
}

export function isWalkableTerrain(terrain: SubcellTerrain): boolean {
  return terrain !== 'open_water'
}

// Land terrain types (non-water biomes)
export type LandTerrain = 'open' | 'rough' | 'path' | 'blocked' | 'building'

// All terrain types combined
export type AnyTerrain = SubcellTerrain | LandTerrain

export const TERRAIN_SPEED_MODIFIER: Readonly<Record<AnyTerrain, number>> = {
  // water types (player can't enter open_water)
  land: 1.0,
  pier: 1.0,
  shore: 0.9,
  shallow_water: 0.7,
  open_water: 0,
  // land types
  open: 1.0,
  rough: 0.75,
  path: 1.15,
  blocked: 0,
  building: 0,
}

export const LAND_COLOR_FOR_TERRAIN: Readonly<Record<LandTerrain, number>> = {
  open: 0x6b8a4b,      // muted green
  rough: 0x7a6a3a,     // earthy brown
  path: 0x9a8a6a,      // pale ochre
  blocked: 0x2a2a2a,   // near-black
  building: 0x3a3a3a,  // dark grey (hidden under building sprite)
}

export function isWalkableLand(t: LandTerrain): boolean {
  return t !== 'blocked' && t !== 'building'
}

// Each row: exactly 15 chars. o=open r=rough p=path X=blocked
export const LAND_MASKS: Readonly<Record<string, readonly string[]>> = {

  // t_forest — dense forest edges, central clearing, winding path
  // buildings: (1,3), (13,3)
  t_forest: [
    'XXXXXXXXXXXXXXX', // 0
    'XoooooooooooooX', // 1
    'XooorrooooooooX', // 2
    'oopppooooooopoX', // 3  col1=o, col13=o
    'XoopppooooooooX', // 4
    'XroXXXXXXrooooX', // 5
    'XoooooXXrrooooX', // 6
    'XoooooorroooooX', // 7
    'XrroooooooooooX', // 8
    'XXXXXXXXXXXXXXX', // 9
  ],

  // t_mountain — cliffs, rocky ledges, narrow path
  // buildings: (4,1)
  t_mountain: [
    'XXXXXoooXXXXXXX', // 0
    'XXXXooopXXXXXXX', // 1  col4=o
    'XXrroopppooXXXX', // 2
    'XrrrooopppooooX', // 3
    'XXoopppppoorroX', // 4
    'XXrroooppooXXXX', // 5
    'XrrrooppooooXXX', // 6
    'XoopppoooorrroX', // 7
    'XoopppooooooooX', // 8
    'XXXXXpppXXXXXXX', // 9
  ],

  // t_desert — sand flats, dune ridges, rocky outcrops
  // buildings: (2,3), (9,3)
  t_desert: [
    'ooooooooooooooo', // 0
    'orrrooooooorrrr', // 1
    'ooppooooooooooo', // 2
    'ooooooooooooooo', // 3  col2=o, col9=o
    'rrrooooooooorrr', // 4
    'rrrooooooooorrr', // 5
    'oooopppppoooooo', // 6
    'oooopppppoooooo', // 7
    'orrrroooooorrrr', // 8
    'ooooooooooooooo', // 9
  ],

  // t_central — urban grass, paths, open plazas
  // buildings: (4,1), (9,8), (4,8), (1,8)
  t_central: [
    'ooooooooooooooo', // 0
    'opppoooooooooop', // 1  col4=o
    'ooopppoooooooop', // 2
    'oooopppppoooooo', // 3
    'ooooooooooooooo', // 4
    'pppoooooooooopp', // 5
    'pppooooooooooop', // 6
    'ooooooooooooooo', // 7
    'opooooooopoooop', // 8  col1=o, col4=o, col9=o
    'ooooooooooooooo', // 9
  ],

  // t_ruin — collapsed walls, rubble, open ruin floor
  // buildings: (2,3), (7,3), (1,8)
  t_ruin: [
    'XrrrooooooorrrX', // 0
    'XoooooooooooooX', // 1
    'XoorroooooorroX', // 2
    'XoooooooooooooX', // 3  col2=o, col7=o
    'XrrroooooorrroX', // 4
    'XoooXXXXooooooX', // 5
    'XoooooXXooooooX', // 6
    'XrrooooooorrooX', // 7
    'XoooooooooooooX', // 8  col1=o
    'XrrrooooooorrrX', // 9
  ],

  // t_dimai — underground ruin, ley-line channels
  // buildings: (7,0), (12,1)
  t_dimai: [
    'XXXXXXXoXXXXXXX', // 0  col7=o
    'XrrrrrrooooopXX', // 1  col12=o
    'XrrrrrrroooopoX', // 2
    'XoopppppooorroX', // 3
    'XoopppppooorroX', // 4
    'XoooooooooooooX', // 5
    'XrroooooooooorX', // 6
    'XrroooooooooorX', // 7
    'XrroooooooooorX', // 8
    'XXXXXXXXXXXXXXX', // 9
  ],
}

const LAND_GLYPH_TO_TERRAIN: Readonly<Record<string, LandTerrain>> = {
  o: 'open',
  r: 'rough',
  p: 'path',
  X: 'blocked',
}

function staticLandTerrainAt(tileId: string, col: number, row: number): LandTerrain {
  const ch = LAND_MASKS[tileId]?.[row]?.[col]
  return (ch ? LAND_GLYPH_TO_TERRAIN[ch] : null) ?? 'open'
}

export function effectiveTerrainAt(
  tileId: DistrictId,
  col: number,
  row: number,
  buildings: readonly { col: number; row: number; state: string }[],
): AnyTerrain {
  const b = buildings.find(b => b.col === col && b.row === row)
  if (b) return b.state === 'abandoned' ? 'rough' : 'building'
  if (LAND_MASKS[tileId] === undefined) {
    return terrainAt(tileId, col, row)
  }
  return staticLandTerrainAt(tileId, col, row)
}

export function walkableCellsForTile(
  tileId: DistrictId,
  buildings: readonly { col: number; row: number; state: string }[],
): readonly { col: number; row: number }[] {
  const result: { col: number; row: number }[] = []
  for (let row = 0; row < AREA_GRID_ROWS; row++) {
    for (let col = 0; col < AREA_GRID_COLS; col++) {
      const t = effectiveTerrainAt(tileId, col, row, buildings)
      if (t !== 'blocked' && t !== 'building' && t !== 'open_water') {
        result.push({ col, row })
      }
    }
  }
  return result
}

/**
 * Hand-authored masks. The world's three water-biome districts each
 * have their own geography:
 *
 *   t_dock (碼頭區): a long pier jutting from the south shore.
 *   t_temple (霓港區): neon harbour with three short docks fanning out.
 *   t_salt_marsh (鹽沼外環): a rim of marsh + reed beds around open water.
 */
// v0.24.2 — masks re-authored to honor building anchor positions
// (`packages/server/src/buildings/catalog.ts`) and to reduce the
// dominant pier coverage that made water districts read as "mostly
// wood" instead of "mostly water with small dock spots".
//
// Building anchors that must land on walkable terrain:
//   t_dock:        b_dock_pier (2,3), b_dock_warehouse (12,3)
//   t_temple:      b_temple_shrine (2,0), b_temple_apartment (9,3),
//                  b_temple_pier_cafe (5,3)
//   t_salt_marsh:  b_salt_marsh_field_station (7,4)
const RAW_MASKS: Readonly<Partial<Record<DistrictId, readonly string[]>>> = {
  t_dock: [
    'LLLLLLLLSSssss.',
    'LLLLLLLLSSssss.',
    'LLLLLLLLSSssss.',
    'LLLLLLLLPPssLLL',
    'LLLLLLLLPPsssss',
    'LLLLLLLLSSsssss',
    'LLLLLLLLSSssss.',
    'LLLLLLLLSSssss.',
    'LLLLLLLLSSss...',
    'LLLLLLLLSSss...',
  ],
  t_temple: [
    'LLLLLLLLLLLSss.',
    'LLLLLLLLLLLSss.',
    'LLLLLLLLLLLSss.',
    'LLLLLLLLLLPPss.',
    'LLLLLLLLLLPPss.',
    'LLLLLLLLLLLSss.',
    'LLLLLLLLLLLSss.',
    'LLLLLLLLLLLSss.',
    'LLLLLLLLLLLSss.',
    'LLLLLLLLLLLSs..',
  ],
  t_salt_marsh: [
    'LLLLLLSSssssss.',
    'LLLLLLSSSsssss.',
    'LLLLLLSSSsss...',
    'LLLLLLSSss.....',
    'LLLLLLLLLLSss..',
    'LLLLLLLLLLSss..',
    'LLLLLLSSss.....',
    'LLLLLLSSSsss...',
    'LLLLLLSSSsssss.',
    'LLLLLLSSssssss.',
  ],
}

/**
 * Compile a raw string-blueprint into a 2D SubcellTerrain mask. The
 * defensive runtime check returns `null` (treated by callers as
 * full-land) when rows are missing or row widths are wrong.
 */
function compile(raw: readonly string[]): SubcellTerrain[][] | null {
  if (raw.length !== AREA_GRID_ROWS) return null
  const rows: SubcellTerrain[][] = []
  for (const rawRow of raw) {
    if (rawRow.length !== AREA_GRID_COLS) return null
    const row: SubcellTerrain[] = []
    for (const ch of rawRow) {
      row.push(GLYPH_TO_TERRAIN[ch] ?? 'land')
    }
    rows.push(row)
  }
  return rows
}

const COMPILED_MASKS = new Map<DistrictId, SubcellTerrain[][] | null>()

export function terrainMaskForDistrict(districtId: DistrictId): SubcellTerrain[][] | null {
  if (COMPILED_MASKS.has(districtId)) return COMPILED_MASKS.get(districtId) ?? null
  const raw = RAW_MASKS[districtId]
  const compiled = raw ? compile(raw) : null
  COMPILED_MASKS.set(districtId, compiled)
  return compiled
}

export function terrainAt(districtId: DistrictId, col: number, row: number): SubcellTerrain {
  if (col < 0 || row < 0) return 'land'
  if (col >= AREA_GRID_COLS || row >= AREA_GRID_ROWS) return 'land'
  const mask = terrainMaskForDistrict(districtId)
  if (!mask) return 'land'
  return mask[row]?.[col] ?? 'land'
}

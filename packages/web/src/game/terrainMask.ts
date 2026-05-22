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

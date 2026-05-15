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
  pier: 0xc6a06b, // weathered cedar plank
  shore: 0x8a9aa6, // damp gray-blue sand
  shallow_water: 0x6fb8d7, // matches the existing t_dock light blue
  open_water: 0x356a80, // darker blue — visibly different from a walkable cell
}

export function isWalkableTerrain(terrain: SubcellTerrain): boolean {
  return terrain !== 'open_water'
}

/**
 * Hand-authored masks. The world's three water-biome districts each
 * have their own geography:
 *
 *   t_dock (碼頭區): a long pier jutting from the south shore.
 *   t_temple (霓港區): neon harbour with three short docks fanning out.
 *   t_salt_marsh (鹽沼外環): a rim of marsh + reed beds around open water.
 */
const RAW_MASKS: Readonly<Partial<Record<DistrictId, readonly string[]>>> = {
  t_dock: [
    'LLLLLLSSSsssss.',
    'LLLLLLSSSsssss.',
    'LLLLLLSSSsssss.',
    'LLLLLLSSSsssss.',
    'LLLLLPPPPPsss..',
    'LLLLLPPPPPsss..',
    'LLLLLLSSSsssss.',
    'LLLLLLSSSssss..',
    'LLLLLLSSsss....',
    'LLLLLLSSsss....',
  ],
  t_temple: [
    'LLLLLLSSsss....',
    'LLLLLLPPPPss...',
    'LLLLLLSSSsss...',
    'LLLLLLPPPPss...',
    'LLLLLLSSSsss...',
    'LLLLLLPPPPss...',
    'LLLLLLSSSsss...',
    'LLLLLLSSSsss...',
    'LLLLLLSSsss....',
    'LLLLLLSSss.....',
  ],
  t_salt_marsh: [
    'LLLLSSSSSSss...',
    'LLLSSssSSSss...',
    'LLLSSs..sSss...',
    'LLSSs....sss...',
    'LLSss......ss..',
    'LLSss......ss..',
    'LLSSs....sss...',
    'LLLSSs..sSss...',
    'LLLSSssSSSss...',
    'LLLLSSSSSSss...',
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

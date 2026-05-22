import { describe, expect, it } from 'vitest'
import {
  isWalkableTerrain,
  terrainAt,
  terrainMaskForDistrict,
  TERRAIN_SPEED_MODIFIER,
  isWalkableLand,
  LAND_MASKS,
  effectiveTerrainAt,
  walkableCellsForTile,
} from './terrainMask'
import { AREA_GRID_COLS, AREA_GRID_ROWS } from './areaGrid'

describe('terrainMask.terrainMaskForDistrict', () => {
  it('returns null for land districts', () => {
    expect(terrainMaskForDistrict('t_central')).toBeNull()
    expect(terrainMaskForDistrict('t_forest')).toBeNull()
    expect(terrainMaskForDistrict('t_ruin')).toBeNull()
  })

  it('returns a fully-sized mask for water districts', () => {
    for (const id of ['t_dock', 't_temple', 't_salt_marsh'] as const) {
      const mask = terrainMaskForDistrict(id)
      expect(mask, `${id} should have a mask`).not.toBeNull()
      expect(mask!.length).toBe(AREA_GRID_ROWS)
      for (const row of mask!) expect(row.length).toBe(AREA_GRID_COLS)
    }
  })

  it('memoises compiled masks (same reference on repeat calls)', () => {
    const a = terrainMaskForDistrict('t_dock')
    const b = terrainMaskForDistrict('t_dock')
    expect(a).toBe(b)
  })
})

describe('terrainMask.isWalkableTerrain', () => {
  it('blocks only open_water', () => {
    expect(isWalkableTerrain('open_water')).toBe(false)
    expect(isWalkableTerrain('land')).toBe(true)
    expect(isWalkableTerrain('pier')).toBe(true)
    expect(isWalkableTerrain('shore')).toBe(true)
    expect(isWalkableTerrain('shallow_water')).toBe(true)
  })
})

describe('terrainMask.terrainAt', () => {
  it('returns land for land districts at any cell', () => {
    expect(terrainAt('t_central', 5, 5)).toBe('land')
    expect(terrainAt('t_forest', 0, 0)).toBe('land')
  })

  it('treats out-of-bounds coords as land', () => {
    expect(terrainAt('t_dock', -1, 5)).toBe('land')
    expect(terrainAt('t_dock', 5, -1)).toBe('land')
    expect(terrainAt('t_dock', AREA_GRID_COLS, 5)).toBe('land')
    expect(terrainAt('t_dock', 5, AREA_GRID_ROWS)).toBe('land')
  })

  it('returns the mask cell for water districts', () => {
    // v0.24.2 mask: t_dock row 4 col 8 = 'P'
    expect(terrainAt('t_dock', 8, 4)).toBe('pier')
    // Far-right of t_dock is open water on row 0
    expect(terrainAt('t_dock', AREA_GRID_COLS - 1, 0)).toBe('open_water')
  })

  it('keeps building anchors on walkable terrain (v0.24.2 bugfix)', () => {
    // b_dock_pier (2, 3) — must be walkable
    expect(terrainAt('t_dock', 2, 3)).toBe('land')
    // b_dock_warehouse (12, 3) — must be walkable
    expect(['land', 'pier', 'shore', 'shallow_water']).toContain(
      terrainAt('t_dock', 12, 3),
    )
    // b_temple_shrine (2, 0)
    expect(terrainAt('t_temple', 2, 0)).toBe('land')
    // b_temple_apartment (9, 3)
    expect(terrainAt('t_temple', 9, 3)).toBe('land')
    // b_temple_pier_cafe (5, 3)
    expect(terrainAt('t_temple', 5, 3)).toBe('land')
    // b_salt_marsh_field_station (7, 4) — was the reported unreachable
    // building. New mask MUST make this walkable.
    const marshCell = terrainAt('t_salt_marsh', 7, 4)
    expect(['land', 'pier', 'shore', 'shallow_water']).toContain(marshCell)
  })
})

describe('LAND_MASKS', () => {
  it('every tile mask has 10 rows of exactly 15 chars', () => {
    for (const [tileId, rows] of Object.entries(LAND_MASKS)) {
      expect(rows.length, `${tileId}: row count`).toBe(10)
      for (let i = 0; i < rows.length; i++) {
        expect(rows[i]!.length, `${tileId} row ${i}`).toBe(15)
      }
    }
  })

  it('building anchor cells are walkable in mask', () => {
    const anchors: [string, number, number][] = [
      ['t_forest', 1, 3], ['t_forest', 13, 3],
      ['t_mountain', 4, 1],
      ['t_desert', 2, 3], ['t_desert', 9, 3],
      ['t_central', 4, 1], ['t_central', 9, 8], ['t_central', 4, 8], ['t_central', 1, 8],
      ['t_ruin', 2, 3], ['t_ruin', 7, 3], ['t_ruin', 1, 8],
      ['t_dimai', 7, 0], ['t_dimai', 12, 1],
    ]
    for (const [tileId, col, row] of anchors) {
      const ch = LAND_MASKS[tileId]?.[row]?.[col]
      expect(['o', 'r', 'p'], `${tileId}(${col},${row})=${ch}`).toContain(ch)
    }
  })
})

describe('effectiveTerrainAt', () => {
  it('returns building for a building anchor cell (non-abandoned)', () => {
    const result = effectiveTerrainAt('t_forest', 1, 3, [{ col: 1, row: 3, state: 'operational' }])
    expect(result).toBe('building')
  })

  it('returns rough for abandoned building', () => {
    const result = effectiveTerrainAt('t_forest', 1, 3, [{ col: 1, row: 3, state: 'abandoned' }])
    expect(result).toBe('rough')
  })

  it('returns static terrain when no building at cell', () => {
    // col 0, row 0 in t_forest = 'X' → blocked
    const result = effectiveTerrainAt('t_forest', 0, 0, [])
    expect(result).toBe('blocked')
  })

  it('returns land-type terrain for water tile (no land mask)', () => {
    // Water tiles fall back to terrainAt() which returns SubcellTerrain
    const result = effectiveTerrainAt('t_dock', 0, 0, [])
    // t_dock row 0 col 0 = 'L' → 'land'
    expect(result).toBe('land')
  })
})

describe('walkableCellsForTile', () => {
  it('returns only non-blocked, non-building cells', () => {
    const cells = walkableCellsForTile('t_forest', [{ col: 1, row: 3, state: 'operational' }])
    // (1,3) is an operational building → not included
    expect(cells.find(c => c.col === 1 && c.row === 3)).toBeUndefined()
    // (0,0) is blocked → not included
    expect(cells.find(c => c.col === 0 && c.row === 0)).toBeUndefined()
    // (1,1) is open → included
    expect(cells.find(c => c.col === 1 && c.row === 1)).toBeDefined()
  })
})

describe('terrain speed modifiers', () => {
  it('open is full speed', () => {
    expect(TERRAIN_SPEED_MODIFIER.open).toBe(1.0)
  })
  it('rough is 0.75x', () => {
    expect(TERRAIN_SPEED_MODIFIER.rough).toBe(0.75)
  })
  it('path is 1.15x', () => {
    expect(TERRAIN_SPEED_MODIFIER.path).toBe(1.15)
  })
  it('blocked and building are impassable', () => {
    expect(TERRAIN_SPEED_MODIFIER.blocked).toBe(0)
    expect(TERRAIN_SPEED_MODIFIER.building).toBe(0)
  })
  it('isWalkableLand returns false for blocked and building', () => {
    expect(isWalkableLand('blocked')).toBe(false)
    expect(isWalkableLand('building')).toBe(false)
    expect(isWalkableLand('open')).toBe(true)
    expect(isWalkableLand('rough')).toBe(true)
    expect(isWalkableLand('path')).toBe(true)
  })
})

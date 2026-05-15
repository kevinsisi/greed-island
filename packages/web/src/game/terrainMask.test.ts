import { describe, expect, it } from 'vitest'
import {
  isWalkableTerrain,
  terrainAt,
  terrainMaskForDistrict,
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

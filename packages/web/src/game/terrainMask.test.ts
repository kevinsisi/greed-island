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
    // t_dock row 4 col 5 is 'P' per the blueprint
    expect(terrainAt('t_dock', 5, 4)).toBe('pier')
    // Far-right of t_dock is open water on every row
    expect(terrainAt('t_dock', AREA_GRID_COLS - 1, 0)).toBe('open_water')
  })
})

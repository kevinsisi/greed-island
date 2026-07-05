// AreaMapSvg pure-logic tests (no DOM — project uses vitest without jsdom).
// Covers: coordinate mapping, terrain colour, grid distance, terrain-grid build.

import { describe, expect, it } from 'vitest'
import {
  colToPercent,
  rowToPercent,
  pixelXToPercent,
  pixelYToPercent,
  gridDistance,
  buildTerrainGrid,
  terrainToCssColor,
  numToHex,
} from './AreaMapSvg'

// ── numToHex ──────────────────────────────────────────────────────────────

describe('numToHex', () => {
  it('converts tide colour', () => {
    expect(numToHex(0x4db8c8)).toBe('#4db8c8')
  })

  it('converts ember colour', () => {
    expect(numToHex(0xf39c20)).toBe('#f39c20')
  })

  it('pads short values with leading zeros', () => {
    expect(numToHex(0x0000ff)).toBe('#0000ff')
  })

  it('handles black', () => {
    expect(numToHex(0x000000)).toBe('#000000')
  })
})

// ── colToPercent ──────────────────────────────────────────────────────────

describe('colToPercent', () => {
  it('places col 0 at 3.33…%', () => {
    expect(parseFloat(colToPercent(0))).toBeCloseTo(100 / 30, 3)
  })

  it('places col 7 near 50%', () => {
    // (7.5/15)*100 = 50%
    expect(parseFloat(colToPercent(7))).toBeCloseTo(50, 3)
  })

  it('places col 14 near 96.67%', () => {
    // (14.5/15)*100 = 96.67%
    expect(parseFloat(colToPercent(14))).toBeCloseTo((14.5 / 15) * 100, 3)
  })

  it('output ends with %', () => {
    expect(colToPercent(3).endsWith('%')).toBe(true)
  })
})

// ── rowToPercent ──────────────────────────────────────────────────────────

describe('rowToPercent', () => {
  it('places row 0 at 5%', () => {
    // (0.5/10)*100 = 5%
    expect(parseFloat(rowToPercent(0))).toBeCloseTo(5, 3)
  })

  it('places row 4 at 45%', () => {
    // (4.5/10)*100 = 45%
    expect(parseFloat(rowToPercent(4))).toBeCloseTo(45, 3)
  })

  it('places row 9 near 95%', () => {
    expect(parseFloat(rowToPercent(9))).toBeCloseTo(95, 3)
  })
})

// ── pixelXToPercent / pixelYToPercent ─────────────────────────────────────

describe('pixelXToPercent', () => {
  it('maps 0 to 0%', () => {
    expect(parseFloat(pixelXToPercent(0))).toBe(0)
  })

  it('maps 300 to 50%', () => {
    expect(parseFloat(pixelXToPercent(300))).toBe(50)
  })

  it('maps 600 to 100%', () => {
    expect(parseFloat(pixelXToPercent(600))).toBe(100)
  })
})

describe('pixelYToPercent', () => {
  it('maps 0 to 0%', () => {
    expect(parseFloat(pixelYToPercent(0))).toBe(0)
  })

  it('maps 200 to 50%', () => {
    expect(parseFloat(pixelYToPercent(200))).toBe(50)
  })

  it('maps 400 to 100%', () => {
    expect(parseFloat(pixelYToPercent(400))).toBe(100)
  })
})

// ── gridDistance ──────────────────────────────────────────────────────────

describe('gridDistance', () => {
  it('returns 0 for same cell', () => {
    expect(gridDistance(5, 3, 5, 3)).toBe(0)
  })

  it('returns 1 for adjacent horizontal', () => {
    expect(gridDistance(4, 3, 5, 3)).toBe(1)
  })

  it('returns 1 for adjacent vertical', () => {
    expect(gridDistance(5, 3, 5, 4)).toBe(1)
  })

  it('returns 1 for diagonal (Chebyshev, not Manhattan)', () => {
    expect(gridDistance(4, 3, 5, 4)).toBe(1)
  })

  it('returns max(dx, dy) for arbitrary cells', () => {
    // dx=3, dy=5 → Chebyshev = 5
    expect(gridDistance(2, 1, 5, 6)).toBe(5)
  })

  it('is symmetric', () => {
    expect(gridDistance(0, 0, 7, 4)).toBe(gridDistance(7, 4, 0, 0))
  })
})

// ── terrainToCssColor ─────────────────────────────────────────────────────

describe('terrainToCssColor', () => {
  it('returns the darkest colour for open_water', () => {
    const c = terrainToCssColor('open_water')
    expect(c).toBe('#0a1520')
  })

  it('returns a distinct colour for land vs open_water', () => {
    expect(terrainToCssColor('land')).not.toBe(terrainToCssColor('open_water'))
  })

  it('returns a colour string for every SubcellTerrain', () => {
    for (const t of ['land', 'pier', 'shore', 'shallow_water', 'open_water'] as const) {
      const c = terrainToCssColor(t)
      expect(c).toMatch(/^#[0-9a-f]{6}$/)
    }
  })

  it('returns a colour string for every LandTerrain', () => {
    for (const t of ['open', 'rough', 'path', 'blocked', 'building'] as const) {
      const c = terrainToCssColor(t)
      expect(c).toMatch(/^#[0-9a-f]{6}$/)
    }
  })

  it('falls back to the land colour for unknown terrain', () => {
    // @ts-expect-error intentional unknown value
    const c = terrainToCssColor('banana')
    expect(c).toBe('#2a2218')
  })
})

// ── buildTerrainGrid ─────────────────────────────────────────────────────

describe('buildTerrainGrid', () => {
  it('returns exactly 10 rows', () => {
    const grid = buildTerrainGrid('t_central', [])
    expect(grid).toHaveLength(10)
  })

  it('each row has exactly 15 columns', () => {
    const grid = buildTerrainGrid('t_central', [])
    for (const row of grid) {
      expect(row).toHaveLength(15)
    }
  })

  it('marks an operational-building cell as "building"', () => {
    // t_central has a building at (4,1) in the catalog; place one manually.
    const grid = buildTerrainGrid('t_central', [{ col: 4, row: 1, state: 'operational' }])
    expect(grid[1]![4]).toBe('building')
  })

  it('marks an abandoned-building cell as "rough"', () => {
    const grid = buildTerrainGrid('t_central', [{ col: 4, row: 1, state: 'abandoned' }])
    expect(grid[1]![4]).toBe('rough')
  })

  it('uses water terrain for t_dock', () => {
    // t_dock row 0 col 14 is '.' = open_water in terrainMask
    const grid = buildTerrainGrid('t_dock', [])
    expect(grid[0]![14]).toBe('open_water')
  })

  it('all cells have a valid terrain type (no undefined)', () => {
    const grid = buildTerrainGrid('t_forest', [])
    for (const row of grid) {
      for (const cell of row) {
        expect(cell).toBeDefined()
      }
    }
  })
})

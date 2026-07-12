// map-visual-language — 新視覺元件的純函式測試。
import { describe, expect, it } from 'vitest'
import { detailRand, terrainToCssColor } from './AreaMapSvg'
import { archetypeFor } from './animalFigure'
import { litWindowsFor, roofColorFor } from './buildingFacade'

describe('detailRand (terrain texture hash)', () => {
  it('is deterministic for the same cell+salt', () => {
    expect(detailRand(3, 7, 13)).toBe(detailRand(3, 7, 13))
  })

  it('differs across salts for the same cell', () => {
    expect(detailRand(3, 7, 13)).not.toBe(detailRand(3, 7, 14))
  })

  it('stays in [0, 1)', () => {
    for (let c = 0; c < 15; c++) {
      for (let r = 0; r < 10; r++) {
        const v = detailRand(c, r, 7)
        expect(v).toBeGreaterThanOrEqual(0)
        expect(v).toBeLessThan(1)
      }
    }
  })
})

describe('terrain palette contract (map-visual-language)', () => {
  it('path is the brightest walkable land terrain', () => {
    const lum = (hex: string) => {
      const n = parseInt(hex.slice(1), 16)
      return ((n >> 16) & 0xff) * 0.299 + ((n >> 8) & 0xff) * 0.587 + (n & 0xff) * 0.114
    }
    const path = lum(terrainToCssColor('path'))
    for (const t of ['open', 'rough', 'land', 'shore', 'pier'] as const) {
      expect(path).toBeGreaterThan(lum(terrainToCssColor(t)))
    }
  })

  it('water terrains are the only blue-dominant colours', () => {
    const isBlueDominant = (hex: string) => {
      const n = parseInt(hex.slice(1), 16)
      return (n & 0xff) > ((n >> 16) & 0xff)
    }
    expect(isBlueDominant(terrainToCssColor('open_water'))).toBe(true)
    expect(isBlueDominant(terrainToCssColor('shallow_water'))).toBe(true)
    for (const t of ['open', 'rough', 'path', 'shore', 'pier', 'land'] as const) {
      expect(isBlueDominant(terrainToCssColor(t))).toBe(false)
    }
  })
})

describe('archetypeFor (animal silhouettes)', () => {
  it('maps known species ids to expected archetypes', () => {
    expect(archetypeFor('forest_deer')).toBe('deer')
    expect(archetypeFor('moss_boar')).toBe('heavy')
    expect(archetypeFor('mountain_bear')).toBe('heavy')
    expect(archetypeFor('ember_owl')).toBe('bird')
    expect(archetypeFor('marsh_heron')).toBe('bird')
    expect(archetypeFor('marsh_fish')).toBe('fish')
    expect(archetypeFor('stone_lizard')).toBe('crawler')
    expect(archetypeFor('fog_wolf')).toBe('quadruped')
    expect(archetypeFor('cliff_goat')).toBe('quadruped')
  })

  it('falls back to quadruped for unknown species', () => {
    expect(archetypeFor('mystery_beast')).toBe('quadruped')
  })
})

describe('buildingFacade state → light', () => {
  it('operational lights both windows', () => {
    expect(litWindowsFor('operational')).toBe(2)
  })
  it('damaged lights one window', () => {
    expect(litWindowsFor('damaged')).toBe(1)
  })
  it('abandoned and under_construction light none', () => {
    expect(litWindowsFor('abandoned')).toBe(0)
    expect(litWindowsFor('under_construction')).toBe(0)
  })
  it('roof colour has a fallback for unknown types', () => {
    expect(roofColorFor('temple')).not.toBe(roofColorFor('restaurant'))
    expect(roofColorFor('unknown_type')).toMatch(/^#[0-9a-f]{6}$/)
  })
})

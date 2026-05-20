import { describe, expect, it } from 'vitest'
import { getGoodsSpecies, listGoodsSpecies } from './catalog.js'

describe('goods catalog', () => {
  it('contains exactly 13 species', () => {
    expect(listGoodsSpecies()).toHaveLength(13)
  })

  it('is frozen (cannot be mutated)', () => {
    const catalog = listGoodsSpecies()
    expect(Object.isFrozen(catalog)).toBe(true)
    for (const species of catalog) {
      expect(Object.isFrozen(species)).toBe(true)
    }
  })

  it('returns undefined for unknown goodsId', () => {
    expect(getGoodsSpecies('platinum_bar')).toBeUndefined()
  })

  it('returns correct entry for known goodsId', () => {
    const meat = getGoodsSpecies('meat')
    expect(meat).toBeDefined()
    expect(meat?.nameZh).toBe('肉')
    expect(meat?.unit).toBe('piece')
    expect(meat?.tier).toBe('raw')
  })
})

import { describe, it, expect } from 'vitest'
import { CARD_CATALOG_TOTAL, CARD_RANKS, assertValidCatalog } from './types.js'
import { loadCardCatalog } from './loader.js'

describe('card catalog', () => {
  const catalog = loadCardCatalog()

  it('contains exactly 100 entries', () => {
    expect(catalog.entries.length).toBe(CARD_CATALOG_TOTAL)
  })

  it('uses unique sequential ids 1..100', () => {
    const ids = catalog.entries.map((e) => e.id).sort((a, b) => a - b)
    expect(ids).toStrictEqual(Array.from({ length: 100 }, (_, i) => i + 1))
  })

  it('uses only valid ranks', () => {
    for (const entry of catalog.entries) {
      expect(CARD_RANKS).toContain(entry.rank)
    }
  })

  it('has non-empty bilingual names and rule references for every entry', () => {
    for (const entry of catalog.entries) {
      expect(entry.nameZh.length).toBeGreaterThan(0)
      expect(entry.nameEn.length).toBeGreaterThan(0)
      expect(entry.discoveryRuleId.length).toBeGreaterThan(0)
      expect(entry.restrictionRuleId.length).toBeGreaterThan(0)
    }
  })

  it('passes the strict validator', () => {
    expect(() => assertValidCatalog(catalog)).not.toThrow()
  })
})

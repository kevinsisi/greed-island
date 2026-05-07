import { describe, it, expect } from 'vitest'
import {
  CARD_CATALOG_TOTAL,
  CARD_RANKS,
  CARD_CATEGORIES,
  CARD_ACQUISITION_METHODS,
  CATEGORY_ID_RANGES,
  assertValidCatalog,
} from './types.js'
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

  it('uses only valid ranks (S/A/B/C/D)', () => {
    for (const entry of catalog.entries) {
      expect(CARD_RANKS).toContain(entry.rank)
    }
  })

  it('uses only valid categories', () => {
    for (const entry of catalog.entries) {
      expect(CARD_CATEGORIES).toContain(entry.category)
    }
  })

  it('keeps each id within its declared category range', () => {
    for (const entry of catalog.entries) {
      const range = CATEGORY_ID_RANGES.find(
        (r) => entry.id >= r.from && entry.id <= r.to
      )
      expect(range).toBeDefined()
      expect(entry.category).toBe(range!.category)
    }
  })

  it('has valid maxCopies and acquisitionMethod for every entry', () => {
    for (const entry of catalog.entries) {
      expect(entry.maxCopies).toBeGreaterThan(0)
      expect(CARD_ACQUISITION_METHODS).toContain(entry.acquisitionMethod)
      expect(entry.acquisitionDetail.length).toBeGreaterThan(0)
      expect(entry.effectDescription.length).toBeGreaterThan(0)
    }
  })

  it('keeps S/A/B ranks out of random_drop pool (high-rank earned only)', () => {
    for (const entry of catalog.entries) {
      if (entry.rank === 'S' || entry.rank === 'A' || entry.rank === 'B') {
        expect(entry.acquisitionMethod).not.toBe('random_drop')
      }
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

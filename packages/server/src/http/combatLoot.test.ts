import { describe, expect, it } from 'vitest'
import {
  combatLootPool,
  combatLootPosition,
  computeCombatLootCardId,
  computeCombatLootChance,
  pickDeterministicIndex,
} from './combatLoot.js'
import { loadCardCatalog } from '../cards/loader.js'

const catalog = loadCardCatalog()

describe('computeCombatLootChance', () => {
  it('applies base + duration bonus with cap', () => {
    expect(computeCombatLootChance({ durationRounds: 0, rareWindowOpen: false, areaSafety: null })).toBeCloseTo(0.05)
    // 5 rounds = 50 ticks → +0.005
    expect(computeCombatLootChance({ durationRounds: 5, rareWindowOpen: false, areaSafety: null })).toBeCloseTo(0.055)
    // duration bonus caps at +0.10
    expect(computeCombatLootChance({ durationRounds: 100000, rareWindowOpen: false, areaSafety: null })).toBeCloseTo(0.15)
  })

  it('applies rare window ×2 and low safety ×1.3', () => {
    expect(computeCombatLootChance({ durationRounds: 0, rareWindowOpen: true, areaSafety: null })).toBeCloseTo(0.1)
    expect(computeCombatLootChance({ durationRounds: 0, rareWindowOpen: false, areaSafety: 20 })).toBeCloseTo(0.065)
    expect(computeCombatLootChance({ durationRounds: 0, rareWindowOpen: true, areaSafety: 20 })).toBeCloseTo(0.13)
    // safety ≥ threshold 不套乘數
    expect(computeCombatLootChance({ durationRounds: 0, rareWindowOpen: false, areaSafety: 80 })).toBeCloseTo(0.05)
  })
})

describe('combatLootPool', () => {
  it('uses the canonical combat_victory acquisition pool', () => {
    const pool = combatLootPool(catalog)
    expect(pool.length).toBeGreaterThan(0)
    expect(pool.every((e) => e.acquisitionMethod === 'combat_victory')).toBe(true)
  })
})

describe('computeCombatLootCardId', () => {
  it('is deterministic for the same combatId', () => {
    const input = { combatId: 'combat_x', durationRounds: 8, rareWindowOpen: true, areaSafety: 10, catalog }
    const first = computeCombatLootCardId(input)
    for (let i = 0; i < 50; i += 1) {
      expect(computeCombatLootCardId(input)).toBe(first)
    }
  })

  it('only ever returns ids from the loot pool (or null)', () => {
    const poolIds = new Set(combatLootPool(catalog).map((e) => e.id))
    for (let i = 0; i < 200; i += 1) {
      const id = computeCombatLootCardId({
        combatId: `combat_${i}`,
        durationRounds: i % 20,
        rareWindowOpen: i % 2 === 0,
        areaSafety: i % 3 === 0 ? 10 : 80,
        catalog,
      })
      if (id !== null) expect(poolIds.has(id)).toBe(true)
    }
  })
})

describe('combatLootPosition / pickDeterministicIndex', () => {
  it('returns stable in-bounds positions', () => {
    const a = combatLootPosition('combat_y')
    expect(a).toEqual(combatLootPosition('combat_y'))
    expect(a.x).toBeGreaterThanOrEqual(2)
    expect(a.x).toBeLessThanOrEqual(12)
    expect(a.y).toBeGreaterThanOrEqual(2)
    expect(a.y).toBeLessThanOrEqual(7)
  })

  it('pickDeterministicIndex is stable and in range', () => {
    expect(pickDeterministicIndex('seed', 5)).toBe(pickDeterministicIndex('seed', 5))
    for (let len = 1; len <= 7; len += 1) {
      const idx = pickDeterministicIndex(`s${len}`, len)
      expect(idx).toBeGreaterThanOrEqual(0)
      expect(idx).toBeLessThan(len)
    }
  })
})

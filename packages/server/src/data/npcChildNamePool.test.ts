import { describe, expect, it } from 'vitest'
import { NPC_CHILD_NAME_POOL, generateChildName } from './npcChildNamePool.js'

describe('npcChildNamePool', () => {
  it('pool has at least 20 entries', () => {
    expect(NPC_CHILD_NAME_POOL.length).toBeGreaterThanOrEqual(20)
  })

  it('every entry has non-empty zh and en', () => {
    for (const e of NPC_CHILD_NAME_POOL) {
      expect(e.nameZh).not.toBe('')
      expect(e.nameEn).not.toBe('')
    }
  })

  it('generateChildName is deterministic for same input', () => {
    const a = generateChildName('household.alice.bob.child.1', 'household.alice.bob')
    const b = generateChildName('household.alice.bob.child.1', 'household.alice.bob')
    expect(a).toEqual(b)
  })

  it('returns a non-empty bilingual name', () => {
    const n = generateChildName('any.id', 'any.hh')
    expect(typeof n.nameZh).toBe('string')
    expect(typeof n.nameEn).toBe('string')
    expect(n.nameZh.length).toBeGreaterThan(0)
    expect(n.nameEn.length).toBeGreaterThan(0)
  })

  it('distinct childIds usually produce distinct names across 20 samples', () => {
    const names = new Set<string>()
    for (let i = 0; i < 20; i++) {
      const n = generateChildName(`household.x.y.child.${i}`, `household.x.y`)
      names.add(n.nameZh)
    }
    // Hash-pool collisions are expected for a pool of ~36 entries with 20 draws.
    // Birthday-paradox-ish bound: empirically expect ≥ 10 distinct in any sample.
    expect(names.size).toBeGreaterThanOrEqual(10)
  })

  it('different households for same child slot produce different names', () => {
    // Mixing householdId into the hash means siblings of different households
    // with the same slot index (e.g., '.child.1') don't share names.
    const collisions = new Set<string>()
    for (let i = 0; i < 10; i++) {
      const n = generateChildName(`household.h${i}.child.1`, `household.h${i}`)
      collisions.add(n.nameZh)
    }
    expect(collisions.size).toBeGreaterThanOrEqual(5)
  })
})

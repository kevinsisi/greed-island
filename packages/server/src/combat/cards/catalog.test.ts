import { describe, expect, it } from 'vitest'
import {
  COMBAT_CARD_CATALOG,
  getCombatCard,
  listCombatCardClasses,
  priorityForCardClass,
  type CombatCardPriority,
} from './catalog.js'

describe('combat.cards.catalog', () => {
  it('exposes the 13 card classes from design D3', () => {
    const ids = listCombatCardClasses()
    expect(ids).toEqual([
      'BUFF_TICK',
      'COUNTERSPELL',
      'DOT_TICK',
      'FIRE_LASH',
      'HASTE',
      'INTERRUPT',
      'MEND',
      'NO_ESCAPE',
      'PHASE_SHIFT',
      'REGEN',
      'SHIELD',
      'SILENCE',
      'STUN',
      'TIDE_STRIKE',
    ])
  })

  it('groups cards into the 5 priority bands', () => {
    const byBand = new Map<CombatCardPriority, string[]>([
      [0, []],
      [1, []],
      [2, []],
      [3, []],
      [4, []],
    ])
    for (const def of Object.values(COMBAT_CARD_CATALOG)) {
      byBand.get(def.priority)!.push(def.cardClass)
    }
    expect(byBand.get(0)!.sort()).toEqual(['COUNTERSPELL', 'INTERRUPT', 'PHASE_SHIFT'])
    expect(byBand.get(1)!.sort()).toEqual(['NO_ESCAPE', 'SILENCE', 'STUN'])
    expect(byBand.get(2)!.sort()).toEqual(['FIRE_LASH', 'MEND', 'TIDE_STRIKE'])
    expect(byBand.get(3)!.sort()).toEqual(['HASTE', 'REGEN', 'SHIELD'])
    expect(byBand.get(4)!.sort()).toEqual(['BUFF_TICK', 'DOT_TICK'])
  })

  it('only Band 0 cards bypass target-lock', () => {
    for (const def of Object.values(COMBAT_CARD_CATALOG)) {
      if (def.priority === 0) {
        expect(def.bypassesTargetLock, `${def.cardClass} should bypass lock`).toBe(true)
      } else {
        expect(def.bypassesTargetLock, `${def.cardClass} should respect lock`).toBe(false)
      }
    }
  })

  it('FIRE_LASH compiles to damage + burn status (design D4 example)', () => {
    const card = getCombatCard('FIRE_LASH')!
    expect(card.effects).toHaveLength(2)
    expect(card.effects[0]).toMatchObject({ kind: 'damage', power: 18, element: 'fire' })
    expect(card.effects[1]).toMatchObject({
      kind: 'status_apply',
      statusId: 'burn',
      remainingTicks: 30,
    })
  })

  it('priorityForCardClass returns the matching band for known cards', () => {
    expect(priorityForCardClass('PHASE_SHIFT')).toBe(0)
    expect(priorityForCardClass('STUN')).toBe(1)
    expect(priorityForCardClass('FIRE_LASH')).toBe(2)
    expect(priorityForCardClass('SHIELD')).toBe(3)
    expect(priorityForCardClass('DOT_TICK')).toBe(4)
  })

  it('priorityForCardClass returns null for unknown cards', () => {
    expect(priorityForCardClass('NOT_A_CARD')).toBeNull()
    expect(getCombatCard('NOT_A_CARD')).toBeNull()
  })

  it('catalog is frozen so a stray write cannot drift priorities', () => {
    expect(Object.isFrozen(COMBAT_CARD_CATALOG)).toBe(true)
  })

  it('every card def carries at least one effect', () => {
    for (const def of Object.values(COMBAT_CARD_CATALOG)) {
      expect(def.effects.length, `${def.cardClass} has effects`).toBeGreaterThan(0)
    }
  })

  it('priority values stay within the design D3 range 0–4', () => {
    for (const def of Object.values(COMBAT_CARD_CATALOG)) {
      expect(def.priority).toBeGreaterThanOrEqual(0)
      expect(def.priority).toBeLessThanOrEqual(4)
      expect(Number.isInteger(def.priority)).toBe(true)
    }
  })
})

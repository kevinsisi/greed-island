import { describe, expect, it } from 'vitest'
import { BASE_HAND_CLASSES, TECHNIQUE_COMBAT_UNLOCKS, allowedClassesFor, computeHandLoadout } from './handLoadout.js'
import { TECHNIQUE_CARDS } from '../cards/techniques.js'
import { getCombatCard } from './cards/catalog.js'

describe('computeHandLoadout', () => {
  it('gives everyone the basic hand with no techniques owned', () => {
    const hand = computeHandLoadout([])
    expect(hand.map((c) => c.cardClass)).toEqual([...BASE_HAND_CLASSES])
    expect(hand.every((c) => c.source === 'basic')).toBe(true)
  })

  it('unlocks combat cards from owned techniques with technique names as labels', () => {
    const hand = computeHandLoadout([1003, 1001])
    const classes = hand.map((c) => c.cardClass)
    expect(classes).toContain('FIRE_LASH')
    expect(classes).toContain('NO_ESCAPE')
    const fireLash = hand.find((c) => c.cardClass === 'FIRE_LASH')!
    expect(fireLash.source).toBe('technique')
    expect(fireLash.techniqueId).toBe(1001)
    expect(fireLash.labelZh).toBe('潮燼一閃')
  })

  it('ignores non-combat / unknown technique ids and duplicates', () => {
    const hand = computeHandLoadout([1008, 1013, 9999, 1002, 1002])
    const classes = hand.map((c) => c.cardClass)
    expect(classes).toEqual([...BASE_HAND_CLASSES, 'PHASE_SHIFT'])
  })

  it('every combat technique maps to a real catalog combat card', () => {
    for (const [techniqueId, cardClass] of Object.entries(TECHNIQUE_COMBAT_UNLOCKS)) {
      expect(getCombatCard(cardClass), `technique ${techniqueId} → ${cardClass}`).not.toBeNull()
      const technique = TECHNIQUE_CARDS.find((t) => t.id === Number(techniqueId))
      expect(technique?.category, `technique ${techniqueId} must be combat`).toBe('combat')
    }
  })

  it('all 7 combat techniques are mapped', () => {
    const combatTechniques = TECHNIQUE_CARDS.filter((t) => t.category === 'combat')
    expect(Object.keys(TECHNIQUE_COMBAT_UNLOCKS)).toHaveLength(combatTechniques.length)
  })
})

describe('allowedClassesFor', () => {
  it('contains the base hand plus owned unlocks only', () => {
    const allowed = allowedClassesFor([1004])
    expect(allowed.has('TIDE_STRIKE')).toBe(true)
    expect(allowed.has('MEND')).toBe(true)
    expect(allowed.has('STUN')).toBe(true)
    expect(allowed.has('FIRE_LASH')).toBe(false)
  })
})

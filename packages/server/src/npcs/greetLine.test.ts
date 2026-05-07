import { describe, expect, it } from 'vitest'
import { derivePersonalityGreetLine } from './greetLine.js'
import type { NpcProfile } from './types.js'

function profile(personality: NpcProfile['personality'], id = 'test.npc'): NpcProfile {
  return {
    id,
    name: { zh: '阿測', en: 'Tester' },
    role: { zh: '路人', en: 'Passerby' },
    defaultLocation: 't_central',
    routine: [],
    triggers: [],
    memory: { consultsEventTypes: [], decayFn: 'none', decayParam: 0 },
    personality,
  }
}

describe('derivePersonalityGreetLine', () => {
  it('is deterministic for the same profile', () => {
    const p = profile({ calmness: 0.5, patience: 0.5, greed: 0.5 })
    expect(derivePersonalityGreetLine(p)).toEqual(derivePersonalityGreetLine(p))
  })

  it('routes faction=temple to reverent bucket', () => {
    const out = derivePersonalityGreetLine(
      profile({ calmness: 0.5, patience: 0.5, greed: 0.5, factionLean: 'temple' })
    )
    expect(out.zh + out.en).toMatch(/施主|tea|bell|friend|heart/i)
  })

  it('routes high greed to merchant bucket', () => {
    const out = derivePersonalityGreetLine(
      profile({ calmness: 0.5, patience: 0.5, greed: 0.8 }, 'merchant.x')
    )
    expect(out.zh + out.en).toMatch(/生意|business|wares|price|information/i)
  })

  it('routes low calmness + ok patience to cheerful bucket', () => {
    const out = derivePersonalityGreetLine(
      profile({ calmness: 0.2, patience: 0.6, greed: 0.3 }, 'cheerful.x')
    )
    expect(out.zh + out.en).toMatch(/歡迎|嘿|wonderful|welcome|hey/i)
  })

  it('routes low patience to gruff bucket', () => {
    const out = derivePersonalityGreetLine(
      profile({ calmness: 0.5, patience: 0.2, greed: 0.3 }, 'gruff.x')
    )
    expect(out.zh + out.en).toMatch(/嘖|tch|擋路|out-of-towner|speak/i)
  })

  it('different ids → different lines within the same bucket (varies)', () => {
    const a = derivePersonalityGreetLine(profile({ calmness: 0.5, patience: 0.5, greed: 0.5 }, 'a.npc'))
    const b = derivePersonalityGreetLine(profile({ calmness: 0.5, patience: 0.5, greed: 0.5 }, 'b.npc.different'))
    const c = derivePersonalityGreetLine(profile({ calmness: 0.5, patience: 0.5, greed: 0.5 }, 'c.npc.another'))
    const distinct = new Set([a.zh, b.zh, c.zh]).size
    expect(distinct).toBeGreaterThanOrEqual(2)
  })

  it('substitutes {name} in chosen line', () => {
    const out = derivePersonalityGreetLine({
      ...profile({ calmness: 0.95, patience: 0.7, greed: 0.3 }, 'reserved.x'),
      name: { zh: '林深', en: 'Lin Shen' },
    })
    expect(out.zh.includes('{name}')).toBe(false)
    expect(out.en.includes('{name}')).toBe(false)
  })
})

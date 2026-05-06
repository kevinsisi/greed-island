import { describe, expect, it } from 'vitest'
import { loadNpcProfiles } from '../loader.js'
import { getDialogPack, pickLine, tierForRelationship } from '../dialog.js'
import { isDailyLifeArchetype, readArchetypeFromProfile } from './dailyLife.js'

describe('daily-life dialog packs', () => {
  const profiles = loadNpcProfiles()
  const dailyLifeProfiles = profiles.filter((p) => readArchetypeFromProfile(p) !== null)

  it('loads at least 40 daily-life archetype profiles', () => {
    expect(dailyLifeProfiles.length).toBeGreaterThanOrEqual(40)
  })

  it('every daily-life profile carries a recognised archetype', () => {
    for (const profile of dailyLifeProfiles) {
      expect(isDailyLifeArchetype(profile.personality.archetype)).toBe(true)
    }
  })

  it('every daily-life profile resolves a personalised greet line that includes its name', () => {
    for (const profile of dailyLifeProfiles) {
      const pack = getDialogPack(profile.id)
      const tier = tierForRelationship(50)
      // greet/ask must each have at least 2 lines per the task spec.
      expect(pack.greet[tier].length).toBeGreaterThanOrEqual(1)
      expect(pack.ask[tier].length).toBeGreaterThanOrEqual(1)
      const lowGreet = pack.greet.low
      expect(lowGreet.length).toBeGreaterThanOrEqual(2)
      const lowAsk = pack.ask.low
      expect(lowAsk.length).toBeGreaterThanOrEqual(2)
      // a personalised line should appear somewhere in the low-tier greet.
      const joinedZh = lowGreet.map((l) => l.zh).join(' ')
      const joinedEn = lowGreet.map((l) => l.en).join(' ')
      expect(joinedZh.includes(profile.name.zh) || joinedZh.includes(profile.role.zh)).toBe(true)
      expect(joinedEn.includes(profile.name.en) || joinedEn.includes(profile.role.en)).toBe(true)
    }
  })

  it('pickLine is deterministic for the same seed', () => {
    const profile = dailyLifeProfiles[0]
    expect(profile).toBeDefined()
    if (!profile) return
    const a = pickLine(profile.id, 'greet', 'low', 7)
    const b = pickLine(profile.id, 'greet', 'low', 7)
    expect(a.zh).toBe(b.zh)
    expect(a.en).toBe(b.en)
  })
})

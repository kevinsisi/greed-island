import { describe, it, expect } from 'vitest'
import { loadNpcProfiles } from './loader.js'

describe('NPC profile loader', () => {
  const profiles = loadNpcProfiles()

  it('loads at least three sample profiles', () => {
    expect(profiles.length).toBeGreaterThanOrEqual(3)
  })

  it('returns profiles sorted by id (deterministic order)', () => {
    const ids = profiles.map((p) => p.id)
    const sorted = [...ids].sort((a, b) => a.localeCompare(b))
    expect(ids).toStrictEqual(sorted)
  })

  it('every profile has bilingual name and role', () => {
    for (const profile of profiles) {
      expect(profile.name.zh.length).toBeGreaterThan(0)
      expect(profile.name.en.length).toBeGreaterThan(0)
      expect(profile.role.zh.length).toBeGreaterThan(0)
      expect(profile.role.en.length).toBeGreaterThan(0)
    }
  })

  it('every routine slot uses tick-of-day bounds within 0..17280', () => {
    const TICKS_PER_DAY = 17_280
    for (const profile of profiles) {
      for (const slot of profile.routine) {
        expect(slot.fromTickOfDay).toBeGreaterThanOrEqual(0)
        expect(slot.toTickOfDay).toBeLessThanOrEqual(TICKS_PER_DAY)
        expect(slot.toTickOfDay).toBeGreaterThan(slot.fromTickOfDay)
      }
    }
  })

  it('every trigger has a unique id within its profile', () => {
    for (const profile of profiles) {
      const ids = profile.triggers.map((t) => t.id)
      expect(new Set(ids).size).toBe(ids.length)
    }
  })
})

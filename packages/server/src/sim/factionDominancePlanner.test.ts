import { describe, expect, it } from 'vitest'
import { planFactionDominance } from './factionDominancePlanner.js'
import type { FactionId } from './areaStateEngine.js'

const NONE = new Set<FactionId>()

describe('planFactionDominance', () => {
  it('returns null when all factions have tiles', () => {
    expect(planFactionDominance({
      currentTileCounts: { tide_hunters: 3, free_runners: 2, guild: 1, civilian: 0 },
      previousTileCounts: { tide_hunters: 3, free_runners: 2, guild: 1, civilian: 0 },
      shiftFiredFor: NONE,
    })).toBeNull()
  })

  it('returns null when no faction had tiles before', () => {
    expect(planFactionDominance({
      currentTileCounts: { tide_hunters: 0, free_runners: 0, guild: 0, civilian: 0 },
      previousTileCounts: { tide_hunters: 0, free_runners: 0, guild: 0, civilian: 0 },
      shiftFiredFor: NONE,
    })).toBeNull()
  })

  it('returns the faction that went from tiles to 0', () => {
    expect(planFactionDominance({
      currentTileCounts: { tide_hunters: 4, free_runners: 0, guild: 2, civilian: 0 },
      previousTileCounts: { tide_hunters: 3, free_runners: 3, guild: 2, civilian: 0 },
      shiftFiredFor: NONE,
    })).toBe('free_runners')
  })

  it('returns null when shift already fired for the defeated faction', () => {
    expect(planFactionDominance({
      currentTileCounts: { tide_hunters: 4, free_runners: 0, guild: 2, civilian: 0 },
      previousTileCounts: { tide_hunters: 3, free_runners: 3, guild: 2, civilian: 0 },
      shiftFiredFor: new Set<FactionId>(['free_runners']),
    })).toBeNull()
  })

  it('returns first defeated faction if multiple went to 0 in same tick', () => {
    const result = planFactionDominance({
      currentTileCounts: { tide_hunters: 8, free_runners: 0, guild: 0, civilian: 0 },
      previousTileCounts: { tide_hunters: 5, free_runners: 2, guild: 1, civilian: 0 },
      shiftFiredFor: NONE,
    })
    expect(['free_runners', 'guild']).toContain(result)
  })

  it('returns null when faction dropped tiles but still has some', () => {
    expect(planFactionDominance({
      currentTileCounts: { tide_hunters: 5, free_runners: 1, guild: 2, civilian: 0 },
      previousTileCounts: { tide_hunters: 4, free_runners: 3, guild: 2, civilian: 0 },
      shiftFiredFor: NONE,
    })).toBeNull()
  })
})

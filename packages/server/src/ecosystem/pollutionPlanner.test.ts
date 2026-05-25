import { describe, expect, it } from 'vitest'
import { planPollution } from './pollutionPlanner.js'

describe('planPollution', () => {
  it('returns null when pressure stays below threshold', () => {
    expect(planPollution({ currentPressureLevel: 20, previousPressureLevel: 0 })).toBeNull()
  })

  it('returns increased when pressure first crosses threshold', () => {
    expect(planPollution({ currentPressureLevel: 40, previousPressureLevel: 20 })).toBe('increased')
  })

  it('returns increased when pressure crosses threshold from 0', () => {
    expect(planPollution({ currentPressureLevel: 60, previousPressureLevel: 0 })).toBe('increased')
  })

  it('returns null when pressure stays above threshold', () => {
    expect(planPollution({ currentPressureLevel: 80, previousPressureLevel: 60 })).toBeNull()
  })

  it('returns null when pressure stays at threshold', () => {
    expect(planPollution({ currentPressureLevel: 40, previousPressureLevel: 40 })).toBeNull()
  })

  it('returns recovered when pressure drops below threshold', () => {
    expect(planPollution({ currentPressureLevel: 0, previousPressureLevel: 40 })).toBe('recovered')
  })

  it('returns recovered when pressure drops below threshold from high value', () => {
    expect(planPollution({ currentPressureLevel: 20, previousPressureLevel: 60 })).toBe('recovered')
  })

  it('returns null when pressure stays at 0', () => {
    expect(planPollution({ currentPressureLevel: 0, previousPressureLevel: 0 })).toBeNull()
  })
})

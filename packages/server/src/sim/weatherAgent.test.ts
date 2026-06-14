import { describe, expect, it } from 'vitest'
import { planWeatherAgentIntent } from './weatherAgent.js'

describe('weather agent policy', () => {
  it('produces deterministic intent for identical inputs', () => {
    const input = {
      tick: 60,
      cadenceStep: 1,
      currentWeather: '晴' as const,
      cycleWeather: '陰' as const,
      season: '潮之月',
      activeWorldEventIds: [] as string[],
      areas: [
        { tileId: 't_forest', resources: { food: 20, safety: 80, economy: 50 } },
      ],
    }

    expect(planWeatherAgentIntent(input)).toEqual(planWeatherAgentIntent(input))
  })

  it('uses ecosystem pressure before cadence weather', () => {
    const intent = planWeatherAgentIntent({
      tick: 60,
      cadenceStep: 1,
      currentWeather: '晴',
      cycleWeather: '陰',
      season: '潮之月',
      activeWorldEventIds: [],
      areas: [{ tileId: 't_forest', resources: { food: 10, safety: 90, economy: 60 } }],
    })

    expect(intent).toEqual(expect.objectContaining({
      desiredWeather: '霧雨',
      mood: 'brooding',
      pressureSource: 'ecosystem',
    }))
    expect(intent?.thought).toContain('林線與水脈')
  })

  it('returns null when cadence does not change weather', () => {
    expect(planWeatherAgentIntent({
      tick: 60,
      cadenceStep: 1,
      currentWeather: '陰',
      cycleWeather: '陰',
      season: '潮之月',
      activeWorldEventIds: [],
      areas: [],
    })).toBeNull()
  })
})

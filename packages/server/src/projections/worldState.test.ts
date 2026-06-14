import { describe, expect, it } from 'vitest'
import { WorldStateProjection } from './worldState.js'
import type { Event } from '../kernel/types.js'

function makeEvent(
  eventType: string,
  data: Record<string, unknown>,
  sequence = 1,
  tick = 10,
): Event {
  return {
    id: `ev-${sequence}`,
    eventType,
    actorId: 'system',
    sequence,
    tick,
    timestamp: new Date().toISOString(),
    payload: { data },
  } as unknown as Event
}

describe('WorldStateProjection', () => {
  it('starts unhydrated with null weather/season and closed rare window', () => {
    const proj = new WorldStateProjection()
    expect(proj.isHydrated()).toBe(false)
    expect(proj.getWeather()).toBeNull()
    expect(proj.getSeason()).toBeNull()
    expect(proj.getRareWindow()).toEqual({ open: false, closesAt: null })
    expect(proj.getActiveEventSeeds()).toHaveLength(0)
  })

  it('tracks weather from WEATHER_CHANGE', () => {
    const proj = new WorldStateProjection()
    proj.project(makeEvent('WEATHER_CHANGE', { from: 'clear', to: 'rain', narration: '...' }))
    expect(proj.getWeather()).toBe('rain')
    expect(proj.getWeatherAgent().latestAcceptedWeather).toBe('rain')
    expect(proj.isHydrated()).toBe(true)
  })

  it('tracks weather-agent thoughts from WEATHER_INTENT_PROPOSED', () => {
    const proj = new WorldStateProjection()
    proj.project(makeEvent('WEATHER_INTENT_PROPOSED', {
      currentWeather: '晴',
      desiredWeather: '霧雨',
      mood: 'watchful',
      pressureSource: 'cadence',
      thought: '天空想替街口降下一場細雨。',
      reason: 'weather cadence shaped the weather-agent intent',
      cadenceKey: 'weather:1:cadence',
      proposedAtTick: 10,
      narration: '天氣意志低語：天空想替街口降下一場細雨。',
    }))

    expect(proj.getWeatherAgent()).toEqual(expect.objectContaining({
      mood: 'watchful',
      latestDesiredWeather: '霧雨',
      latestAcceptedWeather: null,
    }))
    expect(proj.getWeatherAgent().latestThought?.thought).toContain('天空想替街口')
    expect(proj.getWeatherAgent().recentThoughts).toHaveLength(1)
  })

  it('rebuilds weather-agent thoughts deterministically', () => {
    const events = [
      makeEvent('WEATHER_CHANGE', { from: '晴', to: '陰', narration: '...' }, 2),
      makeEvent('WEATHER_INTENT_PROPOSED', {
        currentWeather: '晴',
        desiredWeather: '陰',
        mood: 'calm',
        pressureSource: 'cadence',
        thought: '節律走到第 1 拍，我讓天空轉為陰。',
        reason: 'weather cadence shaped the weather-agent intent',
        cadenceKey: 'weather:1:cadence',
        proposedAtTick: 10,
        narration: '天氣意志低語：節律走到第 1 拍，我讓天空轉為陰。',
      }, 1),
    ]
    const p1 = new WorldStateProjection()
    const p2 = new WorldStateProjection()

    p1.rebuildFromEvents(events)
    p2.rebuildFromEvents(events)

    expect(p1.getWeatherAgent()).toEqual(p2.getWeatherAgent())
    expect(p1.canonicalHash()).toBe(p2.canonicalHash())
  })

  it('tracks season from SEASON_CHANGE', () => {
    const proj = new WorldStateProjection()
    proj.project(makeEvent('SEASON_CHANGE', { from: 'spring', to: 'summer', narration: '...' }))
    expect(proj.getSeason()).toBe('summer')
    expect(proj.isHydrated()).toBe(true)
  })

  it('opens rare window from RARE_WINDOW_OPEN', () => {
    const proj = new WorldStateProjection()
    proj.project(makeEvent('RARE_WINDOW_OPEN', { windowId: 'tide_festival', closesAtTick: 500, narration: '...' }))
    expect(proj.getRareWindow()).toEqual({ open: true, closesAt: 500 })
    expect(proj.isHydrated()).toBe(true)
  })

  it('closes rare window from RARE_WINDOW_CLOSE', () => {
    const proj = new WorldStateProjection()
    proj.project(makeEvent('RARE_WINDOW_OPEN', { windowId: 'tide_festival', closesAtTick: 500, narration: '...' }, 1))
    proj.project(makeEvent('RARE_WINDOW_CLOSE', { windowId: 'tide_festival', narration: '...' }, 2))
    expect(proj.getRareWindow()).toEqual({ open: false, closesAt: null })
  })

  it('tracks active events from WORLD_EVENT_SPAWN', () => {
    const proj = new WorldStateProjection()
    proj.project({
      ...makeEvent('WORLD_EVENT_SPAWN', {
        worldEventId: 'we.1', templateId: 'city.shop_deal', type: 'city', scope: 'world', endsAtTick: 200, narration: '...',
      }),
      tick: 100,
    } as unknown as Event)
    const seeds = proj.getActiveEventSeeds()
    expect(seeds).toHaveLength(1)
    expect(seeds[0]).toMatchObject({ worldEventId: 'we.1', templateId: 'city.shop_deal', startedAtTick: 100 })
    expect(proj.isHydrated()).toBe(true)
  })

  it('removes active events from WORLD_EVENT_END', () => {
    const proj = new WorldStateProjection()
    proj.project({
      ...makeEvent('WORLD_EVENT_SPAWN', { worldEventId: 'we.1', templateId: 'city.shop_deal', type: 'city', scope: 'world', endsAtTick: 200, narration: '...' }, 1),
      tick: 100,
    } as unknown as Event)
    proj.project(makeEvent('WORLD_EVENT_END', { worldEventId: 'we.1', templateId: 'city.shop_deal', type: 'city', scope: 'world' }, 2))
    expect(proj.getActiveEventSeeds()).toHaveLength(0)
    expect(proj.isHydrated()).toBe(true)
  })

  it('rebuildFromEvents resets all state', () => {
    const proj = new WorldStateProjection()
    proj.project(makeEvent('WEATHER_CHANGE', { from: 'clear', to: 'storm', narration: '...' }, 1))
    proj.rebuildFromEvents([])
    expect(proj.getWeather()).toBeNull()
    expect(proj.getWeatherAgent().latestThought).toBeNull()
    expect(proj.isHydrated()).toBe(false)
  })

  it('rebuildFromEvents replays in sequence order', () => {
    const events: Event[] = [
      makeEvent('WEATHER_CHANGE', { from: 'clear', to: 'rain', narration: '...' }, 2),
      makeEvent('WEATHER_CHANGE', { from: 'rain', to: 'storm', narration: '...' }, 1),
    ]
    const proj = new WorldStateProjection()
    proj.rebuildFromEvents(events)
    expect(proj.getWeather()).toBe('rain')
  })

  it('canonicalHash is stable for identical state', () => {
    const p1 = new WorldStateProjection()
    const p2 = new WorldStateProjection()
    p1.project(makeEvent('WEATHER_CHANGE', { from: 'clear', to: 'rain', narration: '...' }, 1))
    p2.project(makeEvent('WEATHER_CHANGE', { from: 'clear', to: 'rain', narration: '...' }, 1))
    expect(p1.canonicalHash()).toBe(p2.canonicalHash())
  })

  it('canonicalHash differs when state differs', () => {
    const p1 = new WorldStateProjection()
    const p2 = new WorldStateProjection()
    p1.project(makeEvent('WEATHER_CHANGE', { from: 'clear', to: 'rain', narration: '...' }, 1))
    p2.project(makeEvent('WEATHER_CHANGE', { from: 'clear', to: 'storm', narration: '...' }, 1))
    expect(p1.canonicalHash()).not.toBe(p2.canonicalHash())
  })
})

import { describe, expect, it } from 'vitest'
import { loadCardCatalog } from '../cards/loader.js'
import { loadNpcProfiles } from '../npcs/loader.js'
import { SimulationRuntime } from './runtime.js'
import type { Event } from '../kernel/types.js'

function makeBuildingConstructedEvent(): Event {
  return {
    id: 'evt-building-1',
    sequence: 1,
    eventType: 'BUILDING_CONSTRUCTED',
    tick: 10,
    payload: {
      data: {
        buildingId: 'b_test_bridgehead',
        tileId: 't_central',
        constructedAtTick: 10,
        narration: 'test building',
      },
    },
    createdAt: new Date().toISOString(),
  } as unknown as Event
}

function makeLargeLogStore(): any {
  const buildingEvents = [makeBuildingConstructedEvent()]
  return {
    readLatestFactSnapshot: () => ({
      eventCount: 25_000,
      lastSequence: 1,
      latestTick: 10,
      facts: {},
    }),
    readLatestFactValues: () => ({}),
    readEvents: () => [],
    readRecentEvents: () => [],
    readEventsByTypes: (eventTypes: readonly string[]) => {
      if (eventTypes.includes('BUILDING_CONSTRUCTED')) return buildingEvents
      return []
    },
    countEvents: () => 25_000,
  }
}

describe('SimulationRuntime deferred large-log hydration', () => {
  it('hydrates omitted projections after startup without synchronous full replay', async () => {
    const runtime = new SimulationRuntime(
      makeLargeLogStore(),
      loadNpcProfiles(),
      loadCardCatalog(),
    )

    expect(runtime.needsDeferredHydration()).toBe(true)
    expect(runtime.getBuildingStatesByTile('t_central')).toHaveLength(0)

    await runtime.startDeferredHydration()

    expect(runtime.getDeferredHydrationState()).toBe('complete')
    expect(runtime.getBuildingStatesByTile('t_central').some((row) => row.buildingId === 'b_test_bridgehead')).toBe(true)

    runtime.stop()
  })
})

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

function makeAnimalSpawnedEvent(input: { id: string; sequence: number; tick: number }): Event {
  return {
    id: `evt-${input.id}`,
    sequence: input.sequence,
    eventType: 'ANIMAL_SPAWNED',
    tick: input.tick,
    payload: {
      data: {
        animal: {
          id: input.id,
          speciesId: 'lantern_moth',
          tileId: 't_forest',
          biomeRegion: 'forest',
        },
        spawnedAtTick: input.tick,
      },
    },
    createdAt: new Date().toISOString(),
  } as unknown as Event
}

function makePlayerHuntedAnimalEvent(): Event {
  return {
    id: 'evt-hunt-1',
    sequence: 4,
    eventType: 'PLAYER_HUNTED_ANIMAL',
    tick: 22,
    payload: {
      data: {
        animalId: 'animal.t_forest.lantern_moth.test.1',
        speciesId: 'lantern_moth',
        tileId: 't_forest',
        tick: 22,
      },
    },
    createdAt: new Date().toISOString(),
  } as unknown as Event
}

function makePlayerFishedEvent(): Event {
  return {
    id: 'evt-fish-1',
    sequence: 5,
    eventType: 'PLAYER_FISHED',
    tick: 23,
    payload: {
      data: {
        tileId: 't_dock',
        quantity: 1,
        tick: 23,
      },
    },
    createdAt: new Date().toISOString(),
  } as unknown as Event
}

type TickWindowRead = { sinceTick: number; untilTick: number; eventTypes: readonly string[]; limit: number }

function makeLargeLogStore(): { store: any; tickWindowReads: TickWindowRead[] } {
  const buildingEvents = [makeBuildingConstructedEvent()]
  const ecologyEvents = [
    makeAnimalSpawnedEvent({ id: 'animal.t_forest.lantern_moth.test.1', sequence: 2, tick: 20 }),
    makeAnimalSpawnedEvent({ id: 'animal.t_forest.lantern_moth.test.2', sequence: 3, tick: 21 }),
    makePlayerHuntedAnimalEvent(),
    makePlayerFishedEvent(),
  ]
  const tickWindowReads: TickWindowRead[] = []
  return {
    store: {
      readLatestFactSnapshot: () => ({
        eventCount: 25_000,
        lastSequence: 5,
        latestTick: 23,
        facts: {},
      }),
      readLatestFactValues: () => ({}),
      readEvents: () => [],
      readRecentEvents: () => [],
      readEventsByTickWindow: (input: TickWindowRead) => {
        tickWindowReads.push(input)
        const events = ecologyEvents
          .filter((event) => input.eventTypes.includes(event.eventType))
          .filter((event) => typeof event.tick === 'number' && event.tick > input.sinceTick && event.tick <= input.untilTick)
          .sort((a, b) => (a.tick ?? 0) - (b.tick ?? 0) || a.sequence - b.sequence)
        return {
          events: events.slice(0, input.limit),
          limited: events.length > input.limit,
        }
      },
      readEventsByTypes: (eventTypes: readonly string[]) => {
        if (eventTypes.includes('BUILDING_CONSTRUCTED')) return buildingEvents
        return []
      },
      countEvents: () => 25_000,
    },
    tickWindowReads,
  }
}

describe('SimulationRuntime deferred large-log hydration', () => {
  it('skips high-volume optional projections that can OOM production boot', async () => {
    const { store, tickWindowReads } = makeLargeLogStore()
    const runtime = new SimulationRuntime(
      store,
      loadNpcProfiles(),
      loadCardCatalog(),
    )

    expect(runtime.needsDeferredHydration()).toBe(true)
    expect(runtime.getBuildingStatesByTile('t_central')).toHaveLength(0)
    expect(tickWindowReads).toEqual([
      expect.objectContaining({ sinceTick: 0, untilTick: 23, limit: 50_000 }),
    ])
    expect(tickWindowReads[0]?.eventTypes).toEqual(expect.arrayContaining(['ANIMAL_SPAWNED', 'PLAYER_HUNTED_ANIMAL', 'PLAYER_FISHED']))
    expect(runtime.getAnimalPopulation()).toEqual([
      expect.objectContaining({
        speciesId: 'lantern_moth',
        tileId: 't_forest',
        count: 1,
        animalIds: ['animal.t_forest.lantern_moth.test.2'],
      }),
    ])
    expect(runtime.getFisheryDensity()).toEqual([expect.objectContaining({ tileId: 't_dock' })])

    await runtime.startDeferredHydration()

    expect(runtime.getDeferredHydrationState()).toBe('complete')
    expect(runtime.getBuildingStatesByTile('t_central').some((row) => row.buildingId === 'b_test_bridgehead')).toBe(false)

    runtime.stop()
  })
})

import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { loadCardCatalog } from '../cards/loader.js'
import { TICKS_PER_MINUTE } from '../config/world.js'
import { SqliteEventStore } from '../kernel/eventStore.js'
import { loadNpcProfiles } from '../npcs/loader.js'
import { SimulationRuntime } from './runtime.js'

type Internal = { runTick: () => void }

describe('SimulationRuntime weather agent', () => {
  it('commits weather intent before weather change and exposes projected thought', () => {
    const db = new Database(':memory:')
    const eventStore = new SqliteEventStore(db)
    const runtime = new SimulationRuntime(eventStore, loadNpcProfiles(), loadCardCatalog())
    try {
      for (let i = 0; i < TICKS_PER_MINUTE; i += 1) {
        ;(runtime as unknown as Internal).runTick()
      }

      const events = eventStore.readEvents()
      const intentIndex = events.findIndex((event) => event.eventType === 'WEATHER_INTENT_PROPOSED')
      const changeIndex = events.findIndex((event) => event.eventType === 'WEATHER_CHANGE')
      expect(intentIndex).toBeGreaterThanOrEqual(0)
      expect(changeIndex).toBeGreaterThan(intentIndex)

      const snapshot = runtime.getSnapshot()
      const weatherAgent = snapshot.facts.weatherAgent as { latestThought?: { thought?: string }; latestDesiredWeather?: string }
      expect(weatherAgent.latestThought?.thought).toBeTruthy()
      expect(weatherAgent.latestDesiredWeather).toBeTruthy()
    } finally {
      runtime.stop()
      db.close()
    }
  })
})

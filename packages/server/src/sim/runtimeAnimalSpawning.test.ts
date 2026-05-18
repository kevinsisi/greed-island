import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { loadCardCatalog } from '../cards/loader.js'
import { ECOSYSTEM_SPAWN_CADENCE_TICKS } from '../config/world.js'
import { SqliteEventStore } from '../kernel/eventStore.js'
import { loadNpcProfiles } from '../npcs/loader.js'
import { SimulationRuntime } from './runtime.js'

type Internal = { runTick: () => void }

describe('SimulationRuntime animal spawning', () => {
  it('emits typed ANIMAL_SPAWNED events and rebuilds animal population from EventLog', () => {
    const db = new Database(':memory:')
    const eventStore = new SqliteEventStore(db)
    const runtime = new SimulationRuntime(eventStore, loadNpcProfiles(), loadCardCatalog())
    try {
      for (let i = 0; i < ECOSYSTEM_SPAWN_CADENCE_TICKS; i += 1) {
        ;(runtime as unknown as Internal).runTick()
      }

      const spawnEvents = eventStore.readEvents().filter((event) => event.eventType === 'ANIMAL_SPAWNED')
      expect(spawnEvents).toHaveLength(2)
      expect(runtime.getAnimalPopulation()).toHaveLength(2)
      expect(runtime.getRecentEvents(50).some((event) => event.eventType === 'ANIMAL_SPAWNED')).toBe(false)

      runtime.stop()
      const restored = new SimulationRuntime(eventStore, loadNpcProfiles(), loadCardCatalog())
      try {
        expect(restored.getAnimalPopulation()).toEqual(runtime.getAnimalPopulation())
      } finally {
        restored.stop()
      }
    } finally {
      runtime.stop()
      db.close()
    }
  })
})

import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { loadCardCatalog } from '../cards/loader.js'
import { ECOSYSTEM_REPRODUCTION_CADENCE_TICKS } from '../config/world.js'
import type { Animal } from '../ecosystem/species.js'
import { SqliteEventStore } from '../kernel/eventStore.js'
import { LivingWorldRuleEngine, makeLivingWorldCommand } from '../kernel/livingWorldCommands.js'
import type { EventDraft } from '../kernel/types.js'
import { loadNpcProfiles } from '../npcs/loader.js'
import { SimulationRuntime } from './runtime.js'

type Internal = { runTick: () => void }

describe('SimulationRuntime animal reproduction', () => {
  it('emits reproduction through the Rule Engine and updates animal population', () => {
    const db = new Database(':memory:')
    const eventStore = new SqliteEventStore(db)
    seedAnimal(eventStore, animal('mantis-a', 'bark_mantis', 't_forest'))
    seedAnimal(eventStore, animal('mantis-b', 'bark_mantis', 't_forest'))
    const runtime = new SimulationRuntime(eventStore, loadNpcProfiles(), loadCardCatalog())
    try {
      for (let i = 0; i < ECOSYSTEM_REPRODUCTION_CADENCE_TICKS * 100; i += 1) {
        ;(runtime as unknown as Internal).runTick()
        if (eventStore.readEvents().some((event) => event.eventType === 'ANIMAL_REPRODUCED')) break
      }

      const reproductionEvents = eventStore.readEvents().filter((event) => event.eventType === 'ANIMAL_REPRODUCED')
      expect(reproductionEvents.length).toBeGreaterThanOrEqual(1)
      expect(runtime.getAnimalPopulation().find((row) => row.speciesId === 'bark_mantis' && row.tileId === 't_forest')?.count).toBeGreaterThanOrEqual(3)
      expect(runtime.getRecentEvents(50).some((event) => event.eventType === 'ANIMAL_REPRODUCED')).toBe(false)
    } finally {
      runtime.stop()
      db.close()
    }
  })
})

function seedAnimal(eventStore: SqliteEventStore, value: Animal): void {
  const ruleEngine = new LivingWorldRuleEngine()
  const result = ruleEngine.evaluate(makeLivingWorldCommand('ANIMAL_SPAWNED', 'system', 'system', 0, 0, {
    animal: value,
    spawnedAtTick: 0,
    narration: null,
  }))
  if (!result.accepted) throw new Error(result.rejection.reason)
  eventStore.appendEvents(result.events as readonly EventDraft[])
}

function animal(id: string, speciesId: string, tileId: string): Animal {
  return {
    id,
    speciesId,
    tileId,
    biomeRegion: 'forest',
    position: { subCol: 1, subRow: 2, subZ: 0 },
    state: 'idle',
    hunger: 0,
    health: 100,
    fear: 50,
    aggression: 5,
    packId: null,
    migrationTarget: null,
    currentTarget: null,
    reproductionCooldown: 0,
    lifecycleStage: 'adult',
    ownerSettlementId: null,
    domesticatedBy: null,
  }
}

import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { loadCardCatalog } from '../cards/loader.js'
import type { Animal } from '../ecosystem/species.js'
import { SqliteEventStore } from '../kernel/eventStore.js'
import { LivingWorldRuleEngine, makeLivingWorldCommand } from '../kernel/livingWorldCommands.js'
import type { EventDraft } from '../kernel/types.js'
import { loadNpcProfiles } from '../npcs/loader.js'
import { SimulationRuntime } from './runtime.js'

type Internal = { runTick: () => void }

describe('SimulationRuntime predation', () => {
  it('emits predation kill events through the Rule Engine and updates animal population', () => {
    const db = new Database(':memory:')
    const eventStore = new SqliteEventStore(db)
    seedAnimal(eventStore, animal('wolf-a', 'fog_wolf', 't_forest'))
    seedAnimal(eventStore, animal('deer-a', 'forest_deer', 't_forest'))
    const runtime = new SimulationRuntime(eventStore, loadNpcProfiles(), loadCardCatalog())
    try {
      ;(runtime as unknown as Internal).runTick()

      const events = eventStore.readEvents()
      expect(events.some((event) => event.eventType === 'ANIMAL_HUNT_STARTED' && event.actorId === 'ecosystem.predator.fog_wolf')).toBe(true)
      expect(events.some((event) => event.eventType === 'ANIMAL_HUNT_RESOLVED' && event.actorId === 'ecosystem.predator.fog_wolf')).toBe(true)
      expect(events.some((event) => event.eventType === 'ANIMAL_KILLED' && event.actorId === 'ecosystem.predator.fog_wolf')).toBe(true)
      expect(runtime.getAnimalPopulation().find((row) => row.speciesId === 'forest_deer' && row.tileId === 't_forest')?.count).toBe(0)
      expect(runtime.getRecentEvents(50).some((event) => event.eventType === 'ANIMAL_KILLED')).toBe(false)
    } finally {
      runtime.stop()
      db.close()
    }
  })

  it('emits starvation pressure without removing predator population', () => {
    const db = new Database(':memory:')
    const eventStore = new SqliteEventStore(db)
    seedAnimal(eventStore, animal('wolf-a', 'fog_wolf', 't_forest'))
    const runtime = new SimulationRuntime(eventStore, loadNpcProfiles(), loadCardCatalog())
    try {
      ;(runtime as unknown as Internal).runTick()

      expect(eventStore.readEvents().some((event) => event.eventType === 'ANIMAL_STARVED')).toBe(true)
      expect(runtime.getAnimalPopulation().find((row) => row.speciesId === 'fog_wolf' && row.tileId === 't_forest')?.count).toBe(1)
      expect(runtime.getRecentEvents(50).some((event) => event.eventType === 'ANIMAL_STARVED')).toBe(false)
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

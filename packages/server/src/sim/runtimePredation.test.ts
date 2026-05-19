import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { loadCardCatalog } from '../cards/loader.js'
import { PREDATOR_STARVATION_THRESHOLD_TICKS } from '../config/world.js'
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

      // predatorHunger populated after a kill
      const snapshot = runtime.getSnapshot()
      const hunger = snapshot.facts.predatorHunger as unknown[]
      expect(hunger.length).toBeGreaterThanOrEqual(1)
    } finally {
      runtime.stop()
      db.close()
    }
  })

  it('does NOT emit ANIMAL_STARVED before starvation threshold', () => {
    const db = new Database(':memory:')
    const eventStore = new SqliteEventStore(db)
    seedAnimal(eventStore, animal('wolf-a', 'fog_wolf', 't_forest'))
    const runtime = new SimulationRuntime(eventStore, loadNpcProfiles(), loadCardCatalog())
    try {
      // Run fewer ticks than the threshold — starvation must not fire
      const safeTicks = PREDATOR_STARVATION_THRESHOLD_TICKS - 1
      for (let i = 0; i < safeTicks; i++) {
        ;(runtime as unknown as Internal).runTick()
      }

      expect(eventStore.readEvents().some((ev) => ev.eventType === 'ANIMAL_STARVED')).toBe(false)
      // Note: Sprint 2B + 2C may have triggered the aggression chain
      // (hungry wolf attacks an NPC on t_forest) and/or a defense
      // party that put the wolf down before the starvation threshold.
      // The invariant this test guards is "no ANIMAL_STARVED before
      // threshold"; the wolf's survival is incidental.
    } finally {
      runtime.stop()
      db.close()
    }
  })

  it('emits ANIMAL_STARVED and removes predator at starvation threshold', { timeout: 120000 }, async () => {
    const db = new Database(':memory:')
    const eventStore = new SqliteEventStore(db)
    seedAnimal(eventStore, animal('wolf-a', 'fog_wolf', 't_forest'))
    const runtime = new SimulationRuntime(eventStore, loadNpcProfiles(), loadCardCatalog())
    try {
      for (let i = 0; i < PREDATOR_STARVATION_THRESHOLD_TICKS * 3; i++) {
        ;(runtime as unknown as Internal).runTick()
        if (i % 20 === 0) await new Promise<void>((resolve) => setImmediate(resolve))
        if (eventStore.readEvents().some((ev) => ev.eventType === 'ANIMAL_STARVED')) break
      }

      const allEvents = eventStore.readEvents()
      const starvedEvent = allEvents.find((ev) => ev.eventType === 'ANIMAL_STARVED')
      expect(starvedEvent).toBeDefined()
      // Read the actual starved animal id from the event — spawning may add wolves so we can't assume wolf-a was the one selected
      const starvedId = (starvedEvent?.payload as { data?: { predatorAnimalId?: string } } | undefined)?.data?.predatorAnimalId
      expect(typeof starvedId).toBe('string')
      const wolfRow = runtime.getAnimalPopulation().find((row) => row.speciesId === 'fog_wolf' && row.tileId === 't_forest')
      expect(wolfRow?.animalIds ?? []).not.toContain(starvedId)
      expect(runtime.getRecentEvents(50).some((ev) => ev.eventType === 'ANIMAL_STARVED')).toBe(false)
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

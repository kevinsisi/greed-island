import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { loadCardCatalog } from '../cards/loader.js'
import { PREDATOR_STARVATION_THRESHOLD_TICKS, TILE_INACTIVE_DRIFT_PERIOD } from '../config/world.js'
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
    seedAnimal(eventStore, animal('hound-a', 'iron_hound', 't_predation_lab'))
    // Starvation is the invariant under test here. Empty NPC profiles plus an
    // off-biome predator keep the integration loop focused on predation instead
    // of spending ~100s in unrelated spawn / NPC aggression / defense side paths
    // before any starvation can be observed.
    const runtime = new SimulationRuntime(eventStore, [], loadCardCatalog())
    try {
      // Run the last ecology-eligible tick before the threshold — starvation must not fire.
      const safeTicks = PREDATOR_STARVATION_THRESHOLD_TICKS - TILE_INACTIVE_DRIFT_PERIOD
      for (let i = 0; i < safeTicks; i++) {
        ;(runtime as unknown as Internal).runTick()
      }

      expect(eventStore.readEventsByTypes(['ANIMAL_STARVED'])).toEqual([])
    } finally {
      runtime.stop()
      db.close()
    }
  })

  it('emits ANIMAL_STARVED and removes predator at starvation threshold', () => {
    const db = new Database(':memory:')
    const eventStore = new SqliteEventStore(db)
    seedAnimal(eventStore, animal('hound-a', 'iron_hound', 't_predation_lab'))
    const runtime = new SimulationRuntime(eventStore, [], loadCardCatalog())
    try {
      let starvedEvents = [] as ReturnType<SqliteEventStore['readEventsByTypes']>
      for (let i = 0; i < PREDATOR_STARVATION_THRESHOLD_TICKS * 3; i++) {
        ;(runtime as unknown as Internal).runTick()
        if (i >= PREDATOR_STARVATION_THRESHOLD_TICKS && i % TILE_INACTIVE_DRIFT_PERIOD === 0) {
          starvedEvents = eventStore.readEventsByTypes(['ANIMAL_STARVED'])
          if (starvedEvents.some((event) => starvedAnimalId(event.payload) === 'hound-a')) break
        }
      }

      starvedEvents = eventStore.readEventsByTypes(['ANIMAL_STARVED'])
      const starvedEvent = starvedEvents.find((event) => starvedAnimalId(event.payload) === 'hound-a')
      expect(starvedEvent).toBeDefined()
      // Read the actual starved animal id from the event — the assertion stays
      // tied to the committed EventLog payload instead of a hardcoded fixture id.
      const starvedId = starvedAnimalId(starvedEvent?.payload)
      expect(typeof starvedId).toBe('string')
      const predatorRow = runtime.getAnimalPopulation().find((row) => row.speciesId === 'iron_hound' && row.tileId === 't_predation_lab')
      expect(predatorRow?.animalIds ?? []).not.toContain(starvedId)
      expect(runtime.getRecentEvents(50).some((ev) => ev.eventType === 'ANIMAL_STARVED')).toBe(false)
    } finally {
      runtime.stop()
      db.close()
    }
  })
})

function starvedAnimalId(payload: unknown): string | undefined {
  return (payload as { data?: { predatorAnimalId?: string } } | undefined)?.data?.predatorAnimalId
}

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

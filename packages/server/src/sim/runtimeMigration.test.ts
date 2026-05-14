import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { loadCardCatalog } from '../cards/loader.js'
import { ECOSYSTEM_MIGRATION_PRESSURE_THRESHOLD, ECOSYSTEM_REPRODUCTION_CADENCE_TICKS } from '../config/world.js'
import { carryingCapacityForTile } from '../ecosystem/animalSpawning.js'
import type { Animal } from '../ecosystem/species.js'
import { requireSpecies } from '../ecosystem/species.js'
import { SqliteEventStore } from '../kernel/eventStore.js'
import { LivingWorldRuleEngine, makeLivingWorldCommand } from '../kernel/livingWorldCommands.js'
import type { EventDraft } from '../kernel/types.js'
import { loadNpcProfiles } from '../npcs/loader.js'
import { SimulationRuntime } from './runtime.js'

type Internal = { runTick: () => void }

describe('SimulationRuntime animal migration', () => {
  it('emits MIGRATION_WAVE_STARTED and ANIMAL_MIGRATED at cadence tick when population is at pressure threshold', () => {
    const db = new Database(':memory:')
    const eventStore = new SqliteEventStore(db)

    // seed forest_deer at pressure threshold on t_forest
    const species = requireSpecies('forest_deer')
    const capacity = carryingCapacityForTile(species)
    const pressureCount = Math.ceil(capacity * ECOSYSTEM_MIGRATION_PRESSURE_THRESHOLD)
    for (let i = 0; i < pressureCount; i++) {
      seedAnimal(eventStore, animal(`deer-${i}`, 'forest_deer', 't_forest', 'forest'))
    }

    const runtime = new SimulationRuntime(eventStore, loadNpcProfiles(), loadCardCatalog())
    try {
      for (let i = 0; i < ECOSYSTEM_REPRODUCTION_CADENCE_TICKS * 200; i += 1) {
        ;(runtime as unknown as Internal).runTick()
        const events = eventStore.readEvents()
        if (events.some((event) => event.eventType === 'ANIMAL_MIGRATED')) break
      }

      const allEvents = eventStore.readEvents()
      const migrated = allEvents.filter((ev) => ev.eventType === 'ANIMAL_MIGRATED')
      const waves = allEvents.filter((ev) => ev.eventType === 'MIGRATION_WAVE_STARTED')

      expect(migrated.length).toBeGreaterThanOrEqual(1)
      expect(waves.length).toBeGreaterThanOrEqual(1)

      // Neither event type appears in public recent events
      const recentTypes = runtime.getRecentEvents(50).map((ev) => ev.eventType)
      expect(recentTypes).not.toContain('ANIMAL_MIGRATED')
      expect(recentTypes).not.toContain('MIGRATION_WAVE_STARTED')

      // migrationRoutes appears in world snapshot
      const snapshot = runtime.getSnapshot()
      const migrationRoutes = snapshot.facts.migrationRoutes
      expect(Array.isArray(migrationRoutes)).toBe(true)
      expect((migrationRoutes as unknown[]).length).toBeGreaterThanOrEqual(1)
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

function animal(id: string, speciesId: string, tileId: string, biomeRegion: Animal['biomeRegion']): Animal {
  return {
    id,
    speciesId,
    tileId,
    biomeRegion,
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

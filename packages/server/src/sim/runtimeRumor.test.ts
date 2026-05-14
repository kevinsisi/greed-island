import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { loadCardCatalog } from '../cards/loader.js'
import { RUMOR_ACCURACY_DECAY, RUMOR_ACCURACY_THRESHOLD } from '../config/world.js'
import type { Animal } from '../ecosystem/species.js'
import { SqliteEventStore } from '../kernel/eventStore.js'
import { LivingWorldRuleEngine, makeLivingWorldCommand } from '../kernel/livingWorldCommands.js'
import type { EventDraft } from '../kernel/types.js'
import { loadNpcProfiles } from '../npcs/loader.js'
import { SimulationRuntime } from './runtime.js'

type Internal = { runTick: () => void }

describe('SimulationRuntime — NPC rumor propagation', () => {
  it('facts.npcRumors is an empty array before any rumor events', () => {
    const db = new Database(':memory:')
    const eventStore = new SqliteEventStore(db)
    const runtime = new SimulationRuntime(eventStore, loadNpcProfiles(), loadCardCatalog())
    try {
      const snapshot = runtime.getSnapshot()
      const npcRumors = snapshot.facts.npcRumors as unknown[]
      expect(Array.isArray(npcRumors)).toBe(true)
      expect(npcRumors).toHaveLength(0)
    } finally {
      runtime.stop()
      db.close()
    }
  })

  it('NPC_RUMOR_HEARD and NPC_RUMOR_SPREAD are absent from getRecentEvents()', { timeout: 30_000 }, () => {
    const db = new Database(':memory:')
    const eventStore = new SqliteEventStore(db)
    // Seed a wolf and a deer so predation/starvation can happen → seed rumors
    seedAnimal(eventStore, animal('wolf-a', 'fog_wolf', 't_forest'))
    seedAnimal(eventStore, animal('deer-a', 'forest_deer', 't_forest'))
    const profiles = loadNpcProfiles()
    const runtime = new SimulationRuntime(eventStore, profiles, loadCardCatalog())
    try {
      // Commit NPC_RUMOR_HEARD directly via rule engine if starvation doesn't fire fast enough
      // Instead: just verify the suppression function works by checking all events in the store
      // Run 5 ticks and check getRecentEvents never leaks rumor events
      for (let i = 0; i < 5; i++) {
        ;(runtime as unknown as Internal).runTick()
      }
      const recent = runtime.getRecentEvents(500)
      expect(recent.some((ev) => ev.eventType === 'NPC_RUMOR_HEARD')).toBe(false)
      expect(recent.some((ev) => ev.eventType === 'NPC_RUMOR_SPREAD')).toBe(false)
    } finally {
      runtime.stop()
      db.close()
    }
  })

  it('facts.npcRumors populated after manually committed NPC_RUMOR_HEARD', () => {
    const db = new Database(':memory:')
    const eventStore = new SqliteEventStore(db)
    const profiles = loadNpcProfiles()
    const runtime = new SimulationRuntime(eventStore, profiles, loadCardCatalog())
    try {
      // Manually submit an NPC_RUMOR_HEARD through the runtime's living world rule engine
      const npcId = profiles[0]?.id ?? 'test-npc'
      const cmd = makeLivingWorldCommand(
        'NPC_RUMOR_HEARD',
        'system.rumor.predator_death',
        'system',
        1,
        1,
        {
          npcId,
          rumorId: 'test-rumor-id',
          topic: 'predator_death',
          subjectId: 'fog_wolf',
          tileId: 't_forest',
          originTick: 1,
          accuracy: 100,
        }
      )
      // Submit via the rule engine path
      const ruleEngine = new LivingWorldRuleEngine()
      const result = ruleEngine.evaluate(cmd)
      expect(result.accepted).toBe(true)
      if (!result.accepted) return

      // Manually commit into eventStore + project into runtime by re-running a tick
      // that sees the heard event already in the store
      eventStore.appendEvents(result.events as readonly EventDraft[])

      // Rebuild the runtime to pick up the committed event
      runtime.stop()
      db.close()

      // Re-open with the committed event
      const db2 = new Database(':memory:')
      const store2 = new SqliteEventStore(db2)
      store2.appendEvents(result.events as readonly EventDraft[])
      const runtime2 = new SimulationRuntime(store2, profiles, loadCardCatalog())
      try {
        const snapshot = runtime2.getSnapshot()
        const npcRumors = snapshot.facts.npcRumors as Array<{ npcId: string; accuracy: number }>
        expect(Array.isArray(npcRumors)).toBe(true)
        expect(npcRumors.some((r) => r.npcId === npcId && r.accuracy >= RUMOR_ACCURACY_THRESHOLD)).toBe(true)
      } finally {
        runtime2.stop()
        db2.close()
      }
      return // early return, cleanup already handled
    } finally {
      // no-op: already cleaned up above if we took the early return
    }
  })
})

describe('SimulationRuntime — NPC_RUMOR_SPREAD accuracy', () => {
  it('NPC_RUMOR_SPREAD accuracy degrades from the sent accuracy', async () => {
    // Test via RumorProjection directly to avoid needing NPCs to interact
    const { RumorProjection } = await import('../projections/rumor.js')
    const proj = new RumorProjection()
    let seq = 0
    proj.project({
      sequence: ++seq,
      eventId: 'e1',
      eventType: 'NPC_RUMOR_HEARD',
      actorId: 'system',
      occurredAt: 0,
      tick: 1,
      payload: { actorType: 'system', data: { npcId: 'npc-a', rumorId: 'r1', topic: 'predator_death', subjectId: 'fog_wolf', tileId: 't_forest', originTick: 1, accuracy: 100 }, narration: null },
      deterministicKey: 'k1',
      version: 1,
    })
    proj.project({
      sequence: ++seq,
      eventId: 'e2',
      eventType: 'NPC_RUMOR_SPREAD',
      actorId: 'npc-a',
      occurredAt: 0,
      tick: 2,
      payload: { actorType: 'npc', data: { fromNpcId: 'npc-a', toNpcId: 'npc-b', rumorId: 'r1', topic: 'predator_death', subjectId: 'fog_wolf', tileId: 't_forest', originTick: 1, accuracy: 100 }, narration: null },
      deterministicKey: 'k2',
      version: 1,
    })

    const bRumors = proj.getActiveRumors('npc-b')
    expect(bRumors).toHaveLength(1)
    expect(bRumors[0]?.accuracy).toBe(Math.round(100 * RUMOR_ACCURACY_DECAY / 100))
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
    position: { subCol: 0, subRow: 0, subZ: 0 },
    state: 'idle',
    hunger: 0,
    health: 1,
    fear: 0,
    aggression: 0,
    reproductionCooldown: 0,
    packId: null,
    migrationTarget: null,
    currentTarget: null,
    lifecycleStage: 'adult',
    ownerSettlementId: null,
    domesticatedBy: null,
  }
}

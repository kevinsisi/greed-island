import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { loadCardCatalog } from '../cards/loader.js'
import { SqliteEventStore } from '../kernel/eventStore.js'
import { loadNpcProfiles } from '../npcs/loader.js'
import { SimulationRuntime } from './runtime.js'

type InternalRuntime = {
  runTick: () => void
  npcEngine: {
    setIntentOverride: (
      npcId: string,
      override: {
        targetTile: string
        expiresAtTick: number
        intentType: 'survival'
        urgency: number
        reason: string
      }
    ) => void
  }
}

describe('SimulationRuntime intent resolution', () => {
  it('commits NPC_INTENT_RESOLVED as an event draft with a deterministic event id', () => {
    const db = new Database(':memory:')
    const eventStore = new SqliteEventStore(db)
    const runtime = new SimulationRuntime(eventStore, loadNpcProfiles(), loadCardCatalog())
    try {
      const npc = runtime.getNpcs()[0]!
      ;(runtime as unknown as InternalRuntime).npcEngine.setIntentOverride(npc.id, {
        targetTile: npc.location,
        expiresAtTick: 10,
        intentType: 'survival',
        urgency: 80,
        reason: 'test already at target',
      })

      ;(runtime as unknown as InternalRuntime).runTick()

      const event = eventStore.readEvents().find((row) => row.eventType === 'NPC_INTENT_RESOLVED')
      expect(event?.eventId).toMatch(/^event_/)
      expect(event?.deterministicKey).toBeTruthy()
    } finally {
      runtime.stop()
      db.close()
    }
  })
})

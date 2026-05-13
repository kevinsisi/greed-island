import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { loadCardCatalog } from '../cards/loader.js'
import { SqliteEventStore } from '../kernel/eventStore.js'
import { loadNpcProfiles } from '../npcs/loader.js'
import { SimulationRuntime } from './runtime.js'

type Internal = { runTick: () => void }

describe('SimulationRuntime npc state typed projection', () => {
  it('commits typed NPC_STATE_RECORDED events instead of npc.state FACT_SET rows and rehydrates from them', () => {
    const db = new Database(':memory:')
    const eventStore = new SqliteEventStore(db)
    const runtime = new SimulationRuntime(eventStore, loadNpcProfiles(), loadCardCatalog())
    try {
      ;(runtime as unknown as Internal).runTick()
      const events = eventStore.readEvents()
      expect(events.some((event) => event.eventType === 'NPC_STATE_RECORDED')).toBe(true)
      const npcStateFacts = events.filter((event) => {
        if (event.eventType !== 'FACT_SET') return false
        const payload = event.payload as { key?: unknown }
        return typeof payload.key === 'string' && payload.key.startsWith('npc.state.')
      })
      expect(npcStateFacts).toEqual([])

      const original = runtime.getNpcs().find((npc) => npc.id === 'central.exchange.shen_ruo_yun')
      expect(original).not.toBeNull()

      runtime.stop()
      const restored = new SimulationRuntime(eventStore, loadNpcProfiles(), loadCardCatalog())
      try {
        const rehydrated = restored.getNpcs().find((npc) => npc.id === 'central.exchange.shen_ruo_yun')
        expect(rehydrated).not.toBeNull()
        expect(rehydrated?.location).toBe(original?.location)
        expect(rehydrated?.activity).toBe(original?.activity)
        expect(rehydrated?.targetTile).toBe(original?.targetTile)
        expect(rehydrated?.subCol).toBe(original?.subCol)
        expect(rehydrated?.subRow).toBe(original?.subRow)
      } finally {
        restored.stop()
      }
    } finally {
      runtime.stop()
      db.close()
    }
  })
})

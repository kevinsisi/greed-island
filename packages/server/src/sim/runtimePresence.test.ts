import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { loadCardCatalog } from '../cards/loader.js'
import { SqliteEventStore } from '../kernel/eventStore.js'
import { loadNpcProfiles } from '../npcs/loader.js'
import { SimulationRuntime } from './runtime.js'

describe('SimulationRuntime NPC presence', () => {
  it('uses one authoritative presence for building and outdoor projections', () => {
    const db = new Database(':memory:')
    const eventStore = new SqliteEventStore(db)
    const runtime = new SimulationRuntime(
      eventStore,
      loadNpcProfiles(),
      loadCardCatalog()
    )

    try {
      const internal = runtime as unknown as { runTick: () => void }
      for (let tick = 0; tick < 8; tick += 1) {
        internal.runTick()
      }
      const npcId = 'central.exchange.shen_ruo_yun'
      const buildingId = 'b_central_exchange'
      const building = runtime.getAllBuildings().find((view) => view.def.id === buildingId)

      expect(runtime.getNpcBuildingId(npcId)).toBe(buildingId)
      expect(runtime.isNpcInsideBuilding(npcId, buildingId)).toBe(true)
      expect(building?.occupants.map((occupant) => occupant.npcId)).toContain(npcId)
      expect(runtime.getOutdoorNpcsAt('t_central')).not.toContain(npcId)

      const events = eventStore.readEvents()
      const eventData = (eventType: string) => (
        events.find((event) => event.eventType === eventType)?.payload as { data?: { motivation?: { explanation?: string } } } | undefined
      )?.data
      expect(eventData('NPC_ACTIVITY_CHANGE')?.motivation?.explanation).toContain('生活需求')
      expect(eventData('BUILDING_ENTER')?.motivation?.explanation).toContain('進入')
    } finally {
      runtime.stop()
      db.close()
    }
  })
})

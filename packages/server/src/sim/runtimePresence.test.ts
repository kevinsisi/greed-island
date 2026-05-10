import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { loadCardCatalog } from '../cards/loader.js'
import { SqliteEventStore } from '../kernel/eventStore.js'
import { loadNpcProfiles } from '../npcs/loader.js'
import { SimulationRuntime } from './runtime.js'

describe('SimulationRuntime NPC presence', () => {
  it('uses one authoritative presence for building and outdoor projections', () => {
    const db = new Database(':memory:')
    const runtime = new SimulationRuntime(
      new SqliteEventStore(db),
      loadNpcProfiles(),
      loadCardCatalog()
    )

    try {
      ;(runtime as unknown as { runTick: () => void }).runTick()
      const npcId = 'central.exchange.shen_ruo_yun'
      const buildingId = 'b_central_exchange'
      const building = runtime.getAllBuildings().find((view) => view.def.id === buildingId)

      expect(runtime.getNpcBuildingId(npcId)).toBe(buildingId)
      expect(runtime.isNpcInsideBuilding(npcId, buildingId)).toBe(true)
      expect(building?.occupants.map((occupant) => occupant.npcId)).toContain(npcId)
      expect(runtime.getOutdoorNpcsAt('t_central')).not.toContain(npcId)
    } finally {
      runtime.stop()
      db.close()
    }
  })
})

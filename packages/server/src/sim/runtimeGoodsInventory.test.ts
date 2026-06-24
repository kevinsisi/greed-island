import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { loadCardCatalog } from '../cards/loader.js'
import { SqliteEventStore } from '../kernel/eventStore.js'
import { loadNpcProfiles } from '../npcs/loader.js'
import { SimulationRuntime } from './runtime.js'

type Internal = { runTick: () => void }

describe('SimulationRuntime goods inventory', () => {
  it('promotes accepted fishery harvests into fish goods inventory', () => {
    const db = new Database(':memory:')
    const eventStore = new SqliteEventStore(db)
    const runtime = new SimulationRuntime(eventStore, loadNpcProfiles(), loadCardCatalog())
    try {
      for (let i = 0; i < 200; i += 1) {
        ;(runtime as unknown as Internal).runTick()
      }

      const events = eventStore.readEvents()
      const storedFish = events.filter((event) => {
        const data = (event.payload as { data?: { goodsId?: string } } | undefined)?.data
        return event.eventType === 'GOODS_STORED' && data?.goodsId === 'fish'
      })
      expect(storedFish.length).toBeGreaterThan(0)
      expect(storedFish.some((event) => {
        const data = (event.payload as { data?: { quantity?: number } } | undefined)?.data
        return typeof data?.quantity === 'number' && data.quantity > 0
      })).toBe(true)
      // FISHERY_HARVESTED → GOODS_EXTRACTED is always emitted before GOODS_STORED in the same pipeline
      const extractedFish = events.some((event) => {
        const data = (event.payload as { data?: { goodsId?: string } } | undefined)?.data
        return event.eventType === 'GOODS_EXTRACTED' && data?.goodsId === 'fish'
      })
      expect(extractedFish).toBe(true)
      expect(runtime.getLogistics().routes.some((row) => row.goodsId === 'fish' && row.toTileId === 't_central')).toBe(true)
      expect(runtime.getLogistics().transports.some((row) => row.goodsId === 'fish' && row.toTileId === 't_central')).toBe(true)

      runtime.stop()
      const restored = new SimulationRuntime(eventStore, loadNpcProfiles(), loadCardCatalog())
      try {
        expect(restored.getGoodsInventory()).toEqual(runtime.getGoodsInventory())
      } finally {
        restored.stop()
      }
    } finally {
      runtime.stop()
      db.close()
    }
  })
})

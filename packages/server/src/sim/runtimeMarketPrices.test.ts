import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { loadCardCatalog } from '../cards/loader.js'
import { SqliteEventStore } from '../kernel/eventStore.js'
import { LivingWorldRuleEngine, makeLivingWorldCommand } from '../kernel/livingWorldCommands.js'
import { loadNpcProfiles } from '../npcs/loader.js'
import { SimulationRuntime } from './runtime.js'

type Internal = { runTick: () => void }

describe('SimulationRuntime market prices', () => {
  it('discovers central market prices from settlement supply', () => {
    const db = new Database(':memory:')
    const eventStore = new SqliteEventStore(db)
    seedStoredGoods(eventStore, 'refined_salt', 0)
    const runtime = new SimulationRuntime(eventStore, loadNpcProfiles(), loadCardCatalog())
    try {
      ;(runtime as unknown as Internal).runTick()

      const refinedSalt = runtime.getMarketPrices().find((row) => row.goodsId === 'refined_salt')
      expect(refinedSalt).toMatchObject({
        marketId: 'market.t_central',
        settlementId: 'settlement.t_central',
        supplyQuantity: 0,
        demandQuantity: 12,
        priceGold: 28,
      })
      expect(eventStore.readEvents().some((event) => event.eventType === 'MARKET_PRICE_DISCOVERED')).toBe(true)
    } finally {
      runtime.stop()
      db.close()
    }
  })

  it('updates price when settlement supply changes', () => {
    const db = new Database(':memory:')
    const eventStore = new SqliteEventStore(db)
    seedStoredGoods(eventStore, 'refined_salt', 12)
    const runtime = new SimulationRuntime(eventStore, loadNpcProfiles(), loadCardCatalog())
    try {
      ;(runtime as unknown as Internal).runTick()

      expect(runtime.getMarketPrices().find((row) => row.goodsId === 'refined_salt')?.priceGold).toBe(14)
    } finally {
      runtime.stop()
      db.close()
    }
  })
})

function seedStoredGoods(eventStore: SqliteEventStore, goodsId: string, quantity: number): void {
  if (quantity <= 0) return
  const result = new LivingWorldRuleEngine().evaluate(
    makeLivingWorldCommand('GOODS_STORED', 'settlement.t_central', 'system', 1, 1, {
      goodsId,
      quantity,
      holderType: 'settlement',
      holderId: 'settlement.t_central',
      tileId: 't_central',
      storedAtTick: 1,
      narration: 'stored goods for market test',
    })
  )
  if (!result.accepted) throw new Error(result.rejection.reason)
  eventStore.appendEvents(result.events)
}

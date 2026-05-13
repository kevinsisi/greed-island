import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { loadCardCatalog } from '../cards/loader.js'
import { SqliteEventStore } from '../kernel/eventStore.js'
import { LivingWorldRuleEngine, makeLivingWorldCommand } from '../kernel/livingWorldCommands.js'
import { loadNpcProfiles } from '../npcs/loader.js'
import { SimulationRuntime } from './runtime.js'

type Internal = { runTick: () => void }

describe('SimulationRuntime production chains', () => {
  it('processes central brine inventory into refined salt', () => {
    const db = new Database(':memory:')
    const eventStore = new SqliteEventStore(db)
    seedStoredBrine(eventStore, 10)
    const runtime = new SimulationRuntime(eventStore, loadNpcProfiles(), loadCardCatalog())
    try {
      ;(runtime as unknown as Internal).runTick()

      const processed = eventStore.readEvents().filter((event) => event.eventType === 'GOODS_PROCESSED')
      expect(processed).toHaveLength(1)
      expect(processed[0]?.payload).toMatchObject({
        data: {
          recipeId: 'recipe.salt_marsh_brine.refined_salt',
          inputGoodsId: 'salt_marsh_brine',
          inputQuantity: 10,
          outputGoodsId: 'refined_salt',
          outputQuantity: 4,
        }
      })
      expect(runtime.getGoodsInventory().some((row) => row.goodsId === 'refined_salt' && row.quantity === 4)).toBe(true)
      expect(runtime.getProductionChains().processed).toHaveLength(1)
    } finally {
      runtime.stop()
      db.close()
    }
  })

  it('does not process when brine inventory is unavailable', () => {
    const db = new Database(':memory:')
    const eventStore = new SqliteEventStore(db)
    const runtime = new SimulationRuntime(eventStore, loadNpcProfiles(), loadCardCatalog())
    try {
      ;(runtime as unknown as Internal).runTick()

      expect(eventStore.readEvents().some((event) => event.eventType === 'GOODS_PROCESSED')).toBe(false)
      expect(runtime.getProductionChains().processed).toHaveLength(0)
    } finally {
      runtime.stop()
      db.close()
    }
  })
})

function seedStoredBrine(eventStore: SqliteEventStore, quantity: number): void {
  const result = new LivingWorldRuleEngine().evaluate(
    makeLivingWorldCommand('GOODS_STORED', 'settlement.t_central', 'system', 1, 1, {
      goodsId: 'salt_marsh_brine',
      quantity,
      holderType: 'settlement',
      holderId: 'settlement.t_central',
      tileId: 't_central',
      storedAtTick: 1,
      narration: 'stored brine for production test',
    })
  )
  if (!result.accepted) throw new Error(result.rejection.reason)
  eventStore.appendEvents(result.events)
}

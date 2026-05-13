import { describe, expect, it } from 'vitest'
import { calculateMarketPriceGold, discoverMarketPrices, listMarketGoods } from './marketPricing.js'
import type { GoodsInventoryRow } from '../projections/goodsInventory.js'

describe('market pricing', () => {
  it('tracks refined salt metadata', () => {
    expect(listMarketGoods().some((goods) => goods.goodsId === 'refined_salt')).toBe(true)
  })

  it('raises price under scarcity and lowers pressure under supply', () => {
    const scarce = calculateMarketPriceGold({ basePriceGold: 14, demandQuantity: 12, supplyQuantity: 0 })
    const supplied = calculateMarketPriceGold({ basePriceGold: 14, demandQuantity: 12, supplyQuantity: 12 })
    expect(scarce).toBeGreaterThan(14)
    expect(supplied).toBeLessThanOrEqual(scarce)
  })

  it('discovers central settlement supply from inventory', () => {
    const prices = discoverMarketPrices({ inventory: [inventoryRow('refined_salt', 12)] })
    expect(prices.find((row) => row.goodsId === 'refined_salt')).toMatchObject({
      marketId: 'market.t_central',
      settlementId: 'settlement.t_central',
      supplyQuantity: 12,
      demandQuantity: 12,
      priceGold: 14,
    })
  })
})

function inventoryRow(goodsId: string, quantity: number): GoodsInventoryRow {
  return {
    goodsId,
    holderType: 'settlement',
    holderId: 'settlement.t_central',
    tileId: 't_central',
    quantity,
    lastUpdatedTick: 1,
    lastSequence: 1,
  }
}

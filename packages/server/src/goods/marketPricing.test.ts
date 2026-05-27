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

  it('applies a multiply_price rule operator multiplier to the discovered price', () => {
    // Baseline refined_salt price at supply==demand is 14 (see test above).
    const doubled = discoverMarketPrices({
      inventory: [inventoryRow('refined_salt', 12)],
      priceMultipliers: new Map([['refined_salt', 2]]),
    })
    expect(doubled.find((row) => row.goodsId === 'refined_salt')?.priceGold).toBe(28)

    const halved = discoverMarketPrices({
      inventory: [inventoryRow('refined_salt', 12)],
      priceMultipliers: new Map([['refined_salt', 0.5]]),
    })
    expect(halved.find((row) => row.goodsId === 'refined_salt')?.priceGold).toBe(7)
  })

  it('leaves goods without a matching multiplier unchanged', () => {
    const prices = discoverMarketPrices({
      inventory: [inventoryRow('refined_salt', 12), inventoryRow('fish', 24)],
      priceMultipliers: new Map([['refined_salt', 2]]),
    })
    // fish has no operator → unaffected; baseline fish at supply==demand is its basePrice (6).
    expect(prices.find((row) => row.goodsId === 'fish')?.priceGold).toBe(6)
    expect(prices.find((row) => row.goodsId === 'refined_salt')?.priceGold).toBe(28)
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

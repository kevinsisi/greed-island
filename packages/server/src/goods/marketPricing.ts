import type { GoodsInventoryRow } from '../projections/goodsInventory.js'

export type MarketGoodsMetadata = Readonly<{
  goodsId: string
  baseDemand: number
  basePriceGold: number
}>

export type MarketPriceDiscovery = Readonly<{
  marketId: string
  settlementId: string
  goodsId: string
  supplyQuantity: number
  demandQuantity: number
  priceGold: number
}>

export const CENTRAL_MARKET_ID = 'market.t_central'
export const CENTRAL_SETTLEMENT_ID = 'settlement.t_central'

const MARKET_GOODS: readonly MarketGoodsMetadata[] = Object.freeze([
  { goodsId: 'fish', baseDemand: 24, basePriceGold: 6 },
  { goodsId: 'meat', baseDemand: 16, basePriceGold: 9 },
  { goodsId: 'brine', baseDemand: 10, basePriceGold: 4 },
  { goodsId: 'refined_salt', baseDemand: 12, basePriceGold: 14 },
])

export function listMarketGoods(): readonly MarketGoodsMetadata[] {
  return MARKET_GOODS
}

export function discoverMarketPrices(input: {
  inventory: readonly GoodsInventoryRow[]
  settlementId?: string
  marketId?: string
}): MarketPriceDiscovery[] {
  const settlementId = input.settlementId ?? CENTRAL_SETTLEMENT_ID
  const marketId = input.marketId ?? CENTRAL_MARKET_ID
  return MARKET_GOODS.map((metadata) => {
    const supplyQuantity = input.inventory
      .filter((row) => row.holderType === 'settlement' && row.holderId === settlementId && row.goodsId === metadata.goodsId)
      .reduce((sum, row) => sum + row.quantity, 0)
    return {
      marketId,
      settlementId,
      goodsId: metadata.goodsId,
      supplyQuantity,
      demandQuantity: metadata.baseDemand,
      priceGold: calculateMarketPriceGold({
        basePriceGold: metadata.basePriceGold,
        demandQuantity: metadata.baseDemand,
        supplyQuantity,
      }),
    }
  })
}

export function calculateMarketPriceGold(input: {
  basePriceGold: number
  demandQuantity: number
  supplyQuantity: number
}): number {
  const demand = Math.max(1, input.demandQuantity)
  const supply = Math.max(0, input.supplyQuantity)
  const pressure = (demand - supply) / demand
  if (pressure > 0) return Math.max(1, Math.round(input.basePriceGold * (1 + Math.min(1, pressure))))
  const surplusRatio = Math.min(0.5, (supply - demand) / demand)
  return Math.max(1, Math.round(input.basePriceGold * (1 - surplusRatio * 0.5)))
}

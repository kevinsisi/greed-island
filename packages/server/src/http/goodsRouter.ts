// Phase 2 §35.1 — read-only goods inventory endpoint.
// Phase 2 §35.4 — market prices endpoint.
// Serves per-holder inventory from GoodsInventoryProjection and current
// market prices from MarketPricesProjection. No auth required (world state is public).

import { Router, type Request, type Response } from 'express'
import { getGoodsSpecies } from '../goods/catalog.js'
import type { SimulationRuntime } from '../sim/runtime.js'

export type GoodsInventoryEntry = Readonly<{
  goodsId: string
  quantity: number
  nameZh: string
  unit: string
}>

export type MarketPriceEntry = Readonly<{
  marketId: string
  settlementId: string
  goodsId: string
  nameZh: string
  supplyQuantity: number
  demandQuantity: number
  priceGold: number
}>

export function createGoodsRouter(input: { runtime: SimulationRuntime }): Router {
  const router = Router()

  router.get('/goods/inventory/:ownerId', (req: Request, res: Response) => {
    const ownerId = req.params.ownerId
    if (!ownerId) {
      res.status(400).json({ error: 'INVALID_OWNER_ID' })
      return
    }
    const rows = input.runtime
      .getGoodsInventory()
      .filter((row) => row.holderId === ownerId && row.quantity > 0)
    const entries: GoodsInventoryEntry[] = rows.map((row) => {
      const meta = getGoodsSpecies(row.goodsId)
      return {
        goodsId: row.goodsId,
        quantity: row.quantity,
        nameZh: meta?.nameZh ?? row.goodsId,
        unit: meta?.unit ?? 'piece',
      }
    })
    res.json(entries)
  })

  router.get('/goods/market-prices', (_req: Request, res: Response) => {
    const rows = input.runtime.getMarketPrices()
    const entries: MarketPriceEntry[] = rows.map((row) => {
      const meta = getGoodsSpecies(row.goodsId)
      return {
        marketId: row.marketId,
        settlementId: row.settlementId,
        goodsId: row.goodsId,
        nameZh: meta?.nameZh ?? row.goodsId,
        supplyQuantity: row.supplyQuantity,
        demandQuantity: row.demandQuantity,
        priceGold: row.priceGold,
      }
    })
    res.json(entries)
  })

  return router
}

// Phase 2 §35.1 — read-only goods inventory endpoint.
// Phase 2 §35.4 — market prices endpoint.
// Serves per-holder inventory from GoodsInventoryProjection and current
// market prices from MarketPricesProjection. Public world holders stay public;
// player inventory is cookie-owned and is never selected by a supplied actor ID.

import { Router, type Request, type Response } from 'express'
import { getGoodsSpecies } from '../goods/catalog.js'
import type { SimulationRuntime } from '../sim/runtime.js'
import type { AuthConfig } from './auth.js'
import type { GoodsInventoryRow } from '../projections/goodsInventory.js'

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

export function createGoodsRouter(input: { runtime: SimulationRuntime; authConfig: AuthConfig }): Router {
  const router = Router()

  router.get('/goods/inventory/self', input.authConfig.session, (req: Request, res: Response) => {
    res.json(inventoryEntries(input.runtime.getGoodsInventory().filter(row =>
      row.holderType === 'player' && row.holderId === String(req.auth!.sub) && row.quantity > 0)))
  })

  router.get('/goods/inventory/:ownerId', (req: Request, res: Response) => {
    const ownerId = req.params.ownerId ?? ''
    if (/^[0-9]+$/.test(ownerId)) {
      // The compatibility path is an assertion. Ownership always comes from the cookie.
      input.authConfig.session(req, res, () => {
        if (ownerId !== String(req.auth!.sub)) { res.status(403).json({ error: 'FORBIDDEN' }); return }
        res.json(inventoryEntries(input.runtime.getGoodsInventory().filter(row =>
          row.holderType === 'player' && row.holderId === String(req.auth!.sub) && row.quantity > 0)))
      })
      return
    }
    if (!ownerId || ownerId.length > 200) { res.status(400).json({ error: 'INVALID_OWNER_ID' }); return }
    const publicTypes = new Set(['npc', 'settlement', 'building'])
    const rows = input.runtime.getGoodsInventory().filter(row =>
      publicTypes.has(row.holderType) && row.holderId === ownerId && row.quantity > 0)
    res.json(inventoryEntries(rows))
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


function inventoryEntries(rows: readonly GoodsInventoryRow[]): GoodsInventoryEntry[] {
  return rows.map(row => {
    const meta = getGoodsSpecies(row.goodsId)
    return { goodsId: row.goodsId, quantity: row.quantity,
      nameZh: meta?.nameZh ?? row.goodsId, unit: meta?.unit ?? 'piece' }
  })
}

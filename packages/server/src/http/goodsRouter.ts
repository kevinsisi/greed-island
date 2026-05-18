// Phase 2 §35.1 — read-only goods inventory endpoint.
// Serves per-holder inventory from GoodsInventoryProjection joined with the
// goods catalog for display metadata. No auth required (world state is public).

import { Router, type Request, type Response } from 'express'
import { getGoodsSpecies } from '../goods/catalog.js'
import type { SimulationRuntime } from '../sim/runtime.js'

export type GoodsInventoryEntry = Readonly<{
  goodsId: string
  quantity: number
  nameZh: string
  unit: string
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

  return router
}

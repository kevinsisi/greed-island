import express from 'express'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { describe, expect, it } from 'vitest'
import { createGoodsRouter } from './goodsRouter.js'
import type { SimulationRuntime } from '../sim/runtime.js'
import type { GoodsInventoryRow } from '../projections/goodsInventory.js'

function makeApp(rows: GoodsInventoryRow[]) {
  const runtime = { getGoodsInventory: () => rows } as unknown as SimulationRuntime
  const app = express()
  app.use('/api', createGoodsRouter({ runtime }))
  return app
}

function listen(app: express.Express): Promise<Server> {
  return new Promise((resolve) => { const s = app.listen(0, () => resolve(s)) })
}

function close(server: Server): Promise<void> {
  return new Promise((resolve, reject) => { server.close((err) => (err ? reject(err) : resolve())) })
}

describe('goods router', () => {
  it('returns non-zero inventory for a known ownerId', async () => {
    const rows: GoodsInventoryRow[] = [
      makeRow('npc', 'npc_hunter_1', 't_forest', 'meat', 3, 10, 1),
      makeRow('npc', 'npc_hunter_1', 't_forest', 'fish', 0, 10, 2),
    ]
    const app = makeApp(rows)
    const server = await listen(app)
    try {
      const { port } = server.address() as AddressInfo
      const res = await fetch(`http://127.0.0.1:${port}/api/goods/inventory/npc_hunter_1`)
      expect(res.status).toBe(200)
      const body = await res.json() as unknown[]
      expect(body).toHaveLength(1)
      expect((body[0] as { goodsId: string }).goodsId).toBe('meat')
      expect((body[0] as { quantity: number }).quantity).toBe(3)
      expect((body[0] as { nameZh: string }).nameZh).toBe('肉')
    } finally {
      await close(server)
    }
  })

  it('returns empty array for unknown ownerId', async () => {
    const app = makeApp([])
    const server = await listen(app)
    try {
      const { port } = server.address() as AddressInfo
      const res = await fetch(`http://127.0.0.1:${port}/api/goods/inventory/nobody`)
      expect(res.status).toBe(200)
      const body = await res.json() as unknown[]
      expect(body).toEqual([])
    } finally {
      await close(server)
    }
  })
})

function makeRow(
  holderType: 'npc' | 'settlement' | 'building',
  holderId: string,
  tileId: string,
  goodsId: string,
  quantity: number,
  lastUpdatedTick: number,
  lastSequence: number
): GoodsInventoryRow {
  return { holderType, holderId, tileId, goodsId, quantity, lastUpdatedTick, lastSequence }
}

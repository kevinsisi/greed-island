import express from 'express'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { describe, expect, it } from 'vitest'
import type { SimulationRuntime } from '../sim/runtime.js'
import { createSettlementsRouter } from './settlementsRouter.js'

describe('settlements router', () => {
  it('keeps the list envelope while returning authoritative settlement state rows', async () => {
    const row = {
      id: 'settlement.t_central',
      tileId: 't_central',
      formedAtTick: 10,
      founderNpcIds: ['npc.a'],
      populationNpcIds: ['npc.a', 'npc.b'],
      storage: [{ goodsId: 'fish', quantity: 4 }],
      pressure: { food: 30, safety: 10, economy: 20, logistics: 5 },
      stability: 82,
      status: 'stable' as const,
      updatedAtTick: 12,
    }
    const runtime = {
      getSettlements: () => [row],
      getSettlementById: (id: string) => id === row.id ? row : null,
    } as unknown as SimulationRuntime
    const app = express()
    app.use(createSettlementsRouter({ runtime }))
    const server = await listen(app)

    try {
      const address = server.address() as AddressInfo
      const listResponse = await fetch(`http://127.0.0.1:${address.port}/settlements`)
      const listPayload = (await listResponse.json()) as { settlements: unknown[] }
      const singleResponse = await fetch(`http://127.0.0.1:${address.port}/settlements/${row.id}`)
      const singlePayload = await singleResponse.json()

      expect(listResponse.status).toBe(200)
      expect(listPayload.settlements).toEqual([row])
      expect(singleResponse.status).toBe(200)
      expect(singlePayload).toEqual(row)
    } finally {
      await close(server)
    }
  })
})

function listen(app: express.Express): Promise<Server> {
  return new Promise((resolve) => {
    const server = app.listen(0, () => resolve(server))
  })
}

function close(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()))
  })
}

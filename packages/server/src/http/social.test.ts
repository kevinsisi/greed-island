import Database from 'better-sqlite3'
import express from 'express'
import jwt from 'jsonwebtoken'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { describe, expect, it } from 'vitest'
import { AccountStore } from './accounts.js'
import type { AuthConfig } from './auth.js'
import { createSocialRouter } from './social.js'
import { SocialBus } from './socialBus.js'
import { SocialStore } from './socialStore.js'
import type { SimulationRuntime } from '../sim/runtime.js'

describe('social presence', () => {
  it('returns nearby players with their last area coordinates', async () => {
    const db = new Database(':memory:')
    const accounts = new AccountStore(db, 4)
    const social = new SocialStore(db)
    const authConfig: AuthConfig = { jwtSecret: 'test-secret', jwtExpiresIn: '1h' }
    const runtime = { getCurrentTick: () => 100 } as unknown as SimulationRuntime
    const bus = new SocialBus()
    const playerA = await accounts.createAccount('a@example.test', 'hunter123')
    const playerB = await accounts.createAccount('b@example.test', 'hunter123')
    accounts.updateProfile(playerA.id, { nickname: 'K' })
    accounts.updateProfile(playerB.id, { nickname: '恒文' })

    const app = express()
    app.use(express.json())
    app.use(createSocialRouter({ runtime, social, accounts, bus, authConfig }))
    const server = await listen(app)

    try {
      const address = server.address() as AddressInfo
      const tokenA = signToken(playerA.id, playerA.email, playerA.role, authConfig)
      const tokenB = signToken(playerB.id, playerB.email, playerB.role, authConfig)

      const presenceA = await fetch(`http://127.0.0.1:${address.port}/social/presence`, {
        method: 'POST',
        headers: { authorization: `Bearer ${tokenA}`, 'content-type': 'application/json' },
        body: JSON.stringify({ tileId: 't_dock', x: 48, y: 52, z: 2, clientUpdatedAt: 1_000 }),
      })
      const presenceB = await fetch(`http://127.0.0.1:${address.port}/social/presence`, {
        method: 'POST',
        headers: { authorization: `Bearer ${tokenB}`, 'content-type': 'application/json' },
        body: JSON.stringify({ tileId: 't_dock', x: 302, y: 214, z: 0, clientUpdatedAt: 1_000 }),
      })
      const nearby = await fetch(`http://127.0.0.1:${address.port}/social/nearby?tileId=t_dock`, {
        headers: { authorization: `Bearer ${tokenB}` },
      })
      const payload = (await nearby.json()) as {
        players: Array<{ id: number; displayName: string; x: number | null; y: number | null; z: number | null }>
      }

      expect(presenceA.status).toBe(200)
      expect(presenceB.status).toBe(200)
      expect(nearby.status).toBe(200)
      expect(payload.players).toEqual([
        expect.objectContaining({ id: playerA.id, displayName: 'K', x: 48, y: 52, z: 2 }),
      ])

      await fetch(`http://127.0.0.1:${address.port}/social/presence`, {
        method: 'POST',
        headers: { authorization: `Bearer ${tokenA}`, 'content-type': 'application/json' },
        body: JSON.stringify({ tileId: 't_dock', clientUpdatedAt: 3_000 }),
      })
      await fetch(`http://127.0.0.1:${address.port}/social/presence`, {
        method: 'POST',
        headers: { authorization: `Bearer ${tokenA}`, 'content-type': 'application/json' },
        body: JSON.stringify({ tileId: 't_dock', x: 60, y: 70, z: 3, clientUpdatedAt: 2_500 }),
      })
      const afterHeartbeat = await fetch(`http://127.0.0.1:${address.port}/social/nearby?tileId=t_dock`, {
        headers: { authorization: `Bearer ${tokenB}` },
      })
      const afterHeartbeatPayload = (await afterHeartbeat.json()) as {
        players: Array<{ id: number; x: number | null; y: number | null; z: number | null }>
      }

      expect(afterHeartbeatPayload.players).toEqual([
        expect.objectContaining({ id: playerA.id, x: 60, y: 70, z: 3 }),
      ])

      await fetch(`http://127.0.0.1:${address.port}/social/presence`, {
        method: 'POST',
        headers: { authorization: `Bearer ${tokenA}`, 'content-type': 'application/json' },
        body: JSON.stringify({ tileId: 't_forest', clientUpdatedAt: 4_000 }),
      })
      await fetch(`http://127.0.0.1:${address.port}/social/presence`, {
        method: 'POST',
        headers: { authorization: `Bearer ${tokenB}`, 'content-type': 'application/json' },
        body: JSON.stringify({ tileId: 't_forest', x: 80, y: 90, z: 0, clientUpdatedAt: 4_000 }),
      })
      const movedNearby = await fetch(`http://127.0.0.1:${address.port}/social/nearby?tileId=t_forest`, {
        headers: { authorization: `Bearer ${tokenB}` },
      })
      const movedPayload = (await movedNearby.json()) as {
        players: Array<{ id: number; x: number | null; y: number | null; z: number | null }>
      }

      expect(movedPayload.players).toEqual([
        expect.objectContaining({ id: playerA.id, x: null, y: null, z: null }),
      ])

      const busEvents: unknown[] = []
      const unsubscribe = bus.subscribe(playerB.id, (event) => busEvents.push(event))
      await fetch(`http://127.0.0.1:${address.port}/social/presence`, {
        method: 'POST',
        headers: { authorization: `Bearer ${tokenA}`, 'content-type': 'application/json' },
        body: JSON.stringify({ tileId: 't_dock', x: 48, y: 52, z: 2, clientUpdatedAt: 3_500 }),
      })
      unsubscribe()
      const afterStale = await fetch(`http://127.0.0.1:${address.port}/social/nearby?tileId=t_forest`, {
        headers: { authorization: `Bearer ${tokenB}` },
      })
      const afterStalePayload = (await afterStale.json()) as {
        players: Array<{ id: number; x: number | null; y: number | null; z: number | null }>
      }

      expect(afterStalePayload.players).toEqual([
        expect.objectContaining({ id: playerA.id, x: null, y: null, z: null }),
      ])
      expect(busEvents).toEqual([])
    } finally {
      await close(server)
      db.close()
    }
  })

  it('keeps hub presence coordinates across the full main map canvas', async () => {
    const db = new Database(':memory:')
    const accounts = new AccountStore(db, 4)
    const social = new SocialStore(db)
    const authConfig: AuthConfig = { jwtSecret: 'test-secret', jwtExpiresIn: '1h' }
    const runtime = { getCurrentTick: () => 100 } as unknown as SimulationRuntime
    const bus = new SocialBus()
    const playerA = await accounts.createAccount('a@example.test', 'hunter123')
    const playerB = await accounts.createAccount('b@example.test', 'hunter123')

    const app = express()
    app.use(express.json())
    app.use(createSocialRouter({ runtime, social, accounts, bus, authConfig }))
    const server = await listen(app)

    try {
      const address = server.address() as AddressInfo
      const tokenA = signToken(playerA.id, playerA.email, playerA.role, authConfig)
      const tokenB = signToken(playerB.id, playerB.email, playerB.role, authConfig)

      await fetch(`http://127.0.0.1:${address.port}/social/presence`, {
        method: 'POST',
        headers: { authorization: `Bearer ${tokenA}`, 'content-type': 'application/json' },
        body: JSON.stringify({ tileId: 't_dock', x: 48, y: 52, z: 2, clientUpdatedAt: 500 }),
      })
      await fetch(`http://127.0.0.1:${address.port}/social/presence`, {
        method: 'POST',
        headers: { authorization: `Bearer ${tokenA}`, 'content-type': 'application/json' },
        body: JSON.stringify({ tileId: 'hub', x: 760, y: 540, z: 0, clientUpdatedAt: 1_000 }),
      })
      await fetch(`http://127.0.0.1:${address.port}/social/presence`, {
        method: 'POST',
        headers: { authorization: `Bearer ${tokenB}`, 'content-type': 'application/json' },
        body: JSON.stringify({ tileId: 'hub', x: 20, y: 30, z: 0, clientUpdatedAt: 1_000 }),
      })

      const nearby = await fetch(`http://127.0.0.1:${address.port}/social/nearby?tileId=hub`, {
        headers: { authorization: `Bearer ${tokenB}` },
      })
      const payload = (await nearby.json()) as {
        players: Array<{ id: number; x: number | null; y: number | null; z: number | null }>
      }

      expect(payload.players).toEqual([
        expect.objectContaining({ id: playerA.id, x: 760, y: 540, z: 0 }),
      ])
      expect(social.getPlayerLocation(playerA.id)).toEqual(
        expect.objectContaining({ tile_id: 't_dock', pos_x: 48, pos_y: 52, pos_z: 2 })
      )
    } finally {
      await close(server)
      db.close()
    }
  })
})

function signToken(
  accountId: number,
  email: string,
  role: string,
  authConfig: AuthConfig
): string {
  return jwt.sign({ sub: accountId, email, role }, authConfig.jwtSecret)
}

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

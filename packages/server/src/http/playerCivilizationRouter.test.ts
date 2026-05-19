import Database from 'better-sqlite3'
import express from 'express'
import jwt from 'jsonwebtoken'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import type { AuthConfig } from './auth.js'
import { createPlayerCivilizationRouter } from './playerCivilizationRouter.js'
import { PlayerCivilizationProjection } from '../projections/playerCivilization.js'
import { AccountStore } from './accounts.js'

function listen(app: ReturnType<typeof express>): Promise<Server> {
  return new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s))
  })
}

function mockRuntime(proj: PlayerCivilizationProjection) {
  return {
    getCurrentTick: () => 42,
    getPlayerCivilizationSnapshot: (accountId: string) => proj.snapshot(accountId),
    submitLivingWorldCommand: (cmd: unknown) => {
      const c = cmd as { commandType: string; payload: { data: Record<string, unknown> } }
      const cmdPayload = c.payload as Record<string, unknown>
      proj.project({
        sequence: 1,
        eventId: 'mock-event-1',
        eventType: c.commandType,
        actorId: String(cmdPayload?.playerAccountId ?? ''),
        payload: { actorType: 'player', data: cmdPayload, narration: null },
        deterministicKey: 'mock-key-1',
        version: 1,
        tick: 42,
        occurredAt: Date.now(),
      })
      return { sequence: 1 }
    },
  }
}

describe('playerCivilizationRouter', () => {
  const servers: Server[] = []
  afterEach(() => servers.forEach((s) => s.close()))

  async function setup() {
    const db = new Database(':memory:')
    const authConfig: AuthConfig = { jwtSecret: 'test-secret', jwtExpiresIn: '1h' }
    const accounts = new AccountStore(db, 4)
    const account = await accounts.createAccount('player@example.test', 'pass1234')
    const proj = new PlayerCivilizationProjection()
    const runtime = mockRuntime(proj)
    const app = express()
    app.use(express.json())
    app.use(createPlayerCivilizationRouter({ runtime: runtime as never, authConfig }))
    const server = await listen(app)
    servers.push(server)
    const port = (server.address() as AddressInfo).port
    const token = jwt.sign({ sub: account.id, email: account.email, role: account.role }, authConfig.jwtSecret)
    const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' }
    return { port, headers, accountId: String(account.id), proj }
  }

  it('returns 401 when unauthenticated', async () => {
    const { port } = await setup()
    const res = await fetch(`http://127.0.0.1:${port}/world/player-action`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'PLAYER_CLAIMED_TERRITORY', payload: {} }) })
    expect(res.status).toBe(401)
  })

  it('accepts PLAYER_CLAIMED_TERRITORY and reflects in player-state', async () => {
    const { port, headers, accountId } = await setup()
    const res = await fetch(`http://127.0.0.1:${port}/world/player-action`, {
      method: 'POST', headers,
      body: JSON.stringify({ type: 'PLAYER_CLAIMED_TERRITORY', payload: { tileId: 't_salt_marsh' } }),
    })
    expect(res.status).toBe(200)
    const body = await res.json() as { accepted: boolean }
    expect(body.accepted).toBe(true)

    const stateRes = await fetch(`http://127.0.0.1:${port}/world/player-state`, { headers })
    const state = await stateRes.json() as { accountId: string; claimedTileIds: string[] }
    expect(state.accountId).toBe(accountId)
    expect(state.claimedTileIds).toContain('t_salt_marsh')
  })

  it('rejects unknown command type', async () => {
    const { port, headers } = await setup()
    const res = await fetch(`http://127.0.0.1:${port}/world/player-action`, {
      method: 'POST', headers,
      body: JSON.stringify({ type: 'UNKNOWN_COMMAND', payload: {} }),
    })
    expect(res.status).toBe(400)
    const body = await res.json() as { accepted: boolean }
    expect(body.accepted).toBe(false)
  })

  it('GET player-state returns zero-state for new player', async () => {
    const { port, headers } = await setup()
    const res = await fetch(`http://127.0.0.1:${port}/world/player-state`, { headers })
    expect(res.status).toBe(200)
    const state = await res.json() as { wallet: number; hiredNpcIds: string[]; factionIds: string[]; claimedTileIds: string[] }
    expect(state.wallet).toBe(0)
    expect(state.hiredNpcIds).toEqual([])
    expect(state.factionIds).toEqual([])
    expect(state.claimedTileIds).toEqual([])
  })
})

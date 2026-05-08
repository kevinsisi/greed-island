import Database from 'better-sqlite3'
import express from 'express'
import jwt from 'jsonwebtoken'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { describe, expect, it } from 'vitest'
import { createNpcRouter } from './npc.js'
import { AccountStore } from './accounts.js'
import { PlayerStateStore } from './playerState.js'
import { SettingsStore } from './settings.js'
import type { AuthConfig } from './auth.js'
import type { NpcProfile } from '../npcs/types.js'
import type { SimulationRuntime } from '../sim/runtime.js'

describe('npc router', () => {
  it('keeps deterministic identity replies from being overwritten by fallback dialog', async () => {
    const db = new Database(':memory:')
    const accounts = new AccountStore(db, 4)
    const store = new PlayerStateStore(db)
    const settings = new SettingsStore(db)
    const account = await accounts.createAccount('gon@example.test', 'hunter123')
    accounts.updateProfile(account.id, { nickname: '小傑' })

    const authConfig: AuthConfig = { jwtSecret: 'test-secret', jwtExpiresIn: '1h' }
    const profile: NpcProfile = {
      id: 'npc-test',
      name: { zh: '米特', en: 'Mito' },
      role: { zh: '鯨魚島居民', en: 'Whale Island resident' },
      defaultLocation: 't_whale',
      routine: [],
      triggers: [],
      memory: { consultsEventTypes: [], decayFn: 'none', decayParam: 0 },
      personality: { trustBase: 50, patience: 0.8 },
    }
    const runtime = {
      findProfile: (npcId: string) => (npcId === profile.id ? profile : null),
      getCurrentTick: () => 1,
    } as unknown as SimulationRuntime

    const app = express()
    app.use(express.json())
    app.use(createNpcRouter({ runtime, store, settings, accounts, authConfig }))
    const server = await listen(app)

    try {
      const address = server.address() as AddressInfo
      const token = jwt.sign(
        { sub: account.id, email: account.email, role: account.role },
        authConfig.jwtSecret
      )
      const response = await fetch(`http://127.0.0.1:${address.port}/npc/${profile.id}/interact`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ message: '我是誰？' }),
      })
      const payload = (await response.json()) as { line: { zh: string }; replySource: string }

      expect(response.status).toBe(200)
      expect(payload.replySource).toBe('fallback')
      expect(payload.line.zh).toContain('小傑')
      expect(payload.line.zh).not.toContain('近況')
    } finally {
      await close(server)
      db.close()
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

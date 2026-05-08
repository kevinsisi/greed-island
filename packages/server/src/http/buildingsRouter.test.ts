import Database from 'better-sqlite3'
import express from 'express'
import jwt from 'jsonwebtoken'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { describe, expect, it } from 'vitest'
import { AccountStore } from './accounts.js'
import type { AuthConfig } from './auth.js'
import { createBuildingsRouter } from './buildingsRouter.js'
import { PlayerJobsStore } from '../buildings/playerJobsStore.js'
import type { SimulationRuntime } from '../sim/runtime.js'

describe('buildings router', () => {
  it('rejects multiple active jobs across buildings and shifts', async () => {
    const db = new Database(':memory:')
    const authConfig: AuthConfig = { jwtSecret: 'test-secret', jwtExpiresIn: '1h' }
    const accounts = new AccountStore(db, 4)
    const jobs = new PlayerJobsStore(db)
    const account = await accounts.createAccount('worker@example.test', 'hunter123')
    const runtime = {
      getCurrentTick: () => 100,
      getBuildingsOnTile: () => [],
      getAllBuildings: () => [],
      getAreaState: () => null,
      getAmbientNarrator: () => null,
    } as unknown as SimulationRuntime
    const app = express()
    app.use(express.json())
    app.use(createBuildingsRouter({ runtime, jobs, authConfig }))
    const server = await listen(app)

    try {
      const address = server.address() as AddressInfo
      const token = jwt.sign(
        { sub: account.id, email: account.email, role: account.role },
        authConfig.jwtSecret
      )
      const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' }
      const first = await fetch(`http://127.0.0.1:${address.port}/buildings/b_desert_workshop/apply`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ shift: 'morning' }),
      })
      const second = await fetch(`http://127.0.0.1:${address.port}/buildings/b_dimai_archive/apply`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ shift: 'afternoon' }),
      })
      const payload = (await second.json()) as { error: string }

      expect(first.status).toBe(200)
      expect(second.status).toBe(409)
      expect(payload.error).toBe('ALREADY_HIRED')
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

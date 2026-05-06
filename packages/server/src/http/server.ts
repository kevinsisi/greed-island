// Express app factory. Wires auth, world, NPC interaction, and SSE
// routers under /api and exposes a health endpoint at /healthz.

import express, { type Express, type NextFunction, type Request, type Response } from 'express'
import cors from 'cors'
import { AccountStore } from './accounts.js'
import { createAuthRouter, type AuthConfig } from './auth.js'
import { createWorldRouter } from './world.js'
import { createSseRouter } from './sse.js'
import { createNpcRouter } from './npc.js'
import { PlayerStateStore } from './playerState.js'
import type { SimulationRuntime } from '../sim/runtime.js'
import type Database from 'better-sqlite3'
import { APP_VERSION } from '../version.js'

export type HttpAppOptions = Readonly<{
  db: Database.Database
  runtime: SimulationRuntime
  auth: AuthConfig
  bcryptCost: number
}>

export function createHttpApp(options: HttpAppOptions): Express {
  const app = express()
  app.disable('x-powered-by')
  app.use(cors())
  app.use(express.json({ limit: '64kb' }))

  app.get('/healthz', (_req, res) => {
    res.json({ ok: true, version: APP_VERSION, tick: options.runtime.getSnapshot().tick })
  })

  app.get('/api/version', (_req, res) => {
    res.json({ version: APP_VERSION })
  })

  const accountStore = new AccountStore(options.db, options.bcryptCost)
  const playerStore = new PlayerStateStore(options.db)

  app.use('/api/auth', createAuthRouter(accountStore, options.auth))
  app.use(
    '/api',
    createWorldRouter({
      runtime: options.runtime,
      store: playerStore,
      authConfig: options.auth,
    })
  )
  app.use(
    '/api',
    createNpcRouter({
      runtime: options.runtime,
      store: playerStore,
      authConfig: options.auth,
    })
  )
  app.use('/api', createSseRouter(options.runtime))

  app.use((req: Request, res: Response) => {
    if (req.path.startsWith('/api') || req.path === '/healthz') {
      res.status(404).json({ error: 'NOT_FOUND', path: req.path })
      return
    }
    res.status(404).type('text/plain').send('Not Found')
  })

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error('[http] unhandled error', err)
    res.status(500).json({ error: 'INTERNAL_ERROR' })
  })

  return app
}

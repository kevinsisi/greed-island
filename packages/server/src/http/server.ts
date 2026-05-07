// Express app factory. Wires auth, world, NPC interaction, settings,
// social, and SSE routers under /api and exposes a health endpoint
// at /healthz.

import express, { type Express, type NextFunction, type Request, type Response } from 'express'
import cors from 'cors'
import { AccountStore } from './accounts.js'
import { createAuthRouter, type AuthConfig } from './auth.js'
import { createWorldRouter } from './world.js'
import { createSseRouter } from './sse.js'
import { createNpcRouter } from './npc.js'
import { PlayerStateStore } from './playerState.js'
import { SettingsStore } from './settings.js'
import { createSettingsRouter } from './settingsRouter.js'
import { createAdminRouter } from './adminRouter.js'
import { createProfileRouter } from './profileRouter.js'
import { PasswordResetStore } from './passwordResets.js'
import { SocialStore } from './socialStore.js'
import { SocialBus } from './socialBus.js'
import { createSocialRouter, createSocialSseRouter } from './social.js'
import { CardWorldStore } from './cardWorldStore.js'
import { createCardWorldRouter } from './cardWorldRouter.js'
import { CardDropEngine, tileIdsFromRuntime } from './cardDropEngine.js'
import type { SimulationRuntime } from '../sim/runtime.js'
import type Database from 'better-sqlite3'
import { APP_VERSION } from '../version.js'

// Owner emails always promoted to admin on boot. Hardcoded so a fresh
// deploy gives the project owner GM access without env-var hand-holding.
// Additional admins can be added via GREED_ISLAND_ADMIN_EMAILS env or
// via the /admin page once one admin already exists.
export const OWNER_ADMIN_EMAILS: readonly string[] = ['kevin950805@gmail.com']

export type HttpAppOptions = Readonly<{
  db: Database.Database
  runtime: SimulationRuntime
  auth: AuthConfig
  bcryptCost: number
  adminEmails: readonly string[]
  geminiApiKeys: readonly string[]
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
  const settingsStore = new SettingsStore(options.db)
  const passwordResetStore = new PasswordResetStore(options.db)
  const socialStore = new SocialStore(options.db)
  const socialBus = new SocialBus()
  const cardCatalog = options.runtime.getCardCatalog()
  const cardWorldStore = new CardWorldStore(options.db, cardCatalog)
  const cardDropEngine = new CardDropEngine(
    cardWorldStore,
    cardCatalog,
    tileIdsFromRuntime(options.runtime)
  )
  cardDropEngine.seedInitialDrops(options.runtime.getCurrentTick())
  options.runtime.subscribeTick((tick) => cardDropEngine.onTick(tick))

  // Best-effort: drop reset tokens older than 30 days so the table
  // stays compact across long-running deployments.
  passwordResetStore.pruneExpired()

  if (options.geminiApiKeys.length > 0) {
    const seeded = settingsStore.addKeys(options.geminiApiKeys, 'env')
    if (seeded > 0) {
      console.log(`[boot] seeded ${seeded} Gemini API key(s) from GEMINI_API_KEY env`)
    }
  }

  // Merge the hardcoded owner allow-list with any env-supplied emails.
  // Both run through ensureAdminAllowList so we promote whatever is
  // already registered; emails not yet registered stay queued (the
  // promotion runs again on next boot).
  const mergedAdminEmails = uniqueLowercase([
    ...OWNER_ADMIN_EMAILS,
    ...options.adminEmails,
  ])
  if (mergedAdminEmails.length > 0) {
    const promoted = accountStore.ensureAdminAllowList(mergedAdminEmails)
    if (promoted > 0) {
      console.log(
        `[boot] promoted ${promoted} account(s) to admin via owner+env allow-list (${mergedAdminEmails.join(', ')})`
      )
    }
  }

  app.use('/api/auth', createAuthRouter(accountStore, passwordResetStore, options.auth))
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
      settings: settingsStore,
      authConfig: options.auth,
    })
  )
  app.use(
    '/api',
    createSettingsRouter({
      store: settingsStore,
      accounts: accountStore,
      authConfig: options.auth,
      adminEmails: mergedAdminEmails,
    })
  )
  app.use(
    '/api',
    createAdminRouter({
      accounts: accountStore,
      resets: passwordResetStore,
      authConfig: options.auth,
    })
  )
  app.use(
    '/api',
    createProfileRouter({
      accounts: accountStore,
      authConfig: options.auth,
    })
  )
  app.use(
    '/api',
    createSocialRouter({
      runtime: options.runtime,
      social: socialStore,
      accounts: accountStore,
      bus: socialBus,
      authConfig: options.auth,
    })
  )
  app.use('/api', createSocialSseRouter({ bus: socialBus, authConfig: options.auth }))
  app.use(
    '/api',
    createCardWorldRouter({
      store: cardWorldStore,
      runtime: options.runtime,
      accounts: accountStore,
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

function uniqueLowercase(values: readonly string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const v of values) {
    const norm = v.trim().toLowerCase()
    if (!norm) continue
    if (seen.has(norm)) continue
    seen.add(norm)
    out.push(norm)
  }
  return out
}

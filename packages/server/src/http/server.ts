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
import { createAdminNpcsRouter } from './adminNpcsRouter.js'
import { createProfileRouter } from './profileRouter.js'
import { PasswordResetStore } from './passwordResets.js'
import { SocialStore } from './socialStore.js'
import { SocialBus } from './socialBus.js'
import { createSocialRouter, createSocialSseRouter } from './social.js'
import { CardWorldStore } from './cardWorldStore.js'
import { createCardWorldRouter } from './cardWorldRouter.js'
import { CardDropEngine, tileIdsFromRuntime } from './cardDropEngine.js'
import { CardActionPipeline } from './cardCommands.js'
import { PlayerJobsStore } from '../buildings/playerJobsStore.js'
import { createBuildingsRouter } from './buildingsRouter.js'
import { createSettlementsRouter } from './settlementsRouter.js'
import { createCombatRouter } from './combatRouter.js'
import { createTechniqueShopRouter } from './techniqueShopRouter.js'
import type { SimulationRuntime } from '../sim/runtime.js'
import type Database from 'better-sqlite3'
import { APP_VERSION } from '../version.js'
import { SqliteEventStore } from '../kernel/eventStore.js'
import { SqliteNpcMemoryStore } from '../kernel/npcMemory.js'
import { SqliteNpcRelationshipsStore } from '../kernel/npcRelationships.js'
import { createLivingWorldRouter } from './livingWorldRouter.js'

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
  // Living World v0.10.0：Buildings + AmbientNarrator (jobs store comes
  // first so the card router can read player energy via jobs.getWallet())
  const jobsStore = new PlayerJobsStore(options.db)
  options.runtime.attachAmbientNarrator(settingsStore)

  const cardCatalog = options.runtime.getCardCatalog()
  const cardWorldStore = new CardWorldStore(options.db, cardCatalog)
  const cardActionPipeline = new CardActionPipeline(options.db, cardWorldStore)
  const cardDropEngine = new CardDropEngine(
    cardWorldStore,
    cardActionPipeline,
    cardCatalog,
    tileIdsFromRuntime(options.runtime),
    options.runtime
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

  // Living World v0.11.0：NPC memory + relationship projections.
  // Tables are created lazily by the constructors. The runtime
  // rebuilds projections from the existing EventLog the first time
  // it sees an empty memory table — see attachLivingWorldProjections.
  const npcMemoryStore = new SqliteNpcMemoryStore(options.db)
  const npcRelationshipsStore = new SqliteNpcRelationshipsStore(options.db)
  options.runtime.attachLivingWorldProjections({
    memory: npcMemoryStore,
    relationships: npcRelationshipsStore,
  })
  console.log(
    `[boot] ambient narrator attached (${settingsStore.listActiveKeys().length} active key(s))`
  )

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
      accounts: accountStore,
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
  // GM/admin observability over NPC origin (manual vs autonomously-born),
  // births, households, and explicit deaths-not-implemented placeholder.
  // Read-only projection over runtime + EventLog; submits no commands.
  const eventStore = new SqliteEventStore(options.db)
  app.use(
    '/api',
    createAdminNpcsRouter({
      runtime: options.runtime,
      eventStore,
      accounts: accountStore,
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
      pipeline: cardActionPipeline,
      runtime: options.runtime,
      accounts: accountStore,
      jobs: jobsStore,
      authConfig: options.auth,
    })
  )
  app.use(
    '/api',
    createBuildingsRouter({
      runtime: options.runtime,
      jobs: jobsStore,
      authConfig: options.auth,
    })
  )
  app.use('/api', createSettlementsRouter({ runtime: options.runtime }))
  app.use(
    '/api',
    createCombatRouter({
      db: options.db,
      runtime: options.runtime,
      jobs: jobsStore,
      social: socialStore,
      authConfig: options.auth,
    })
  )
  app.use(
    '/api',
    createTechniqueShopRouter({
      db: options.db,
      jobs: jobsStore,
      social: socialStore,
      authConfig: options.auth,
    })
  )
  app.use(
    '/api',
    createLivingWorldRouter({
      runtime: options.runtime,
      memory: npcMemoryStore,
      relationships: npcRelationshipsStore,
      settings: settingsStore,
      accounts: accountStore,
      authConfig: options.auth,
      db: options.db,
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

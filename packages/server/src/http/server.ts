// Express app factory. Wires auth, world, NPC interaction, settings,
// social, and SSE routers under /api and exposes a health endpoint
// at /healthz.

import express, { type Express, type NextFunction, type Request, type Response } from 'express'
import { mkdirSync } from 'fs'
import { resolve } from 'path'
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
import { createAdminCardsRouter } from './adminCardsRouter.js'
import { createAdminSimRouter } from './adminSimRouter.js'
import { createAdminLineageRouter } from './adminLineageRouter.js'
import { createProfileRouter } from './profileRouter.js'
import { PasswordResetStore } from './passwordResets.js'
import { SocialStore } from './socialStore.js'
import { SocialBus } from './socialBus.js'
import { createSocialRouter, createSocialSseRouter } from './social.js'
import { CardWorldStore } from './cardWorldStore.js'
import { createCardWorldRouter } from './cardWorldRouter.js'
import { CardDropEngine, tileIdsFromRuntime } from './cardDropEngine.js'
import { combatLootPosition, computeCombatLootCardId, pickDeterministicIndex } from './combatLoot.js'
import { CardActionPipeline } from './cardCommands.js'
import { PlayerJobsStore } from '../buildings/playerJobsStore.js'
import { createBuildingsRouter } from './buildingsRouter.js'
import { createSettlementsRouter } from './settlementsRouter.js'
import { createAreaEcologyRouter } from './areaEcologyRouter.js'
import { createGoodsRouter } from './goodsRouter.js'
import { createHistoryRouter } from './historyRouter.js'
import { createBioNodesRouter } from './bioNodesRouter.js'
import { createCombatRouter } from './combatRouter.js'
import { createTechniqueShopRouter } from './techniqueShopRouter.js'
import { createPropertiesRouter, createPropertyContextProvider } from './propertiesRouter.js'
import type { SimulationRuntime } from '../sim/runtime.js'
import type Database from 'better-sqlite3'
import { APP_VERSION } from '../version.js'
import { SqliteEventStore } from '../kernel/eventStore.js'
import { SqliteNpcMemoryStore } from '../kernel/npcMemory.js'
import { SqliteNpcRelationshipsStore } from '../kernel/npcRelationships.js'
import { createLivingWorldRouter } from './livingWorldRouter.js'
import { createPlayerCivilizationRouter } from './playerCivilizationRouter.js'
import { createPlayerSurvivalRouter } from './playerSurvivalRouter.js'
import { CombatStore } from '../combat/combatStore.js'

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
  dataDir: string
}>

export function createHttpApp(options: HttpAppOptions): Express {
  const app = express()
  app.disable('x-powered-by')
  app.use(cors())
  app.use(express.json({ limit: '10mb' }))

  // Serve uploaded card art images as static files.
  const cardImagesDir = resolve(options.dataDir, 'card-images')
  mkdirSync(cardImagesDir, { recursive: true })
  app.use('/card-images', express.static(cardImagesDir))

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
  options.runtime.attachPlayerJobsStore(jobsStore)
  options.runtime.attachAmbientNarrator(settingsStore)
  // v0.89.0 — 每個 NPC 都是 AI agent（AI 不可用時自動退回確定性 planner）。
  options.runtime.attachNpcAgent(settingsStore)
  const combatStore = new CombatStore(options.db)
  options.runtime.attachCombatStore(combatStore)

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

  // v0.90.0 — Phase D：戰鬥終局 → 紋卡世界回饋（COMBAT_ARCHITECTURE §5.2/§6）。
  //   * player_victory：§6 機率掉一張正典 combat_victory 卡（deterministic by combatId）
  //   * npc_victory：玩家隨身 held 卡隨機掉一張回地上（重新 60s 計時，其他人可搶 — 奪卡感）
  options.runtime.subscribeCombatResolved((info) => {
    try {
      if (info.outcome === 'player_victory') {
        const areaState = options.runtime.getAreaState(info.tileId)
        const lootCardId = computeCombatLootCardId({
          combatId: info.combatId,
          durationRounds: info.durationRounds,
          rareWindowOpen: options.runtime.isRareWindowOpen(),
          areaSafety: typeof areaState?.resources?.safety === 'number' ? areaState.resources.safety : null,
          catalog: cardCatalog,
        })
        if (lootCardId !== null) {
          const pos = combatLootPosition(info.combatId)
          cardActionPipeline.spawnDrop({
            type: 'CARD_DROP_SPAWN',
            actorId: 'system',
            tick: info.tick,
            cardId: lootCardId,
            tileId: info.tileId,
            x: pos.x,
            y: pos.y,
            reason: 'combat_loot',
          })
        }
      } else if (info.outcome === 'npc_victory') {
        const held = cardWorldStore.listHeldByPlayer(info.playerAccountId)
        if (held.length > 0) {
          const idx = pickDeterministicIndex(`${info.combatId}:defeat-drop`, held.length)
          const lost = held[idx]!
          cardActionPipeline.release({
            type: 'CARD_RELEASE',
            actorId: info.playerAccountId,
            tick: info.tick,
            dropId: lost.id,
          })
        }
      }
    } catch (err) {
      console.error('[combat] post-resolve card effects failed', err)
    }
  })

  // Best-effort: drop reset tokens older than 30 days so the table
  // stays compact across long-running deployments.
  passwordResetStore.pruneExpired()

  if (options.geminiApiKeys.length > 0) {
    const seeded = settingsStore.addKeys(options.geminiApiKeys, 'env')
    if (seeded > 0) {
      console.log(`[boot] seeded ${seeded} Gemini API key(s) from GEMINI_API_KEY env`)
    }
  }

  // v0.42.0 — seed OpenCode base URL + model from env on first boot. The
  // admin can override at any time via the Settings page; we only seed
  // when the kv row is empty so we don't clobber a manual change.
  const envOpenCodeUrl = process.env.OPENCODE_BASE_URL?.trim()
  if (envOpenCodeUrl && !settingsStore.getSetting('opencode_base_url')) {
    settingsStore.setSetting('opencode_base_url', envOpenCodeUrl)
    console.log(`[boot] seeded OpenCode base URL from env: ${envOpenCodeUrl}`)
  }
  const envOpenCodeModel = process.env.OPENCODE_MODEL?.trim()
  if (envOpenCodeModel && !settingsStore.getSetting('opencode_model')) {
    settingsStore.setSetting('opencode_model', envOpenCodeModel)
    console.log(`[boot] seeded OpenCode model from env: ${envOpenCodeModel}`)
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
  const openCodeConfigured = Boolean(settingsStore.getSetting('opencode_base_url'))
  console.log(
    `[boot] ambient narrator attached — gemini=${settingsStore.listActiveKeys().length} active key(s), opencode=${openCodeConfigured ? 'configured' : 'not configured'}`
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
      dataDir: options.dataDir,
    })
  )
  const propertyContextProvider = createPropertyContextProvider(options.db, accountStore, options.runtime)
  app.use(
    '/api',
    createNpcRouter({
      runtime: options.runtime,
      store: playerStore,
      settings: settingsStore,
      accounts: accountStore,
      authConfig: options.auth,
      getPropertyContext: propertyContextProvider,
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
    createAdminCardsRouter({
      dataDir: options.dataDir,
      accounts: accountStore,
      authConfig: options.auth,
    })
  )
  app.use(
    '/api',
    createAdminSimRouter({
      runtime: options.runtime,
      accounts: accountStore,
      authConfig: options.auth,
    })
  )
  app.use(
    '/api',
    createAdminLineageRouter({
      runtime: options.runtime,
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
  app.use('/api', createAreaEcologyRouter({ runtime: options.runtime }))
  app.use('/api', createGoodsRouter({ runtime: options.runtime }))
  app.use('/api', createHistoryRouter({ runtime: options.runtime }))
  app.use('/api', createBioNodesRouter({ runtime: options.runtime }))
  app.use('/api', createPlayerCivilizationRouter({ runtime: options.runtime, authConfig: options.auth }))
  app.use('/api', createPlayerSurvivalRouter({ runtime: options.runtime, jobs: jobsStore, authConfig: options.auth }))
  app.use(
    '/api',
    createCombatRouter({
      store: combatStore,
      runtime: options.runtime,
      jobs: jobsStore,
      social: socialStore,
      authConfig: options.auth,
      db: options.db,
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
  app.use('/api', createPropertiesRouter({
    db: options.db,
    accounts: accountStore,
    runtime: options.runtime,
    authConfig: options.auth,
  }))
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

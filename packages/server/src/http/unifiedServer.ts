import express, { type Express, type ErrorRequestHandler } from 'express'
import type { SimulationRuntime } from '../sim/runtime.js'
import { AuthService, sessionTokenFromCookie } from '../identity/authService.js'
import { createUnifiedAuthRouter, requireUnifiedSession } from '../identity/authRouter.js'
import { createUnifiedAdminRouter } from '../identity/adminRouter.js'
import { createPlayerWorldRouter } from './playerWorldRouter.js'
import { APP_VERSION } from '../version.js'
import type Database from 'better-sqlite3'
import { createHttpAuthorization } from './authorization.js'
import { createCanonicalAccountView } from './canonicalAccountView.js'
import { SocialStore } from './socialStore.js'
import { SocialBus } from './socialBus.js'
import { createSocialRouter } from './social.js'
import { createSocialSseRouter } from './socialStream.js'
import type { SqliteEventStore } from '../kernel/eventStore.js'
import { createWorldRouter } from './world.js'
import { publicMap } from './publicReadModels.js'
import { createSseRouter } from './sse.js'
import { createCardArtRouter } from './cardArtFiles.js'
import type { PlayerJobsStore } from '../buildings/playerJobsStore.js'
import type { CombatStore } from '../combat/combatStore.js'
import type { SettingsStore } from './settings.js'
import type { PlayerStateStore } from './playerState.js'
import type { CardWorldStore } from './cardWorldStore.js'
import type { CardActionPipeline } from './cardCommands.js'
import type { TechniqueShopStore } from '../cards/techniques.js'
import { createBuildingsReadRouter } from './buildingsRouter.js'
import { createPropertiesReadRouter } from './propertiesRouter.js'
import { createAreaEcologyRouter } from './areaEcologyRouter.js'
import { createGoodsRouter } from './goodsRouter.js'
import { createOwnedCardRouter } from './cardWorldRouter.js'
import { createOwnedTechniqueRouter } from './techniqueShopRouter.js'
import { createAdminCardsRouter } from './adminCardsRouter.js'
import { createSettingsRouter } from './settingsRouter.js'
import { createAdminSimRouter } from './adminSimRouter.js'
import { createUnifiedNpcRouter } from './npc.js'
import { createUnifiedPlayerCivilizationRouter } from './playerCivilizationRouter.js'
import { createUnifiedPlayerSurvivalRouter } from './playerSurvivalRouter.js'
import { createUnifiedCombatRouter } from './combatRouter.js'

export type UnifiedHttpApp = Readonly<{ app: Express; closeStreams: () => void }>

/** Reviewed routes only. Never invoke the old all-route JWT factory here. */
export type UnifiedHttpInput = Readonly<{
  db: Database.Database; eventStore: SqliteEventStore; dataDir: string
  runtime: SimulationRuntime; auth: AuthService
  jobs: PlayerJobsStore; combat: CombatStore; settings: SettingsStore
  playerState: PlayerStateStore; cards: CardWorldStore; cardPipeline: CardActionPipeline
  techniques: TechniqueShopStore; openCodeCredentialOrigin?: string; buildSha?: string
}>
export function createUnifiedHttpApp(input: UnifiedHttpInput): UnifiedHttpApp {
  const app = express()
  app.disable('x-powered-by')
  app.set('trust proxy', false)
  app.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next() })
  app.get('/healthz', (_req, res) => {
    res.json({ ok: true, mode: 'unified', version: APP_VERSION, buildSha: input.buildSha ?? null, tick: input.runtime.getCurrentTick() })
  })
  app.get('/api/version', (_req, res) => { res.json({ version: APP_VERSION }) })
  const world = createPlayerWorldRouter({ runtime: input.runtime, authService: input.auth, sessionTokenFromCookie })
  // Raw-body limits belong before any upstream JSON parser.
  app.use('/api', world)
  const authorization = createHttpAuthorization(input.auth)
  const accounts = createCanonicalAccountView(input.db, input.auth.accounts)
  // These reviewed GM routes authorize before their own larger bounded parser.
  // Place them before the auth router's generic 4KiB parser.
  app.use('/api', createAdminCardsRouter({ dataDir: input.dataDir, authConfig: authorization }))
  app.use('/api', createSettingsRouter({ store: input.settings, authConfig: authorization,
    ...(input.openCodeCredentialOrigin ? { openCodeCredentialOrigin: input.openCodeCredentialOrigin } : {}) }))
  app.use('/api', createAdminSimRouter({ runtime: input.runtime, authConfig: authorization }))
  app.use('/api', createUnifiedAuthRouter({ auth: input.auth }))
  app.use('/api', createUnifiedAdminRouter({ auth: input.auth }))
  const social = new SocialStore(input.db), socialBus = new SocialBus()
  const socialStream = createSocialSseRouter({ bus: socialBus, authConfig: authorization })
  app.use('/api', socialStream)
  app.use('/api', createSocialRouter({ runtime: input.runtime, social, accounts, bus: socialBus, authConfig: authorization }))
  app.use('/api', createWorldRouter({ runtime: input.runtime, db: input.db, eventStore: input.eventStore, authConfig: authorization, dataDir: input.dataDir }))
  app.use('/api', createBuildingsReadRouter({ runtime: input.runtime, jobs: input.jobs, authConfig: authorization }))
  app.use('/api', createPropertiesReadRouter({ db: input.db, accounts, runtime: input.runtime, authConfig: authorization }))
  app.use('/api', createAreaEcologyRouter({ runtime: input.runtime }))
  app.use('/api', createGoodsRouter({ runtime: input.runtime, authConfig: authorization }))
  app.use('/api', createOwnedCardRouter({ db: input.db, store: input.cards, pipeline: input.cardPipeline,
    runtime: input.runtime, accounts, jobs: input.jobs, authConfig: authorization }))
  app.use('/api', createOwnedTechniqueRouter({ db: input.db, jobs: input.jobs, runtime: input.runtime,
    store: input.techniques, authConfig: authorization }))
  app.use('/api', createUnifiedNpcRouter({ runtime: input.runtime, store: input.playerState,
    settings: input.settings, accounts, authConfig: authorization }))
  app.use('/api', createUnifiedPlayerSurvivalRouter({ runtime: input.runtime, jobs: input.jobs, authConfig: authorization }))
  app.use('/api', createUnifiedPlayerCivilizationRouter({ runtime: input.runtime, authConfig: authorization }))
  const combat = createUnifiedCombatRouter({ runtime: input.runtime, store: input.combat,
    jobs: input.jobs, techniques: input.techniques, db: input.db, authConfig: authorization })
  app.use('/api', combat)
  const publicStream = createSseRouter(input.runtime, input.eventStore)
  app.use('/api', publicStream)
  app.use(createCardArtRouter(input.dataDir))
  app.get('/api/map', requireUnifiedSession(input.auth), (_req, res) => {
    res.json(publicMap(input.runtime))
  })
  app.use((_req, res) => { res.status(404).json({ error: 'NOT_FOUND' }) })
  const errors: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
    const status = error && typeof error === 'object' && 'status' in error ? error.status : undefined
    if (!res.headersSent && (status === 400 || status === 413)) {
      res.status(status).json({ error: status === 413 ? 'PAYLOAD_TOO_LARGE' : 'INVALID_BODY' }); return
    }
    console.error('[unified-http] request failed', error instanceof Error ? error.name : 'UnknownError')
    if (!res.headersSent) res.status(500).json({ error: 'INTERNAL_ERROR' })
  }
  app.use(errors)
  return { app, closeStreams: () => { world.closeStreams(); socialStream.closeStreams(); publicStream.closeStreams(); combat.closeStreams() } }
}

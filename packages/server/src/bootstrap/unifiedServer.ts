import Database from 'better-sqlite3'
import type { Server } from 'node:http'
import type { Express } from 'express'
import { dirname } from 'node:path'
import { assertUnifiedIdentitySchema } from '../identity/schema.js'
import { assertAccountAllocatorReady } from '../identity/accountIdAuthority.js'
import { assertLegacyWorldStageActivationReady } from '../migration/legacyWorldStageGate.js'
import { AuthService } from '../identity/authService.js'
import { SqliteEventStore } from '../kernel/eventStore.js'
import { SqliteNpcMemoryStore } from '../kernel/npcMemory.js'
import { SqliteNpcRelationshipsStore } from '../kernel/npcRelationships.js'
import { SimulationRuntime } from '../sim/runtime.js'
import { loadCardCatalog } from '../cards/loader.js'
import { loadNpcProfiles } from '../npcs/loader.js'
import { PlayerJobsStore } from '../buildings/playerJobsStore.js'
import { CombatStore } from '../combat/combatStore.js'
import { SettingsStore } from '../http/settings.js'
import { createUnifiedHttpApp } from '../http/unifiedServer.js'
import { createHarborProgressPolicy } from '../playerWorld/harborPolicy.js'
import type { UnifiedServerConfig } from './unifiedConfig.js'
import { PlayerStateStore } from '../http/playerState.js'
import { CardWorldStore } from '../http/cardWorldStore.js'
import { CardActionPipeline } from '../http/cardCommands.js'
import { TechniqueShopStore } from '../cards/techniques.js'
import { attachOwnedCardWorld } from '../http/ownedCardWorldHooks.js'
import { createCanonicalAccountView } from '../http/canonicalAccountView.js'
import { assertUnifiedFeatureSchemaReady } from './featureSchema.js'

const DEFERRED_HYDRATION_DELAY_MS = 30_000
const EVENT_COLUMNS = ['sequence', 'event_id', 'event_type', 'occurred_at', 'actor_id', 'command_id', 'tick', 'ruleset_version', 'payload_json', 'version', 'deterministic_key']

/** Read-only before any WAL, schema constructor, promotion or world tick. */
export function assertUnifiedDatabaseReady(db: Database.Database): void {
  assertLegacyWorldStageActivationReady(db)
  assertUnifiedIdentitySchema(db)
  assertAccountAllocatorReady(db)
  const tables = new Set((db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{ name: string }>).map(row => row.name))
  const columns = db.prepare('PRAGMA table_info(event_log)').all() as Array<{ name: string }>
  if (!tables.has('event_log') || !tables.has('rejected_command_log') || EVENT_COLUMNS.some(name => !columns.some(column => column.name === name))) {
    throw new Error('Canonical EventLog is not ready; explicit reviewed initialization or migration is required.')
  }
  if ((db.pragma('foreign_key_check') as unknown[]).length) throw new Error('Canonical database has foreign-key violations; refusing startup.')
  if (!db.prepare("SELECT id FROM accounts WHERE role='admin' AND status='active' LIMIT 1").get()) {
    throw new Error('OWNER_BOOTSTRAP_REQUIRED: verify an existing active owner admin before startup. No account will be promoted automatically.')
  }
  assertUnifiedFeatureSchemaReady(db)
}

/** Deployment/readiness probes may call this without starting or mutating. */
export function inspectUnifiedDatabase(databasePath: string): void {
  const inspection = new Database(databasePath, { readonly: true, fileMustExist: true })
  try { assertUnifiedDatabaseReady(inspection) } finally { inspection.close() }
}

export function openUnifiedDatabase(databasePath: string): Database.Database {
  inspectUnifiedDatabase(databasePath)
  const db = new Database(databasePath, { fileMustExist: true })
  try {
    // Recheck after reopening, before writable pragmas.
    assertUnifiedDatabaseReady(db)
    db.pragma('foreign_keys = ON')
    db.pragma('journal_mode = WAL')
    return db
  } catch (error) { db.close(); throw error }
}

export type UnifiedServer = Readonly<{
  app: Express
  db: Database.Database
  eventStore: SqliteEventStore
  runtime: SimulationRuntime
  auth: AuthService
  start: () => Promise<Server>
  close: () => Promise<void>
}>

export function createUnifiedServer(config: UnifiedServerConfig): UnifiedServer {
  const db = openUnifiedDatabase(config.databasePath)
  let runtime: SimulationRuntime | undefined
  let detachOwnedCards: (() => void) | undefined
  try {
    const eventStore = new SqliteEventStore(db)
    runtime = new SimulationRuntime(eventStore, loadNpcProfiles(), loadCardCatalog())
    const auth = new AuthService(db, { allowedOrigins: config.allowedOrigins, secureCookies: config.secureCookies, sessionMs: config.sessionMs })
    const settings = new SettingsStore(db)
    const jobs = new PlayerJobsStore(db), combat = new CombatStore(db)
    const playerState = new PlayerStateStore(db)
    const cards = new CardWorldStore(db, runtime.getCardCatalog())
    const cardPipeline = new CardActionPipeline(db, cards)
    const techniques = new TechniqueShopStore(db)
    runtime.attachPlayerJobsStore(jobs)
    runtime.attachCombatStore(combat)
    runtime.attachLivingWorldProjections({ memory: new SqliteNpcMemoryStore(db), relationships: new SqliteNpcRelationshipsStore(db) })
    runtime.attachAmbientNarrator(settings)
    runtime.attachNpcAgent(settings)
    runtime.attachPlayerWorldDisplayNameResolver(id => auth.accounts.getProfile(id)?.displayName ?? null)
    runtime.attachPlayerWorldHarborProgressPolicy(createHarborProgressPolicy(db))
    detachOwnedCards = attachOwnedCardWorld({ db, store: cards, pipeline: cardPipeline, runtime,
      accounts: createCanonicalAccountView(db, auth.accounts) })
    const canonicalRuntime = runtime
    const http = createUnifiedHttpApp({ db, eventStore, dataDir: dirname(config.databasePath), runtime: canonicalRuntime,
      auth, jobs, combat, settings, playerState, cards, cardPipeline, techniques,
      ...(config.openCodeCredentialOrigin ? { openCodeCredentialOrigin: config.openCodeCredentialOrigin } : {}),
      ...(config.buildSha ? { buildSha: config.buildSha } : {}) })
    let server: Server | undefined
    let hydrationTimer: ReturnType<typeof setTimeout> | undefined
    let closePromise: Promise<void> | undefined
    let started = false
    let closed = false
    let listenFailed = false

    const close = (): Promise<void> => {
      if (closePromise) return closePromise
      closed = true
      if (hydrationTimer) clearTimeout(hydrationTimer)
      http.closeStreams()
      detachOwnedCards?.()
      canonicalRuntime.stop()
      // Stop accepting requests immediately, but keep the canonical handle
      // open until an already-started replay has observed its cancellation.
      const listenerClosed = new Promise<void>(resolve => {
        if (!server || listenFailed) { resolve(); return }
        const closeListener = () => {
          server!.close(() => resolve())
          server!.closeIdleConnections()
        }
        if (server.listening) closeListener()
        else {
          // A stop during asynchronous bind must not close the DB and then
          // let a late listening callback restart the runtime against it.
          server.once('listening', closeListener)
          server.once('error', () => resolve())
        }
      })
      closePromise = Promise.all([
        listenerClosed,
        // A genuine replay failure is reported by the boot callback. Cleanup
        // still has to close SQLite after the failed run has settled.
        canonicalRuntime.waitForDeferredHydration().catch(() => {}),
        // Cancelled provider continuations drain promptly even when the provider ignores abort.
        canonicalRuntime.waitForBackgroundWork(1000),
      ]).then(() => { if (db.open) db.close() })
      return closePromise
    }
    const start = (): Promise<Server> => {
      if (closed || started) return Promise.reject(new Error('Unified server can only start once.'))
      started = true
      return new Promise<Server>((resolve, reject) => {
        try { server = http.app.listen(config.port, config.host) }
        catch (error) { listenFailed = true; void close().then(() => reject(error), reject); return }
        server.once('error', error => { listenFailed = true; void close().then(() => reject(error), reject) })
        server.once('listening', () => {
          try {
            if (closed) throw new Error('Unified server startup was cancelled.')
            canonicalRuntime.start()
            if (canonicalRuntime.needsDeferredHydration()) {
              hydrationTimer = setTimeout(() => {
                void canonicalRuntime.startDeferredHydration().catch(error => {
                  console.error('[boot] deferred hydration failed', error)
                })
              }, DEFERRED_HYDRATION_DELAY_MS)
              hydrationTimer.unref()
            }
            resolve(server!)
          } catch (error) { void close().then(() => reject(error), reject) }
        })
      })
    }
    return { app: http.app, db, eventStore, runtime: canonicalRuntime, auth, start, close }
  } catch (error) {
    detachOwnedCards?.()
    runtime?.stop()
    if (db.open) db.close()
    throw error
  }
}

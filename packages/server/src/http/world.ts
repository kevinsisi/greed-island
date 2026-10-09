// Reviewed world/catalog geography and actor-owned dashboard projections.
import { Router, type RequestHandler } from 'express'
import type Database from 'better-sqlite3'
import type { SqliteEventStore } from '../kernel/eventStore.js'
import type { SimulationRuntime } from '../sim/runtime.js'
import type { AuthConfig } from './auth.js'
import { findCardArt } from './cardArtFiles.js'
import { publicWorldSnapshot, publicNpc, publicCatalog, publicNarrativeEvent, publicActiveEvent, tableExists, readPublicNarratives, operatorWorldSnapshot } from './publicReadModels.js'

export function createWorldRouter(input: { runtime: SimulationRuntime; db: Database.Database; eventStore: SqliteEventStore; authConfig: AuthConfig; dataDir: string }): Router {
  const router = Router(), { runtime, db, authConfig } = input
  // A requested personalized view requires the asserted current cookie owner.
  // A plain public request never silently acquires private data from a cookie.
  const contextOrPublic: RequestHandler = (req, res, next) => {
    if (req.get('X-Greed-Account-Id') !== undefined) authConfig.session(req, res, next)
    else authConfig.optional(req, res, next)
  }
  const events = (limit: number) => readPublicNarratives(input.eventStore, runtime, limit)
  router.get('/admin/world', authConfig.role('gm','admin'), (_req, res) => { res.json(operatorWorldSnapshot(runtime)) })
  router.get('/world', (_req, res) => { res.json(publicWorldSnapshot(runtime)) })
  router.get('/npcs', contextOrPublic, (req, res) => {
    const actor = req.get('X-Greed-Account-Id') !== undefined ? req.auth?.sub : undefined
    const ready = tableExists(db, 'player_npc_relations')
    const relations = actor !== undefined && ready ? new Map((db.prepare('SELECT npc_id,trust,interaction_count,last_interaction_tick FROM player_npc_relations WHERE account_id=?').all(actor) as Array<{ npc_id: string; trust: number; interaction_count: number; last_interaction_tick: number }>).map(row => [row.npc_id, row])) : null
    res.json(runtime.getNpcs().filter(npc => !npc.deceased).map(npc => {
      const dto = publicNpc(npc)
      if (actor === undefined) return dto
      const relation = relations?.get(npc.id)
      return { ...dto, relationshipProgressReady: ready,
        ...(ready ? { relationshipScore: relation?.trust ?? dto.relationshipScore,
          relationshipScoreSource: relation ? 'owned-relation' : 'profile-seed',
          interactionCount: relation?.interaction_count ?? 0, lastInteractionTick: relation?.last_interaction_tick ?? 0 } : {}) }
    }))
  })
  router.get('/events', (req, res) => {
    const requested = typeof req.query.limit === 'string' && /^[1-9][0-9]*$/.test(req.query.limit) ? Number(req.query.limit) : 50
    res.json(events(Math.min(100, Number.isSafeInteger(requested) ? requested : 50)))
  })
  router.get('/cards', (_req, res) => { res.json(publicCatalog(runtime, id => findCardArt(input.dataDir, id)?.imageUrl ?? null)) })
  router.get('/world-events', (_req, res) => { res.json({ active: runtime.getActiveWorldEvents().flatMap(event => { const dto = publicActiveEvent(event); return dto ? [dto] : [] }) }) })
  router.get('/dashboard', contextOrPublic, (req, res) => {
    const actor = req.get('X-Greed-Account-Id') !== undefined ? req.auth?.sub : undefined
    const codexReady = actor !== undefined && tableExists(db, 'player_codex')
    const owned = codexReady ? (db.prepare('SELECT COUNT(*) AS count FROM player_codex WHERE account_id=?').get(actor) as { count: number }).count : null
    const lastSeen = actor === undefined ? null : (db.prepare("SELECT last_seen_tick FROM accounts WHERE id=? AND status='active'").get(actor) as { last_seen_tick: number } | undefined)?.last_seen_tick ?? null
    const walletRow = actor !== undefined && tableExists(db, 'player_wallet') ? db.prepare('SELECT gold,energy,updated_at FROM player_wallet WHERE account_id=?').get(actor) as { gold: number; energy: number; updated_at: number } | undefined : undefined
    const wallet = walletRow ? { accountId: actor, gold: walletRow.gold, energy: walletRow.energy, updatedAt: walletRow.updated_at } : null
    res.json({ world: publicWorldSnapshot(runtime), cardsOwned: owned, cardsOwnedReady: codexReady,
      cardsTotal: runtime.getCardCatalog().entries.length, recentEvents: events(5), rareWindowOpen: runtime.isRareWindowOpen(),
      activeEvents: runtime.getActiveWorldEvents().flatMap(event => { const dto = publicActiveEvent(event); return dto ? [dto] : [] }),
      ticksSinceLastVisit: lastSeen === null ? null : Math.max(0, runtime.getCurrentTick() - lastSeen),
      wallet, walletInitialized: wallet !== null, accountContext: actor ?? null })
  })
  return router
}

// Living World v0.11.0 read endpoints — NPC memory, NPC
// relationships, per-NPC emotional snapshot, and offline catch-up
// summary. All endpoints are read-only projections over the
// EventLog; nothing here writes events.

import { Router, type Request, type Response } from 'express'
import type Database from 'better-sqlite3'
import type { SimulationRuntime } from '../sim/runtime.js'
import { SqliteEventStore } from '../kernel/eventStore.js'
import { summarizeWindow } from '../kernel/catchUpSummary.js'
import { buildChronicleContext, renderChronicle } from '../kernel/chronicleRenderer.js'
import { deriveEmotionalSnapshot } from '../kernel/emotionalSimulation.js'
import type { SqliteNpcMemoryStore } from '../kernel/npcMemory.js'
import type { SqliteNpcRelationshipsStore } from '../kernel/npcRelationships.js'
import type { AccountStore } from './accounts.js'
import { requireAuth, type AuthConfig } from './auth.js'
import type { SettingsStore } from './settings.js'

const CATCH_UP_EVENT_TYPES = [
  'NPC_INTERACT',
  'NPC_PRODUCTIVE_ACTION',
  'NPC_LIFE_GOAL_SET',
  'CONSTRUCTION_PROJECT_PROGRESS',
  'BUILDING_CONSTRUCTED',
  'MAP_TILE_UNLOCKED',
  'NPC_HOUSEHOLD_FORMED',
  'NPC_CHILD_BORN',
  'NPC_MOVE',
  'BUILDING_ENTER',
  'AREA_PRESSURE',
  'WEATHER_CHANGE',
  'SEASON_CHANGE',
  'WORLD_EVENT_SPAWN'
] as const
const CATCH_UP_EVENT_LIMIT = 5_000

export function createLivingWorldRouter(input: {
  runtime: SimulationRuntime
  memory: SqliteNpcMemoryStore
  relationships: SqliteNpcRelationshipsStore
  settings: SettingsStore
  accounts: AccountStore
  authConfig: AuthConfig
  db: Database.Database
}): Router {
  const router = Router()
  const eventStore = new SqliteEventStore(input.db)
  const auth = requireAuth(input.authConfig)

  router.get('/world/catch-up', (req: Request, res: Response) => {
    const sinceTickRaw = Number.parseInt(String(req.query.sinceTick ?? '0'), 10)
    const sinceTick = Number.isFinite(sinceTickRaw) ? Math.max(0, sinceTickRaw) : 0
    const latestTick = input.runtime.getCurrentTick()
    const { events, limited } = eventStore.readEventsByTickWindow({
      sinceTick,
      untilTick: latestTick,
      eventTypes: CATCH_UP_EVENT_TYPES,
      limit: CATCH_UP_EVENT_LIMIT
    })
    const summary = summarizeWindow(events, sinceTick, latestTick)
    res.json({ latestTick, summary, partial: limited })
  })

  router.get('/world/chronicle', async (req: Request, res: Response) => {
    const limit = clampInt(req.query.limit, 1, 100, 40)
    const useAi = String(req.query.ai ?? '0') === '1'
    const events = eventStore.readRecentEvents(limit)
    // Chronicle MUST resolve names for deceased actors so their last arcs read correctly.
    const actorNames = Object.fromEntries(
      input.runtime.getNpcsIncludingDeceased().map((npc) => [npc.id, npc.name.zh]),
    )
    const context = buildChronicleContext({ events, memory: input.memory, actorNames })
    const chronicle = await renderChronicle({ context, settings: input.settings, useAi })
    res.json({ latestTick: input.runtime.getCurrentTick(), chronicle })
  })

  // v0.11.0 — "while you were gone". Reads the player's last_seen_tick
  // from accounts, summarizes the EventLog window, then bumps the
  // pointer to the current tick so subsequent calls report only what
  // happened after this acknowledgement.
  router.get('/world/since-last-visit', auth, (req: Request, res: Response) => {
    const claims = req.auth
    if (!claims) {
      res.status(401).json({ error: 'UNAUTHORIZED' })
      return
    }
    const accountId = claims.sub
    const previousLastSeenTick = input.accounts.getLastSeenTick(accountId)
    const latestTick = input.runtime.getCurrentTick()
    const { events, limited } = eventStore.readEventsByTickWindow({
      sinceTick: previousLastSeenTick,
      untilTick: latestTick,
      eventTypes: CATCH_UP_EVENT_TYPES,
      limit: CATCH_UP_EVENT_LIMIT
    })
    const summary = summarizeWindow(events, previousLastSeenTick, latestTick)
    input.accounts.setLastSeenTick(accountId, latestTick)
    res.json({
      previousLastSeenTick,
      latestTick,
      summary,
      partial: limited
    })
  })

  router.get('/npc/:id/memory', (req: Request, res: Response) => {
    const npcId = req.params.id ?? ''
    if (npcId.length === 0) {
      res.status(400).json({ error: 'MISSING_ID' })
      return
    }
    const limit = clampInt(req.query.limit, 1, 200, 50)
    const recent = input.memory.getRecent(npcId, limit)
    const important = input.memory.getImportant(npcId, 5, 20)
    res.json({ npcId, recent, important })
  })

  router.get('/npc/:id/relationships', (req: Request, res: Response) => {
    const npcId = req.params.id ?? ''
    if (npcId.length === 0) {
      res.status(400).json({ error: 'MISSING_ID' })
      return
    }
    res.json({ npcId, relationships: input.relationships.listFor(npcId) })
  })

  router.get('/npc/:id/emotion', (req: Request, res: Response) => {
    const npcId = req.params.id ?? ''
    if (npcId.length === 0) {
      res.status(400).json({ error: 'MISSING_ID' })
      return
    }
    const profile = input.runtime.findProfile(npcId)
    if (!profile) {
      res.status(404).json({ error: 'NPC_NOT_FOUND', npcId })
      return
    }
    const npcs = input.runtime.getNpcs()
    const npcView = npcs.find((n) => n.id === npcId) ?? null
    const tile = npcView?.location ?? profile.defaultLocation
    const area = input.runtime.getAreaState(tile)
    const areaPressure = computeAreaPressure(area)
    const snapshot = deriveEmotionalSnapshot(npcId, input.memory, input.relationships, {
      areaPressure
    })
    res.json({ npcId, areaPressure, snapshot })
  })

  return router
}

function clampInt(raw: unknown, lo: number, hi: number, fallback: number): number {
  const n = Number.parseInt(String(raw ?? ''), 10)
  if (!Number.isFinite(n)) return fallback
  return Math.min(hi, Math.max(lo, n))
}

function computeAreaPressure(
  area:
    | {
        resources: { food: number; safety: number; economy: number }
        factionControl: Record<string, number>
      }
    | null
): number {
  if (!area) return 0
  // Pressure = how far below mid-line each resource is, normalized to 0..1.
  const r = area.resources
  const lacks =
    Math.max(0, 50 - r.food) + Math.max(0, 50 - r.safety) + Math.max(0, 50 - r.economy)
  const max = 50 * 3
  return Math.min(1, lacks / max)
}

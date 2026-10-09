// Property listings API bridge — proxies to the existing agent system API
// and returns normalised listing data for the frontend property browser.
// Also manages agent ↔ NPC bindings so agent accounts can assign NPC proxies.

import { Router, type Request, type Response } from 'express'
import type { Database } from 'better-sqlite3'
import type { CanonicalAccountView } from './canonicalAccountView.js'
import type { AuthConfig } from './auth.js'
import { requireRole } from './auth.js'

type NpcRef = Readonly<{ id: string; name: { zh: string; en: string } }>

const UPSTREAM_BASE = process.env.PROPERTY_API_URL ?? 'http://agent-api.internal'
const DEFAULT_PAGE_SIZE = 50
const REQUEST_TIMEOUT_MS = 10_000

export type PropertyListing = Readonly<{
  id: string
  title: string
  price: number
  address: string
  lat: number
  lng: number
  rooms: number
  hall: number
  bath: number
  sizePing: number
  buildingType: string
  floor: string | null
  age: number | null
  photoUrls: readonly string[]
  agentName: string
  agentContact: string
}>

export type PropertyListResponse = Readonly<{
  listings: readonly PropertyListing[]
  total: number
  page: number
  pageSize: number
}>

export type AgentNpcBinding = Readonly<{
  accountId: number
  npcId: string
  npcName: string
  boundAt: number
}>

export function initializeAgentBindingSchema(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_npc_bindings (
      account_id  INTEGER NOT NULL,
      npc_id      TEXT NOT NULL,
      bound_at    INTEGER NOT NULL,
      PRIMARY KEY (account_id, npc_id),
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
    );
  `)
}

export type PropertiesRouterInput = {
  db: Database
  accounts: CanonicalAccountView
  runtime: { getNpcs: () => readonly NpcRef[] }
  authConfig: AuthConfig
}

/** Only public listings and cookie-owned bindings. Binding commands stay gated. */
export function createPropertiesReadRouter(deps: PropertiesRouterInput): Router {
  const router = Router()
  initializeAgentBindingSchema(deps.db)
  registerPropertyReads(router, deps)
  return router
}

export function createPropertiesRouter(deps: PropertiesRouterInput): Router {
  const router = Router()
  initializeAgentBindingSchema(deps.db)
  registerPropertyReads(router, deps)
  const requireAgent = requireRole(deps.authConfig, deps.accounts, 'agent', 'admin')

  router.post('/properties/bindings', requireAgent, (req: Request, res: Response) => {
    const accountId = req.auth!.sub
    const { npcId } = req.body as { npcId?: string }
    if (!npcId || typeof npcId !== 'string') {
      res.status(400).json({ error: 'BAD_REQUEST', message: 'npcId is required' })
      return
    }
    const npc = deps.runtime.getNpcs().find((n) => n.id === npcId)
    if (!npc) {
      res.status(404).json({ error: 'NPC_NOT_FOUND', message: '指定的 NPC 不存在' })
      return
    }
    bindNpc(deps.db, accountId, npcId)
    res.json({ bound: true, npcId, npcName: npc.name.zh })
  })

  router.delete('/properties/bindings/:npcId', requireAgent, (req: Request, res: Response) => {
    const accountId = req.auth!.sub
    const { npcId } = req.params
    unbindNpc(deps.db, accountId, npcId!)
    res.json({ unbound: true, npcId })
  })

  return router
}

function registerPropertyReads(router: Router, deps: PropertiesRouterInput): void {
  const requireAgent = requireRole(deps.authConfig, deps.accounts, 'agent', 'admin')
  router.get('/properties', async (req: Request, res: Response) => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    try {
      const { url: upstreamUrl, page, pageSize } = buildUpstreamUrl(req.query)
      const response = await fetch(upstreamUrl, { signal: controller.signal })

      if (!response.ok) {
        console.error(`[properties] upstream returned ${response.status}`)
        res.status(503).json({ error: 'UPSTREAM_UNAVAILABLE', message: '房源系統暫時無法連線' })
        return
      }

      const decoded: unknown = await response.json()
      if (!isRecord(decoded) || !Array.isArray(decoded.listings)) throw new Error('Invalid listing response')
      const raw = decoded
      const listings = normaliseListings((raw.listings as unknown[]).slice(0, pageSize))
      res.json({
        listings,
        total: typeof raw.total === 'number' && Number.isSafeInteger(raw.total) && raw.total >= 0 ? raw.total : listings.length,
        page, pageSize,
      } satisfies PropertyListResponse)
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        res.status(503).json({ error: 'UPSTREAM_TIMEOUT', message: '房源系統連線逾時' })
        return
      }
      res.status(503).json({ error: 'UPSTREAM_UNAVAILABLE', message: '房源系統暫時無法連線' })
    } finally {
      clearTimeout(timer)
    }
  })

  router.get('/properties/bindings', requireAgent, (req: Request, res: Response) => {
    const accountId = req.auth!.sub
    const rows = listBindings(deps.db, accountId)
    const npcs = deps.runtime.getNpcs()
    const npcMap = new Map(npcs.map((n) => [n.id, n.name.zh]))
    const bindings: AgentNpcBinding[] = rows.map((r) => ({
      accountId: r.account_id,
      npcId: r.npc_id,
      npcName: npcMap.get(r.npc_id) ?? r.npc_id,
      boundAt: r.bound_at,
    }))
    res.json({ bindings })
  })

}

function buildUpstreamUrl(query: Record<string, unknown>): { url: string; page: number; pageSize: number } {
  const params = new URLSearchParams()
  // Current browser filters only. Never forward cookie, account, token or private selectors.
  const allowed = ['region', 'type', 'rooms', 'priceMin', 'priceMax', 'sizeMin', 'sizeMax', 'ageMax']
  for (const key of allowed) {
    const value = query[key]
    if (typeof value === 'string' && value.length > 0 && value.length <= 200) params.set(key, value)
  }
  const page = boundedPositiveInteger(query.page, 1, 1_000_000)
  const pageSize = boundedPositiveInteger(query.limit, DEFAULT_PAGE_SIZE, 100)
  params.set('page', String(page)); params.set('limit', String(pageSize))
  return { url: `${UPSTREAM_BASE}/api/listings?${params.toString()}`, page, pageSize }
}

function boundedPositiveInteger(value: unknown, fallback: number, maximum: number): number {
  if (typeof value !== 'string' || !/^[1-9][0-9]*$/.test(value)) return fallback
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) ? Math.min(parsed, maximum) : fallback
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function finiteNumber(value: unknown): number {
  const number = typeof value === 'number' || typeof value === 'string' ? Number(value) : NaN
  return Number.isFinite(number) ? number : 0
}

function normaliseListings(raw: readonly unknown[]): readonly PropertyListing[] {
  return raw.filter(isRecord).map(r => {
    return {
      id: String(r.id ?? ''),
      title: String(r.title ?? ''),
      price: finiteNumber(r.price),
      address: String(r.address ?? ''),
      lat: finiteNumber(r.lat),
      lng: finiteNumber(r.lng),
      rooms: finiteNumber(r.rooms),
      hall: finiteNumber(r.hall),
      bath: finiteNumber(r.bath),
      sizePing: finiteNumber(r.sizePing),
      buildingType: String(r.buildingType ?? ''),
      floor: r.floor !== null && r.floor !== undefined ? String(r.floor) : null,
      age: r.age !== null && r.age !== undefined ? finiteNumber(r.age) : null,
      photoUrls: Array.isArray(r.photoUrls) ? r.photoUrls.filter((value): value is string => typeof value === 'string' && /^https?:\/\//.test(value) && value.length <= 2048).slice(0, 50) : [],
      agentName: String(r.agentName ?? ''),
      agentContact: String(r.agentContact ?? ''),
    } satisfies PropertyListing
  })
}

// -- agent_npc_bindings DB helpers -------------------------------------------

function listBindings(db: Database, accountId: number): Array<{ account_id: number; npc_id: string; bound_at: number }> {
  return db.prepare(`SELECT account_id, npc_id, bound_at FROM agent_npc_bindings WHERE account_id = ? ORDER BY bound_at DESC`).all(accountId) as Array<{ account_id: number; npc_id: string; bound_at: number }>
}

function bindNpc(db: Database, accountId: number, npcId: string): void {
  db.prepare(`INSERT OR REPLACE INTO agent_npc_bindings (account_id, npc_id, bound_at) VALUES (?, ?, ?)`).run(accountId, npcId, Date.now())
}

function unbindNpc(db: Database, accountId: number, npcId: string): void {
  db.prepare(`DELETE FROM agent_npc_bindings WHERE account_id = ? AND npc_id = ?`).run(accountId, npcId)
}

// -- property context provider for NPC AI dialog ----------------------------

export type PropertyContextRow = Readonly<{
  title: string
  price: number
  address: string
  rooms: number
  hall: number
  bath: number
  sizePing: number
  buildingType: string
  floor: string | null
  age: number | null
}>

export function createPropertyContextProvider(
  db: Database,
  _accounts: CanonicalAccountView,
  _runtime: { getNpcs: () => readonly NpcRef[] },
): (npcId: string) => Promise<readonly PropertyContextRow[]> {
  return async (npcId: string): Promise<readonly PropertyContextRow[]> => {
    const bindings = db.prepare(
      `SELECT account_id FROM agent_npc_bindings WHERE npc_id = ?`
    ).all(npcId) as Array<{ account_id: number }>

    if (bindings.length === 0) return []

    // TODO: fetch actual property listings from UPSTREAM_BASE for these agents.
    // For MVP, return empty to keep response latency low.
    // The bindings exist; property sync will be implemented in a follow-up.
    void bindings // keep reference to avoid unused var warning
    return []
  }
}

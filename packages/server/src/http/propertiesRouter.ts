// Property listings API bridge — proxies to the existing agent system API
// and returns normalised listing data for the frontend property browser.
// Also manages agent ↔ NPC bindings so agent accounts can assign NPC proxies.

import { Router, type Request, type Response } from 'express'
import type { Database } from 'better-sqlite3'
import type { AccountStore } from './accounts.js'
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

export function createPropertiesRouter(deps: {
  db: Database
  accounts: AccountStore
  runtime: { getNpcs: () => readonly NpcRef[] }
  authConfig: AuthConfig
}): Router {
  const router = Router()

  initializeAgentBindingSchema(deps.db)

  // Agent + admin can manage NPC bindings
  const requireAgent = requireRole(deps.authConfig, deps.accounts, 'agent', 'admin')

  router.get('/properties', async (req: Request, res: Response) => {
    try {
      const upstreamUrl = buildUpstreamUrl(req.query)
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

      const response = await fetch(upstreamUrl, { signal: controller.signal })
      clearTimeout(timer)

      if (!response.ok) {
        console.error(`[properties] upstream returned ${response.status}`)
        res.status(503).json({ error: 'UPSTREAM_UNAVAILABLE', message: '房源系統暫時無法連線' })
        return
      }

      const raw = await response.json() as { listings?: readonly unknown[]; total?: number }
      const listings = normaliseListings(raw.listings ?? [])
      res.json({
        listings,
        total: raw.total ?? listings.length,
        page: Number(req.query.page) || 1,
        pageSize: Number(req.query.limit) || DEFAULT_PAGE_SIZE,
      } satisfies PropertyListResponse)
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        res.status(503).json({ error: 'UPSTREAM_TIMEOUT', message: '房源系統連線逾時' })
        return
      }
      console.error('[properties] proxy error', err)
      res.status(503).json({ error: 'UPSTREAM_UNAVAILABLE', message: '房源系統暫時無法連線' })
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

function buildUpstreamUrl(query: Record<string, unknown>): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (typeof value === 'string' && value.length > 0) params.set(key, value)
  }
  if (!params.has('limit')) params.set('limit', String(DEFAULT_PAGE_SIZE))
  return `${UPSTREAM_BASE}/api/listings?${params.toString()}`
}

function normaliseListings(raw: readonly unknown[]): readonly PropertyListing[] {
  return raw.map((item: unknown) => {
    const r = item as Record<string, unknown>
    return {
      id: String(r.id ?? ''),
      title: String(r.title ?? ''),
      price: Number(r.price) || 0,
      address: String(r.address ?? ''),
      lat: Number(r.lat) || 0,
      lng: Number(r.lng) || 0,
      rooms: Number(r.rooms) || 0,
      hall: Number(r.hall) || 0,
      bath: Number(r.bath) || 0,
      sizePing: Number(r.sizePing) || 0,
      buildingType: String(r.buildingType ?? ''),
      floor: r.floor !== null && r.floor !== undefined ? String(r.floor) : null,
      age: r.age !== null && r.age !== undefined ? Number(r.age) : null,
      photoUrls: Array.isArray(r.photoUrls) ? r.photoUrls.map(String) : [],
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
  _accounts: AccountStore,
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

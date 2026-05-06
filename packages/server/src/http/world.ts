// World/NPC/Event/Card/Map read endpoints + dashboard summary.
// All endpoints are public — read-only projections of the simulation
// runtime. Writes (claim card, etc.) are deliberately not exposed yet.

import { Router, type Request, type Response } from 'express'
import type { SimulationRuntime } from '../sim/runtime.js'

const RECENT_EVENT_LIMIT = 100
const DASHBOARD_RECENT_EVENTS = 5

export function createWorldRouter(runtime: SimulationRuntime): Router {
  const router = Router()

  router.get('/world', (_req: Request, res: Response) => {
    res.json(runtime.getSnapshot())
  })

  router.get('/npcs', (_req: Request, res: Response) => {
    res.json(runtime.getNpcs())
  })

  router.get('/events', (req: Request, res: Response) => {
    const limit = clampInt(req.query.limit, 1, RECENT_EVENT_LIMIT, 50)
    res.json(runtime.getRecentEvents(limit))
  })

  router.get('/cards', (_req: Request, res: Response) => {
    res.json(runtime.getCardCatalog())
  })

  router.get('/map', (_req: Request, res: Response) => {
    res.json(runtime.getMap())
  })

  router.get('/dashboard', (_req: Request, res: Response) => {
    const world = runtime.getSnapshot()
    const cards = runtime.getCardCatalog()
    res.json({
      world,
      cardsOwned: 0,
      cardsTotal: cards.entries.length,
      recentEvents: runtime.getRecentEvents(DASHBOARD_RECENT_EVENTS),
      rareWindowOpen: runtime.isRareWindowOpen(),
      ticksSinceLastVisit: 0
    })
  })

  return router
}

function clampInt(raw: unknown, min: number, max: number, fallback: number): number {
  const n = typeof raw === 'string' ? Number.parseInt(raw, 10) : NaN
  if (!Number.isFinite(n)) return fallback
  return Math.max(min, Math.min(max, n))
}

// World/NPC/Event/Card/Map read endpoints + dashboard summary.
//
// Reads here are world-level (public) projections. Player-specific
// data — most notably the trust value with each NPC — is overlaid only
// when an Authorization header is present so logged-in players see
// their own relationship with each NPC. Anonymous clients fall back
// to the NPC profile's seed trust.

import { Router, type Request, type Response } from 'express'
import type { SimulationRuntime } from '../sim/runtime.js'
import { optionalAuth, type AuthConfig } from './auth.js'
import { type PlayerStateStore, clampTrust } from './playerState.js'

const RECENT_EVENT_LIMIT = 100
const DASHBOARD_RECENT_EVENTS = 5

export function createWorldRouter(input: {
  runtime: SimulationRuntime
  store: PlayerStateStore
  authConfig: AuthConfig
}): Router {
  const router = Router()
  const overlay = optionalAuth(input.authConfig)

  router.get('/world', (_req: Request, res: Response) => {
    res.json(input.runtime.getSnapshot())
  })

  router.get('/npcs', overlay, (req: Request, res: Response) => {
    const npcs = input.runtime.getNpcs()
    const accountId = req.auth?.sub ?? null
    // npcs 已含 activity / mood / health / faction / targetTile
    if (accountId === null) {
      res.json(npcs)
      return
    }
    const relations = new Map(
      input.store.listRelations(accountId).map((r) => [r.npcId, r] as const)
    )
    res.json(
      npcs.map((npc) => {
        const r = relations.get(npc.id)
        return {
          ...npc,
          relationshipScore: r ? r.trust : clampTrust(npc.relationshipScore),
          interactionCount: r ? r.interactionCount : 0,
          lastInteractionTick: r ? r.lastInteractionTick : 0,
        }
      })
    )
  })

  router.get('/events', (req: Request, res: Response) => {
    const limit = clampInt(req.query.limit, 1, RECENT_EVENT_LIMIT, 50)
    res.json(input.runtime.getRecentEvents(limit))
  })

  router.get('/cards', (_req: Request, res: Response) => {
    res.json(input.runtime.getCardCatalog())
  })

  router.get('/map', (_req: Request, res: Response) => {
    res.json(input.runtime.getMap())
  })

  router.get('/dashboard', (_req: Request, res: Response) => {
    const world = input.runtime.getSnapshot()
    const cards = input.runtime.getCardCatalog()
    res.json({
      world,
      cardsOwned: 0,
      cardsTotal: cards.entries.length,
      recentEvents: input.runtime.getRecentEvents(DASHBOARD_RECENT_EVENTS),
      rareWindowOpen: input.runtime.isRareWindowOpen(),
      activeEvents: input.runtime.getActiveWorldEvents(),
      ticksSinceLastVisit: 0,
    })
  })

  router.get('/world-events', (_req: Request, res: Response) => {
    res.json({ active: input.runtime.getActiveWorldEvents() })
  })

  return router
}

function clampInt(raw: unknown, min: number, max: number, fallback: number): number {
  const n = typeof raw === 'string' ? Number.parseInt(raw, 10) : NaN
  if (!Number.isFinite(n)) return fallback
  return Math.max(min, Math.min(max, n))
}

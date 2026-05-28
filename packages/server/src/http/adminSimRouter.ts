// GM/admin time accelerator — fast-forwards the simulation by N ticks.
//
// Used to observe emergent §43 acceptance criteria (NPC mortality at lifespan,
// faction shifts, ecological collapse, generational memory) without waiting
// for real wall-clock time. Per-tick processing is identical to the regular
// interval-driven path.
//
// Spec: openspec/changes/born-npc-becomes-runtime-entity (verification helper)

import { Router, type Request, type Response } from 'express'
import type { SimulationRuntime } from '../sim/runtime.js'
import type { AccountStore } from './accounts.js'
import { requireRole, type AuthConfig } from './auth.js'

const MAX_ADVANCE_TICKS = 50_000  // ~3 in-game days per call; safety cap

export type AdminSimRouterInput = Readonly<{
  runtime: SimulationRuntime
  accounts: AccountStore
  authConfig: AuthConfig
}>

export function createAdminSimRouter(input: AdminSimRouterInput): Router {
  const router = Router()
  const requireGmOrAdmin = requireRole(input.authConfig, input.accounts, 'gm', 'admin')

  router.post('/admin/sim/advance', requireGmOrAdmin, (req: Request, res: Response) => {
    const body = req.body as { ticks?: unknown }
    const ticksRaw = typeof body.ticks === 'number' ? body.ticks : Number(body.ticks)
    if (!Number.isFinite(ticksRaw) || ticksRaw <= 0) {
      res.status(400).json({ error: 'INVALID_TICKS', message: 'ticks must be a positive number' })
      return
    }
    const ticks = Math.min(Math.floor(ticksRaw), MAX_ADVANCE_TICKS)
    const beforeTick = input.runtime.getSnapshot().tick
    const startedAt = Date.now()
    input.runtime.advanceTicks(ticks)
    const afterTick = input.runtime.getSnapshot().tick
    const elapsedMs = Date.now() - startedAt
    res.json({
      ok: true,
      beforeTick,
      afterTick,
      requestedTicks: ticks,
      advancedTicks: afterTick - beforeTick,
      elapsedMs,
      capped: ticksRaw > MAX_ADVANCE_TICKS,
    })
  })

  return router
}

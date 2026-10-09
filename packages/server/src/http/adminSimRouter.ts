// GM/admin time accelerator — fast-forwards the simulation by N ticks.
//
// Used to observe emergent §43 acceptance criteria (NPC mortality at lifespan,
// faction shifts, ecological collapse, generational memory) without waiting
// for real wall-clock time. Per-tick processing is identical to the regular
// interval-driven path.
//
// Spec: openspec/changes/born-npc-becomes-runtime-entity (verification helper)

import { Router, json, type Request, type Response, type ErrorRequestHandler } from 'express'
import type { SimulationRuntime } from '../sim/runtime.js'
import type { HttpAuthorization } from './authorization.js'
import { GM_ROLES, sendFeatureError } from './featureAuthorization.js'

const MAX_ADVANCE_TICKS = 50_000  // ~3 in-game days per call; safety cap

export type AdminSimRouterInput = Readonly<{
  runtime: SimulationRuntime
  authConfig: HttpAuthorization
}>

export function createAdminSimRouter(input: AdminSimRouterInput): Router {
  const router = Router()
  const requireGmOrAdmin = input.authConfig.role(...GM_ROLES)

  router.post('/admin/sim/advance', requireGmOrAdmin, json({ limit: '4kb', strict: true }), (req: Request, res: Response) => {
    const body = (req.body ?? {}) as { ticks?: unknown }
    const ticksRaw = typeof body.ticks === 'number' ? body.ticks : typeof body.ticks === 'string' && body.ticks.trim() ? Number(body.ticks) : NaN
    if (!Number.isFinite(ticksRaw) || ticksRaw < 1) {
      res.status(400).json({ error: 'INVALID_TICKS', message: 'ticks must be a positive number' })
      return
    }
    const ticks = Math.min(Math.floor(ticksRaw), MAX_ADVANCE_TICKS)
    const beforeTick = input.runtime.getSnapshot().tick
    const startedAt = Date.now()
    input.authConfig.reauthorizeMutation(req, GM_ROLES)
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

  const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
    const status = (error as { status?: number }).status
    if (status === 400 || status === 413) { res.status(status).json({ error: status === 413 ? 'BODY_TOO_LARGE' : 'INVALID_BODY' }); return }
    sendFeatureError(res, error)
  }
  router.use(errorHandler)
  return router
}

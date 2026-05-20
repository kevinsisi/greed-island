// Phase 5 §30.9 — History Chronicle HTTP read surface (Layer 5 Perception Runtime).
// Read-only projection over narrative arc events; no mutation endpoints.

import { Router, type Request, type Response } from 'express'
import type { SimulationRuntime } from '../sim/runtime.js'
import type { HistoryArcType } from '../projections/historyChronicle.js'

export function createHistoryRouter(input: { runtime: SimulationRuntime }): Router {
  const router = Router()

  router.get('/world/history-arcs', (_req: Request, res: Response) => {
    res.json({ arcs: input.runtime.getHistoryArcs() })
  })

  router.get('/world/history-arcs/:arcType', (req: Request, res: Response) => {
    const arcType = req.params.arcType as HistoryArcType
    res.json({ arcs: input.runtime.getHistoryArcs().filter((a) => a.arcType === arcType) })
  })

  return router
}

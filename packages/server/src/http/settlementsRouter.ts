// Phase 1 §33.4 — Settlements HTTP read surface (Layer 3 Civilization
// Runtime). Read-only projection over SETTLEMENT_FORMED events; no
// mutation endpoints — settlements come into existence only via the
// runtime's Command → Rule Engine → Event pipeline.

import { Router, type Request, type Response } from 'express'
import type { SimulationRuntime } from '../sim/runtime.js'

export function createSettlementsRouter(input: { runtime: SimulationRuntime }): Router {
  const router = Router()

  router.get('/settlements', (_req: Request, res: Response) => {
    res.json({ settlements: input.runtime.getSettlements() })
  })

  router.get('/settlements/:id', (req: Request, res: Response) => {
    const id = req.params.id
    if (!id) {
      res.status(400).json({ error: 'INVALID_ID' })
      return
    }
    const row = input.runtime.getSettlementById(id)
    if (!row) {
      res.status(404).json({ error: 'SETTLEMENT_NOT_FOUND' })
      return
    }
    res.json(row)
  })

  return router
}

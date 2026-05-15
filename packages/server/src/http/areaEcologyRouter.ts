// Sprint 2A — world-visibility-ecology (Phase E0/E1 follow-up).
// Read-only HTTP surface that projects the four ecology projections
// down to a single per-tile view the player UI can render.

import { Router, type Request, type Response } from 'express'
import type { SimulationRuntime } from '../sim/runtime.js'

export function createAreaEcologyRouter(input: { runtime: SimulationRuntime }): Router {
  const router = Router()

  router.get('/area/:tileId/ecology', (req: Request, res: Response) => {
    const tileId = req.params.tileId
    if (!tileId) {
      res.status(400).json({ error: 'INVALID_TILE_ID' })
      return
    }
    const view = input.runtime.getAreaEcology(tileId)
    if (!view) {
      res.status(404).json({ error: 'unknown tile' })
      return
    }
    res.json(view)
  })

  return router
}

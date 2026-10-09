// Sprint 2A — world-visibility-ecology (Phase E0/E1 follow-up).
// Read-only HTTP surface that projects the four ecology projections
// down to a single per-tile view the player UI can render.

import { Router, type Request, type Response } from 'express'
import type { SimulationRuntime } from '../sim/runtime.js'
import type { AreaEcologyView, MigrationRow } from '../sim/areaEcology.js'

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
    res.json(publicAreaEcology(view))
  })

  return router
}


/** Projection DTO: do not let richer runtime/ecosystem rows expand public data. */
function publicAreaEcology(view: AreaEcologyView): object {
  const migration = (row: MigrationRow) => ({
    waveId: row.waveId, speciesId: row.speciesId, fromTileId: row.fromTileId,
    toTileId: row.toTileId, migrationType: row.migrationType,
    startedAtTick: row.startedAtTick, count: row.count,
  })
  return {
    tileId: view.tileId,
    animals: view.animals.map(row => ({ speciesId: row.speciesId, tileId: row.tileId,
      biomeRegion: row.biomeRegion, count: row.count, animalIds: [...row.animalIds],
      intent: row.intent, thoughtZh: row.thoughtZh })),
    fishery: view.fishery ? { tileId: view.fishery.tileId, density: view.fishery.density,
      harvestedTotal: view.fishery.harvestedTotal, collapsed: view.fishery.collapsed,
      lastUpdatedTick: view.fishery.lastUpdatedTick } : null,
    migrationsArriving: view.migrationsArriving.map(migration),
    migrationsDeparting: view.migrationsDeparting.map(migration),
    predatorWarnings: view.predatorWarnings.map(row => ({ predatorSpeciesId: row.predatorSpeciesId,
      tileId: row.tileId, lastKillAtTick: row.lastKillAtTick })),
    plants: view.plants.map(row => ({ speciesId: row.speciesId, density: row.density,
      capacity: row.capacity, saturationPct: row.saturationPct, state: row.state, thoughtZh: row.thoughtZh })),
  }
}

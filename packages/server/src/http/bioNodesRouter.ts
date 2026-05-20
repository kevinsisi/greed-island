// Phase E5 — BioNode HTTP read surface (plant ecology substrate).
// Read-only projection over BIO_NODE_* events.

import { Router, type Request, type Response } from 'express'
import type { SimulationRuntime } from '../sim/runtime.js'
import { getPlantSpecies } from '../ecosystem/plantSpecies.js'

export type BioNodeEntry = Readonly<{
  tileId: string
  speciesId: string
  nameZh: string
  category: string
  density: number
  capacity: number
  saturationPct: number
  lastUpdatedTick: number
}>

export function createBioNodesRouter(input: { runtime: SimulationRuntime }): Router {
  const router = Router()

  router.get('/world/bio-nodes', (_req: Request, res: Response) => {
    res.json({ nodes: enrich(input.runtime.getBioNodes()) })
  })

  router.get('/world/bio-nodes/:tileId', (req: Request, res: Response) => {
    const tileId = req.params.tileId
    if (!tileId) {
      res.status(400).json({ error: 'INVALID_TILE_ID' })
      return
    }
    res.json({ tileId, nodes: enrich(input.runtime.getBioNodesOnTile(tileId)) })
  })

  return router
}

function enrich(rows: readonly { tileId: string; speciesId: string; density: number; capacity: number; lastUpdatedTick: number }[]): BioNodeEntry[] {
  return rows.map((r) => {
    const species = getPlantSpecies(r.speciesId)
    return {
      tileId: r.tileId,
      speciesId: r.speciesId,
      nameZh: species?.nameZh ?? r.speciesId,
      category: species?.category ?? 'unknown',
      density: Math.round(r.density * 100) / 100,
      capacity: r.capacity,
      saturationPct: r.capacity > 0 ? Math.round((r.density / r.capacity) * 100) : 0,
      lastUpdatedTick: r.lastUpdatedTick,
    }
  })
}

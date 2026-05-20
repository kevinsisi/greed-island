// Phase E5 — Plant Regrowth Engine.
// Pure function. Given current BioNode density rows and the per-species
// regrowth catalog, returns a list of REGREW intents for nodes whose
// density is below capacity.
//
// Cadence: TICKS_PER_HOUR. The runtime calls this every hour-tick.
// Per-call work is O(nodes), which is bounded by (tiles × plant species),
// currently ~10 nodes total.

import { getPlantSpecies } from './plantSpecies.js'
import type { BioNodeRow } from '../projections/bioNode.js'

export type RegrowthIntent = Readonly<{
  tileId: string
  speciesId: string
  densityBefore: number
  densityAfter: number
  capacity: number
  tick: number
}>

export function planPlantRegrowth(input: {
  nodes: readonly BioNodeRow[]
  tick: number
}): readonly RegrowthIntent[] {
  const out: RegrowthIntent[] = []
  for (const node of input.nodes) {
    if (node.density >= node.capacity) continue
    const species = getPlantSpecies(node.speciesId)
    if (!species) continue
    const next = Math.min(node.capacity, node.density + species.regrowthPerHour)
    // Only emit if change is meaningful (> 0.01 density), so we don't spam
    // the event log with no-op regrows on a node at capacity boundary.
    if (next - node.density < 0.01) continue
    out.push({
      tileId: node.tileId,
      speciesId: node.speciesId,
      densityBefore: node.density,
      densityAfter: next,
      capacity: node.capacity,
      tick: input.tick,
    })
  }
  return out
}

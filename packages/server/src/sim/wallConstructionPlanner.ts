// Wall auto-construction planner (v0.80.0).
//
// Walls form on tile borders where two different factions each control one
// adjacent tile.  Demolition fires when one side loses its faction control.
// Goods flow and NPC movement are unaffected — walls are a social/political
// record of territorial boundaries, visible in the world state and history.

import { MAP_ADJACENCY } from './mapGraph.js'
import type { FactionControlProjection } from '../projections/factionControl.js'
import type { WallNetworkProjection } from '../projections/wallNetwork.js'

export type WallConstructionIntent =
  | Readonly<{ action: 'build'; wallId: string; tileIdA: string; tileIdB: string; factionIdA: string; factionIdB: string }>
  | Readonly<{ action: 'demolish'; wallId: string; tileIdA: string; tileIdB: string }>

function borderKey(a: string, b: string): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`
}

export function planWallConstruction(input: {
  currentTick: number
  factionControlProjection: FactionControlProjection
  wallNetworkProjection: WallNetworkProjection
  unlockedTileIds?: readonly string[]
}): readonly WallConstructionIntent[] {
  const { currentTick, factionControlProjection, wallNetworkProjection, unlockedTileIds } = input

  const adjacency = MAP_ADJACENCY
  const intents: WallConstructionIntent[] = []
  const visited = new Set<string>()

  for (const [tileIdA, neighbours] of Object.entries(adjacency)) {
    if (unlockedTileIds && !unlockedTileIds.includes(tileIdA)) continue
    for (const tileIdB of neighbours) {
      const key = borderKey(tileIdA, tileIdB)
      if (visited.has(key)) continue
      visited.add(key)

      const factionA = factionControlProjection.dominantFactionOf(tileIdA)
      const factionB = factionControlProjection.dominantFactionOf(tileIdB)
      const wallExists = wallNetworkProjection.hasWall(tileIdA, tileIdB)

      if (factionA && factionB && factionA !== factionB && !wallExists) {
        intents.push({
          action: 'build',
          wallId: `wall.${key}.${currentTick}`,
          tileIdA,
          tileIdB,
          factionIdA: factionA,
          factionIdB: factionB,
        })
      } else if (wallExists && (!factionA || !factionB || factionA === factionB)) {
        const wallId = wallNetworkProjection.wallIdForBorder(tileIdA, tileIdB)
        if (wallId) {
          intents.push({ action: 'demolish', wallId, tileIdA, tileIdB })
        }
      }
    }
  }

  return intents
}

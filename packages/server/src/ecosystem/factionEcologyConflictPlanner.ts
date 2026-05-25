import { TILE_ADJACENCY } from '../projections/beliefProjection.js'

export type FactionEcologyConflictIntent = Readonly<{
  conflictId: string
  tileId: string
  resourceType: 'fishery' | 'forest'
  contestingFactionId: string
  currentFactionId: string | null
  tick: number
}>

export function planFactionEcologyConflict(input: {
  tileId: string
  resourceType: 'fishery' | 'forest'
  contestingFactionId: string
  tick: number
  getDominantFaction: (tileId: string) => string | null
}): FactionEcologyConflictIntent | null {
  const { tileId, resourceType, contestingFactionId, tick, getDominantFaction } = input
  const currentFactionId = getDominantFaction(tileId)

  // Only contest if the contesting faction doesn't already control the tile
  if (currentFactionId === contestingFactionId) return null

  // Check if the contesting faction controls any adjacent tile (so it can plausibly contest)
  const adjacentTiles = TILE_ADJACENCY[tileId] ?? []
  const contestingHasAdjacent = adjacentTiles.some((tid) => getDominantFaction(tid) === contestingFactionId)
  if (!contestingHasAdjacent && currentFactionId !== null) return null

  return {
    conflictId: `${contestingFactionId}.${resourceType}.${tileId}.${tick}`,
    tileId,
    resourceType,
    contestingFactionId,
    currentFactionId: currentFactionId ?? null,
    tick,
  }
}

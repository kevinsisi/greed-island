import type { FrontierZoneDef } from './mapGraph.js'

export type TileGenerationIntent = Readonly<{
  tileId: string
  biome: string
  name: string
  x: number
  y: number
  adjacentTileIds: readonly string[]
}>

export function planTileGeneration(input: {
  currentTileIds: readonly string[]
  generatedTileIds: readonly string[]
  openTradeRouteCount: number
  minTradeRoutes: number
  maxWorldTiles: number
  frontierZones: readonly FrontierZoneDef[]
}): readonly TileGenerationIntent[] {
  const totalTiles = input.currentTileIds.length
  if (totalTiles >= input.maxWorldTiles) return []
  if (input.openTradeRouteCount < input.minTradeRoutes) return []

  const generated = new Set(input.generatedTileIds)
  const nextZone = input.frontierZones.find((z) => !generated.has(z.id))
  if (!nextZone) return []

  return [{
    tileId: nextZone.id,
    biome: nextZone.biome,
    name: nextZone.name,
    x: nextZone.x,
    y: nextZone.y,
    adjacentTileIds: nextZone.adjacentTo,
  }]
}

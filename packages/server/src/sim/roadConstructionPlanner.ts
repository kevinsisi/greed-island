import type { LogisticsProjection } from '../projections/logistics.js'
import type { RoadNetworkProjection } from '../projections/roadNetwork.js'
import { ROAD_CONSTRUCTION_CADENCE_TICKS } from '../config/world.js'

export type RoadConstructionIntent = Readonly<{
  roadId: string
  fromTileId: string
  toTileId: string
  roadType: 'road' | 'bridge'
}>

function routeKey(a: string, b: string): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`
}

export function planRoadConstruction(input: {
  currentTick: number
  logisticsProjection: LogisticsProjection
  roadNetworkProjection: RoadNetworkProjection
}): readonly RoadConstructionIntent[] {
  const { currentTick, logisticsProjection, roadNetworkProjection } = input

  if (currentTick % ROAD_CONSTRUCTION_CADENCE_TICKS !== 0) return []

  const snap = logisticsProjection.snapshot()
  const openRoutes = snap.routes.filter((r) => r.open)
  if (openRoutes.length === 0) return []

  // Count how many open routes connect each tile pair
  const pairCount = new Map<string, { fromTileId: string; toTileId: string; count: number }>()
  for (const route of openRoutes) {
    const key = routeKey(route.fromTileId, route.toTileId)
    const existing = pairCount.get(key)
    if (existing) {
      pairCount.set(key, { ...existing, count: existing.count + 1 })
    } else {
      pairCount.set(key, { fromTileId: route.fromTileId, toTileId: route.toTileId, count: 1 })
    }
  }

  const intents: RoadConstructionIntent[] = []
  for (const [, pair] of pairCount) {
    if (pair.count < 2) continue
    if (roadNetworkProjection.hasRoad(pair.fromTileId, pair.toTileId)) continue
    intents.push({
      roadId: `road.${routeKey(pair.fromTileId, pair.toTileId)}.${currentTick}`,
      fromTileId: pair.fromTileId,
      toTileId: pair.toTileId,
      roadType: 'road',
    })
  }

  return intents
}

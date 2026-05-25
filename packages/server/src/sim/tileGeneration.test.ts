import { describe, expect, it } from 'vitest'
import { planTileGeneration } from './tileGenerationPlanner.js'
import type { FrontierZoneDef } from './mapGraph.js'

const FRONTIER_ZONES: FrontierZoneDef[] = [
  { id: 't_frontier_a', name: '前線A', x: 9, y: 3, biome: 'ruin', adjacentTo: ['t_ruin'] },
  { id: 't_frontier_b', name: '前線B', x: 2, y: -1, biome: 'mountain', adjacentTo: ['t_mountain'] },
]

const BASE_TILES = ['t_dock', 't_forest', 't_mountain', 't_central', 't_ruin', 't_desert', 't_temple', 't_dimai']

describe('planTileGeneration', () => {
  it('returns empty when trade route threshold not met', () => {
    const intents = planTileGeneration({
      currentTileIds: BASE_TILES,
      generatedTileIds: [],
      openTradeRouteCount: 0,
      minTradeRoutes: 2,
      maxWorldTiles: 12,
      frontierZones: FRONTIER_ZONES,
    })
    expect(intents).toHaveLength(0)
  })

  it('generates the first frontier zone when conditions are met', () => {
    const intents = planTileGeneration({
      currentTileIds: BASE_TILES,
      generatedTileIds: [],
      openTradeRouteCount: 3,
      minTradeRoutes: 2,
      maxWorldTiles: 12,
      frontierZones: FRONTIER_ZONES,
    })
    expect(intents).toHaveLength(1)
    expect(intents[0]!.tileId).toBe('t_frontier_a')
    expect(intents[0]!.biome).toBe('ruin')
  })

  it('skips already-generated frontier zones', () => {
    const intents = planTileGeneration({
      currentTileIds: BASE_TILES,
      generatedTileIds: ['t_frontier_a'],
      openTradeRouteCount: 3,
      minTradeRoutes: 2,
      maxWorldTiles: 12,
      frontierZones: FRONTIER_ZONES,
    })
    expect(intents).toHaveLength(1)
    expect(intents[0]!.tileId).toBe('t_frontier_b')
  })

  it('returns empty when all frontier zones already generated', () => {
    const intents = planTileGeneration({
      currentTileIds: BASE_TILES,
      generatedTileIds: ['t_frontier_a', 't_frontier_b'],
      openTradeRouteCount: 5,
      minTradeRoutes: 2,
      maxWorldTiles: 12,
      frontierZones: FRONTIER_ZONES,
    })
    expect(intents).toHaveLength(0)
  })

  it('returns empty when world tile cap reached', () => {
    const intents = planTileGeneration({
      currentTileIds: BASE_TILES,
      generatedTileIds: [],
      openTradeRouteCount: 5,
      minTradeRoutes: 2,
      maxWorldTiles: BASE_TILES.length,
      frontierZones: FRONTIER_ZONES,
    })
    expect(intents).toHaveLength(0)
  })
})

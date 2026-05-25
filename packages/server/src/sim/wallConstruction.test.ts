import { describe, expect, it } from 'vitest'
import { planWallConstruction } from './wallConstructionPlanner.js'
import { FactionControlProjection } from '../projections/factionControl.js'
import { WallNetworkProjection } from '../projections/wallNetwork.js'
import type { Event } from '../kernel/types.js'

function makeSeizeEvent(tileId: string, factionId: string, tick = 100): Event {
  return {
    eventType: 'FACTION_TILE_SEIZED',
    sequence: tick,
    tick,
    payload: { data: { tileId, factionId, previousFactionId: null, seizedAtTick: tick } },
    source: 'test',
    id: `${tileId}-${factionId}`,
  } as unknown as Event
}

function makeWallBuiltEvent(wallId: string, tileIdA: string, tileIdB: string, factionIdA: string, factionIdB: string, tick = 100): Event {
  return {
    eventType: 'WALL_BUILT',
    sequence: tick,
    tick,
    payload: { data: { wallId, tileIdA, tileIdB, factionIdA, factionIdB, builtAtTick: tick, narration: 'wall' } },
    source: 'test',
    id: wallId,
  } as unknown as Event
}

function makeFactionProjection(tiles: Array<{ tileId: string; factionId: string }>): FactionControlProjection {
  const proj = new FactionControlProjection()
  for (const { tileId, factionId } of tiles) {
    proj.project(makeSeizeEvent(tileId, factionId))
  }
  return proj
}

describe('planWallConstruction', () => {
  it('returns empty when no factions control tiles', () => {
    const result = planWallConstruction({
      currentTick: 100,
      factionControlProjection: new FactionControlProjection(),
      wallNetworkProjection: new WallNetworkProjection(),
    })
    expect(result).toHaveLength(0)
  })

  it('returns empty when same faction controls both sides of a border', () => {
    const fcp = makeFactionProjection([
      { tileId: 't_central', factionId: 'fishers' },
      { tileId: 't_forest', factionId: 'fishers' },
    ])
    const result = planWallConstruction({
      currentTick: 100,
      factionControlProjection: fcp,
      wallNetworkProjection: new WallNetworkProjection(),
    })
    expect(result.every((r) => r.action !== 'build')).toBe(true)
  })

  it('builds a wall when different factions control adjacent tiles', () => {
    const fcp = makeFactionProjection([
      { tileId: 't_central', factionId: 'fishers' },
      { tileId: 't_forest', factionId: 'merchants' },
    ])
    const result = planWallConstruction({
      currentTick: 200,
      factionControlProjection: fcp,
      wallNetworkProjection: new WallNetworkProjection(),
    })
    const build = result.filter((r) => r.action === 'build')
    expect(build.length).toBeGreaterThanOrEqual(1)
    const border = build.find(
      (r) => r.action === 'build' &&
        ((r.tileIdA === 't_central' && r.tileIdB === 't_forest') ||
         (r.tileIdA === 't_forest' && r.tileIdB === 't_central'))
    )
    expect(border).toBeDefined()
    if (border && border.action === 'build') {
      expect(border.wallId).toContain('200')
    }
  })

  it('does not build a wall when one already exists', () => {
    const fcp = makeFactionProjection([
      { tileId: 't_central', factionId: 'fishers' },
      { tileId: 't_forest', factionId: 'merchants' },
    ])
    const wnp = new WallNetworkProjection()
    wnp.project(makeWallBuiltEvent('wall.t_central:t_forest.100', 't_central', 't_forest', 'fishers', 'merchants'))
    const result = planWallConstruction({
      currentTick: 200,
      factionControlProjection: fcp,
      wallNetworkProjection: wnp,
    })
    const build = result.filter(
      (r) => r.action === 'build' &&
        ((r.tileIdA === 't_central' && r.tileIdB === 't_forest') ||
         (r.tileIdA === 't_forest' && r.tileIdB === 't_central'))
    )
    expect(build).toHaveLength(0)
  })

  it('demolishes a wall when one side loses faction control', () => {
    const fcp = makeFactionProjection([
      { tileId: 't_central', factionId: 'fishers' },
      // t_forest has no faction
    ])
    const wnp = new WallNetworkProjection()
    wnp.project(makeWallBuiltEvent('wall.t_central:t_forest.50', 't_central', 't_forest', 'fishers', 'merchants'))
    const result = planWallConstruction({
      currentTick: 200,
      factionControlProjection: fcp,
      wallNetworkProjection: wnp,
    })
    const demolish = result.filter(
      (r) => r.action === 'demolish' &&
        ((r.tileIdA === 't_central' && r.tileIdB === 't_forest') ||
         (r.tileIdA === 't_forest' && r.tileIdB === 't_central'))
    )
    expect(demolish.length).toBeGreaterThanOrEqual(1)
    if (demolish[0]) expect(demolish[0].wallId).toBe('wall.t_central:t_forest.50')
  })

  it('does not emit duplicate wall intents for the same border', () => {
    const fcp = makeFactionProjection([
      { tileId: 't_central', factionId: 'fishers' },
      { tileId: 't_forest', factionId: 'merchants' },
    ])
    const result = planWallConstruction({
      currentTick: 100,
      factionControlProjection: fcp,
      wallNetworkProjection: new WallNetworkProjection(),
    })
    const centralForest = result.filter(
      (r) => r.action === 'build' &&
        ((r.tileIdA === 't_central' && r.tileIdB === 't_forest') ||
         (r.tileIdA === 't_forest' && r.tileIdB === 't_central'))
    )
    expect(centralForest).toHaveLength(1)
  })
})

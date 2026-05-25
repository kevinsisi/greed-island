import { describe, expect, it } from 'vitest'
import { planRoadConstruction } from './roadConstructionPlanner.js'
import { ROAD_CONSTRUCTION_CADENCE_TICKS } from '../config/world.js'
import type { LogisticsProjection, TradeRouteRow } from '../projections/logistics.js'
import { RoadNetworkProjection } from '../projections/roadNetwork.js'

function makeLogistics(routes: Partial<TradeRouteRow>[]): LogisticsProjection {
  const full: TradeRouteRow[] = routes.map((r, i) => ({
    routeId: `route-${i}`,
    fromTileId: r.fromTileId ?? 't_a',
    toTileId: r.toTileId ?? 't_b',
    goodsId: r.goodsId ?? 'goods_grain',
    open: r.open ?? true,
    openedAtTick: r.openedAtTick ?? 0,
    closedAtTick: r.closedAtTick ?? null,
    lastSequence: r.lastSequence ?? 1,
  }))
  return {
    snapshot: () => ({ routes: full, transports: [] }),
  } as unknown as LogisticsProjection
}

describe('planRoadConstruction', () => {
  it('returns empty when tick is not on cadence', () => {
    const logistics = makeLogistics([
      { fromTileId: 't_a', toTileId: 't_b', open: true },
      { fromTileId: 't_a', toTileId: 't_b', open: true },
    ])
    const road = new RoadNetworkProjection()
    const result = planRoadConstruction({
      currentTick: ROAD_CONSTRUCTION_CADENCE_TICKS + 1,
      logisticsProjection: logistics,
      roadNetworkProjection: road,
    })
    expect(result).toHaveLength(0)
  })

  it('returns empty when no open routes', () => {
    const logistics = makeLogistics([
      { fromTileId: 't_a', toTileId: 't_b', open: false },
      { fromTileId: 't_a', toTileId: 't_b', open: false },
    ])
    const road = new RoadNetworkProjection()
    const result = planRoadConstruction({
      currentTick: ROAD_CONSTRUCTION_CADENCE_TICKS,
      logisticsProjection: logistics,
      roadNetworkProjection: road,
    })
    expect(result).toHaveLength(0)
  })

  it('returns empty when fewer than 2 open routes on a tile pair', () => {
    const logistics = makeLogistics([
      { fromTileId: 't_a', toTileId: 't_b', open: true },
    ])
    const road = new RoadNetworkProjection()
    const result = planRoadConstruction({
      currentTick: ROAD_CONSTRUCTION_CADENCE_TICKS,
      logisticsProjection: logistics,
      roadNetworkProjection: road,
    })
    expect(result).toHaveLength(0)
  })

  it('proposes road when 2+ open routes and no existing road', () => {
    const logistics = makeLogistics([
      { fromTileId: 't_a', toTileId: 't_b', open: true },
      { fromTileId: 't_a', toTileId: 't_b', open: true },
    ])
    const road = new RoadNetworkProjection()
    const result = planRoadConstruction({
      currentTick: ROAD_CONSTRUCTION_CADENCE_TICKS,
      logisticsProjection: logistics,
      roadNetworkProjection: road,
    })
    expect(result).toHaveLength(1)
    expect(result[0]?.fromTileId === 't_a' || result[0]?.fromTileId === 't_b').toBe(true)
    expect(result[0]?.roadType).toBe('road')
  })

  it('skips tile pair that already has a road', () => {
    const logistics = makeLogistics([
      { fromTileId: 't_a', toTileId: 't_b', open: true },
      { fromTileId: 't_a', toTileId: 't_b', open: true },
    ])
    const road = new RoadNetworkProjection()
    road.rebuildFromEvents([
      {
        id: 'e1',
        sequence: 1,
        eventType: 'ROAD_CONSTRUCTED',
        tick: 1,
        payload: { data: { roadId: 'road.t_a:t_b.1', fromTileId: 't_a', toTileId: 't_b', roadType: 'road', constructedAtTick: 1 } },
        createdAt: new Date().toISOString(),
      } as unknown as import('../kernel/types.js').Event,
    ])
    const result = planRoadConstruction({
      currentTick: ROAD_CONSTRUCTION_CADENCE_TICKS,
      logisticsProjection: logistics,
      roadNetworkProjection: road,
    })
    expect(result).toHaveLength(0)
  })

  it('handles reverse-direction routes as the same tile pair', () => {
    const logistics = makeLogistics([
      { fromTileId: 't_a', toTileId: 't_b', open: true },
      { fromTileId: 't_b', toTileId: 't_a', open: true },
    ])
    const road = new RoadNetworkProjection()
    const result = planRoadConstruction({
      currentTick: ROAD_CONSTRUCTION_CADENCE_TICKS,
      logisticsProjection: logistics,
      roadNetworkProjection: road,
    })
    expect(result).toHaveLength(1)
  })

  it('proposes roads for multiple independent tile pairs', () => {
    const logistics = makeLogistics([
      { fromTileId: 't_a', toTileId: 't_b', open: true },
      { fromTileId: 't_a', toTileId: 't_b', open: true },
      { fromTileId: 't_c', toTileId: 't_d', open: true },
      { fromTileId: 't_c', toTileId: 't_d', open: true },
    ])
    const road = new RoadNetworkProjection()
    const result = planRoadConstruction({
      currentTick: ROAD_CONSTRUCTION_CADENCE_TICKS,
      logisticsProjection: logistics,
      roadNetworkProjection: road,
    })
    expect(result).toHaveLength(2)
  })

  it('road id includes tick', () => {
    const logistics = makeLogistics([
      { fromTileId: 't_a', toTileId: 't_b', open: true },
      { fromTileId: 't_a', toTileId: 't_b', open: true },
    ])
    const road = new RoadNetworkProjection()
    const result = planRoadConstruction({
      currentTick: ROAD_CONSTRUCTION_CADENCE_TICKS,
      logisticsProjection: logistics,
      roadNetworkProjection: road,
    })
    expect(result[0]?.roadId).toContain(String(ROAD_CONSTRUCTION_CADENCE_TICKS))
  })
})

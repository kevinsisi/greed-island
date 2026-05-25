import { describe, expect, it } from 'vitest'
import { RoadNetworkProjection } from './roadNetwork.js'
import type { Event } from '../kernel/types.js'

function makeEvent(
  eventType: string,
  data: Record<string, unknown>,
  sequence = 1
): Event {
  return {
    id: `evt-${sequence}`,
    sequence,
    eventType,
    tick: 100,
    payload: { data },
    createdAt: new Date().toISOString(),
  } as unknown as Event
}

describe('RoadNetworkProjection', () => {
  it('starts empty', () => {
    const proj = new RoadNetworkProjection()
    expect(proj.list()).toHaveLength(0)
    expect(proj.hasRoad('t_a', 't_b')).toBe(false)
  })

  it('records a constructed road', () => {
    const proj = new RoadNetworkProjection()
    proj.project(makeEvent('ROAD_CONSTRUCTED', {
      roadId: 'road.t_a:t_b.100',
      fromTileId: 't_a',
      toTileId: 't_b',
      roadType: 'road',
      constructedAtTick: 100,
    }))
    expect(proj.list()).toHaveLength(1)
    expect(proj.hasRoad('t_a', 't_b')).toBe(true)
  })

  it('hasRoad is bidirectional', () => {
    const proj = new RoadNetworkProjection()
    proj.project(makeEvent('ROAD_CONSTRUCTED', {
      roadId: 'road.t_a:t_b.100',
      fromTileId: 't_a',
      toTileId: 't_b',
      roadType: 'road',
      constructedAtTick: 100,
    }))
    expect(proj.hasRoad('t_b', 't_a')).toBe(true)
  })

  it('getRoadSet contains both directions', () => {
    const proj = new RoadNetworkProjection()
    proj.project(makeEvent('ROAD_CONSTRUCTED', {
      roadId: 'road.t_a:t_b.100',
      fromTileId: 't_a',
      toTileId: 't_b',
      roadType: 'road',
      constructedAtTick: 100,
    }))
    const set = proj.getRoadSet()
    expect(set.has('t_a:t_b')).toBe(true)
    expect(set.has('t_b:t_a')).toBe(true)
  })

  it('removes road on ROAD_DESTROYED', () => {
    const proj = new RoadNetworkProjection()
    proj.project(makeEvent('ROAD_CONSTRUCTED', {
      roadId: 'road.t_a:t_b.100',
      fromTileId: 't_a',
      toTileId: 't_b',
      roadType: 'road',
      constructedAtTick: 100,
    }, 1))
    proj.project(makeEvent('ROAD_DESTROYED', {
      roadId: 'road.t_a:t_b.100',
      fromTileId: 't_a',
      toTileId: 't_b',
      destroyedAtTick: 200,
    }, 2))
    expect(proj.list()).toHaveLength(0)
    expect(proj.hasRoad('t_a', 't_b')).toBe(false)
  })

  it('ignores events with missing roadId', () => {
    const proj = new RoadNetworkProjection()
    proj.project(makeEvent('ROAD_CONSTRUCTED', {
      fromTileId: 't_a',
      toTileId: 't_b',
      roadType: 'road',
      constructedAtTick: 100,
    }))
    expect(proj.list()).toHaveLength(0)
  })

  it('ignores unrelated events', () => {
    const proj = new RoadNetworkProjection()
    proj.project(makeEvent('GOODS_CONSUMED', { roadId: 'road.x:y.1' }))
    expect(proj.list()).toHaveLength(0)
  })

  it('rebuildFromEvents resets then replays', () => {
    const proj = new RoadNetworkProjection()
    proj.project(makeEvent('ROAD_CONSTRUCTED', {
      roadId: 'road.t_a:t_b.100',
      fromTileId: 't_a',
      toTileId: 't_b',
      roadType: 'road',
      constructedAtTick: 100,
    }, 1))
    proj.rebuildFromEvents([
      makeEvent('ROAD_CONSTRUCTED', {
        roadId: 'road.t_c:t_d.200',
        fromTileId: 't_c',
        toTileId: 't_d',
        roadType: 'bridge',
        constructedAtTick: 200,
      }, 2),
    ])
    expect(proj.list()).toHaveLength(1)
    expect(proj.hasRoad('t_c', 't_d')).toBe(true)
    expect(proj.hasRoad('t_a', 't_b')).toBe(false)
  })

  it('supports multiple roads', () => {
    const proj = new RoadNetworkProjection()
    proj.project(makeEvent('ROAD_CONSTRUCTED', {
      roadId: 'road.t_a:t_b.100',
      fromTileId: 't_a',
      toTileId: 't_b',
      roadType: 'road',
      constructedAtTick: 100,
    }, 1))
    proj.project(makeEvent('ROAD_CONSTRUCTED', {
      roadId: 'road.t_c:t_d.100',
      fromTileId: 't_c',
      toTileId: 't_d',
      roadType: 'bridge',
      constructedAtTick: 100,
    }, 2))
    expect(proj.list()).toHaveLength(2)
    expect(proj.getRoadSet().size).toBe(4)
  })

  it('defaults roadType to road when invalid value provided', () => {
    const proj = new RoadNetworkProjection()
    proj.project(makeEvent('ROAD_CONSTRUCTED', {
      roadId: 'road.t_a:t_b.100',
      fromTileId: 't_a',
      toTileId: 't_b',
      roadType: 'invalid_type',
      constructedAtTick: 100,
    }))
    expect(proj.list()[0]?.roadType).toBe('road')
  })
})

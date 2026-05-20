import { describe, expect, it } from 'vitest'
import { BioNodeProjection } from './bioNode.js'
import type { Event } from '../kernel/types.js'

function makeEvent(
  eventType: string,
  data: Record<string, unknown>,
  sequence: number,
  tick = 1,
): Event {
  return {
    id: `ev-${sequence}`,
    eventType,
    actorId: 'system',
    sequence,
    tick,
    timestamp: new Date().toISOString(),
    payload: { data },
  } as unknown as Event
}

describe('BioNodeProjection', () => {
  it('records a node on BIO_NODE_SEEDED', () => {
    const p = new BioNodeProjection()
    p.project(makeEvent('BIO_NODE_SEEDED', {
      tileId: 't_forest', speciesId: 'oak',
      density: 80, capacity: 100, seededAtTick: 10,
    }, 1))
    const row = p.get('t_forest', 'oak')!
    expect(row.density).toBe(80)
    expect(row.capacity).toBe(100)
    expect(row.lastUpdatedTick).toBe(10)
  })

  it('regrows existing nodes via BIO_NODE_REGREW', () => {
    const p = new BioNodeProjection()
    p.project(makeEvent('BIO_NODE_SEEDED', {
      tileId: 't_forest', speciesId: 'oak',
      density: 50, capacity: 100, seededAtTick: 1,
    }, 1))
    p.project(makeEvent('BIO_NODE_REGREW', {
      tileId: 't_forest', speciesId: 'oak',
      densityBefore: 50, densityAfter: 51, capacity: 100, tick: 60,
    }, 2))
    expect(p.get('t_forest', 'oak')?.density).toBe(51)
    expect(p.get('t_forest', 'oak')?.lastUpdatedTick).toBe(60)
  })

  it('reduces density on BIO_NODE_HARVESTED, floored at 0', () => {
    const p = new BioNodeProjection()
    p.project(makeEvent('BIO_NODE_SEEDED', {
      tileId: 't_forest', speciesId: 'oak',
      density: 50, capacity: 100, seededAtTick: 1,
    }, 1))
    p.project(makeEvent('BIO_NODE_HARVESTED', {
      tileId: 't_forest', speciesId: 'oak',
      densityConsumed: 60, densityAfter: -10,
      harvesterId: 'npc.x', harvestGoodsId: 'lumber', goodsQuantity: 24, tick: 5,
    }, 2))
    expect(p.get('t_forest', 'oak')?.density).toBe(0)
  })

  it('ignores REGREW with no prior seed', () => {
    const p = new BioNodeProjection()
    p.project(makeEvent('BIO_NODE_REGREW', {
      tileId: 't_forest', speciesId: 'oak',
      densityBefore: 50, densityAfter: 51, capacity: 100, tick: 60,
    }, 1))
    expect(p.get('t_forest', 'oak')).toBeNull()
  })

  it('keeps separate state per (tile, species)', () => {
    const p = new BioNodeProjection()
    p.project(makeEvent('BIO_NODE_SEEDED', {
      tileId: 't_forest', speciesId: 'oak', density: 80, capacity: 100, seededAtTick: 1,
    }, 1))
    p.project(makeEvent('BIO_NODE_SEEDED', {
      tileId: 't_forest', speciesId: 'pine', density: 60, capacity: 80, seededAtTick: 1,
    }, 2))
    p.project(makeEvent('BIO_NODE_SEEDED', {
      tileId: 't_salt_marsh', speciesId: 'reed', density: 100, capacity: 120, seededAtTick: 1,
    }, 3))
    expect(p.list()).toHaveLength(3)
    expect(p.listOnTile('t_forest')).toHaveLength(2)
    expect(p.listOnTile('t_salt_marsh')).toHaveLength(1)
  })

  it('hasSeed returns true after seeding', () => {
    const p = new BioNodeProjection()
    expect(p.hasSeed('t_forest', 'oak')).toBe(false)
    p.project(makeEvent('BIO_NODE_SEEDED', {
      tileId: 't_forest', speciesId: 'oak', density: 80, capacity: 100, seededAtTick: 1,
    }, 1))
    expect(p.hasSeed('t_forest', 'oak')).toBe(true)
  })

  it('rebuildFromEvents replays in sequence order', () => {
    const events: Event[] = [
      makeEvent('BIO_NODE_HARVESTED', {
        tileId: 't_forest', speciesId: 'oak',
        densityConsumed: 10, densityAfter: 70,
        harvesterId: 'npc.x', harvestGoodsId: 'lumber', goodsQuantity: 4, tick: 30,
      }, 3),
      makeEvent('BIO_NODE_SEEDED', {
        tileId: 't_forest', speciesId: 'oak', density: 100, capacity: 100, seededAtTick: 1,
      }, 1),
      makeEvent('BIO_NODE_REGREW', {
        tileId: 't_forest', speciesId: 'oak',
        densityBefore: 80, densityAfter: 80.6, capacity: 100, tick: 60,
      }, 2),
    ]
    const p = new BioNodeProjection()
    p.rebuildFromEvents(events)
    expect(p.get('t_forest', 'oak')?.density).toBe(70)
    expect(p.get('t_forest', 'oak')?.lastUpdatedTick).toBe(30)
  })

  it('canonicalHash is deterministic regardless of insertion order', () => {
    const a = new BioNodeProjection()
    a.project(makeEvent('BIO_NODE_SEEDED', { tileId: 't_a', speciesId: 'x', density: 1, capacity: 10, seededAtTick: 1 }, 1))
    a.project(makeEvent('BIO_NODE_SEEDED', { tileId: 't_b', speciesId: 'y', density: 2, capacity: 20, seededAtTick: 2 }, 2))
    const b = new BioNodeProjection()
    b.project(makeEvent('BIO_NODE_SEEDED', { tileId: 't_b', speciesId: 'y', density: 2, capacity: 20, seededAtTick: 2 }, 2))
    b.project(makeEvent('BIO_NODE_SEEDED', { tileId: 't_a', speciesId: 'x', density: 1, capacity: 10, seededAtTick: 1 }, 1))
    expect(a.canonicalHash()).toBe(b.canonicalHash())
  })
})

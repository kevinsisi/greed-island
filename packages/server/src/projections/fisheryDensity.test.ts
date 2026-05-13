import { describe, expect, it } from 'vitest'
import { FisheryDensityProjection } from './fisheryDensity.js'
import type { Event } from '../kernel/types.js'

describe('FisheryDensityProjection', () => {
  it('projects harvest and collapse events replayably', () => {
    const projection = new FisheryDensityProjection()
    projection.rebuildFromEvents([
      harvestEvent(1, 't_dock', 12, 88, 10),
      collapseEvent(2, 't_dock', 18, 20),
    ])
    const row = projection.getByTile('t_dock')
    expect(row?.density).toBe(18)
    expect(row?.harvestedTotal).toBe(12)
    expect(row?.collapsed).toBe(true)

    const replayed = new FisheryDensityProjection()
    replayed.rebuildFromEvents([harvestEvent(1, 't_dock', 12, 88, 10), collapseEvent(2, 't_dock', 18, 20)])
    expect(replayed.canonicalHash()).toBe(projection.canonicalHash())
  })
})

function harvestEvent(sequence: number, tileId: string, delta: number, densityAfter: number, tick: number): Event {
  return {
    sequence,
    eventId: `fishery-harvest-${sequence}`,
    eventType: 'FISHERY_HARVESTED',
    occurredAt: 0,
    actorId: 'fisher',
    payload: { actorType: 'npc', data: { tileId, npcId: 'fisher', delta, densityBefore: densityAfter + delta, densityAfter, harvestedAtTick: tick, narration: 'harvest' }, narration: 'harvest' },
    deterministicKey: `fh-${sequence}`,
    version: 1,
    tick,
  }
}

function collapseEvent(sequence: number, tileId: string, density: number, tick: number): Event {
  return {
    sequence,
    eventId: `fishery-collapse-${sequence}`,
    eventType: 'FISHERY_COLLAPSED',
    occurredAt: 0,
    actorId: 'system',
    payload: { actorType: 'system', data: { tileId, density, collapsedAtTick: tick, narration: 'collapse' }, narration: 'collapse' },
    deterministicKey: `fc-${sequence}`,
    version: 1,
    tick,
  }
}

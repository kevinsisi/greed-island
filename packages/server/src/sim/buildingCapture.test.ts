import { describe, expect, it } from 'vitest'
import { planBuildingCaptures } from './buildingCapturePlanner.js'
import { FactionControlProjection } from '../projections/factionControl.js'
import type { Event } from '../kernel/types.js'

function makeSeizeEvent(tileId: string, factionId: string, sequence: number): Event {
  return {
    sequence,
    eventId: `e-${sequence}`,
    eventType: 'FACTION_TILE_SEIZED',
    occurredAt: 0,
    actorId: 'system',
    payload: { actorType: 'system', data: { tileId, factionId, previousFactionId: null, seizedAtTick: 1 }, narration: null },
    deterministicKey: `k-${sequence}`,
    version: 1,
    tick: 1,
  }
}

describe('planBuildingCaptures', () => {
  it('returns empty when no buildings', () => {
    const projection = new FactionControlProjection()
    expect(planBuildingCaptures({ buildings: [], factionControlProjection: projection })).toHaveLength(0)
  })

  it('does not capture when no faction controls the tile', () => {
    const projection = new FactionControlProjection()
    const intents = planBuildingCaptures({
      buildings: [{ buildingId: 'b_hall', tileId: 't_central', controllingFactionId: null }],
      factionControlProjection: projection,
    })
    expect(intents).toHaveLength(0)
  })

  it('does not capture when building already belongs to dominant faction', () => {
    const projection = new FactionControlProjection()
    projection.rebuildFromEvents([makeSeizeEvent('t_central', 'faction_a', 1)])
    const intents = planBuildingCaptures({
      buildings: [{ buildingId: 'b_hall', tileId: 't_central', controllingFactionId: 'faction_a' }],
      factionControlProjection: projection,
    })
    expect(intents).toHaveLength(0)
  })

  it('captures an unclaimed building when a faction dominates the tile', () => {
    const projection = new FactionControlProjection()
    projection.rebuildFromEvents([makeSeizeEvent('t_ruin', 'faction_b', 1)])
    const intents = planBuildingCaptures({
      buildings: [{ buildingId: 'b_ruins', tileId: 't_ruin', controllingFactionId: null }],
      factionControlProjection: projection,
    })
    expect(intents).toHaveLength(1)
    expect(intents[0]).toMatchObject({ capturingFactionId: 'faction_b', previousFactionId: null })
  })

  it('captures a building held by old faction when tile changes hands', () => {
    const projection = new FactionControlProjection()
    projection.rebuildFromEvents([makeSeizeEvent('t_ruin', 'faction_c', 2)])
    const intents = planBuildingCaptures({
      buildings: [{ buildingId: 'b_ruins', tileId: 't_ruin', controllingFactionId: 'faction_b' }],
      factionControlProjection: projection,
    })
    expect(intents).toHaveLength(1)
    expect(intents[0]).toMatchObject({ capturingFactionId: 'faction_c', previousFactionId: 'faction_b' })
  })
})

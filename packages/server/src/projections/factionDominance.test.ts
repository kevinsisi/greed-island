import { describe, expect, it } from 'vitest'
import { FactionDominanceProjection } from './factionDominance.js'
import type { Event } from '../kernel/types.js'

function makeEvent(losingFactionId: string, sequence = 1): Event {
  return {
    sequence,
    eventType: 'FACTION_DOMINANCE_SHIFTED',
    commandId: 'cmd-1',
    submittedAt: new Date().toISOString(),
    tick: sequence,
    payload: {
      actorType: 'system',
      actorId: 'world',
      data: { losingFactionId, dominantFactionId: 'tide_hunters', lostTileCount: 3, tick: sequence, narration: '' },
      narration: null,
    },
  } as unknown as Event
}

describe('FactionDominanceProjection', () => {
  it('starts with no factions shifted', () => {
    const proj = new FactionDominanceProjection()
    expect(proj.hasShiftFiredFor('free_runners')).toBe(false)
  })

  it('records a faction as shifted after FACTION_DOMINANCE_SHIFTED event', () => {
    const proj = new FactionDominanceProjection()
    proj.project(makeEvent('free_runners'))
    expect(proj.hasShiftFiredFor('free_runners')).toBe(true)
    expect(proj.hasShiftFiredFor('guild')).toBe(false)
  })

  it('ignores unrelated events', () => {
    const proj = new FactionDominanceProjection()
    const unrelated = { ...makeEvent('free_runners'), eventType: 'FACTION_TILE_SEIZED' } as unknown as Event
    proj.project(unrelated)
    expect(proj.hasShiftFiredFor('free_runners')).toBe(false)
  })

  it('rebuildFromEvents produces same state as incremental projection', () => {
    const events = [makeEvent('free_runners', 1), makeEvent('guild', 2)]
    const incremental = new FactionDominanceProjection()
    for (const ev of events) incremental.project(ev)

    const rebuilt = new FactionDominanceProjection()
    rebuilt.rebuildFromEvents(events)

    expect(rebuilt.hasShiftFiredFor('free_runners')).toBe(incremental.hasShiftFiredFor('free_runners'))
    expect(rebuilt.hasShiftFiredFor('guild')).toBe(incremental.hasShiftFiredFor('guild'))
    expect(rebuilt.shiftedFactions()).toEqual(incremental.shiftedFactions())
  })
})

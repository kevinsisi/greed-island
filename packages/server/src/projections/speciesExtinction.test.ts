import { describe, expect, it } from 'vitest'
import { SpeciesExtinctionProjection } from './speciesExtinction.js'
import type { Event } from '../kernel/types.js'

describe('SpeciesExtinctionProjection', () => {
  it('starts with stable status for any species', () => {
    const proj = new SpeciesExtinctionProjection()
    expect(proj.getStatus('fog_wolf')).toBe('stable')
    expect(proj.list()).toHaveLength(0)
  })

  it('moves species to warning on SPECIES_EXTINCTION_WARNING', () => {
    const proj = new SpeciesExtinctionProjection()
    proj.project(warningEvent('fog_wolf', 't_forest', 100))
    expect(proj.getStatus('fog_wolf')).toBe('warning')
    const row = proj.getRow('fog_wolf')!
    expect(row.warningTileIds).toContain('t_forest')
    expect(row.lastWarningTick).toBe(100)
    expect(row.extinctSince).toBeNull()
  })

  it('accumulates warning tile ids across multiple warnings', () => {
    const proj = new SpeciesExtinctionProjection()
    proj.project(warningEvent('forest_deer', 't_forest', 50))
    proj.project(warningEvent('forest_deer', 't_mountain', 60))
    const row = proj.getRow('forest_deer')!
    expect(row.warningTileIds).toEqual(['t_forest', 't_mountain'])
  })

  it('does not duplicate tile id on repeated warning for same tile', () => {
    const proj = new SpeciesExtinctionProjection()
    proj.project(warningEvent('fog_wolf', 't_forest', 100))
    proj.project(warningEvent('fog_wolf', 't_forest', 110))
    expect(proj.getRow('fog_wolf')!.warningTileIds).toHaveLength(1)
  })

  it('moves species to extinct on SPECIES_EXTINCT', () => {
    const proj = new SpeciesExtinctionProjection()
    proj.project(warningEvent('fog_wolf', 't_forest', 100))
    proj.project(extinctEvent('fog_wolf', 110))
    expect(proj.getStatus('fog_wolf')).toBe('extinct')
    expect(proj.getRow('fog_wolf')!.extinctSince).toBe(110)
    expect(proj.getRow('fog_wolf')!.warningTileIds).toHaveLength(0)
  })

  it('moves species to stable on SPECIES_RECOVERED', () => {
    const proj = new SpeciesExtinctionProjection()
    proj.project(extinctEvent('fog_wolf', 110))
    proj.project(recoveredEvent('fog_wolf', 200))
    expect(proj.getStatus('fog_wolf')).toBe('stable')
    expect(proj.list()).toHaveLength(0)
  })

  it('ignores extinction warning for already-extinct species', () => {
    const proj = new SpeciesExtinctionProjection()
    proj.project(extinctEvent('fog_wolf', 110))
    proj.project(warningEvent('fog_wolf', 't_forest', 120))
    expect(proj.getStatus('fog_wolf')).toBe('extinct')
  })

  it('rebuild from events yields same result as incremental projection', () => {
    const events: Event[] = [
      warningEvent('fog_wolf', 't_forest', 100),
      warningEvent('fog_wolf', 't_mountain', 110),
      extinctEvent('fog_wolf', 120),
      warningEvent('forest_deer', 't_forest', 130),
    ]
    const incremental = new SpeciesExtinctionProjection()
    for (const ev of events) incremental.project(ev)
    const rebuilt = new SpeciesExtinctionProjection()
    rebuilt.rebuildFromEvents(events)
    expect(incremental.canonicalHash()).toBe(rebuilt.canonicalHash())
    expect(incremental.list()).toEqual(rebuilt.list())
  })

  it('canonicalHash is stable for empty projection', () => {
    expect(new SpeciesExtinctionProjection().canonicalHash())
      .toBe(new SpeciesExtinctionProjection().canonicalHash())
  })
})

let seq = 0
function nextSeq() { return ++seq }

function warningEvent(speciesId: string, tileId: string, tick: number): Event {
  const s = nextSeq()
  return {
    sequence: s, eventId: `evt-${s}`, eventType: 'SPECIES_EXTINCTION_WARNING',
    actorId: 'system', occurredAt: 0, tick,
    payload: { actorType: 'system', data: { speciesId, tileId, population: 2, threshold: 3, tick }, narration: null },
    deterministicKey: `key-${s}`, version: 1,
  }
}

function extinctEvent(speciesId: string, lastSeenTick: number): Event {
  const s = nextSeq()
  return {
    sequence: s, eventId: `evt-${s}`, eventType: 'SPECIES_EXTINCT',
    actorId: 'system', occurredAt: 0, tick: lastSeenTick,
    payload: { actorType: 'system', data: { speciesId, lastSeenTick, affectedTileIds: ['t_forest'] }, narration: null },
    deterministicKey: `key-${s}`, version: 1,
  }
}

function recoveredEvent(speciesId: string, tick: number): Event {
  const s = nextSeq()
  return {
    sequence: s, eventId: `evt-${s}`, eventType: 'SPECIES_RECOVERED',
    actorId: 'system', occurredAt: 0, tick,
    payload: { actorType: 'system', data: { speciesId, tileId: 't_forest', population: 5, tick }, narration: null },
    deterministicKey: `key-${s}`, version: 1,
  }
}

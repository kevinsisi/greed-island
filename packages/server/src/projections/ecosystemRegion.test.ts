import { describe, expect, it } from 'vitest'
import { EcosystemRegionProjection } from './ecosystemRegion.js'
import type { Event } from '../kernel/types.js'

describe('EcosystemRegionProjection', () => {
  it('returns zero-pressure row for unknown tile', () => {
    const proj = new EcosystemRegionProjection()
    const row = proj.getForTile('t_forest')
    expect(row.pressureLevel).toBe(0)
    expect(row.pollutionLevel).toBe(0)
    expect(row.lastPressureRaisedTick).toBeNull()
  })

  it('records pressure level on ECOSYSTEM_PRESSURE_RAISED', () => {
    const proj = new EcosystemRegionProjection()
    proj.project(raisedEvent('t_forest', 40, 50))
    const row = proj.getForTile('t_forest')
    expect(row.pressureLevel).toBe(40)
    expect(row.pollutionLevel).toBe(20)
    expect(row.lastPressureRaisedTick).toBe(50)
  })

  it('resets pressure to 0 on ECOSYSTEM_PRESSURE_RECOVERED', () => {
    const proj = new EcosystemRegionProjection()
    proj.project(raisedEvent('t_forest', 60, 50))
    proj.project(recoveredEvent('t_forest', 100))
    const row = proj.getForTile('t_forest')
    expect(row.pressureLevel).toBe(0)
    expect(row.pollutionLevel).toBe(0)
    expect(row.lastRecoveredTick).toBe(100)
    expect(row.lastPressureRaisedTick).toBe(50)
  })

  it('list() only returns tiles with positive pressure', () => {
    const proj = new EcosystemRegionProjection()
    proj.project(raisedEvent('t_forest', 20, 50))
    proj.project(raisedEvent('t_mountain', 0, 60))
    expect(proj.list()).toHaveLength(1)
    expect(proj.list()[0]!.tileId).toBe('t_forest')
  })

  it('rebuild from events yields same result as incremental projection', () => {
    const events: Event[] = [
      raisedEvent('t_forest', 40, 50),
      raisedEvent('t_mountain', 60, 60),
      recoveredEvent('t_forest', 100),
    ]
    const incremental = new EcosystemRegionProjection()
    for (const ev of events) incremental.project(ev)
    const rebuilt = new EcosystemRegionProjection()
    rebuilt.rebuildFromEvents(events)
    expect(incremental.canonicalHash()).toBe(rebuilt.canonicalHash())
    expect(incremental.list()).toEqual(rebuilt.list())
  })

  it('canonicalHash is stable for empty projection', () => {
    expect(new EcosystemRegionProjection().canonicalHash())
      .toBe(new EcosystemRegionProjection().canonicalHash())
  })
})

let seq = 0
function nextSeq() { return ++seq }

function raisedEvent(tileId: string, pressureLevel: number, tick: number): Event {
  const s = nextSeq()
  return {
    sequence: s, eventId: `evt-${s}`, eventType: 'ECOSYSTEM_PRESSURE_RAISED',
    actorId: 'system', occurredAt: 0, tick,
    payload: { actorType: 'system', data: { tileId, pressureLevel, tick }, narration: null },
    deterministicKey: `key-${s}`, version: 1,
  }
}

function recoveredEvent(tileId: string, tick: number): Event {
  const s = nextSeq()
  return {
    sequence: s, eventId: `evt-${s}`, eventType: 'ECOSYSTEM_PRESSURE_RECOVERED',
    actorId: 'system', occurredAt: 0, tick,
    payload: { actorType: 'system', data: { tileId, tick }, narration: null },
    deterministicKey: `key-${s}`, version: 1,
  }
}

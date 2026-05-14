import { describe, expect, it } from 'vitest'
import { CulturalElementProjection } from './culturalElement.js'
import { CULTURAL_FESTIVAL_THRESHOLD } from '../config/world.js'
import type { Event } from '../kernel/types.js'

let seq = 0
function nextSeq() { return ++seq }

function makeEvent(eventType: string, data: Record<string, unknown>): Event {
  const s = nextSeq()
  return {
    sequence: s,
    eventId: `event-${s}`,
    eventType,
    actorId: 'system',
    occurredAt: 0,
    tick: s,
    payload: { actorType: 'system', data, narration: null },
    deterministicKey: `key-${s}`,
    version: 1,
  }
}

function rareWindowOpen(windowId = 'tide_festival') {
  return makeEvent('RARE_WINDOW_OPEN', { windowId, closesAtTick: 100 })
}

function festivalFormed(windowId = 'tide_festival', tileId = 't_temple', count = CULTURAL_FESTIVAL_THRESHOLD, tick = 10) {
  return makeEvent('CULTURAL_FESTIVAL_FORMED', { windowId, tileId, occurrenceCount: count, formedAtTick: tick, narration: '' })
}

function ritualPerformed(npcId = 'npc_a', buildingId = 'b_temple_shrine', tileId = 't_temple', factionLean = 'temple', tick = 5) {
  return makeEvent('CULTURAL_RITUAL_PERFORMED', { npcId, buildingId, tileId, factionLean, performedAtTick: tick, narration: '' })
}

function normEstablished(tileId = 't_salt_marsh', skillId = 'fishing', npcCount = 3, tick = 20) {
  return makeEvent('CULTURAL_NORM_ESTABLISHED', { tileId, skillId, npcCount, formedAtTick: tick, narration: '' })
}

describe('CulturalElementProjection', () => {
  it('RARE_WINDOW_OPEN increments festivalCounter per windowId', () => {
    const proj = new CulturalElementProjection()
    proj.project(rareWindowOpen('tide_festival'))
    proj.project(rareWindowOpen('tide_festival'))
    expect(proj.getFestivalCounter('tide_festival')).toBe(2)
    expect(proj.getFestivalCounter('other_window')).toBe(0)
  })

  it('CULTURAL_FESTIVAL_FORMED adds festival row', () => {
    const proj = new CulturalElementProjection()
    proj.project(festivalFormed())
    const rows = proj.getByTile('t_temple')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      tileId: 't_temple',
      elementType: 'festival',
      elementId: 'festival:tide_festival',
    })
    expect(proj.hasFestival('tide_festival')).toBe(true)
  })

  it('CULTURAL_FESTIVAL_FORMED is idempotent (duplicate event ignored)', () => {
    const proj = new CulturalElementProjection()
    proj.project(festivalFormed('tide_festival', 't_temple', 3, 10))
    proj.project(festivalFormed('tide_festival', 't_temple', 4, 15))
    expect(proj.getByTile('t_temple')).toHaveLength(1)
  })

  it('CULTURAL_RITUAL_PERFORMED adds ritual row with unique elementId per tick', () => {
    const proj = new CulturalElementProjection()
    proj.project(ritualPerformed('npc_a', 'b_temple_shrine', 't_temple', 'temple', 5))
    proj.project(ritualPerformed('npc_a', 'b_temple_shrine', 't_temple', 'temple', 10))
    const rows = proj.getByTile('t_temple')
    expect(rows).toHaveLength(2)
    expect(rows.every((r) => r.elementType === 'ritual')).toBe(true)
  })

  it('CULTURAL_NORM_ESTABLISHED adds norm row', () => {
    const proj = new CulturalElementProjection()
    proj.project(normEstablished('t_salt_marsh', 'fishing', 3, 20))
    expect(proj.hasNorm('t_salt_marsh', 'fishing')).toBe(true)
    expect(proj.hasNorm('t_salt_marsh', 'hunting')).toBe(false)
    const rows = proj.getByTile('t_salt_marsh')
    expect(rows[0]).toMatchObject({ elementType: 'norm', formedAtTick: 20 })
  })

  it('CULTURAL_NORM_ESTABLISHED is idempotent', () => {
    const proj = new CulturalElementProjection()
    proj.project(normEstablished('t_salt_marsh', 'fishing', 3, 20))
    proj.project(normEstablished('t_salt_marsh', 'fishing', 4, 25))
    expect(proj.getByTile('t_salt_marsh')).toHaveLength(1)
  })

  it('rebuildFromEvents resets and replays in sequence order', () => {
    const proj = new CulturalElementProjection()
    const events = [
      rareWindowOpen(),
      rareWindowOpen(),
      rareWindowOpen(),
      festivalFormed(),
      normEstablished(),
    ]
    proj.rebuildFromEvents(events)
    const hash1 = proj.canonicalHash()
    proj.rebuildFromEvents(events)
    expect(proj.canonicalHash()).toBe(hash1)
    expect(proj.getFestivalCounter('tide_festival')).toBe(3)
    expect(proj.hasFestival('tide_festival')).toBe(true)
    expect(proj.hasNorm('t_salt_marsh', 'fishing')).toBe(true)
  })

  it('hasFestival returns false before any festival formed', () => {
    const proj = new CulturalElementProjection()
    for (let i = 0; i < CULTURAL_FESTIVAL_THRESHOLD - 1; i++) proj.project(rareWindowOpen())
    expect(proj.hasFestival('tide_festival')).toBe(false)
  })
})

import { describe, expect, it } from 'vitest'
import { WorldEventProjection } from './worldEvent.js'
import type { Event } from '../kernel/types.js'

function makeEvent(overrides: Partial<Event> & { eventType: string; payload: unknown }): Event {
  return {
    eventId: overrides.eventId ?? 'evt-1',
    sequence: overrides.sequence ?? 1,
    eventType: overrides.eventType,
    occurredAt: '2024-01-01T00:00:00.000Z',
    actorId: 'system',
    tick: 0,
    payload: overrides.payload,
    ...(overrides as Partial<Event>),
  } as Event
}

function spawnEvent(linkedAnimalId: string, tileId = 't1', seq = 1): Event {
  return makeEvent({
    eventId: `evt-spawn-${linkedAnimalId}`,
    sequence: seq,
    eventType: 'LEGENDARY_WORLD_EVENT_SPAWNED',
    payload: {
      actorType: 'system',
      data: { eventKind: 'legendary_creature', tileId, linkedAnimalId, speciesId: 'white_marsh_leviathan', severity: 30, tick: seq * 10 },
      narration: null,
    },
  })
}

function resolveEvent(linkedAnimalId: string, seq = 2): Event {
  return makeEvent({
    eventId: `evt-resolve-${linkedAnimalId}`,
    sequence: seq,
    eventType: 'LEGENDARY_WORLD_EVENT_RESOLVED',
    payload: {
      actorType: 'system',
      data: { linkedAnimalId, tileId: 't1', speciesId: 'white_marsh_leviathan', resolutionTick: seq * 10 },
      narration: null,
    },
  })
}

function huntStartedEvent(linkedAnimalId: string, seq = 3): Event {
  return makeEvent({
    eventId: `evt-hunt-${linkedAnimalId}`,
    sequence: seq,
    eventType: 'LEGENDARY_HUNT_STARTED',
    payload: {
      actorType: 'system',
      data: { worldEventId: `evt-spawn-${linkedAnimalId}`, linkedAnimalId, tileId: 't1', hunterNpcIds: ['npc1', 'npc2', 'npc3'], startedAtTick: seq * 10 },
      narration: null,
    },
  })
}

describe('WorldEventProjection', () => {
  it('shows world event after spawn', () => {
    const proj = new WorldEventProjection()
    proj.rebuildFromEvents([spawnEvent('animal-1', 't_marsh')])
    const active = proj.getActiveByTile('t_marsh')
    expect(active).toHaveLength(1)
    expect(active[0]?.linkedAnimalId).toBe('animal-1')
    expect(active[0]?.severity).toBe(30)
  })

  it('clears world event after resolve', () => {
    const proj = new WorldEventProjection()
    proj.rebuildFromEvents([spawnEvent('animal-1'), resolveEvent('animal-1')])
    expect(proj.getActiveByTile('t1')).toHaveLength(0)
    expect(proj.getActiveByAnimalId('animal-1')).toBeNull()
  })

  it('marks huntStartedEmitted after LEGENDARY_HUNT_STARTED', () => {
    const proj = new WorldEventProjection()
    proj.rebuildFromEvents([spawnEvent('animal-1'), huntStartedEvent('animal-1')])
    const row = proj.getActiveByAnimalId('animal-1')
    expect(row?.huntStartedEmitted).toBe(true)
  })

  it('does not show event on a different tile', () => {
    const proj = new WorldEventProjection()
    proj.rebuildFromEvents([spawnEvent('animal-1', 't_other')])
    expect(proj.getActiveByTile('t_marsh')).toHaveLength(0)
    expect(proj.getActiveByTile('t_other')).toHaveLength(1)
  })

  it('rebuilds from EventLog on boot — only unresolved events are active', () => {
    const proj = new WorldEventProjection()
    proj.rebuildFromEvents([
      spawnEvent('animal-1', 't1', 1),
      spawnEvent('animal-2', 't2', 2),
      resolveEvent('animal-1', 3),
    ])
    expect(proj.list()).toHaveLength(1)
    expect(proj.list()[0]?.linkedAnimalId).toBe('animal-2')
  })

  it('incremental project() works without full rebuild', () => {
    const proj = new WorldEventProjection()
    proj.project(spawnEvent('animal-1'))
    expect(proj.snapshot()).toHaveLength(1)
    proj.project(resolveEvent('animal-1'))
    expect(proj.snapshot()).toHaveLength(0)
  })
})

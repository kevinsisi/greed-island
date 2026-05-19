import { describe, expect, it } from 'vitest'
import { NpcMortalityProjection } from './npcMortality.js'
import type { Event } from '../kernel/types.js'

function makeEvent(eventType: string, data: Record<string, unknown>, sequence = 1): Event {
  return {
    id: `evt-${sequence}`,
    eventType,
    sequence,
    tick: 100,
    createdAt: '2024-01-01T00:00:00Z',
    payload: { actorType: 'system', data, narration: null },
  } as unknown as Event
}

function makeDeceasedEvent(npcId: string, tick: number, sequence = 1): Event {
  return makeEvent('NPC_DECEASED', { npcId, tileId: 'hub', householdId: npcId, deceasedAtTick: tick }, sequence)
}

describe('NpcMortalityProjection', () => {
  it('starts empty', () => {
    const proj = new NpcMortalityProjection()
    expect(proj.isDeceased('npc_1')).toBe(false)
    expect(proj.deceasedAtTick('npc_1')).toBeNull()
    expect(proj.list()).toHaveLength(0)
  })

  it('marks NPC deceased after NPC_DECEASED event', () => {
    const proj = new NpcMortalityProjection()
    proj.project(makeDeceasedEvent('npc_fisher_1', 500))
    expect(proj.isDeceased('npc_fisher_1')).toBe(true)
    expect(proj.deceasedAtTick('npc_fisher_1')).toBe(500)
  })

  it('ignores unrelated event types', () => {
    const proj = new NpcMortalityProjection()
    proj.project(makeEvent('NPC_HIRED', { npcId: 'npc_1' }))
    expect(proj.isDeceased('npc_1')).toBe(false)
  })

  it('returns false for unknown npc', () => {
    const proj = new NpcMortalityProjection()
    proj.project(makeDeceasedEvent('npc_a', 100))
    expect(proj.isDeceased('npc_b')).toBe(false)
  })

  it('rebuildFromEvents restores state', () => {
    const events = [
      makeDeceasedEvent('npc_elder', 200, 1),
      makeDeceasedEvent('npc_merchant', 300, 2),
    ]
    const proj = new NpcMortalityProjection()
    proj.rebuildFromEvents(events)
    expect(proj.isDeceased('npc_elder')).toBe(true)
    expect(proj.isDeceased('npc_merchant')).toBe(true)
    expect(proj.isDeceased('npc_guard')).toBe(false)
    expect(proj.list()).toHaveLength(2)
  })

  it('list returns rows sorted by deceasedAtTick', () => {
    const proj = new NpcMortalityProjection()
    proj.project(makeDeceasedEvent('npc_b', 400, 2))
    proj.project(makeDeceasedEvent('npc_a', 100, 1))
    const list = proj.list()
    expect(list[0]?.npcId).toBe('npc_a')
    expect(list[1]?.npcId).toBe('npc_b')
  })

  it('deceasedIds returns all deceased npc ids', () => {
    const proj = new NpcMortalityProjection()
    proj.project(makeDeceasedEvent('npc_x', 50, 1))
    proj.project(makeDeceasedEvent('npc_y', 60, 2))
    expect(proj.deceasedIds.has('npc_x')).toBe(true)
    expect(proj.deceasedIds.has('npc_y')).toBe(true)
    expect(proj.deceasedIds.has('npc_z')).toBe(false)
  })
})

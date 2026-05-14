import { describe, expect, it } from 'vitest'
import { RumorProjection } from './rumor.js'
import type { Event } from '../kernel/types.js'

let seq = 0
function nextSeq() { return ++seq }

function heardEvent(npcId: string, rumorId: string, topic: string, subjectId: string, tileId: string, originTick: number, accuracy: number, tick: number): Event {
  const s = nextSeq()
  return {
    sequence: s,
    eventId: `event-heard-${s}`,
    eventType: 'NPC_RUMOR_HEARD',
    actorId: `system.rumor.${topic}`,
    occurredAt: 0,
    tick,
    payload: {
      actorType: 'system',
      data: { npcId, rumorId, topic, subjectId, tileId, originTick, accuracy },
      narration: null,
    },
    deterministicKey: `key-heard-${s}`,
    version: 1,
  }
}

function spreadEvent(fromNpcId: string, toNpcId: string, rumorId: string, topic: string, subjectId: string, tileId: string, originTick: number, accuracy: number, tick: number): Event {
  const s = nextSeq()
  return {
    sequence: s,
    eventId: `event-spread-${s}`,
    eventType: 'NPC_RUMOR_SPREAD',
    actorId: fromNpcId,
    occurredAt: 0,
    tick,
    payload: {
      actorType: 'npc',
      data: { fromNpcId, toNpcId, rumorId, topic, subjectId, tileId, originTick, accuracy },
      narration: null,
    },
    deterministicKey: `key-spread-${s}`,
    version: 1,
  }
}

describe('RumorProjection', () => {
  it('NPC_RUMOR_HEARD adds an active rumor for the NPC', () => {
    const proj = new RumorProjection()
    proj.project(heardEvent('npc-a', 'r1', 'predator_death', 'fog_wolf', 't_forest', 10, 100, 12))

    const rows = proj.getActiveRumors('npc-a')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ npcId: 'npc-a', rumorId: 'r1', topic: 'predator_death', subjectId: 'fog_wolf', accuracy: 100 })
  })

  it('NPC_RUMOR_SPREAD adds degraded copy to recipient', () => {
    const proj = new RumorProjection()
    proj.project(heardEvent('npc-a', 'r1', 'predator_death', 'fog_wolf', 't_forest', 10, 100, 12))
    proj.project(spreadEvent('npc-a', 'npc-b', 'r1', 'predator_death', 'fog_wolf', 't_forest', 10, 100, 15))

    const bRumors = proj.getActiveRumors('npc-b')
    expect(bRumors).toHaveLength(1)
    expect(bRumors[0]?.accuracy).toBe(85) // Math.round(100 * 85 / 100)
  })

  it('accuracy degrades on each hop', () => {
    const proj = new RumorProjection()
    proj.project(heardEvent('npc-a', 'r1', 'predator_death', 'fog_wolf', 't_forest', 10, 100, 12))
    proj.project(spreadEvent('npc-a', 'npc-b', 'r1', 'predator_death', 'fog_wolf', 't_forest', 10, 100, 15))
    proj.project(spreadEvent('npc-b', 'npc-c', 'r1', 'predator_death', 'fog_wolf', 't_forest', 10, 85, 18))

    const cRumors = proj.getActiveRumors('npc-c')
    expect(cRumors[0]?.accuracy).toBe(72) // Math.round(85 * 85 / 100)
  })

  it('duplicate rumorId for recipient is no-op (does not add duplicate row)', () => {
    const proj = new RumorProjection()
    proj.project(heardEvent('npc-b', 'r1', 'predator_death', 'fog_wolf', 't_forest', 10, 100, 12))
    proj.project(spreadEvent('npc-a', 'npc-b', 'r1', 'predator_death', 'fog_wolf', 't_forest', 10, 80, 15))

    const bRumors = proj.getActiveRumors('npc-b')
    // npc-b already had r1 with accuracy=100; spread overwrites with accuracy=68 (Math.round(80*85/100))
    // The upsert replaces the existing entry
    expect(bRumors).toHaveLength(1)
  })

  it('accuracy below RUMOR_ACCURACY_THRESHOLD excluded from getActiveRumors', () => {
    const proj = new RumorProjection()
    proj.project(heardEvent('npc-a', 'r1', 'predator_death', 'fog_wolf', 't_forest', 10, 9, 12))

    expect(proj.getActiveRumors('npc-a')).toHaveLength(0)
  })

  it('cap evicts oldest on overflow beyond RUMOR_MAX_PER_NPC (5)', () => {
    const proj = new RumorProjection()
    for (let i = 1; i <= 6; i++) {
      proj.project(heardEvent('npc-a', `r${i}`, 'predator_death', `subject-${i}`, 't_forest', i, 100, i * 2))
    }
    const rumors = proj.getActiveRumors('npc-a')
    expect(rumors).toHaveLength(5)
    // Oldest is r1 (heardAtTick=2); it should have been evicted
    expect(rumors.find((r) => r.rumorId === 'r1')).toBeUndefined()
  })

  it('getActiveRumors returns rows sorted by descending accuracy', () => {
    const proj = new RumorProjection()
    proj.project(heardEvent('npc-a', 'r1', 'predator_death', 's1', 't1', 1, 70, 1))
    proj.project(heardEvent('npc-a', 'r2', 'predator_death', 's2', 't2', 2, 100, 2))
    proj.project(heardEvent('npc-a', 'r3', 'predator_death', 's3', 't3', 3, 50, 3))

    const rows = proj.getActiveRumors('npc-a')
    expect(rows[0]?.accuracy).toBe(100)
    expect(rows[1]?.accuracy).toBe(70)
    expect(rows[2]?.accuracy).toBe(50)
  })

  it('getActiveRumors returns empty array for unknown NPC', () => {
    const proj = new RumorProjection()
    expect(proj.getActiveRumors('unknown-npc')).toEqual([])
  })

  it('rebuildFromEvents produces stable canonicalHash', () => {
    const events = [
      heardEvent('npc-a', 'r1', 'predator_death', 'fog_wolf', 't_forest', 10, 100, 12),
      spreadEvent('npc-a', 'npc-b', 'r1', 'predator_death', 'fog_wolf', 't_forest', 10, 100, 15),
    ]

    const proj1 = new RumorProjection()
    proj1.rebuildFromEvents(events)

    const proj2 = new RumorProjection()
    proj2.rebuildFromEvents(events)

    expect(proj1.canonicalHash()).toBe(proj2.canonicalHash())
  })

  it('canonicalHash changes when state changes', () => {
    const proj = new RumorProjection()
    const hashBefore = proj.canonicalHash()
    proj.project(heardEvent('npc-a', 'r1', 'predator_death', 'fog_wolf', 't_forest', 10, 100, 12))
    expect(proj.canonicalHash()).not.toBe(hashBefore)
  })
})

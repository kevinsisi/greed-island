import { describe, expect, it } from 'vitest'
import type { Event } from '../kernel/types.js'
import { NpcStateProjection } from './npcState.js'

function npcStateEvent(input: {
  sequence: number
  npcId: string
  tick: number
  tile?: string
  mood?: number
}): Event {
  return {
    sequence: input.sequence,
    eventId: `evt_${input.npcId}_${input.sequence}`,
    eventType: 'NPC_STATE_RECORDED',
    occurredAt: 0,
    actorId: input.npcId,
    payload: {
      actorType: 'npc',
      data: {
        npcId: input.npcId,
        state: {
          tile: input.tile ?? 't_central',
          mood: input.mood ?? 60,
          health: 80,
          activity: 'idle',
          faction: 'civilian',
          targetTile: input.tile ?? 't_central',
          lastActedTick: input.tick,
          subCol: 7,
          subRow: 5,
          subZ: 0,
          personalityOverride: null,
          travelRoute: null,
          agent: { activeTask: { kind: 'bootstrap' } },
        },
        narration: 'internal npc state projection',
      },
      narration: 'internal npc state projection',
    },
    deterministicKey: `k_${input.npcId}_${input.sequence}`,
    version: 1,
    tick: input.tick,
  }
}

describe('NpcStateProjection', () => {
  it('rebuilds latest state per npc', () => {
    const projection = new NpcStateProjection()
    projection.rebuildFromEvents([
      npcStateEvent({ sequence: 1, npcId: 'npc.a', tick: 1, tile: 't_central', mood: 50 }),
      npcStateEvent({ sequence: 2, npcId: 'npc.a', tick: 2, tile: 't_dock', mood: 55 }),
      npcStateEvent({ sequence: 3, npcId: 'npc.b', tick: 1, tile: 't_forest', mood: 40 }),
    ])
    expect(projection.getByNpcId('npc.a')?.state.tile).toBe('t_dock')
    expect(projection.getByNpcId('npc.a')?.recordedAtTick).toBe(2)
    expect(projection.getByNpcId('npc.b')?.state.tile).toBe('t_forest')
  })

  it('ignores unrelated events', () => {
    const projection = new NpcStateProjection()
    projection.rebuildFromEvents([
      {
        sequence: 1,
        eventId: 'e1',
        eventType: 'NPC_MOVE',
        occurredAt: 0,
        actorId: 'npc.a',
        payload: { actorType: 'npc', data: {}, narration: null },
        deterministicKey: 'k1',
        version: 1,
        tick: 1,
      },
    ])
    expect(projection.getAll()).toEqual([])
  })

  it('canonical hash is stable across rebuilds', () => {
    const events = [
      npcStateEvent({ sequence: 1, npcId: 'npc.a', tick: 1 }),
      npcStateEvent({ sequence: 2, npcId: 'npc.b', tick: 1, tile: 't_forest' }),
    ]
    const a = new NpcStateProjection()
    const b = new NpcStateProjection()
    a.rebuildFromEvents(events)
    b.rebuildFromEvents(events)
    expect(a.canonicalHash()).toBe(b.canonicalHash())
  })
})

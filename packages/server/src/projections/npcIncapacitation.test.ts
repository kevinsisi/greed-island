import { describe, expect, it } from 'vitest'
import { NpcIncapacitationProjection } from './npcIncapacitation.js'
import type { Event } from '../kernel/types.js'

function makeEvent(
  eventType: string,
  data: Record<string, unknown>,
  sequence = 1
): Event {
  return {
    id: `evt-${sequence}`,
    sequence,
    eventType,
    tick: 100,
    payload: { data },
    createdAt: new Date().toISOString(),
  } as unknown as Event
}

function makeIncapEvent(overrides: Partial<{
  npcId: string
  tileId: string
  incapacitatedAtTick: number
  recoverAtTick: number
}> = {}, sequence = 1): Event {
  return makeEvent('NPC_INCAPACITATED_LONG', {
    npcId: overrides.npcId ?? 'npc.fighter',
    tileId: overrides.tileId ?? 't_arena',
    incapacitatedAtTick: overrides.incapacitatedAtTick ?? 100,
    recoverAtTick: overrides.recoverAtTick ?? 532,
    narration: 'fell in battle',
  }, sequence)
}

describe('NpcIncapacitationProjection', () => {
  it('starts empty', () => {
    const proj = new NpcIncapacitationProjection()
    expect(proj.list()).toHaveLength(0)
    expect(proj.isIncapacitated('npc.fighter', 100)).toBe(false)
  })

  it('records an incapacitation', () => {
    const proj = new NpcIncapacitationProjection()
    proj.project(makeIncapEvent())
    expect(proj.list()).toHaveLength(1)
    expect(proj.list()[0]?.npcId).toBe('npc.fighter')
    expect(proj.list()[0]?.recoverAtTick).toBe(532)
  })

  it('isIncapacitated returns true before recoverAtTick', () => {
    const proj = new NpcIncapacitationProjection()
    proj.project(makeIncapEvent({ recoverAtTick: 532 }))
    expect(proj.isIncapacitated('npc.fighter', 531)).toBe(true)
    expect(proj.isIncapacitated('npc.fighter', 532)).toBe(false)
    expect(proj.isIncapacitated('npc.fighter', 600)).toBe(false)
  })

  it('isIncapacitated returns false for unknown NPC', () => {
    const proj = new NpcIncapacitationProjection()
    proj.project(makeIncapEvent())
    expect(proj.isIncapacitated('npc.unknown', 100)).toBe(false)
  })

  it('overwrites earlier record for same NPC (re-incapacitation)', () => {
    const proj = new NpcIncapacitationProjection()
    proj.project(makeIncapEvent({ recoverAtTick: 200 }, 1))
    proj.project(makeIncapEvent({ recoverAtTick: 400 }, 2))
    expect(proj.list()).toHaveLength(1)
    expect(proj.list()[0]?.recoverAtTick).toBe(400)
  })

  it('tracks multiple NPCs independently', () => {
    const proj = new NpcIncapacitationProjection()
    proj.project(makeIncapEvent({ npcId: 'npc.A', recoverAtTick: 200 }, 1))
    proj.project(makeIncapEvent({ npcId: 'npc.B', recoverAtTick: 300 }, 2))
    expect(proj.isIncapacitated('npc.A', 150)).toBe(true)
    expect(proj.isIncapacitated('npc.B', 150)).toBe(true)
    expect(proj.isIncapacitated('npc.A', 250)).toBe(false)
    expect(proj.isIncapacitated('npc.B', 250)).toBe(true)
  })

  it('ignores events with missing npcId', () => {
    const proj = new NpcIncapacitationProjection()
    proj.project(makeEvent('NPC_INCAPACITATED_LONG', {
      tileId: 't_arena',
      incapacitatedAtTick: 100,
      recoverAtTick: 532,
      narration: '',
    }))
    expect(proj.list()).toHaveLength(0)
  })

  it('ignores unrelated events', () => {
    const proj = new NpcIncapacitationProjection()
    proj.project(makeEvent('GOODS_CONSUMED', { npcId: 'npc.fighter' }))
    expect(proj.list()).toHaveLength(0)
  })

  it('rebuildFromEvents resets and replays', () => {
    const proj = new NpcIncapacitationProjection()
    proj.project(makeIncapEvent({ npcId: 'npc.old', recoverAtTick: 200 }, 1))
    proj.rebuildFromEvents([
      makeIncapEvent({ npcId: 'npc.new', recoverAtTick: 400 }, 2),
    ])
    expect(proj.list()).toHaveLength(1)
    expect(proj.list()[0]?.npcId).toBe('npc.new')
  })
})

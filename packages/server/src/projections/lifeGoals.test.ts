import { describe, expect, it } from 'vitest'
import { LifeGoalsProjection, formatLifeGoalContext } from './lifeGoals.js'
import type { Event } from '../kernel/types.js'

describe('LifeGoalsProjection', () => {
  it('keeps the latest life goal per NPC', () => {
    const projection = new LifeGoalsProjection()
    projection.rebuildFromEvents([
      goalEvent(1, { npcId: 'npc.smith', kind: 'earn_money', pressure: 70, narration: '增加收入，讓生活不被物價追著跑。', tick: 30 }),
      goalEvent(2, { npcId: 'npc.smith', kind: 'rest', pressure: 82, narration: '找地方休息，明天才能繼續工作。', tick: 60 }),
      goalEvent(3, { npcId: 'npc.monk', kind: 'learn_skill', pressure: 58, narration: '累積知識與技能，替下一步生活開路。', tick: 60 }),
    ])

    const smith = projection.latestFor('npc.smith')
    expect(smith?.kind).toBe('rest')
    expect(smith?.pressure).toBe(82)
    expect(smith?.setAtTick).toBe(60)
    expect(projection.latestFor('npc.monk')?.kind).toBe('learn_skill')
    expect(projection.latestFor('npc.unknown')).toBeNull()
    expect(projection.list()).toHaveLength(2)
  })

  it('ignores events with malformed payloads', () => {
    const projection = new LifeGoalsProjection()
    projection.rebuildFromEvents([
      {
        ...goalEvent(1, { npcId: 'npc.smith', kind: 'rest', pressure: 50, narration: 'x', tick: 30 }),
        payload: { actorType: 'npc', data: { npcId: 'npc.smith' } },
      } as Event,
    ])
    expect(projection.latestFor('npc.smith')).toBeNull()
  })

  it('does not regress to an older sequence on out-of-order project calls', () => {
    const projection = new LifeGoalsProjection()
    const newer = goalEvent(9, { npcId: 'npc.smith', kind: 'rest', pressure: 80, narration: 'newer', tick: 90 })
    const older = goalEvent(4, { npcId: 'npc.smith', kind: 'eat', pressure: 60, narration: 'older', tick: 40 })
    projection.project(newer)
    projection.project(older)
    expect(projection.latestFor('npc.smith')?.kind).toBe('rest')
  })
})

describe('formatLifeGoalContext', () => {
  it('returns empty string for null rows', () => {
    expect(formatLifeGoalContext(null, 100, 10)).toBe('')
  })

  it('formats goal narration, direction, pressure, and top needs', () => {
    const text = formatLifeGoalContext(
      {
        npcId: 'npc.smith',
        tile: 't_forge',
        kind: 'earn_money',
        pressure: 71,
        narration: '增加收入，讓生活不被物價追著跑。',
        needs: { food: 30, money: 71, rest: 44 },
        setAtTick: 100,
        lastSequence: 5,
      },
      130,
      10
    )
    expect(text).toContain('人生目標')
    expect(text).toContain('增加收入，讓生活不被物價追著跑。')
    expect(text).toContain('約 3 天前')
    expect(text).toContain('壓力指數 71')
    expect(text).toContain('金錢 71')
  })
})

function goalEvent(
  sequence: number,
  input: { npcId: string; kind: string; pressure: number; narration: string; tick: number }
): Event {
  return {
    sequence,
    eventId: `event-${sequence}`,
    eventType: 'NPC_LIFE_GOAL_SET',
    occurredAt: 0,
    actorId: input.npcId,
    payload: {
      actorType: 'npc',
      data: {
        npcId: input.npcId,
        tile: 't_central',
        needs: { food: 20, rest: 30, money: 40, housing: 10, safety: 5 },
        goal: { kind: input.kind, pressure: input.pressure, narration: input.narration },
        narration: input.narration,
      },
    },
    deterministicKey: `key-${sequence}`,
    version: 1,
    tick: input.tick,
  }
}

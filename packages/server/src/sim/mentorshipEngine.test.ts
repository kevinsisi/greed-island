import { describe, expect, it } from 'vitest'
import { planMentorshipTick } from './mentorshipEngine.js'
import { SkillXpProjection } from '../projections/skillXp.js'
import { SKILL_XP_PER_MENTOR_TICK, SKILL_XP_LEVEL_THRESHOLD } from '../config/world.js'
import type { Event } from '../kernel/types.js'

let seq = 0
function nextSeq() { return ++seq }

function startedEvent(mentorNpcId: string, menteeNpcId: string, skillId: string, tick: number): Event {
  const s = nextSeq()
  return {
    sequence: s,
    eventId: `mstart-${s}`,
    eventType: 'NPC_MENTORSHIP_STARTED',
    actorId: 'system',
    occurredAt: 0,
    tick,
    payload: { actorType: 'system', data: { mentorNpcId, menteeNpcId, skillId, tick }, narration: null },
    deterministicKey: `key-mstart-${s}`,
    version: 1,
  }
}

function observedEvent(npcId: string, skillId: string, xp: number, tick: number): Event {
  const s = nextSeq()
  return {
    sequence: s,
    eventId: `obs-${s}`,
    eventType: 'NPC_OBSERVED_SKILL',
    actorId: 'system',
    occurredAt: 0,
    tick,
    payload: { actorType: 'system', data: { npcId, skillId, sourceEventType: 'NPC_MENTORSHIP_STARTED', tick, xpDelta: xp }, narration: null },
    deterministicKey: `key-obs-${s}`,
    version: 1,
  }
}

describe('planMentorshipTick', () => {
  it('returns NPC_OBSERVED_SKILL command for active mentorship below threshold', () => {
    const proj = new SkillXpProjection()
    proj.rebuildFromEvents([startedEvent('mentor', 'mentee', 'hunting', 1)])

    const cmds = planMentorshipTick(proj, 10)
    expect(cmds).toHaveLength(1)
    expect(cmds[0]?.commandType).toBe('NPC_OBSERVED_SKILL')
    const p = cmds[0]?.payload as Record<string, unknown>
    expect(p.npcId).toBe('mentee')
    expect(p.skillId).toBe('hunting')
    expect(p.xpDelta).toBe(SKILL_XP_PER_MENTOR_TICK)
  })

  it('returns NPC_MENTORSHIP_COMPLETED when XP crosses threshold', () => {
    const proj = new SkillXpProjection()
    // Put mentee just below threshold
    const xpNeeded = SKILL_XP_LEVEL_THRESHOLD - SKILL_XP_PER_MENTOR_TICK + 1
    const events: Event[] = [
      startedEvent('mentor', 'mentee', 'fishing', 1),
      observedEvent('mentee', 'fishing', xpNeeded, 2),
    ]
    proj.rebuildFromEvents(events)

    const cmds = planMentorshipTick(proj, 20)
    expect(cmds).toHaveLength(1)
    expect(cmds[0]?.commandType).toBe('NPC_MENTORSHIP_COMPLETED')
    const p = cmds[0]?.payload as Record<string, unknown>
    expect(p.mentorNpcId).toBe('mentor')
    expect(p.menteeNpcId).toBe('mentee')
    expect(p.finalLevel).toBeGreaterThanOrEqual(1)
  })

  it('returns empty when no active mentorships', () => {
    const proj = new SkillXpProjection()
    expect(planMentorshipTick(proj, 1)).toHaveLength(0)
  })

  it('does not emit commands for completed mentorships', () => {
    const proj = new SkillXpProjection()
    proj.rebuildFromEvents([
      startedEvent('mentor', 'mentee', 'construction', 1),
      { sequence: 99, eventId: 'comp', eventType: 'NPC_MENTORSHIP_COMPLETED', actorId: 'system', occurredAt: 0, tick: 2,
        payload: { actorType: 'system', data: { mentorNpcId: 'mentor', menteeNpcId: 'mentee', skillId: 'construction', finalLevel: 1, tick: 2 }, narration: null },
        deterministicKey: 'key-comp', version: 1 }
    ])

    const cmds = planMentorshipTick(proj, 10)
    expect(cmds).toHaveLength(0)
  })
})

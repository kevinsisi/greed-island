import { describe, expect, it } from 'vitest'
import { SkillXpProjection } from './skillXp.js'
import { SKILL_XP_PER_OBSERVE, SKILL_XP_LEVEL_THRESHOLD } from '../config/world.js'
import type { Event } from '../kernel/types.js'

let seq = 0
function nextSeq() { return ++seq }

function observedEvent(npcId: string, skillId: string, tick: number, xpDelta?: number): Event {
  const s = nextSeq()
  return {
    sequence: s,
    eventId: `event-obs-${s}`,
    eventType: 'NPC_OBSERVED_SKILL',
    actorId: `system.skill.${skillId}`,
    occurredAt: 0,
    tick,
    payload: {
      actorType: 'system',
      data: { npcId, skillId, sourceEventType: 'ANIMAL_HUNT_RESOLVED', tick, ...(xpDelta !== undefined ? { xpDelta } : {}) },
      narration: null,
    },
    deterministicKey: `key-obs-${s}`,
    version: 1,
  }
}

function mentorshipStartedEvent(mentorNpcId: string, menteeNpcId: string, skillId: string, tick: number): Event {
  const s = nextSeq()
  return {
    sequence: s,
    eventId: `event-mstart-${s}`,
    eventType: 'NPC_MENTORSHIP_STARTED',
    actorId: `system.mentorship.${skillId}`,
    occurredAt: 0,
    tick,
    payload: {
      actorType: 'system',
      data: { mentorNpcId, menteeNpcId, skillId, tick },
      narration: null,
    },
    deterministicKey: `key-mstart-${s}`,
    version: 1,
  }
}

function mentorshipCompletedEvent(mentorNpcId: string, menteeNpcId: string, skillId: string, finalLevel: number, tick: number): Event {
  const s = nextSeq()
  return {
    sequence: s,
    eventId: `event-mcomp-${s}`,
    eventType: 'NPC_MENTORSHIP_COMPLETED',
    actorId: `system.mentorship.${skillId}`,
    occurredAt: 0,
    tick,
    payload: {
      actorType: 'system',
      data: { mentorNpcId, menteeNpcId, skillId, finalLevel, tick },
      narration: null,
    },
    deterministicKey: `key-mcomp-${s}`,
    version: 1,
  }
}

describe('SkillXpProjection', () => {
  it('NPC_OBSERVED_SKILL creates row with SKILL_XP_PER_OBSERVE when no xpDelta provided', () => {
    const proj = new SkillXpProjection()
    proj.project(observedEvent('npc_a', 'hunting', 10))

    const rows = proj.getByNpc('npc_a')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ npcId: 'npc_a', skillId: 'hunting', xp: SKILL_XP_PER_OBSERVE, level: 0, mentorId: null })
  })

  it('NPC_OBSERVED_SKILL with xpDelta uses provided value', () => {
    const proj = new SkillXpProjection()
    proj.project(observedEvent('npc_a', 'fishing', 10, 8))

    const rows = proj.getByNpc('npc_a')
    expect(rows[0]?.xp).toBe(8)
  })

  it('repeated observations accumulate XP and level up when threshold crossed', () => {
    const proj = new SkillXpProjection()
    const count = Math.ceil(SKILL_XP_LEVEL_THRESHOLD / SKILL_XP_PER_OBSERVE)
    for (let i = 0; i < count; i++) {
      proj.project(observedEvent('npc_a', 'hunting', i + 1))
    }
    const rows = proj.getByNpc('npc_a')
    expect(rows[0]?.xp).toBeGreaterThanOrEqual(SKILL_XP_LEVEL_THRESHOLD)
    expect(rows[0]?.level).toBeGreaterThanOrEqual(1)
  })

  it('returns empty array for unknown NPC', () => {
    const proj = new SkillXpProjection()
    expect(proj.getByNpc('nobody')).toEqual([])
  })

  it('NPC_MENTORSHIP_STARTED sets mentorId on row', () => {
    const proj = new SkillXpProjection()
    proj.project(observedEvent('npc_b', 'fishing', 1))
    proj.project(mentorshipStartedEvent('npc_a', 'npc_b', 'fishing', 2))

    const rows = proj.getByNpc('npc_b')
    expect(rows[0]?.mentorId).toBe('npc_a')
  })

  it('NPC_MENTORSHIP_STARTED creates row even without prior XP', () => {
    const proj = new SkillXpProjection()
    proj.project(mentorshipStartedEvent('npc_a', 'npc_b', 'construction', 1))

    const all = proj.getAllActive()
    expect(all).toHaveLength(1)
    expect(all[0]).toMatchObject({ npcId: 'npc_b', skillId: 'construction', mentorId: 'npc_a' })
  })

  it('NPC_MENTORSHIP_COMPLETED clears mentorId and sets finalLevel', () => {
    const proj = new SkillXpProjection()
    proj.project(mentorshipStartedEvent('npc_a', 'npc_b', 'fishing', 1))
    proj.project(mentorshipCompletedEvent('npc_a', 'npc_b', 'fishing', 1, 2))

    const rows = proj.getByNpc('npc_b')
    expect(rows[0]?.mentorId).toBeNull()
    expect(rows[0]?.level).toBe(1)
  })

  it('rebuildFromEvents is idempotent', () => {
    const proj = new SkillXpProjection()
    const events = [
      observedEvent('npc_a', 'hunting', 1),
      observedEvent('npc_a', 'hunting', 2),
      mentorshipStartedEvent('npc_b', 'npc_a', 'hunting', 3),
    ]
    proj.rebuildFromEvents(events)
    const hash1 = proj.canonicalHash()
    proj.rebuildFromEvents(events)
    const hash2 = proj.canonicalHash()
    expect(hash1).toBe(hash2)
  })

  it('getAllActive returns only rows with mentorId', () => {
    const proj = new SkillXpProjection()
    proj.project(observedEvent('npc_a', 'hunting', 1))
    proj.project(mentorshipStartedEvent('npc_b', 'npc_a', 'fishing', 2))

    const active = proj.getAllActive()
    expect(active).toHaveLength(1)
    expect(active[0]).toMatchObject({ npcId: 'npc_a', skillId: 'fishing', mentorId: 'npc_b' })
  })
})

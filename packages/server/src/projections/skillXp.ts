import { hashCanonicalJson } from '../kernel/canonicalJson.js'
import type { Event } from '../kernel/types.js'
import { SKILL_XP_PER_OBSERVE, SKILL_XP_LEVEL_THRESHOLD } from '../config/world.js'

export type SkillXpRow = Readonly<{
  npcId: string
  skillId: string
  xp: number
  level: number
  mentorId: string | null
}>

const NPC_OBSERVED_SKILL = 'NPC_OBSERVED_SKILL'
const NPC_MENTORSHIP_STARTED = 'NPC_MENTORSHIP_STARTED'
const NPC_MENTORSHIP_COMPLETED = 'NPC_MENTORSHIP_COMPLETED'
const NPC_FREEFORM_ACTION_PROPOSED = 'NPC_FREEFORM_ACTION_PROPOSED'

export const SKILL_XP_BOOT_EVENT_TYPES = [
  NPC_OBSERVED_SKILL,
  NPC_MENTORSHIP_STARTED,
  NPC_MENTORSHIP_COMPLETED,
  NPC_FREEFORM_ACTION_PROPOSED,
] as const

export class SkillXpProjection {
  private rows = new Map<string, SkillXpRow>()

  private key(npcId: string, skillId: string): string {
    return `${npcId}::${skillId}`
  }

  rebuildFromEvents(events: readonly Event[]): void {
    this.rows = new Map()
    for (const event of [...events].sort((a, b) => a.sequence - b.sequence)) {
      this.project(event)
    }
  }

  project(event: Event): void {
    if (event.eventType === NPC_FREEFORM_ACTION_PROPOSED) {
      const p = readFreeformSkillPayload(event)
      if (!p) return
      this.addXp(p.npcId, p.skillId, p.xpDelta)
      return
    }
    if (event.eventType === NPC_OBSERVED_SKILL) {
      const p = readObservedPayload(event)
      if (!p) return
      this.addXp(p.npcId, p.skillId, p.xpDelta ?? SKILL_XP_PER_OBSERVE)
      return
    }
    if (event.eventType === NPC_MENTORSHIP_STARTED) {
      const p = readMentorshipStartedPayload(event)
      if (!p) return
      const k = this.key(p.menteeNpcId, p.skillId)
      const existing = this.rows.get(k)
      this.rows.set(k, {
        npcId: p.menteeNpcId,
        skillId: p.skillId,
        xp: existing?.xp ?? 0,
        level: existing?.level ?? 0,
        mentorId: p.mentorNpcId,
      })
      return
    }
    if (event.eventType === NPC_MENTORSHIP_COMPLETED) {
      const p = readMentorshipCompletedPayload(event)
      if (!p) return
      const k = this.key(p.menteeNpcId, p.skillId)
      const existing = this.rows.get(k)
      this.rows.set(k, {
        npcId: p.menteeNpcId,
        skillId: p.skillId,
        xp: existing?.xp ?? 0,
        level: p.finalLevel,
        mentorId: null,
      })
    }
  }

  getByNpc(npcId: string): SkillXpRow[] {
    const result: SkillXpRow[] = []
    for (const row of this.rows.values()) {
      if (row.npcId === npcId) result.push(row)
    }
    return result
  }

  getAll(): SkillXpRow[] {
    return [...this.rows.values()].sort(
      (a, b) => a.npcId.localeCompare(b.npcId) || a.skillId.localeCompare(b.skillId)
    )
  }

  getAllActive(): SkillXpRow[] {
    return this.getAll().filter((r) => r.mentorId !== null)
  }

  canonicalHash(): string {
    return hashCanonicalJson(this.getAll())
  }

  private addXp(npcId: string, skillId: string, delta: number): void {
    const k = this.key(npcId, skillId)
    const existing = this.rows.get(k)
    const newXp = (existing?.xp ?? 0) + delta
    const newLevel = Math.floor(newXp / SKILL_XP_LEVEL_THRESHOLD)
    this.rows.set(k, {
      npcId,
      skillId,
      xp: newXp,
      level: newLevel,
      mentorId: existing?.mentorId ?? null,
    })
  }
}

function readFreeformSkillPayload(event: Event): { npcId: string; skillId: string; xpDelta: number } | null {
  const data = (event.payload as Record<string, unknown>)?.data
  if (typeof data !== 'object' || data === null) return null
  const p = data as Record<string, unknown>
  if (p.accepted !== true || typeof p.npcId !== 'string') return null
  const resolved = p.resolved
  if (typeof resolved !== 'object' || resolved === null || Array.isArray(resolved)) return null
  const kind = (resolved as Record<string, unknown>).kind
  if (kind === 'learn') return { npcId: p.npcId, skillId: 'learning', xpDelta: SKILL_XP_PER_OBSERVE }
  if (kind === 'invent') return { npcId: p.npcId, skillId: 'invention', xpDelta: SKILL_XP_PER_OBSERVE }
  return null
}

function readObservedPayload(event: Event): { npcId: string; skillId: string; xpDelta?: number } | null {
  const data = (event.payload as Record<string, unknown>)?.data
  if (typeof data !== 'object' || data === null) return null
  const p = data as Record<string, unknown>
  if (typeof p.npcId !== 'string' || typeof p.skillId !== 'string') return null
  const xpDelta = typeof p.xpDelta === 'number' ? p.xpDelta : undefined
  return { npcId: p.npcId, skillId: p.skillId, ...(xpDelta !== undefined ? { xpDelta } : {}) }
}

function readMentorshipStartedPayload(event: Event): { mentorNpcId: string; menteeNpcId: string; skillId: string } | null {
  const data = (event.payload as Record<string, unknown>)?.data
  if (typeof data !== 'object' || data === null) return null
  const p = data as Record<string, unknown>
  if (typeof p.mentorNpcId !== 'string' || typeof p.menteeNpcId !== 'string' || typeof p.skillId !== 'string') return null
  return { mentorNpcId: p.mentorNpcId, menteeNpcId: p.menteeNpcId, skillId: p.skillId }
}

function readMentorshipCompletedPayload(event: Event): { mentorNpcId: string; menteeNpcId: string; skillId: string; finalLevel: number } | null {
  const data = (event.payload as Record<string, unknown>)?.data
  if (typeof data !== 'object' || data === null) return null
  const p = data as Record<string, unknown>
  if (typeof p.mentorNpcId !== 'string' || typeof p.menteeNpcId !== 'string' || typeof p.skillId !== 'string' || typeof p.finalLevel !== 'number') return null
  return { mentorNpcId: p.mentorNpcId, menteeNpcId: p.menteeNpcId, skillId: p.skillId, finalLevel: p.finalLevel }
}

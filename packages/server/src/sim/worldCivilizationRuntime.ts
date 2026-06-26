import { makeLivingWorldCommand, type LivingWorldCommand } from '../kernel/livingWorldCommands.js'
import type { Event } from '../kernel/types.js'

export type WorldCivilizationDomain = 'construction' | 'infrastructure' | 'learning' | 'economy' | 'ecology' | 'cards'

export type WorldCivilizationGoal = Readonly<{
  goalId: string
  domain: WorldCivilizationDomain | string
  title: string
  rationale: string
  targetProgress: number
  progress: number
  declaredAtTick: number
  completed: boolean
  completedAtTick: number | null
}>

export type WorldTechnology = Readonly<{
  techId: string
  domain: WorldCivilizationDomain | string
  title: string
  discoveredAtTick: number
  evidenceEventIds: readonly string[]
  unlocks: readonly string[]
}>

export type WorldCivilizationSnapshot = Readonly<{
  goals: readonly WorldCivilizationGoal[]
  technologies: readonly WorldTechnology[]
}>

export type WorldCivilizationEvidence = Readonly<{
  eventId: string
  eventType: string
  subjectId: string
  domain: WorldCivilizationDomain | string
  tick: number
}>

export type WorldCivilizationPlannerInput = Readonly<{
  tick: number
  submittedAt: number
  projection: WorldCivilizationSnapshot
  recentEvidence: readonly WorldCivilizationEvidence[]
}>

export class WorldCivilizationProjection {
  private readonly goals = new Map<string, WorldCivilizationGoal>()
  private readonly technologies = new Map<string, WorldTechnology>()

  projectEvent(event: Pick<Event, 'eventType' | 'tick' | 'payload'>): void {
    const data = readEventData(event.payload)
    if (!data) return
    if (event.eventType === 'WORLD_GOAL_DECLARED') {
      const goalId = stringField(data.goalId)
      const domain = stringField(data.domain)
      const title = stringField(data.title)
      const rationale = stringField(data.rationale)
      const targetProgress = numberField(data.targetProgress)
      const declaredAtTick = numberField(data.declaredAtTick) ?? event.tick ?? 0
      if (!goalId || !domain || !title || !rationale || !targetProgress) return
      this.goals.set(goalId, {
        goalId,
        domain,
        title,
        rationale,
        targetProgress,
        progress: 0,
        declaredAtTick,
        completed: false,
        completedAtTick: null,
      })
      return
    }
    if (event.eventType === 'WORLD_GOAL_PROGRESS_RECORDED') {
      const goalId = stringField(data.goalId)
      const progressDelta = numberField(data.progressDelta)
      const recordedAtTick = numberField(data.recordedAtTick) ?? event.tick ?? 0
      if (!goalId || !progressDelta) return
      const existing = this.goals.get(goalId)
      if (!existing) return
      const progress = Math.max(0, existing.progress + progressDelta)
      const completed = progress >= existing.targetProgress
      this.goals.set(goalId, {
        ...existing,
        progress,
        completed,
        completedAtTick: completed ? (existing.completedAtTick ?? recordedAtTick) : null,
      })
      return
    }
    if (event.eventType === 'WORLD_TECH_DISCOVERED') {
      const techId = stringField(data.techId)
      const domain = stringField(data.domain)
      const title = stringField(data.title)
      const discoveredAtTick = numberField(data.discoveredAtTick) ?? event.tick ?? 0
      const evidenceEventIds = arrayOfStrings(data.evidenceEventIds)
      const unlocks = arrayOfStrings(data.unlocks)
      if (!techId || !domain || !title || evidenceEventIds.length === 0) return
      this.technologies.set(techId, { techId, domain, title, discoveredAtTick, evidenceEventIds, unlocks })
    }
  }

  rebuild(events: readonly Pick<Event, 'eventType' | 'tick' | 'payload'>[]): void {
    this.goals.clear()
    this.technologies.clear()
    for (const event of events) this.projectEvent(event)
  }

  snapshot(): WorldCivilizationSnapshot {
    return {
      goals: [...this.goals.values()].sort((a, b) => a.declaredAtTick - b.declaredAtTick || a.goalId.localeCompare(b.goalId)),
      technologies: [...this.technologies.values()].sort((a, b) => a.discoveredAtTick - b.discoveredAtTick || a.techId.localeCompare(b.techId)),
    }
  }
}

export function planWorldCivilizationCommands(input: WorldCivilizationPlannerInput): LivingWorldCommand[] {
  const grouped = groupEvidenceByDomain(input.recentEvidence)
  const commands: LivingWorldCommand[] = []
  for (const [domain, evidence] of [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (evidence.length < 3) continue
    const techId = `tech.${domain}.knowledge-system`
    if (input.projection.technologies.some((tech) => tech.techId === techId)) continue
    const goalId = `goal.${domain}.knowledge-system`
    if (!input.projection.goals.some((goal) => goal.goalId === goalId)) {
      commands.push(makeLivingWorldCommand('WORLD_GOAL_DECLARED', 'world.civilization', 'system', input.tick, input.submittedAt, {
        goalId,
        domain,
        title: `${domainTitle(domain)}知識體系`,
        rationale: `${domainTitle(domain)}相關事件重複出現，世界開始把零散經驗整理成可傳承的共同目標。`,
        targetProgress: 100,
        declaredAtTick: input.tick,
        narration: `潮鳴市把「${domainTitle(domain)}知識體系」列為新的世界目標。`,
      }))
    }
    commands.push(makeLivingWorldCommand('WORLD_TECH_DISCOVERED', 'world.civilization', 'system', input.tick, input.submittedAt, {
      techId,
      domain,
      title: `${domainTitle(domain)}知識體系`,
      discoveredAtTick: input.tick,
      evidenceEventIds: evidence.slice(0, 5).map((ev) => ev.eventId),
      unlocks: ['world-goal-planning', `${domain}-coordination`],
      narration: `${domainTitle(domain)}經驗被整理成可傳授、可延伸的世界技術。`,
    }))
  }
  return commands
}

function groupEvidenceByDomain(evidence: readonly WorldCivilizationEvidence[]): Map<string, WorldCivilizationEvidence[]> {
  const grouped = new Map<string, WorldCivilizationEvidence[]>()
  for (const ev of evidence) {
    if (!ev.eventId || !ev.domain) continue
    const list = grouped.get(ev.domain) ?? []
    list.push(ev)
    grouped.set(ev.domain, list)
  }
  return grouped
}

function domainTitle(domain: string): string {
  switch (domain) {
    case 'construction': return '建造'
    case 'infrastructure': return '基礎設施'
    case 'learning': return '學習'
    case 'economy': return '經濟'
    case 'ecology': return '生態'
    case 'cards': return '卡片技術'
    default: return domain
  }
}

function readEventData(payload: unknown): Record<string, unknown> | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null
  const data = (payload as { data?: unknown }).data
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null
  return data as Record<string, unknown>
}

function stringField(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function numberField(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function arrayOfStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.length > 0) : []
}

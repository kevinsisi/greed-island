import type { WorldCivilizationSnapshot } from '../../state/types'

export type WorldCivilizationPanelSummary = Readonly<{
  activeGoalCount: number
  completedGoalCount: number
  technologyCount: number
  topGoals: readonly {
    goalId: string
    title: string
    domain: string
    progressPct: number
    completed: boolean
  }[]
  recentTechnologies: readonly {
    techId: string
    title: string
    domain: string
    evidenceCount: number
  }[]
}>

export function summarizeWorldCivilizationPanel(
  snapshot: WorldCivilizationSnapshot | null | undefined,
  limit = 3
): WorldCivilizationPanelSummary {
  const goals = snapshot?.goals ?? []
  const technologies = snapshot?.technologies ?? []
  const topGoals = [...goals]
    .sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1
      const aPct = progressPct(a.progress, a.targetProgress)
      const bPct = progressPct(b.progress, b.targetProgress)
      return bPct - aPct || b.declaredAtTick - a.declaredAtTick || a.goalId.localeCompare(b.goalId)
    })
    .slice(0, limit)
    .map((goal) => ({
      goalId: goal.goalId,
      title: goal.title,
      domain: goal.domain,
      progressPct: progressPct(goal.progress, goal.targetProgress),
      completed: goal.completed,
    }))

  const recentTechnologies = [...technologies]
    .sort((a, b) => b.discoveredAtTick - a.discoveredAtTick || a.techId.localeCompare(b.techId))
    .slice(0, limit)
    .map((tech) => ({
      techId: tech.techId,
      title: tech.title,
      domain: tech.domain,
      evidenceCount: tech.evidenceEventIds.length,
    }))

  return {
    activeGoalCount: goals.filter((goal) => !goal.completed).length,
    completedGoalCount: goals.filter((goal) => goal.completed).length,
    technologyCount: technologies.length,
    topGoals,
    recentTechnologies,
  }
}

function progressPct(progress: number, target: number): number {
  if (!Number.isFinite(progress) || !Number.isFinite(target) || target <= 0) return 0
  return Math.max(0, Math.min(100, Math.round((progress / target) * 100)))
}

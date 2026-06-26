import { describe, expect, it } from 'vitest'
import { summarizeWorldCivilizationPanel } from './worldCivilizationPanelData'

const snapshot = {
  goals: [
    {
      goalId: 'goal.learning.old',
      domain: 'learning',
      title: '學習知識體系',
      rationale: '師徒事件累積。',
      targetProgress: 100,
      progress: 25,
      declaredAtTick: 10,
      completed: false,
      completedAtTick: null,
    },
    {
      goalId: 'goal.construction.new',
      domain: 'construction',
      title: '建造知識體系',
      rationale: '建造事件累積。',
      targetProgress: 100,
      progress: 80,
      declaredAtTick: 20,
      completed: false,
      completedAtTick: null,
    },
    {
      goalId: 'goal.economy.done',
      domain: 'economy',
      title: '經濟知識體系',
      rationale: '交易事件累積。',
      targetProgress: 100,
      progress: 100,
      declaredAtTick: 5,
      completed: true,
      completedAtTick: 30,
    },
  ],
  technologies: [
    {
      techId: 'tech.learning.knowledge-system',
      domain: 'learning',
      title: '學習知識體系',
      discoveredAtTick: 12,
      evidenceEventIds: ['ev1', 'ev2', 'ev3'],
      unlocks: ['learning-coordination'],
    },
    {
      techId: 'tech.construction.knowledge-system',
      domain: 'construction',
      title: '建造知識體系',
      discoveredAtTick: 22,
      evidenceEventIds: ['ev4', 'ev5', 'ev6', 'ev7'],
      unlocks: ['construction-coordination'],
    },
  ],
} as const

describe('summarizeWorldCivilizationPanel', () => {
  it('prioritizes active high-progress goals and recent technologies for Hub display', () => {
    const summary = summarizeWorldCivilizationPanel(snapshot, 2)

    expect(summary.activeGoalCount).toBe(2)
    expect(summary.completedGoalCount).toBe(1)
    expect(summary.technologyCount).toBe(2)
    expect(summary.topGoals.map((goal) => goal.goalId)).toEqual([
      'goal.construction.new',
      'goal.learning.old',
    ])
    expect(summary.topGoals[0]!.progressPct).toBe(80)
    expect(summary.recentTechnologies.map((tech) => tech.techId)).toEqual([
      'tech.construction.knowledge-system',
      'tech.learning.knowledge-system',
    ])
    expect(summary.recentTechnologies[0]!.evidenceCount).toBe(4)
  })

  it('returns an empty stable summary before the world forms civilization facts', () => {
    expect(summarizeWorldCivilizationPanel(null)).toEqual({
      activeGoalCount: 0,
      completedGoalCount: 0,
      technologyCount: 0,
      topGoals: [],
      recentTechnologies: [],
    })
  })
})

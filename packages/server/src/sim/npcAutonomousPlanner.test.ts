import { describe, expect, it } from 'vitest'
import { planNpcAutonomousDecision, type NpcAutonomousPlannerInput } from './npcAutonomousPlanner.js'

function input(overrides: Partial<NpcAutonomousPlannerInput> = {}): NpcAutonomousPlannerInput {
  return {
    npcId: 'npc.planner.test',
    npcNameZh: '潮策',
    currentTile: 't_central',
    defaultTile: 't_central',
    currentTick: 120,
    threshold: 30,
    needs: { food: 12, rest: 14, money: 18, housing: 20, safety: 10 },
    lifeGoal: { kind: 'earn_money', pressure: 20, narration: '賺到下一筆穩定收入' },
    intentEntries: [],
    currentOverride: null,
    adjacentTiles: ['t_forest', 't_dock', 't_ruin'],
    tileScores: {
      t_central: { safety: 40, economy: 55 },
      t_forest: { safety: 80, economy: 40 },
      t_dock: { safety: 50, economy: 90 },
      t_ruin: { safety: 20, economy: 35 },
    },
    tileNames: {
      t_central: '夜潮區',
      t_forest: '潮見丘',
      t_dock: '碼頭區',
      t_ruin: '鏽灣區',
    },
    ...overrides,
  }
}

describe('planNpcAutonomousDecision', () => {
  it('is deterministic for identical inputs', () => {
    const args = input({ needs: { food: 80, rest: 14, money: 18, housing: 20, safety: 10 } })

    expect(planNpcAutonomousDecision(args)).toEqual(planNpcAutonomousDecision(args))
  })

  it('chooses the highest-priority server intent entry before local needs', () => {
    const decision = planNpcAutonomousDecision(input({
      needs: { food: 80, rest: 14, money: 18, housing: 20, safety: 10 },
      intentEntries: [{ kind: 'survival', urgency: 95, targetTile: 't_forest', reason: 'danger' }],
    }))

    expect(decision.chosenIntent).toBe('survival')
    expect(decision.targetTile).toBe('t_forest')
    expect(decision.reason).toContain('潮見丘')
    expect(decision.reason).not.toContain('household.')
  })

  it('turns need pressure into a concrete short-horizon plan', () => {
    const decision = planNpcAutonomousDecision(input({
      needs: { food: 12, rest: 14, money: 82, housing: 20, safety: 10 },
    }))

    expect(decision.chosenIntent).toBe('economic')
    expect(decision.targetTile).toBe('t_dock')
    expect(decision.narration).toContain('潮策')
    expect(decision.narration).toContain('碼頭區')
  })

  it('falls back to schedule when no pressure clears the threshold', () => {
    const decision = planNpcAutonomousDecision(input())

    expect(decision.chosenIntent).toBe('follow_schedule')
    expect(decision.targetTile).toBeNull()
    expect(decision.urgency).toBe(0)
  })

  it('lets cognition make different personalities choose different plans under equal pressure', () => {
    const common = input({
      needs: { food: 12, rest: 14, money: 70, housing: 20, safety: 70 },
      lifeGoal: { kind: 'earn_money', pressure: 20, narration: '賺到下一筆穩定收入' },
    })

    const greedy = planNpcAutonomousDecision({
      ...common,
      cognitive: {
        survivalBias: 0.82,
        economicBias: 1.45,
        socialBias: 1,
        ecosystemBias: 1,
        patienceBias: 0.9,
        dominantTrait: 'economic',
        thoughtZh: '潮策正在盤算生計、資源與下一個機會。',
        thoughtEn: 'Chao Ce is weighing livelihood, resources, and opportunity.',
      },
    })
    const cautious = planNpcAutonomousDecision({
      ...common,
      cognitive: {
        survivalBias: 1.45,
        economicBias: 0.82,
        socialBias: 1,
        ecosystemBias: 1,
        patienceBias: 1.2,
        dominantTrait: 'survival',
        thoughtZh: '潮策先把安全與退路排在第一位。',
        thoughtEn: 'Chao Ce puts safety and escape routes first.',
      },
    })

    expect(greedy.chosenIntent).toBe('economic')
    expect(greedy.targetTile).toBe('t_dock')
    expect(greedy.reason).toContain('cognitive:economic')
    expect(cautious.chosenIntent).toBe('survival')
    expect(cautious.targetTile).toBe('t_forest')
    expect(cautious.reason).toContain('cognitive:survival')
  })

})

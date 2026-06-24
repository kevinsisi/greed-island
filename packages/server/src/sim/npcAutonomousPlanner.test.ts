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
})

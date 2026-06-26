import { describe, expect, it } from 'vitest'
import { planNpcWorldLawAction, type NpcWorldLawActionPlannerInput } from './npcWorldLawActionPlanner.js'

function input(overrides: Partial<NpcWorldLawActionPlannerInput> = {}): NpcWorldLawActionPlannerInput {
  return {
    npcId: 'npc.worldlaw.test',
    npcNameZh: '潮策',
    roleZh: '鍛造師',
    currentTile: 't_central',
    defaultTile: 't_central',
    currentTick: 240,
    threshold: 30,
    needs: { food: 12, rest: 14, money: 82, housing: 20, safety: 10 },
    lifeGoal: { kind: 'earn_money', pressure: 61, narration: '累積買卡資金' },
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
    cognitive: {
      survivalBias: 0.9,
      economicBias: 1.35,
      socialBias: 0.95,
      ecosystemBias: 0.8,
      patienceBias: 0.7,
      dominantTrait: 'economic',
      thoughtZh: '潮策記得最近發生的事，正在盤算生計、資源與下一個機會。',
      thoughtEn: 'Chao Ce remembers recent events and weighs livelihood.',
    },
    memoryContext: '昨夜碼頭區有人缺修工具，報酬比夜潮區高。',
    ...overrides,
  }
}

describe('planNpcWorldLawAction', () => {
  it('turns pressure into a concrete accepted freeform action instead of a generic intent label', () => {
    const action = planNpcWorldLawAction(input())

    expect(action).not.toBeNull()
    expect(action?.accepted).toBe(true)
    expect(action?.resolved.kind).toBe('work')
    expect(action?.resolved.targetTile).toBe('t_dock')
    expect(action?.proposal.action).toContain('鍛造師')
    expect(action?.proposal.reason).toContain('買卡資金')
    expect(action?.proposal.reason).toContain('碼頭區')
    expect(action?.proposal.risk.length).toBeGreaterThan(0)
    expect(action?.resolved.summary).not.toContain('生計與資源')
  })

  it('lets different personalities choose different concrete actions under equal pressure', () => {
    const common = input({
      needs: { food: 12, rest: 14, money: 70, housing: 20, safety: 70 },
      lifeGoal: { kind: 'earn_money', pressure: 55, narration: '補足家中儲備' },
    })

    const greedy = planNpcWorldLawAction(common)
    const cautious = planNpcWorldLawAction({
      ...common,
      cognitive: {
        survivalBias: 1.45,
        economicBias: 0.82,
        socialBias: 1,
        ecosystemBias: 1,
        patienceBias: 1.2,
        dominantTrait: 'survival',
        thoughtZh: '潮策先把安全與退路排在第一位。',
        thoughtEn: 'Chao Ce puts safety first.',
      },
    })

    expect(greedy?.resolved.kind).toBe('work')
    expect(greedy?.resolved.targetTile).toBe('t_dock')
    expect(cautious?.resolved.kind).toBe('travel')
    expect(cautious?.resolved.targetTile).toBe('t_forest')
    expect(cautious?.proposal.action).toContain('避開')
  })

  it('stays quiet when no world pressure crosses the threshold', () => {
    const action = planNpcWorldLawAction(input({
      needs: { food: 12, rest: 14, money: 18, housing: 20, safety: 10 },
      lifeGoal: { kind: 'earn_money', pressure: 20, narration: '慢慢存錢' },
      memoryContext: '',
      cognitive: null,
    }))

    expect(action).toBeNull()
  })
})

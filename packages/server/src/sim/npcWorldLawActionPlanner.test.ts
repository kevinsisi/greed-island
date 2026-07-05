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

  it('renders player-facing narration as world events instead of explaining scheduler agency', () => {
    const buildAction = planNpcWorldLawAction(input({
      needs: { food: 12, rest: 14, money: 20, housing: 88, safety: 10 },
      lifeGoal: { kind: 'build_city', pressure: 85, narration: '整理公共空間' },
      cognitive: { ...input().cognitive!, dominantTrait: 'steady' },
    }))
    const socialAction = planNpcWorldLawAction(input({
      lifeGoal: { kind: 'form_family', pressure: 90, narration: '建立可靠的人情網' },
      cognitive: { ...input().cognitive!, dominantTrait: 'social' },
    }))

    expect(buildAction?.narration).toContain('查看')
    expect(buildAction?.narration).toContain('公共空間')
    expect(socialAction?.narration).toContain('交換近況')
    expect(socialAction?.narration).toContain('人情')
    expect(buildAction?.narration).not.toContain('不是被排程')
    expect(socialAction?.narration).not.toContain('不是被排程')
  })

  it('turns food pressure into concrete shopping and procurement instead of more construction', () => {
    const action = planNpcWorldLawAction(input({
      roleZh: '料理人',
      needs: { food: 91, rest: 14, money: 32, housing: 20, safety: 10 },
      lifeGoal: { kind: 'eat', pressure: 91, narration: '替今晚備齊食材' },
      cognitive: { ...input().cognitive!, dominantTrait: 'steady' },
    }))

    expect(action?.resolved.kind).toBe('buy_goods')
    expect(action?.resolved.targetTile).toBe('t_dock')
    expect(action?.proposal.action).toContain('採買')
    expect(action?.proposal.reason).toContain('食物')
    expect(action?.narration).toContain('採買')
    expect(action?.narration).not.toContain('公共空間')
  })

  it('turns learning goals into concrete study or apprenticeship actions', () => {
    const action = planNpcWorldLawAction(input({
      roleZh: '學徒',
      needs: { food: 22, rest: 14, money: 18, housing: 20, safety: 10 },
      lifeGoal: { kind: 'learn_skill', pressure: 88, narration: '學會修理潮汐儀' },
      cognitive: { ...input().cognitive!, dominantTrait: 'steady' },
    }))

    expect(action?.resolved.kind).toBe('learn')
    expect(action?.proposal.action).toContain('學習')
    expect(action?.proposal.reason).toContain('學會修理潮汐儀')
    expect(action?.narration).toContain('請教')
  })

  it('lets patient knowledge-heavy NPCs propose experiments and ideas', () => {
    const action = planNpcWorldLawAction(input({
      roleZh: '發明家',
      needs: { food: 18, rest: 14, money: 20, housing: 22, safety: 10 },
      lifeGoal: { kind: 'learn_skill', pressure: 72, narration: '想出新的抽水裝置' },
      cognitive: {
        survivalBias: 0.7,
        economicBias: 0.85,
        socialBias: 0.75,
        ecosystemBias: 0.9,
        patienceBias: 1.55,
        dominantTrait: 'steady',
        thoughtZh: '潮策想先把零散觀察變成可測試的點子。',
        thoughtEn: 'Chao Ce wants to turn observations into a testable idea.',
      },
    }))

    expect(action?.resolved.kind).toBe('invent')
    expect(action?.proposal.action).toContain('發想')
    expect(action?.proposal.expectedOutcome).toContain('原型')
    expect(action?.narration).toContain('草圖')
  })

  it('turns relationship caution pressure into a concrete warning action', () => {
    const action = planNpcWorldLawAction(input({
      needs: { food: 12, rest: 14, money: 18, housing: 20, safety: 10 },
      lifeGoal: { kind: 'earn_money', pressure: 20, narration: '慢慢存錢' },
      memoryContext: '',
      intentEntries: [{ kind: 'social', urgency: 76, targetTile: 't_central', reason: 'player_relationship_caution resentment=82 minTrust=18 interactions=5' }],
    }))

    expect(action?.resolved.kind).toBe('spread_rumor')
    expect(action?.resolved.targetTile).toBe('t_central')
    expect(action?.proposal.action).toContain('提醒')
    expect(action?.proposal.reason).toContain('玩家關係')
    expect(action?.proposal.utterance).toContain('別太靠近')
  })

  it('turns relationship affinity pressure into a concrete social approach action', () => {
    const action = planNpcWorldLawAction(input({
      needs: { food: 12, rest: 14, money: 18, housing: 20, safety: 10 },
      lifeGoal: { kind: 'earn_money', pressure: 20, narration: '慢慢存錢' },
      memoryContext: '',
      intentEntries: [{ kind: 'social', urgency: 61, targetTile: 't_central', reason: 'player_relationship_affinity trust=86 affinity=42 familiarity=9 positives=7' }],
    }))

    expect(action?.resolved.kind).toBe('custom_social_scene')
    expect(action?.resolved.targetTile).toBe('t_central')
    expect(action?.proposal.action).toContain('主動')
    expect(action?.proposal.reason).toContain('親近')
    expect(action?.proposal.utterance).toContain('聊一下')
  })

  it('turns relationship reciprocity pressure into a concrete trade-work action', () => {
    const action = planNpcWorldLawAction(input({
      needs: { food: 12, rest: 14, money: 18, housing: 20, safety: 10 },
      lifeGoal: { kind: 'earn_money', pressure: 20, narration: '慢慢存錢' },
      memoryContext: '',
      intentEntries: [{ kind: 'economic', urgency: 66, targetTile: 't_dock', reason: 'player_relationship_reciprocity trust=78 trades=3 affinity=28' }],
    }))

    expect(action?.resolved.kind).toBe('work')
    expect(action?.resolved.targetTile).toBe('t_dock')
    expect(action?.proposal.action).toContain('留一手')
    expect(action?.proposal.reason).toContain('交易互惠')
    expect(action?.proposal.utterance).toContain('留給熟客')
  })

  it('rotates away from recently repeated actions when pressure is not critical', () => {
    const action = planNpcWorldLawAction(input({
      recentActionKinds: ['work', 'buy_goods'],
    }))

    expect(action?.resolved.kind).not.toBe('work')
    expect(action?.resolved.kind).not.toBe('buy_goods')
    expect(['learn', 'build', 'rest', 'travel']).toContain(action?.resolved.kind)
    expect(action?.proposal.reason).toContain('買卡資金')
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

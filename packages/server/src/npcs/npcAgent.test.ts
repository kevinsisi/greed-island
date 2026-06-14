import { describe, expect, it } from 'vitest'
import {
  buildAgentOptions,
  buildAgentPrompt,
  buildFreeformAgentPrompt,
  parseAgentDecision,
  parseFreeformAgentProposal,
  resolveFreeformAgentProposal,
} from './npcAgent.js'
import type { IntentEntry } from '../sim/intentPlanner.js'
import type { NpcProfile } from './types.js'

function profile(): NpcProfile {
  return {
    id: 'npc.smith',
    name: { zh: '鐵匠', en: 'Smith' },
    role: { zh: '鍛造師', en: 'Blacksmith' },
    defaultLocation: 't_central',
    routine: [],
    triggers: [],
    memory: { consultsEventTypes: [], decayFn: 'none', decayParam: 0 },
    personality: {},
  }
}

const ENTRIES: IntentEntry[] = [
  { kind: 'survival', urgency: 62, targetTile: 't_dock', reason: 'tile t_central tile_safety=dangerous conf=70' },
  { kind: 'economic', urgency: 41, targetTile: 't_forest', reason: 'goods_scarcity=fish scarce conf=58' },
]

describe('buildAgentOptions', () => {
  it('always lists follow_schedule first, then stack entries with server urgency', () => {
    const options = buildAgentOptions(ENTRIES)
    expect(options).toHaveLength(3)
    expect(options[0]!.kind).toBe('follow_schedule')
    expect(options[0]!.targetTile).toBeNull()
    expect(options[1]).toMatchObject({ kind: 'survival', targetTile: 't_dock', urgency: 62 })
    expect(options[2]).toMatchObject({ kind: 'economic', targetTile: 't_forest', urgency: 41 })
  })
})

describe('buildAgentPrompt', () => {
  it('embeds identity, options, and the strict JSON instruction', () => {
    const { systemPrompt, userPrompt } = buildAgentPrompt({
      profile: profile(),
      currentTile: 't_central',
      needsLine: '食物壓力 70',
      lifeGoalContext: '### 你目前的人生目標\n  · 增加收入',
      beliefContext: '',
      reflectionContext: '',
      options: buildAgentOptions(ENTRIES),
      worldTick: 1000,
    })
    expect(systemPrompt).toContain('鐵匠')
    expect(systemPrompt).toContain('0. 照常生活')
    expect(systemPrompt).toContain('1. 生存')
    expect(systemPrompt).toContain('"choice"')
    expect(systemPrompt).toContain('人生目標')
    expect(userPrompt).toContain('1000')
  })
})

describe('parseAgentDecision', () => {
  it('parses a well-formed reply', () => {
    const decision = parseAgentDecision(
      '{"choice": 1, "reason": "碼頭比較安全", "utterance": "這裡不能再待了。"}',
      3
    )
    expect(decision).toEqual({ optionIndex: 1, reason: '碼頭比較安全', utterance: '這裡不能再待了。' })
  })

  it('tolerates surrounding prose and string choice', () => {
    const decision = parseAgentDecision('好的：{"choice": "2", "reason": "去找魚"} 結束', 3)
    expect(decision?.optionIndex).toBe(2)
    expect(decision?.utterance).toBeNull()
  })

  it('rejects out-of-range choices and garbage', () => {
    expect(parseAgentDecision('{"choice": 9, "reason": "x"}', 3)).toBeNull()
    expect(parseAgentDecision('{"choice": -1, "reason": "x"}', 3)).toBeNull()
    expect(parseAgentDecision('not json at all', 3)).toBeNull()
  })

  it('truncates runaway utterances and strips newlines', () => {
    const long = '我'.repeat(200)
    const decision = parseAgentDecision(`{"choice": 0, "reason": "ok", "utterance": "${long}\\n第二行"}`, 3)
    expect(decision?.utterance).not.toContain('\n')
    expect((decision?.utterance ?? '').length).toBeLessThanOrEqual(60)
  })
})

describe('freeform NPC agent proposals', () => {
  it('builds a persona prompt that asks for freeform action JSON', () => {
    const { systemPrompt, userPrompt } = buildFreeformAgentPrompt({
      profile: {
        ...profile(),
        personality: { greed: 0.9, patience: 0.2, safetyWeight: 0.4 },
      },
      currentTile: 't_central',
      needsLine: '金錢 80、安全 20',
      lifeGoalContext: '### 你目前的人生目標\n  · 收集指定卡',
      beliefContext: '### 你的信念\n  · 碼頭有人欠你錢',
      reflectionContext: '',
      worldTick: 123,
    })
    expect(systemPrompt).toContain('自由創造任意生活行為')
    expect(systemPrompt).toContain('貪婪 0.9')
    expect(systemPrompt).toContain('build')
    expect(systemPrompt).toContain('buy_card')
    expect(systemPrompt).toContain('"action"')
    expect(userPrompt).toContain('123')
  })

  it('parses and resolves a creative valid proposal', () => {
    const proposal = parseFreeformAgentProposal(JSON.stringify({
      action: 'socialize',
      target: { tileId: null, npcId: 'npc.friend', cardId: null },
      reason: '我想去找朋友借錢買卡',
      risk: '可能被拒絕',
      expectedOutcome: '得到下一步線索',
      utterance: '先去找他談談。',
    }))
    expect(proposal).not.toBeNull()
    const resolution = resolveFreeformAgentProposal(proposal!, {
      currentTile: 't_central',
      defaultTile: 't_central',
      livingNpcIds: new Set(['npc.friend']),
      getNpcTile: () => 't_dock',
    })
    expect(resolution.accepted).toBe(true)
    expect(resolution.resolved).toMatchObject({ kind: 'socialize', targetNpcId: 'npc.friend', targetTile: 't_dock' })
  })

  it('accepts build as a first-class freeform action', () => {
    const proposal = parseFreeformAgentProposal(JSON.stringify({
      action: 'build',
      target: { tileId: 't_central', npcId: null, cardId: null },
      reason: '我想替街區開一處新的公共建案',
      risk: '材料不一定夠',
      expectedOutcome: '讓大家有更穩的落腳處',
      utterance: '先把地基量出來。',
    }))
    expect(proposal).not.toBeNull()
    const resolution = resolveFreeformAgentProposal(proposal!, {
      currentTile: 't_central',
      defaultTile: 't_central',
      livingNpcIds: new Set(),
      getNpcTile: () => null,
    })
    expect(resolution.accepted).toBe(true)
    expect(resolution.resolved).toMatchObject({ kind: 'build', targetTile: 't_central' })
  })

  it('rejects unsupported actions and unknown targets without executing them', () => {
    const proposal = parseFreeformAgentProposal('{"action":"become_god","target":{"tileId":"t_void","npcId":null,"cardId":null},"reason":"我要支配世界","risk":"無","expectedOutcome":"全都聽我的","utterance":"跪下吧。"}')
    expect(proposal).not.toBeNull()
    const resolution = resolveFreeformAgentProposal(proposal!, {
      currentTile: 't_central',
      defaultTile: 't_central',
      livingNpcIds: new Set(),
      getNpcTile: () => null,
    })
    expect(resolution.accepted).toBe(false)
    expect(resolution.rejectionReason).toContain('unsupported action')
  })
})

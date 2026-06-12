import { describe, expect, it } from 'vitest'
import { buildAgentOptions, buildAgentPrompt, parseAgentDecision } from './npcAgent.js'
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

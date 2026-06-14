import { describe, expect, it, vi } from 'vitest'
import { NpcAgentRunner } from './npcAgentRunner.js'
import type { SettingsStore } from '../http/settings.js'
import type { NpcProfile } from './types.js'

vi.mock('./aiProvider.js', () => ({
  generateWithProviders: vi.fn(async () => ({
    provider: 'opencode',
    text: JSON.stringify({
      action: 'custom_social_scene',
      target: { tileId: null, npcId: null, cardId: null },
      reason: '我想整理今天聽到的消息',
      risk: '可能浪費時間',
      expectedOutcome: '想清楚下一步',
      utterance: '先想清楚再動。',
    }),
  })),
}))

function settings(): SettingsStore {
  return {
    getSetting: (key: string) => key === 'opencode_base_url' ? 'http://opencode.test' : null,
    countActive: () => 0,
  } as unknown as SettingsStore
}

function profile(): NpcProfile {
  return {
    id: 'npc.freeform',
    name: { zh: '自由人', en: 'Freeform' },
    role: { zh: '旅人', en: 'Traveler' },
    defaultLocation: 't_central',
    routine: [],
    triggers: [],
    memory: { consultsEventTypes: [], decayFn: 'none', decayParam: 0 },
    personality: {},
  }
}

describe('NpcAgentRunner diagnostics', () => {
  it('still asks AI for a freeform proposal when deterministic intent entries are empty', async () => {
    const submitted: unknown[] = []
    const runner = new NpcAgentRunner(settings(), {
      listAgentNpcs: () => [profile()],
      getNpcTile: () => 't_central',
      computeIntentEntries: () => [],
      getNeedsLine: () => '食物壓力 20、休息 25、金錢 30、住房 35、安全 10',
      getLifeGoalContext: () => '### 你目前的人生目標\n建立穩定生活。',
      getBeliefContext: () => '',
      getReflectionContext: () => '',
      submitDecision: (input) => { submitted.push(input) },
    })

    await (runner as unknown as { deliberate: (p: NpcProfile, tick: number) => Promise<void> })
      .deliberate(profile(), 123)

    expect(submitted).toHaveLength(1)
    expect(runner.getDiagnostics()).toMatchObject({
      emptyIntentEntriesCount: 1,
      providerSuccessCount: 1,
      submitCount: 1,
    })
  })
})

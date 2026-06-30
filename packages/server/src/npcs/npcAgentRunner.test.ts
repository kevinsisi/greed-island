import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NpcAgentRunner, type NpcAgentDeps } from './npcAgentRunner.js'
import { generateWithProviders } from './aiProvider.js'
import type { SettingsStore } from '../http/settings.js'
import type { NpcProfile } from './types.js'
import { NPC_AGENT_DECISION_INTERVAL_TICKS } from '../config/world.js'

vi.mock('./aiProvider.js', () => ({
  generateWithProviders: vi.fn(),
  AiUnavailableError: class AiUnavailableError extends Error {},
}))

const mockedGenerate = vi.mocked(generateWithProviders)

const VALID_RESPONSE = {
  provider: 'opencode' as const,
  text: JSON.stringify({
    action: 'custom_social_scene',
    target: { tileId: null, npcId: null, cardId: null },
    reason: '我想整理今天聽到的消息',
    risk: '可能浪費時間',
    expectedOutcome: '想清楚下一步',
    utterance: '先想清楚再動。',
  }),
}

/** settings：enabled（countActive>0 滿足 provider 閘門），retry base 0（測試免等待），可加 override。 */
function settings(overrides: Record<string, string> = {}): SettingsStore {
  const map: Record<string, string> = { npc_agent_retry_base_ms: '0', ...overrides }
  return {
    getSetting: (key: string) => (key in map ? map[key] : key === 'opencode_base_url' ? 'http://opencode.test' : null),
    countActive: () => 1,
  } as unknown as SettingsStore
}

function profile(id: string): NpcProfile {
  return {
    id,
    name: { zh: '自由人', en: 'Freeform' },
    role: { zh: '旅人', en: 'Traveler' },
    defaultLocation: 't_central',
    routine: [],
    triggers: [],
    memory: { consultsEventTypes: [], decayFn: 'none', decayParam: 0 },
    personality: {},
  }
}

function makeDeps(profiles: NpcProfile[], submitted: string[]): NpcAgentDeps {
  return {
    listAgentNpcs: () => profiles,
    getNpcTile: () => 't_central',
    computeIntentEntries: () => [],
    getNeedsLine: () => '食物壓力 20、休息 25、金錢 30、住房 35、安全 10',
    getLifeGoalContext: () => '',
    getBeliefContext: () => '',
    getReflectionContext: () => '',
    submitDecision: (input) => { submitted.push(input.profile.id) },
  }
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

beforeEach(() => {
  mockedGenerate.mockReset()
  mockedGenerate.mockResolvedValue(VALID_RESPONSE as never)
})

describe('NpcAgentRunner diagnostics', () => {
  it('still asks AI for a freeform proposal when deterministic intent entries are empty', async () => {
    const submitted: string[] = []
    const runner = new NpcAgentRunner(settings(), makeDeps([profile('npc.freeform')], submitted))
    await (runner as unknown as { deliberate: (p: NpcProfile, tick: number) => Promise<void> })
      .deliberate(profile('npc.freeform'), 123)
    expect(submitted).toHaveLength(1)
    expect(runner.getDiagnostics()).toMatchObject({
      emptyIntentEntriesCount: 1,
      providerSuccessCount: 1,
      submitCount: 1,
    })
  })
})

describe('NpcAgentRunner scheduling (staleness + global cap)', () => {
  const I = NPC_AGENT_DECISION_INTERVAL_TICKS

  it('全域每 tick 硬上限：上限 1 時多個合格 NPC 單 tick 僅 1 次出題', async () => {
    const submitted: string[] = []
    const runner = new NpcAgentRunner(
      settings({ npc_agent_max_per_tick: '1' }),
      makeDeps([profile('npc.a'), profile('npc.b'), profile('npc.c')], submitted)
    )
    runner.tick(I) // 全部從未思考 → 全合格
    await flush()
    expect(mockedGenerate).toHaveBeenCalledTimes(1)
    expect(submitted).toHaveLength(1)
  })

  it('成本上限不隨 NPC 數量增長：上限 2 時不論幾個合格都最多 2 次', async () => {
    const submitted: string[] = []
    const many = Array.from({ length: 20 }, (_, i) => profile(`npc.${i}`))
    const runner = new NpcAgentRunner(settings({ npc_agent_max_per_tick: '2' }), makeDeps(many, submitted))
    runner.tick(I)
    await flush()
    expect(mockedGenerate).toHaveBeenCalledTimes(2)
  })

  it('最久沒思考者優先：被略過的 NPC 於下一合格 tick 先被選', async () => {
    const submitted: string[] = []
    const runner = new NpcAgentRunner(
      settings({ npc_agent_max_per_tick: '1' }),
      makeDeps([profile('npc.a'), profile('npc.b')], submitted)
    )
    runner.tick(I)        // 兩者皆 ∞ stale → 取 1 個
    await flush()
    runner.tick(I + I)    // 上一個 staleness=I、另一個仍 ∞ → 選 ∞ 那個
    await flush()
    expect(submitted).toHaveLength(2)
    expect(new Set(submitted).size).toBe(2) // 兩個不同 NPC 各被選一次
  })

  it('剛出題的 NPC 在間隔未過前不被重選', async () => {
    const submitted: string[] = []
    const runner = new NpcAgentRunner(
      settings({ npc_agent_max_per_tick: '1' }),
      makeDeps([profile('npc.solo')], submitted)
    )
    runner.tick(I)
    await flush()
    runner.tick(I + 1) // 間隔未過
    await flush()
    expect(submitted).toHaveLength(1)
  })

  it('npc_agent_enabled=false 時不出題', async () => {
    const submitted: string[] = []
    const runner = new NpcAgentRunner(
      settings({ npc_agent_enabled: 'false' }),
      makeDeps([profile('npc.a')], submitted)
    )
    runner.tick(I)
    await flush()
    expect(mockedGenerate).not.toHaveBeenCalled()
  })
})

describe('NpcAgentRunner retry with backoff', () => {
  it('首次 provider 失敗、重試成功：送出 1 次決策、不記 error', async () => {
    mockedGenerate.mockReset()
    mockedGenerate
      .mockRejectedValueOnce(new Error('transient timeout'))
      .mockResolvedValue(VALID_RESPONSE as never)
    const submitted: string[] = []
    const runner = new NpcAgentRunner(settings(), makeDeps([profile('npc.retry')], submitted))
    await (runner as unknown as { deliberate: (p: NpcProfile, tick: number) => Promise<void> })
      .deliberate(profile('npc.retry'), 50)
    expect(submitted).toHaveLength(1)
    expect(runner.getDiagnostics()).toMatchObject({ submitCount: 1, errorCount: 0, providerSuccessCount: 1 })
  })

  it('重試耗盡：每次皆失敗 → 記 error、無 submit、不 throw', async () => {
    mockedGenerate.mockReset()
    mockedGenerate.mockRejectedValue(new Error('provider down'))
    const submitted: string[] = []
    const runner = new NpcAgentRunner(settings(), makeDeps([profile('npc.dead')], submitted))
    await (runner as unknown as { deliberate: (p: NpcProfile, tick: number) => Promise<void> })
      .deliberate(profile('npc.dead'), 50)
    expect(submitted).toHaveLength(0)
    const diag = runner.getDiagnostics()
    expect(diag.errorCount).toBe(1)
    expect(diag.submitCount).toBe(0)
    expect(diag.lastError?.status).toBe('error')
    // 預設 maxRetries=2 → 共 3 次嘗試
    expect(mockedGenerate).toHaveBeenCalledTimes(3)
  })

  it('非結構化 JSON 重試耗盡：記 parse_failed', async () => {
    mockedGenerate.mockReset()
    mockedGenerate.mockResolvedValue({ provider: 'opencode', text: 'not json at all' } as never)
    const submitted: string[] = []
    const runner = new NpcAgentRunner(settings(), makeDeps([profile('npc.garbled')], submitted))
    await (runner as unknown as { deliberate: (p: NpcProfile, tick: number) => Promise<void> })
      .deliberate(profile('npc.garbled'), 50)
    expect(submitted).toHaveLength(0)
    const diag = runner.getDiagnostics()
    expect(diag.parseFailureCount).toBe(1)
    expect(diag.lastError?.status).toBe('parse_failed')
    expect(mockedGenerate).toHaveBeenCalledTimes(3)
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AmbientNarrator,
  AMBIENT_BACKGROUND_REFRESH_PERIOD_TICKS,
  type AmbientContext
} from './ambientNarrator.js'
import { generateWithProviders } from '../npcs/aiProvider.js'
import type { SettingsStore } from '../http/settings.js'

vi.mock('../npcs/aiProvider.js', () => ({
  generateWithProviders: vi.fn(),
  AiUnavailableError: class AiUnavailableError extends Error {}
}))

const mockedGenerate = vi.mocked(generateWithProviders)

/** settings mock：activeKeys>0 視為已配置 provider；getSetting 全 null → isOpenCodeConfigured=false。 */
function makeSettings(activeKeys = 1): SettingsStore {
  return {
    listActiveKeys: () => (activeKeys > 0 ? new Array(activeKeys).fill({}) : []),
    getSetting: () => null
  } as unknown as SettingsStore
}

function ctxFor(tileId: string): AmbientContext {
  return {
    tileId,
    weather: '晴',
    season: '霜之月',
    presentNpcNames: [],
    presentBuildingNames: [],
    recentNarrations: [],
    areaState: null,
    worldEvents: []
  }
}

/** runtime 的 getContext：所有傳入 tile 都有效。 */
const getContext = (tileId: string): AmbientContext | null => ctxFor(tileId)

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

/** 讀第 N 次 generateWithProviders 呼叫的 userPrompt（含 undefined 防護，滿足 strict tsc）。 */
function userPromptOf(callIndex: number): string {
  const call = mockedGenerate.mock.calls[callIndex]
  if (!call) throw new Error(`no generateWithProviders call at index ${callIndex}`)
  return (call[1] as { userPrompt: string }).userPrompt
}

const PERIOD = AMBIENT_BACKGROUND_REFRESH_PERIOD_TICKS

beforeEach(() => {
  mockedGenerate.mockReset()
  mockedGenerate.mockResolvedValue({ text: '潮味的風從巷口灌進來。', provider: 'gemini' } as never)
})

describe('AmbientNarrator.backgroundRefresh', () => {
  it('無玩家在看時，跨 period 邊界後最舊 tile 仍被自主刷新', async () => {
    const narrator = new AmbientNarrator(makeSettings(1))
    narrator.backgroundRefresh(PERIOD, ['t_a', 't_b'], getContext)
    await flush()
    expect(mockedGenerate).toHaveBeenCalledTimes(1)
  })

  it('多個從未生成的 tile：挑選順序決定性（tileId 字典序最小者先）', async () => {
    const narrator = new AmbientNarrator(makeSettings(1))
    narrator.backgroundRefresh(PERIOD, ['t_c', 't_a', 't_b'], getContext)
    await flush()
    expect(mockedGenerate).toHaveBeenCalledTimes(1)
    const userPrompt = userPromptOf(0)
    expect(userPrompt).toContain('t_a')
    expect(userPrompt).not.toContain('（t_b）')
  })

  it('速率封頂：非 period 整數倍 tick 不動作', async () => {
    const narrator = new AmbientNarrator(makeSettings(1))
    narrator.backgroundRefresh(PERIOD + 1, ['t_a', 't_b'], getContext)
    await flush()
    expect(mockedGenerate).not.toHaveBeenCalled()
  })

  it('速率封頂：單一 period 內最多 1 個 tile 生成', async () => {
    const narrator = new AmbientNarrator(makeSettings(1))
    narrator.backgroundRefresh(PERIOD, ['t_a', 't_b', 't_c'], getContext)
    await flush()
    expect(mockedGenerate).toHaveBeenCalledTimes(1)
  })

  it('無 AI provider 時零成本：完全不呼叫 AI', async () => {
    const narrator = new AmbientNarrator(makeSettings(0))
    narrator.backgroundRefresh(PERIOD, ['t_a', 't_b'], getContext)
    await flush()
    expect(mockedGenerate).not.toHaveBeenCalled()
  })

  it('round-robin：刷過的 tile 下一輪讓位給較舊的 tile', async () => {
    const narrator = new AmbientNarrator(makeSettings(1))
    narrator.backgroundRefresh(PERIOD, ['t_a', 't_b'], getContext)
    await flush()
    // t_a 剛在 tick=PERIOD 生成；t_b 仍從未生成 → 下一輪應挑 t_b。
    narrator.backgroundRefresh(PERIOD * 2, ['t_a', 't_b'], getContext)
    await flush()
    expect(mockedGenerate).toHaveBeenCalledTimes(2)
    expect(userPromptOf(1)).toContain('t_b')
  })

  it('in-flight 去重：同一 tile 不會重複併發生成', async () => {
    const narrator = new AmbientNarrator(makeSettings(1))
    // 讓第一次生成永遠 pending，使 t_a 維持 in-flight。
    let resolveFirst: (() => void) | null = null
    mockedGenerate.mockImplementationOnce(
      () =>
        new Promise((res) => {
          resolveFirst = () => res({ text: 'x', provider: 'gemini' })
        }) as ReturnType<typeof generateWithProviders>
    )
    narrator.backgroundRefresh(PERIOD, ['t_a'], getContext)
    await flush()
    // 同一 tick 再呼叫一次：t_a 已 in-flight → 無候選 → 不再生成。
    narrator.backgroundRefresh(PERIOD, ['t_a'], getContext)
    await flush()
    expect(mockedGenerate).toHaveBeenCalledTimes(1)
    ;(resolveFirst as (() => void) | null)?.()
  })

  it('recent-visitor 涵蓋的 tile 由背景跳過（交給 tickRefresh）', async () => {
    const narrator = new AmbientNarrator(makeSettings(1))
    // 模擬 t_a 剛被玩家看過：getOrSchedule 會記 lastRequestedTickByTile 並啟動一次 refresh。
    narrator.getOrSchedule(ctxFor('t_a'), PERIOD)
    await flush()
    const callsAfterView = mockedGenerate.mock.calls.length // t_a 的 view-time 生成
    // 背景在同 tick：t_a 屬 recent-visitor → 應改挑 t_b。
    narrator.backgroundRefresh(PERIOD, ['t_a', 't_b'], getContext)
    await flush()
    expect(mockedGenerate.mock.calls.length - callsAfterView).toBe(1)
    expect(userPromptOf(mockedGenerate.mock.calls.length - 1)).toContain('t_b')
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderChronicle, type ChronicleContext } from './chronicleRenderer.js'
import { generateWithKeyPool } from '../npcs/geminiClient.js'
import type { SettingsStore } from '../http/settings.js'

vi.mock('../npcs/geminiClient.js', () => ({
  generateWithKeyPool: vi.fn()
}))

const mockedGenerate = vi.mocked(generateWithKeyPool)

function makeSettings(activeKeys = 1): SettingsStore {
  return { countActive: () => activeKeys } as unknown as SettingsStore
}

function makeContext(): ChronicleContext {
  return {
    sinceTick: 1,
    untilTick: 2,
    allowedNames: ['npc-a', 'npc-b'],
    events: [
      {
        tick: 2,
        eventType: 'NPC_INTERACT',
        actorId: 'npc-a',
        narration: 'npc-a 和 npc-b 在市場低聲交談。'
      }
    ],
    memories: []
  }
}

describe('chronicle AI rendering', () => {
  beforeEach(() => {
    mockedGenerate.mockReset()
  })

  it('uses grounded AI JSON when cited names are allowed', async () => {
    mockedGenerate.mockResolvedValue(JSON.stringify({
      zh: 'npc-a 和 npc-b 的交談被記入編年史。',
      en: 'npc-a and npc-b were recorded in the chronicle.',
      citedNames: ['npc-a', 'npc-b']
    }))

    const rendered = await renderChronicle({
      context: makeContext(),
      settings: makeSettings(),
      useAi: true
    })

    expect(rendered.source).toBe('ai')
    expect(rendered.textZh).toContain('npc-a')
    expect(rendered.citedNames).toEqual(['npc-a', 'npc-b'])
  })

  it('falls back when AI cites names outside the grounded context', async () => {
    mockedGenerate.mockResolvedValue(JSON.stringify({
      zh: 'npc-a、npc-b 和不存在的人一起密談。',
      en: 'npc-a, npc-b, and a stranger met.',
      citedNames: ['npc-a', 'npc-b', 'stranger']
    }))

    const rendered = await renderChronicle({
      context: makeContext(),
      settings: makeSettings(),
      useAi: true
    })

    expect(rendered.source).toBe('fallback')
    expect(rendered.aiError).toContain('outside grounded context')
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildChronicleContext, renderChronicle, type ChronicleContext } from './chronicleRenderer.js'
import { generateWithKeyPool } from '../npcs/geminiClient.js'
import type { SettingsStore } from '../http/settings.js'
import type { SqliteNpcMemoryStore } from './npcMemory.js'
import type { Event } from './types.js'

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

function makeMemory(): SqliteNpcMemoryStore {
  return { getImportant: () => [] } as unknown as SqliteNpcMemoryStore
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
    expect(rendered.aiMeta.responseMimeType).toBe('application/json')
    expect(rendered.aiMeta.attempts).toEqual([
      expect.objectContaining({ attempt: 1, ok: true, responseMimeType: 'application/json' })
    ])
  })

  it('retries transient chronicle AI failures with observable metadata', async () => {
    mockedGenerate
      .mockRejectedValueOnce(new Error('HTTP 500: overloaded'))
      .mockResolvedValueOnce(JSON.stringify({
        zh: 'npc-a 和 npc-b 的事件在重試後被寫成編年史。',
        en: 'npc-a and npc-b were chronicled after retry.',
        citedNames: ['npc-a', 'npc-b']
      }))

    const rendered = await renderChronicle({
      context: makeContext(),
      settings: makeSettings(),
      useAi: true,
      aiBackoffMs: 0
    })

    expect(rendered.source).toBe('ai')
    expect(mockedGenerate).toHaveBeenCalledTimes(2)
    expect(rendered.aiMeta.fallbackReason).toBeNull()
    expect(rendered.aiMeta.attempts).toEqual([
      expect.objectContaining({ attempt: 1, ok: false, error: 'HTTP 500: overloaded' }),
      expect.objectContaining({ attempt: 2, ok: true, error: null })
    ])
  })

  it('falls back with timeout metadata when chronicle AI hangs', async () => {
    mockedGenerate.mockReturnValue(new Promise(() => undefined))

    const rendered = await renderChronicle({
      context: makeContext(),
      settings: makeSettings(),
      useAi: true,
      aiTimeoutMs: 1,
      aiMaxAttempts: 1,
      aiBackoffMs: 0
    })

    expect(rendered.source).toBe('fallback')
    expect(rendered.aiError).toContain('timed out')
    expect(rendered.aiMeta.fallbackReason).toContain('timed out')
    expect(rendered.aiMeta.attempts).toEqual([
      expect.objectContaining({ attempt: 1, timeoutMs: 1, ok: false })
    ])
  })

  it('falls back after retryable failures exhaust max attempts', async () => {
    mockedGenerate
      .mockRejectedValueOnce(new Error('HTTP 500: overloaded'))
      .mockRejectedValueOnce(new Error('HTTP 503: unavailable'))

    const rendered = await renderChronicle({
      context: makeContext(),
      settings: makeSettings(),
      useAi: true,
      aiMaxAttempts: 2,
      aiBackoffMs: 0
    })

    expect(rendered.source).toBe('fallback')
    expect(rendered.aiError).toBe('HTTP 503: unavailable')
    expect(mockedGenerate).toHaveBeenCalledTimes(2)
    expect(rendered.aiMeta.attempts).toEqual([
      expect.objectContaining({ attempt: 1, ok: false, error: 'HTTP 500: overloaded' }),
      expect.objectContaining({ attempt: 2, ok: false, error: 'HTTP 503: unavailable' })
    ])
  })

  it('does not retry non-transient chronicle AI failures', async () => {
    mockedGenerate.mockRejectedValue(new Error('HTTP 400: bad request'))

    const rendered = await renderChronicle({
      context: makeContext(),
      settings: makeSettings(),
      useAi: true,
      aiMaxAttempts: 3,
      aiBackoffMs: 0
    })

    expect(rendered.source).toBe('fallback')
    expect(rendered.aiError).toBe('HTTP 400: bad request')
    expect(mockedGenerate).toHaveBeenCalledTimes(1)
    expect(rendered.aiMeta.attempts).toEqual([
      expect.objectContaining({ attempt: 1, ok: false, error: 'HTTP 400: bad request' })
    ])
  })

  it('skips AI cleanly when no active keys are configured', async () => {
    const rendered = await renderChronicle({
      context: makeContext(),
      settings: makeSettings(0),
      useAi: true
    })

    expect(rendered.source).toBe('fallback')
    expect(mockedGenerate).not.toHaveBeenCalled()
    expect(rendered.aiMeta).toEqual(expect.objectContaining({
      requested: true,
      activeKeys: 0,
      fallbackReason: 'No active Gemini API keys configured.',
      attempts: []
    }))
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
    expect(rendered.aiMeta.fallbackReason).toContain('outside grounded context')
  })

  it('excludes internal FACT_SET events from chronicle context', () => {
    const events = [
      {
        eventType: 'FACT_SET',
        actorId: 'system',
        tick: 1,
        payload: {},
        eventId: 'fact',
        sequence: 1,
        occurredAt: 1
      },
      {
        eventType: 'WORLD_TICK',
        actorId: 'system',
        tick: 2,
        payload: { actorType: 'system', data: { tick: 2 }, narration: null },
        eventId: 'tick',
        sequence: 2,
        occurredAt: 2
      }
    ] as unknown as Event[]

    const context = buildChronicleContext({ events, memory: makeMemory() })

    expect(context.events).toHaveLength(1)
    expect(context.events[0]!.eventType).toBe('WORLD_TICK')
  })

  it('adds actor display names to allowedNames', () => {
    const events = [
      {
        eventType: 'NPC_INTERACT',
        actorId: 'npc-a',
        tick: 3,
        payload: {
          actorType: 'npc',
          data: { tile: 't_market', participants: ['npc-a', 'npc-b'], mode: 'chat', narration: '...' },
          narration: '莊婉容和阿七在市場交換消息。'
        },
        eventId: 'interact',
        sequence: 3,
        occurredAt: 3
      }
    ] as unknown as Event[]

    const context = buildChronicleContext({
      events,
      memory: makeMemory(),
      actorNames: { 'npc-a': '莊婉容', 'npc-b': '阿七' }
    })

    expect(context.allowedNames).toContain('npc-a')
    expect(context.allowedNames).toContain('莊婉容')
  })

  it('keeps typed world events in chronicle context', () => {
    const events = [
      {
        eventType: 'WORLD_EVENT_SPAWN',
        actorId: 'system',
        tick: 4,
        payload: {
          actorType: 'system',
          data: {
            worldEventId: 'we-1',
            templateId: 'weather.tide',
            type: 'weather',
            scope: 'world',
            endsAtTick: 9,
            narration: '潮汐異兆浮現。',
            data: {}
          },
          narration: '潮汐異兆浮現。'
        },
        eventId: 'world-event',
        sequence: 4,
        occurredAt: 4
      }
    ] as unknown as Event[]

    const context = buildChronicleContext({ events, memory: makeMemory() })

    expect(context.events).toHaveLength(1)
    expect(context.events[0]!.eventType).toBe('WORLD_EVENT_SPAWN')
  })
})

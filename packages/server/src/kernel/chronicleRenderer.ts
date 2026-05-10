// Grounded chronicle rendering. The context is built only from committed
// EventLog rows and NPC memory projection rows. AI can render text, but cannot
// create facts; invalid or ungrounded AI output falls back to deterministic text.

import { generateWithKeyPool } from '../npcs/geminiClient.js'
import type { SettingsStore } from '../http/settings.js'
import type { Event } from './types.js'
import type { SqliteNpcMemoryStore } from './npcMemory.js'
import type { LivingWorldEventPayload } from './livingWorldCommands.js'

export type ChronicleEvent = Readonly<{
  tick: number
  eventType: string
  actorId: string
  narration: string | null
}>

export type ChronicleMemorySnippet = Readonly<{
  npcId: string
  tick: number
  memoryType: string
  importance: number
  content: Record<string, unknown>
}>

export type ChronicleContext = Readonly<{
  sinceTick: number
  untilTick: number
  events: readonly ChronicleEvent[]
  memories: readonly ChronicleMemorySnippet[]
  allowedNames: readonly string[]
}>

export type ChronicleRender = Readonly<{
  source: 'ai' | 'fallback'
  textZh: string
  textEn: string
  citedNames: readonly string[]
  aiError: string | null
  context: ChronicleContext
}>

type AiChronicleResponse = Readonly<{
  zh?: unknown
  en?: unknown
  citedNames?: unknown
}>

export function buildChronicleContext(input: {
  events: readonly Event[]
  memory: SqliteNpcMemoryStore
  maxMemories?: number
}): ChronicleContext {
  const normalizedEvents = input.events
    .map(eventToChronicleEvent)
    .filter((event): event is ChronicleEvent => event !== null)
  const sinceTick = normalizedEvents[0]?.tick ?? 0
  const untilTick = normalizedEvents[normalizedEvents.length - 1]?.tick ?? sinceTick
  const actorIds = [...new Set(normalizedEvents.map((e) => e.actorId).filter(Boolean))].sort()
  const maxMemories = Math.max(0, Math.min(20, input.maxMemories ?? 12))
  const memories: ChronicleMemorySnippet[] = []
  for (const npcId of actorIds) {
    if (memories.length >= maxMemories) break
    for (const row of input.memory.getImportant(npcId, 5, 3)) {
      memories.push({
        npcId,
        tick: row.tick,
        memoryType: row.memoryType,
        importance: row.importance,
        content: row.content
      })
      if (memories.length >= maxMemories) break
    }
  }
  const memoryNames = memories.flatMap((m) => collectStringFields(m.content, ['withNpc', 'otherNpc', 'playerAccountId']))
  const allowedNames = [...new Set([...actorIds, ...memoryNames])].sort()
  return { sinceTick, untilTick, events: normalizedEvents, memories, allowedNames }
}

export async function renderChronicle(input: {
  context: ChronicleContext
  settings: SettingsStore
  useAi: boolean
}): Promise<ChronicleRender> {
  const fallback = renderFallbackChronicle(input.context, null)
  if (!input.useAi || input.settings.countActive() === 0 || input.context.events.length === 0) {
    return fallback
  }

  try {
    const raw = await generateWithKeyPool(input.settings, {
      systemPrompt: chronicleSystemPrompt(),
      userPrompt: chronicleUserPrompt(input.context),
      temperature: 0.35,
      maxOutputTokens: 700,
      responseMimeType: 'application/json',
      thinkingBudget: 0
    })
    const parsed = parseAiChronicle(raw)
    const citedNames = parsed.citedNames.filter((name) => input.context.allowedNames.includes(name))
    if (citedNames.length !== parsed.citedNames.length) {
      return renderFallbackChronicle(input.context, 'AI cited names outside grounded context.')
    }
    return {
      source: 'ai',
      textZh: parsed.zh,
      textEn: parsed.en,
      citedNames,
      aiError: null,
      context: input.context
    }
  } catch (err) {
    return renderFallbackChronicle(input.context, err instanceof Error ? err.message : String(err))
  }
}

function eventToChronicleEvent(event: Event): ChronicleEvent {
  const tick = typeof event.tick === 'number' ? event.tick : 0
  const payload = event.payload as LivingWorldEventPayload | undefined
  const narration = payload && typeof payload === 'object' ? payload.narration ?? null : null
  return {
    tick,
    eventType: event.eventType,
    actorId: event.actorId,
    narration: typeof narration === 'string' ? narration : null
  }
}

function renderFallbackChronicle(context: ChronicleContext, aiError: string | null): ChronicleRender {
  const last = context.events.slice(-5)
  const zhLines = last.map((event) => {
    const text = event.narration ?? `${event.actorId} 觸發了 ${event.eventType}`
    return `第 ${event.tick} tick：${text}`
  })
  const enLines = last.map((event) => {
    const text = event.narration ?? `${event.actorId} triggered ${event.eventType}`
    return `Tick ${event.tick}: ${text}`
  })
  return {
    source: 'fallback',
    textZh: zhLines.length > 0 ? zhLines.join('\n') : '最近沒有可編年史化的事件。',
    textEn: enLines.length > 0 ? enLines.join('\n') : 'No recent chronicle-ready events.',
    citedNames: context.allowedNames,
    aiError,
    context
  }
}

function chronicleSystemPrompt(): string {
  return [
    'You render a concise living-world chronicle from committed game events.',
    'You are read-only: do not create events, facts, locations, NPCs, buildings, or outcomes.',
    'Only mention names listed in allowedNames. If unsure, use generic unnamed references.',
    'Return strict JSON: {"zh": string, "en": string, "citedNames": string[]}.'
  ].join('\n')
}

function chronicleUserPrompt(context: ChronicleContext): string {
  return JSON.stringify({
    allowedNames: context.allowedNames,
    tickWindow: { sinceTick: context.sinceTick, untilTick: context.untilTick },
    events: context.events,
    memories: context.memories
  })
}

function parseAiChronicle(raw: string): { zh: string; en: string; citedNames: string[] } {
  const parsed = JSON.parse(raw) as AiChronicleResponse
  if (typeof parsed.zh !== 'string' || parsed.zh.trim().length === 0) {
    throw new Error('AI chronicle missing zh text.')
  }
  if (typeof parsed.en !== 'string' || parsed.en.trim().length === 0) {
    throw new Error('AI chronicle missing en text.')
  }
  const citedNames = Array.isArray(parsed.citedNames)
    ? parsed.citedNames.filter((name): name is string => typeof name === 'string')
    : []
  return { zh: parsed.zh.trim(), en: parsed.en.trim(), citedNames }
}

function collectStringFields(value: Record<string, unknown>, keys: readonly string[]): string[] {
  const out: string[] = []
  for (const key of keys) {
    const raw = value[key]
    if (typeof raw === 'string' && raw.length > 0) out.push(raw)
  }
  return out
}

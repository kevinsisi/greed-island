// Grounded chronicle rendering. The context is built only from server events
// and NPC memory projection rows. AI can render text, but cannot
// create facts; invalid or ungrounded AI output falls back to deterministic text.

import { generateWithProviders } from '../npcs/aiProvider.js'
import { isOpenCodeConfigured } from '../npcs/openCodeClient.js'
import type { SettingsStore } from '../http/settings.js'
import type { SqliteNpcMemoryStore } from './npcMemory.js'
import { isLivingWorldCommandType, type LivingWorldEventPayload } from './livingWorldCommands.js'

const CHRONICLE_AI_RESPONSE_MIME = 'application/json'
const CHRONICLE_AI_TIMEOUT_MS = 20_000
const CHRONICLE_AI_MAX_ATTEMPTS = 2
const CHRONICLE_AI_BACKOFF_MS = 250
const SIMPLIFIED_TO_TRADITIONAL_PHRASES: ReadonlyArray<readonly [string, string]> = [
  ['无事发生', '無事發生'],
  ['发生', '發生'],
  ['这时', '這時'],
  ['市场', '市場'],
  ['说话', '說話']
]
const SIMPLIFIED_TO_TRADITIONAL_CHARS: Readonly<Record<string, string>> = {
  '无': '無',
  '发': '發',
  '这': '這',
  '时': '時',
  '场': '場',
  '说': '說',
  '话': '話',
  '个': '個',
  '们': '們',
  '与': '與',
  '为': '為',
  '后': '後',
  '来': '來',
  '会': '會',
  '见': '見',
  '风': '風',
  '阴': '陰',
  '阳': '陽',
  '雾': '霧',
  '骤': '驟',
  '岛': '島'
}
export type ChronicleEvent = Readonly<{
  tick: number
  eventType: string
  actorId: string
  narration: string | null
}>

type ChronicleSourceEvent = Readonly<{
  tick?: number
  eventType: string
  actorId: string
  payload?: unknown
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

export type ChronicleAiAttempt = Readonly<{
  attempt: number
  timeoutMs: number
  backoffMs: number
  responseMimeType: string
  ok: boolean
  error: string | null
}>

export type ChronicleAiMetadata = Readonly<{
  requested: boolean
  activeKeys: number
  maxAttempts: number
  timeoutMs: number
  responseMimeType: string
  fallbackReason: string | null
  attempts: readonly ChronicleAiAttempt[]
}>

export type ChronicleRender = Readonly<{
  source: 'ai' | 'fallback'
  textZh: string
  textEn: string
  citedNames: readonly string[]
  aiError: string | null
  aiMeta: ChronicleAiMetadata
  context: ChronicleContext
}>

type AiChronicleResponse = Readonly<{
  zh?: unknown
  en?: unknown
  citedNames?: unknown
}>

export function buildChronicleContext(input: {
  events: readonly ChronicleSourceEvent[]
  memory: SqliteNpcMemoryStore
  actorNames?: Readonly<Record<string, string>>
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
  const displayNames = [...actorIds, ...memoryNames]
    .map((id) => input.actorNames?.[id])
    .filter((name): name is string => typeof name === 'string' && name.length > 0)
  const allowedNames = [...new Set([...actorIds, ...memoryNames, ...displayNames])].sort()
  return { sinceTick, untilTick, events: normalizedEvents, memories, allowedNames }
}

export async function renderChronicle(input: {
  context: ChronicleContext
  settings: SettingsStore
  useAi: boolean
  aiTimeoutMs?: number
  aiMaxAttempts?: number
  aiBackoffMs?: number
}): Promise<ChronicleRender> {
  const activeKeys = input.settings.countActive()
  const hasOpenCode = isOpenCodeConfigured(input.settings)
  const hasAiProvider = activeKeys > 0 || hasOpenCode
  const timeoutMs = Math.max(1, input.aiTimeoutMs ?? CHRONICLE_AI_TIMEOUT_MS)
  const maxAttempts = Math.max(1, input.aiMaxAttempts ?? CHRONICLE_AI_MAX_ATTEMPTS)
  const backoffMs = Math.max(0, input.aiBackoffMs ?? CHRONICLE_AI_BACKOFF_MS)
  const skipReason = !input.useAi
    ? null
    : !hasAiProvider
      ? 'No AI providers configured.'
      : input.context.events.length === 0
        ? 'No chronicle-ready events to render.'
        : null
  const baseAiMeta = makeAiMeta({
    requested: input.useAi,
    activeKeys,
    maxAttempts,
    timeoutMs,
    attempts: [],
    fallbackReason: skipReason
  })
  const fallback = renderFallbackChronicle(input.context, null, baseAiMeta)
  if (!input.useAi || !hasAiProvider || input.context.events.length === 0) {
    return fallback
  }

  const attempts: ChronicleAiAttempt[] = []
  try {
    const raw = await generateChronicleJsonWithRetry(input.settings, input.context, {
      timeoutMs,
      maxAttempts,
      backoffMs,
      attempts
    })
    const parsed = parseAiChronicle(raw)
    const citedNames = parsed.citedNames.filter((name) => input.context.allowedNames.includes(name))
    if (citedNames.length !== parsed.citedNames.length) {
      const reason = 'AI cited names outside grounded context.'
      return renderFallbackChronicle(input.context, reason, makeAiMeta({
        requested: true,
        activeKeys,
        maxAttempts,
        timeoutMs,
        attempts,
        fallbackReason: reason
      }))
    }
    return {
      source: 'ai',
      textZh: parsed.zh,
      textEn: parsed.en,
      citedNames,
      aiError: null,
      aiMeta: makeAiMeta({
        requested: true,
        activeKeys,
        maxAttempts,
        timeoutMs,
        attempts,
        fallbackReason: null
      }),
      context: input.context
    }
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    return renderFallbackChronicle(input.context, reason, makeAiMeta({
      requested: true,
      activeKeys,
      maxAttempts,
      timeoutMs,
      attempts,
      fallbackReason: reason
    }))
  }
}

async function generateChronicleJsonWithRetry(
  settings: SettingsStore,
  context: ChronicleContext,
  options: {
    timeoutMs: number
    maxAttempts: number
    backoffMs: number
    attempts: ChronicleAiAttempt[]
  }
): Promise<string> {
  let lastError: unknown = null
  for (let attempt = 1; attempt <= options.maxAttempts; attempt += 1) {
    try {
      const providerResult = await withTimeout(generateWithProviders(settings, {
        systemPrompt: chronicleSystemPrompt(),
        userPrompt: chronicleUserPrompt(context),
        temperature: 0.35,
        maxOutputTokens: 700,
        responseMimeType: CHRONICLE_AI_RESPONSE_MIME,
        thinkingBudget: 0
      }), options.timeoutMs)
      options.attempts.push(makeAttempt(attempt, options.timeoutMs, options.backoffMs, true, null))
      return providerResult.text
    } catch (err) {
      lastError = err
      const error = err instanceof Error ? err.message : String(err)
      options.attempts.push(makeAttempt(attempt, options.timeoutMs, options.backoffMs, false, error))
      if (attempt < options.maxAttempts && isRetryableChronicleAiError(error)) {
        await sleep(options.backoffMs)
        continue
      }
      break
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}

function makeAttempt(
  attempt: number,
  timeoutMs: number,
  backoffMs: number,
  ok: boolean,
  error: string | null
): ChronicleAiAttempt {
  return { attempt, timeoutMs, backoffMs, responseMimeType: CHRONICLE_AI_RESPONSE_MIME, ok, error }
}

function makeAiMeta(input: {
  requested: boolean
  activeKeys: number
  maxAttempts: number
  timeoutMs: number
  fallbackReason: string | null
  attempts: readonly ChronicleAiAttempt[]
}): ChronicleAiMetadata {
  return {
    requested: input.requested,
    activeKeys: input.activeKeys,
    maxAttempts: input.maxAttempts,
    timeoutMs: input.timeoutMs,
    responseMimeType: CHRONICLE_AI_RESPONSE_MIME,
    fallbackReason: input.fallbackReason,
    attempts: input.attempts
  }
}

function isRetryableChronicleAiError(error: string): boolean {
  return /timed out|timeout|HTTP 408|HTTP 409|HTTP 425|HTTP 429|HTTP 5\d\d|GeminiUnavailableError|fetch failed|network/i.test(error)
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Chronicle AI request timed out after ${timeoutMs}ms`)), timeoutMs)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (err) => {
        clearTimeout(timer)
        reject(err)
      }
    )
  })
}

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve()
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function eventToChronicleEvent(event: ChronicleSourceEvent): ChronicleEvent | null {
  if (!isLivingWorldCommandType(event.eventType)) return null
  if (event.eventType === 'WORLD_TICK') return null
  if (event.eventType === 'NPC_OBSERVED_SKILL') return null
  if (event.eventType === 'NPC_STATE_RECORDED') return null
  if (event.eventType === 'ANIMAL_SPAWNED') return null
  if (event.eventType === 'ANIMAL_HUNT_STARTED') return null
  if (event.eventType === 'ANIMAL_HUNT_RESOLVED') return null
  if (event.eventType === 'ANIMAL_KILLED') return null
  if (event.eventType === 'ANIMAL_STARVED') return null
  if (event.eventType === 'ANIMAL_REPRODUCED') return null
  if (event.eventType === 'SPECIES_EXTINCTION_WARNING') return null
  if (event.eventType === 'FISHERY_RECOVERED') return null
  if (event.eventType === 'ECOSYSTEM_PRESSURE_RAISED') return null
  if (event.eventType === 'ECOSYSTEM_PRESSURE_RECOVERED') return null
  if (event.eventType === 'ANIMAL_DOMESTICATED') return null
  if (event.eventType === 'LIVESTOCK_BRED') return null
  if (event.eventType === 'LIVESTOCK_SLAUGHTERED') {
    const p = (event.payload as { data?: Record<string, unknown> } | null)?.data
    const speciesId = typeof p?.speciesId === 'string' ? p.speciesId : ''
    const settlementId = typeof p?.settlementId === 'string' ? p.settlementId : ''
    return { tick: event.tick ?? 0, eventType: event.eventType, actorId: event.actorId, narration: `[LIVESTOCK_SLAUGHTERED] settlement=${settlementId} species=${speciesId}` }
  }
  if (event.eventType === 'MOUNT_ASSIGNED') {
    const p = (event.payload as { data?: Record<string, unknown> } | null)?.data
    const npcId = typeof p?.npcId === 'string' ? p.npcId : ''
    return { tick: event.tick ?? 0, eventType: event.eventType, actorId: event.actorId, narration: `[MOUNT_ASSIGNED] npc=${npcId}` }
  }
  if (event.eventType === 'SPECIES_EXTINCT') {
    const p = (event.payload as { data?: Record<string, unknown> } | null)?.data
    const speciesId = typeof p?.speciesId === 'string' ? p.speciesId : event.actorId
    return { tick: event.tick ?? 0, eventType: event.eventType, actorId: event.actorId, narration: `[SPECIES_EXTINCT] species=${speciesId}` }
  }
  if (event.eventType === 'SPECIES_RECOVERED') {
    const p = (event.payload as { data?: Record<string, unknown> } | null)?.data
    const speciesId = typeof p?.speciesId === 'string' ? p.speciesId : event.actorId
    return { tick: event.tick ?? 0, eventType: event.eventType, actorId: event.actorId, narration: `[SPECIES_RECOVERED] species=${speciesId}` }
  }
  if (event.eventType === 'LEGENDARY_WORLD_EVENT_SPAWNED') {
    const p = (event.payload as { data?: Record<string, unknown> } | null)?.data
    const speciesId = typeof p?.speciesId === 'string' ? p.speciesId : ''
    const tileId = typeof p?.tileId === 'string' ? p.tileId : ''
    return { tick: event.tick ?? 0, eventType: event.eventType, actorId: event.actorId, narration: `[LEGENDARY_WORLD_EVENT_SPAWNED] species=${speciesId} tile=${tileId}` }
  }
  if (event.eventType === 'LEGENDARY_WORLD_EVENT_RESOLVED') {
    const p = (event.payload as { data?: Record<string, unknown> } | null)?.data
    const speciesId = typeof p?.speciesId === 'string' ? p.speciesId : ''
    return { tick: event.tick ?? 0, eventType: event.eventType, actorId: event.actorId, narration: `[LEGENDARY_WORLD_EVENT_RESOLVED] species=${speciesId}` }
  }
  if (event.eventType === 'LEGENDARY_HUNT_STARTED') {
    const p = (event.payload as { data?: Record<string, unknown> } | null)?.data
    const linkedAnimalId = typeof p?.linkedAnimalId === 'string' ? p.linkedAnimalId : ''
    const tileId = typeof p?.tileId === 'string' ? p.tileId : ''
    return { tick: event.tick ?? 0, eventType: event.eventType, actorId: event.actorId, narration: `[LEGENDARY_HUNT_STARTED] animal=${linkedAnimalId} tile=${tileId}` }
  }
  if (event.eventType === 'LEGENDARY_HUNT_CONCLUDED') {
    const p = (event.payload as { data?: Record<string, unknown> } | null)?.data
    const linkedAnimalId = typeof p?.linkedAnimalId === 'string' ? p.linkedAnimalId : ''
    const outcome = typeof p?.outcome === 'string' ? p.outcome : ''
    return { tick: event.tick ?? 0, eventType: event.eventType, actorId: event.actorId, narration: `[LEGENDARY_HUNT_CONCLUDED] animal=${linkedAnimalId} outcome=${outcome}` }
  }
  if (event.eventType === 'FOREST_CLEARCUT_ORDERED') {
    const p = (event.payload as { data?: Record<string, unknown> } | null)?.data
    const factionId = typeof p?.factionId === 'string' ? p.factionId : ''
    const tileId = typeof p?.tileId === 'string' ? p.tileId : ''
    return { tick: event.tick ?? 0, eventType: event.eventType, actorId: event.actorId, narration: `[FOREST_CLEARCUT_ORDERED] faction=${factionId} tile=${tileId}` }
  }
  if (event.eventType === 'FISHING_QUOTA_ENFORCED') {
    const p = (event.payload as { data?: Record<string, unknown> } | null)?.data
    const factionId = typeof p?.factionId === 'string' ? p.factionId : ''
    const tileId = typeof p?.tileId === 'string' ? p.tileId : ''
    return { tick: event.tick ?? 0, eventType: event.eventType, actorId: event.actorId, narration: `[FISHING_QUOTA_ENFORCED] faction=${factionId} tile=${tileId}` }
  }
  if (event.eventType === 'INDUSTRIAL_SITE_SABOTAGED') {
    const p = (event.payload as { data?: Record<string, unknown> } | null)?.data
    const factionId = typeof p?.factionId === 'string' ? p.factionId : ''
    const tileId = typeof p?.tileId === 'string' ? p.tileId : ''
    return { tick: event.tick ?? 0, eventType: event.eventType, actorId: event.actorId, narration: `[INDUSTRIAL_SITE_SABOTAGED] faction=${factionId} tile=${tileId}` }
  }
  if (event.eventType === 'RITUAL_ECOSYSTEM_MANIPULATION') {
    const p = (event.payload as { data?: Record<string, unknown> } | null)?.data
    const factionId = typeof p?.factionId === 'string' ? p.factionId : ''
    return { tick: event.tick ?? 0, eventType: event.eventType, actorId: event.actorId, narration: `[RITUAL_ECOSYSTEM_MANIPULATION] faction=${factionId}` }
  }
  if (event.eventType === 'WEATHER_INTENT_PROPOSED') {
    const p = (event.payload as { data?: Record<string, unknown> } | null)?.data
    const thought = typeof p?.thought === 'string' ? p.thought : ''
    const desiredWeather = typeof p?.desiredWeather === 'string' ? p.desiredWeather : ''
    return { tick: event.tick ?? 0, eventType: event.eventType, actorId: event.actorId, narration: `[WEATHER_INTENT_PROPOSED] desiredWeather=${desiredWeather} thought=${thought}` }
  }
  if (event.eventType === 'NPC_FREEFORM_ACTION_PROPOSED') {
    const p = (event.payload as { data?: Record<string, unknown>; narration?: unknown } | null)?.data
    const narration = (event.payload as { narration?: unknown } | null)?.narration
    const resolved = p?.resolved && typeof p.resolved === 'object' ? p.resolved as Record<string, unknown> : {}
    const action = typeof resolved.kind === 'string' ? resolved.kind : 'act'
    const accepted = p?.accepted === true
    const summary = typeof resolved.summary === 'string' ? sanitizeChronicleNarration(resolved.summary) : null
    const publicNarration = typeof narration === 'string' ? sanitizeChronicleNarration(narration) : null
    return {
      tick: event.tick ?? 0,
      eventType: event.eventType,
      actorId: event.actorId,
      narration: publicNarration ?? `[NPC_FREEFORM_ACTION_PROPOSED] action=${action} accepted=${accepted}${summary ? ` summary=${summary}` : ''}`,
    }
  }
  // Phase 6 - Player Civilization: pass through to AI pipeline
  if (event.eventType.startsWith('PLAYER_') && event.eventType !== 'PLAYER_INTERVENE' && event.eventType !== 'PLAYER_ENERGY_SET') {
    const p = (event.payload as { data?: Record<string, unknown> } | null)?.data
    const actor = typeof p?.playerAccountId === 'string' ? p.playerAccountId : event.actorId
    const tileId = typeof p?.tileId === 'string' ? ` tile=${p.tileId}` : ''
    return { tick: event.tick ?? 0, eventType: event.eventType, actorId: actor, narration: `[${event.eventType}] actor=${actor}${tileId}` }
  }
  if (event.eventType.startsWith('GOODS_')) return null
  if (event.eventType.startsWith('HOUSEHOLD_GOLD_')) return null
  if (event.eventType === 'HOUSEHOLD_INHERITANCE_ASSIGNED') return null
  if (event.eventType.startsWith('TRADE_ROUTE_')) return null
  if (event.eventType === 'MARKET_PRICE_DISCOVERED') return null
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

function renderFallbackChronicle(
  context: ChronicleContext,
  aiError: string | null,
  aiMeta: ChronicleAiMetadata
): ChronicleRender {
  const storyEvents = context.events
    .filter((event) => event.eventType !== 'WORLD_TICK')
    .filter((event) => event.narration !== null || event.eventType !== 'NPC_ACTIVITY_CHANGE')
    .slice(-8)
  const textZh = renderFallbackParagraphZh(storyEvents)
  const textEn = renderFallbackParagraphEn(storyEvents)
  return {
    source: 'fallback',
    textZh,
    textEn,
    citedNames: context.allowedNames,
    aiError,
    aiMeta,
    context
  }
}

function renderFallbackParagraphZh(events: readonly ChronicleEvent[]): string {
  if (events.length === 0) {
    return '沒有足夠鮮明的公共事件能寫入編年史，但城市仍在自行運轉。'
  }
  return dedupeSentences(events.map((event, index) => chronicleSentenceZh(event, index))).slice(-5).join('')
}

function renderFallbackParagraphEn(events: readonly ChronicleEvent[]): string {
  if (events.length === 0) {
    return 'No public event was sharp enough to enter the chronicle, though the city kept moving on its own.'
  }
  return dedupeSentences(events.map((event, index) => chronicleSentenceEn(event, index))).slice(-5).join('')
}

function chronicleSentenceZh(event: ChronicleEvent, index: number): string {
  const prefix = index === 0 ? '' : index % 3 === 1 ? '接著，' : index % 3 === 2 ? '稍後，' : '同時，'
  switch (event.eventType) {
    case 'NPC_INTERACT':
      return `${prefix}兩個人的交會留下了能被城市記住的痕跡。`
    case 'NPC_MOVE':
      return `${prefix}有人改變了穿過城市的路線，讓當天的流向跟著變化。`
    case 'BUILDING_ENTER':
      return `${prefix}一道門把某人帶離街面的視線。`
    case 'BUILDING_LEAVE':
      return `${prefix}有人從室內任務回到街區流動。`
    case 'NPC_ACTIVITY_CHANGE':
      return `${prefix}一段日程轉向，讓角色的眼前任務換了形狀。`
    case 'NPC_LIFE_GOAL_SET':
      return `${prefix}某個生活目標被重新計算，壓力開始推動下一步行動。`
    case 'NPC_PRODUCTIVE_ACTION':
      return `${prefix}${sanitizeChronicleNarration(event.narration) ?? '有人把職責或生活壓力轉成街區裡可見的進展。'}`
    case 'NPC_FREEFORM_ACTION_PROPOSED':
      return `${prefix}${sanitizeChronicleNarration(event.narration) ?? '有人照著自己的念頭提出下一步行動。'}`
    case 'WEATHER_INTENT_PROPOSED':
      return `${prefix}天氣先有了自己的念頭，才把變化推向世界。`
    case 'WEATHER_CHANGE':
      return `${prefix}天氣改變了城市的節奏。`
    case 'SEASON_CHANGE':
      return `${prefix}季節把世界推進到下一個長週期。`
    case 'WORLD_EVENT_SPAWN':
      return `${prefix}一股外部壓力浮上城市表面。`
    case 'WORLD_EVENT_END':
      return `${prefix}先前的外部壓力暫時退場。`
    default:
      return `${prefix}${sanitizeChronicleNarration(event.narration) ?? '世界留下了一筆可回放的公共紀錄。'}`
  }
}

function chronicleSentenceEn(event: ChronicleEvent, index: number): string {
  const prefix = index === 0 ? '' : index % 3 === 1 ? 'Then, ' : index % 3 === 2 ? 'Later, ' : 'Meanwhile, '
  switch (event.eventType) {
    case 'NPC_INTERACT':
      return `${prefix}two lives crossed closely enough to leave a public trace.`
    case 'NPC_MOVE':
      return `${prefix}someone's route through the city changed the shape of the day.`
    case 'BUILDING_ENTER':
      return `${prefix}a doorway took someone out of the street's sight.`
    case 'BUILDING_LEAVE':
      return `${prefix}someone returned from indoors to the city's open noise.`
    case 'AREA_PRESSURE':
      return `${prefix}pressure in one district altered the crowd's rhythm.`
    case 'WORLD_EVENT_SPAWN':
      return `${prefix}a new omen began to bend the city around it.`
    case 'WORLD_EVENT_END':
      return `${prefix}an omen faded, and daily noise filled the gap again.`
    case 'WEATHER_CHANGE':
      return `${prefix}the weather shifted, changing the texture of the streets.`
    case 'WEATHER_INTENT_PROPOSED':
      return `${prefix}the weather itself formed an intention before the sky changed.`
    case 'NPC_FREEFORM_ACTION_PROPOSED':
      return `${prefix}someone acted from a self-directed NPC proposal instead of a routine schedule.`
    case 'SEASON_CHANGE':
      return `${prefix}the season crossed a quiet boundary.`
    default:
      return `${prefix}one more event settled into the city's record.`
  }
}

function sanitizeChronicleNarration(narration: string | null): string | null {
  if (!narration) return null
  if (/(?:agenda\.|\bt_[a-z0-9_]+\b|cap_zero|event\.[a-z0-9_.-]+)/i.test(narration)) return null
  return normalizeTraditionalChinese(narration.trim())
}

function dedupeSentences(sentences: readonly string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const sentence of sentences) {
    if (seen.has(sentence)) continue
    seen.add(sentence)
    out.push(sentence)
  }
  return out
}

function chronicleSystemPrompt(): string {
  return [
    'You render a concise living-world chronicle from committed game events.',
    'You are read-only: do not create events, facts, locations, NPCs, buildings, or outcomes.',
    'Only mention names listed in allowedNames. If unsure, use generic unnamed references.',
    'The zh field must be Traditional Chinese, Taiwan/Hong Kong style. Do not output Simplified Chinese characters.',
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
  const parsed = JSON.parse(extractJsonPayload(raw)) as AiChronicleResponse
  if (typeof parsed.zh !== 'string' || parsed.zh.trim().length === 0) {
    throw new Error('AI chronicle missing zh text.')
  }
  if (typeof parsed.en !== 'string' || parsed.en.trim().length === 0) {
    throw new Error('AI chronicle missing en text.')
  }
  const citedNames = Array.isArray(parsed.citedNames)
    ? parsed.citedNames.filter((name): name is string => typeof name === 'string')
    : []
  return { zh: normalizeTraditionalChinese(parsed.zh.trim()), en: parsed.en.trim(), citedNames }
}

function normalizeTraditionalChinese(text: string): string {
  let normalized = text
  for (const [from, to] of SIMPLIFIED_TO_TRADITIONAL_PHRASES) {
    normalized = normalized.split(from).join(to)
  }
  return [...normalized].map((char) => SIMPLIFIED_TO_TRADITIONAL_CHARS[char] ?? char).join('')
}

function extractJsonPayload(raw: string): string {
  const trimmed = raw.trim()
  if (trimmed.startsWith('{')) return trimmed
  if (trimmed.startsWith('```')) {
    const firstLineEnd = trimmed.indexOf('\n')
    const closingFence = trimmed.lastIndexOf('```')
    if (firstLineEnd >= 0 && closingFence > firstLineEnd) {
      return trimmed.slice(firstLineEnd + 1, closingFence).trim()
    }
  }
  const firstBrace = trimmed.indexOf('{')
  const lastBrace = trimmed.lastIndexOf('}')
  if (firstBrace >= 0 && lastBrace > firstBrace) return trimmed.slice(firstBrace, lastBrace + 1)
  return trimmed
}

function collectStringFields(value: Record<string, unknown>, keys: readonly string[]): string[] {
  const out: string[] = []
  for (const key of keys) {
    const raw = value[key]
    if (typeof raw === 'string' && raw.length > 0) out.push(raw)
  }
  return out
}

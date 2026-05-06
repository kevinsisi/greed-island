// Simulation runtime — drives a 5-second tick loop on top of the
// append-only kernel event log. Every tick the runtime:
//   1. Increments world.tick
//   2. Re-evaluates each NPC's routine slot and emits NPC_MOVE
//      narrative events when the resolved location changes
//   3. On a fixed cadence, rotates weather / season and toggles the
//      tide_festival rare window
//
// All state is persisted as FACT_SET events so it can be reconstructed
// on restart via the kernel reducer. The runtime also keeps an in-
// memory projection so HTTP reads don't have to re-reduce the entire
// event log on every request.

import {
  DEFAULT_RULESET_VERSION,
  KERNEL_EVENT_VERSION,
  type EventDraft,
  type FactSetPayload
} from '../kernel/types.js'
import { hashCanonicalJson } from '../kernel/canonicalJson.js'
import { EVENT_FACT_SET } from '../kernel/ruleEngine.js'
import type { SqliteEventStore } from '../kernel/eventStore.js'
import { reduceEventLog } from '../kernel/reducer.js'
import {
  TICK_DURATION_MS,
  TICKS_PER_DAY,
  TICKS_PER_HOUR,
  TICKS_PER_MINUTE
} from '../config/world.js'
import type { NpcProfile } from '../npcs/types.js'
import type { CardCatalog } from '../cards/types.js'

const SIM_ACTOR_WORLD = 'system'
const NARRATIVE_KEY_PREFIX = 'narrative.'
const FACT_TICK = 'world.tick'
const FACT_WEATHER = 'world.weather'
const FACT_SEASON = 'world.season'
const FACT_RARE_WINDOW = 'world.rareWindow.tide_festival'
const NPC_LOCATION_PREFIX = 'npc.'
const NPC_LOCATION_SUFFIX = '.location'

const WEATHERS = ['晴', '陰', '霧雨', '驟雨', '微風'] as const
const SEASONS = ['霜之月', '雨之月', '潮之月', '熾之月'] as const

const WEATHER_CADENCE_TICKS = TICKS_PER_MINUTE
const SEASON_CADENCE_TICKS = TICKS_PER_HOUR
const RARE_WINDOW_PERIOD_TICKS = TICKS_PER_MINUTE * 10
const RARE_WINDOW_OPEN_TICKS = TICKS_PER_MINUTE * 4
const NPC_HEARTBEAT_CADENCE_TICKS = TICKS_PER_MINUTE * 2
const NPC_OBSERVATIONS = [
  '感受到島的低語，停下手邊的事物。',
  '檢視今日的進度，眉頭微皺。',
  '在風中嗅到什麼，視線投向遠方。',
  '輕聲念誦一句咒語，繼續前行。',
  '與身邊的人交換了一個短暫的眼神。'
] as const

export type NarrativeEventPayload = Readonly<{
  eventType: string
  actorId: string
  payload: Record<string, unknown>
  narration: string | null
}>

export type SimNpcState = Readonly<{
  id: string
  name: { zh: string; en: string }
  role: { zh: string; en: string }
  location: string
  relationshipScore: number
  lastActedTick: number
  internalState: Record<string, unknown>
}>

export type WorldSnapshot = Readonly<{
  tick: number
  lastSequence: number
  eventCount: number
  npcCount: number
  facts: Record<string, unknown>
  generatedAt: string
}>

export type NarrativeEvent = Readonly<{
  sequence: number
  tick: number
  eventType: string
  actorId: string
  occurredAt: string
  payload: Record<string, unknown>
  narration: string | null
}>

type Listener = (event: NarrativeEvent) => void

const RECENT_EVENTS_BUFFER = 200

export class SimulationRuntime {
  private currentTick = 0
  private weather: string = WEATHERS[0]
  private season: string = SEASONS[0]
  private rareWindowOpen = false
  private rareWindowClosesAtTick = 0
  private readonly npcLocations = new Map<string, string>()
  private readonly npcLastActed = new Map<string, number>()
  private readonly recentEvents: NarrativeEvent[] = []
  private readonly listeners = new Set<Listener>()
  private timer: NodeJS.Timeout | null = null
  private lastSequence = 0
  private eventCount = 0

  constructor(
    private readonly store: SqliteEventStore,
    private readonly profiles: readonly NpcProfile[],
    private readonly cards: CardCatalog,
    private readonly tickDurationMs: number = TICK_DURATION_MS
  ) {
    this.hydrateFromEventLog()
  }

  start(): void {
    if (this.timer !== null) return
    this.timer = setInterval(() => this.runTickSafely(), this.tickDurationMs)
  }

  stop(): void {
    if (this.timer === null) return
    clearInterval(this.timer)
    this.timer = null
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getRecentEvents(limit = 50): NarrativeEvent[] {
    return this.recentEvents.slice(-limit).reverse()
  }

  getSnapshot(): WorldSnapshot {
    return {
      tick: this.currentTick,
      lastSequence: this.lastSequence,
      eventCount: this.eventCount,
      npcCount: this.profiles.length,
      facts: {
        weather: this.weather,
        season: this.season,
        rareWindowOpen: this.rareWindowOpen,
        rareWindowClosesAtTick: this.rareWindowOpen ? this.rareWindowClosesAtTick : null
      },
      generatedAt: new Date().toISOString()
    }
  }

  getNpcs(): SimNpcState[] {
    return this.profiles.map((profile) => {
      const location = this.npcLocations.get(profile.id) ?? profile.defaultLocation
      return {
        id: profile.id,
        name: { zh: profile.name.zh, en: profile.name.en },
        role: { zh: profile.role.zh, en: profile.role.en },
        location,
        relationshipScore: this.deriveRelationshipScore(profile),
        lastActedTick: this.npcLastActed.get(profile.id) ?? 0,
        internalState: {
          patience: profile.personality.patience ?? null,
          greed: profile.personality.greed ?? null
        }
      }
    })
  }

  getCardCatalog(): CardCatalog {
    return this.cards
  }

  getMap(): Readonly<{
    width: number
    height: number
    tiles: Array<{
      id: string
      name: string
      x: number
      y: number
      biome: string
      npcIds: string[]
    }>
  }> {
    const tiles = MAP_TILES.map((tile) => ({
      ...tile,
      npcIds: this.profiles
        .filter((p) => (this.npcLocations.get(p.id) ?? p.defaultLocation) === tile.id)
        .map((p) => p.id)
    }))
    return { width: 8, height: 6, tiles }
  }

  isRareWindowOpen(): boolean {
    return this.rareWindowOpen
  }

  private runTickSafely(): void {
    try {
      this.runTick()
    } catch (err) {
      console.error('[sim] tick failed', err)
    }
  }

  private runTick(): void {
    const nextTick = this.currentTick + 1
    const drafts: EventDraft[] = []

    drafts.push(this.factSetDraft(FACT_TICK, nextTick, SIM_ACTOR_WORLD, nextTick))

    if (nextTick === 1 && this.eventCount === 0) {
      drafts.push(
        this.narrativeDraft('world.genesis', nextTick, {
          eventType: 'WORLD_GENESIS',
          actorId: SIM_ACTOR_WORLD,
          payload: { weather: this.weather, season: this.season },
          narration: '貪婪之島從靜謐中甦醒，第一道刻度開始流動。'
        })
      )
    }

    for (const profile of this.profiles) {
      const slot = findRoutineSlotForTick(profile, nextTick)
      const newLocation = slot?.location ?? profile.defaultLocation
      const oldLocation = this.npcLocations.get(profile.id) ?? profile.defaultLocation
      if (oldLocation !== newLocation) {
        drafts.push(
          this.factSetDraft(
            `${NPC_LOCATION_PREFIX}${profile.id}${NPC_LOCATION_SUFFIX}`,
            newLocation,
            profile.id,
            nextTick
          )
        )
        drafts.push(
          this.narrativeDraft(profile.id, nextTick, {
            eventType: 'NPC_MOVE',
            actorId: profile.id,
            payload: {
              from: oldLocation,
              to: newLocation,
              ...(slot?.label === undefined ? {} : { label: slot.label })
            },
            narration: this.composeMoveNarration(profile, oldLocation, newLocation)
          })
        )
        this.npcLocations.set(profile.id, newLocation)
        this.npcLastActed.set(profile.id, nextTick)
      }
    }

    if (nextTick % WEATHER_CADENCE_TICKS === 0) {
      const next = pickFromCycle(WEATHERS, Math.floor(nextTick / WEATHER_CADENCE_TICKS))
      if (next !== this.weather) {
        const before = this.weather
        drafts.push(this.factSetDraft(FACT_WEATHER, next, SIM_ACTOR_WORLD, nextTick))
        drafts.push(
          this.narrativeDraft('world.weather', nextTick, {
            eventType: 'WORLD_WEATHER_CHANGED',
            actorId: SIM_ACTOR_WORLD,
            payload: { from: before, to: next },
            narration: `天空從${before}轉為${next}。`
          })
        )
        this.weather = next
      }
    }

    if (nextTick % SEASON_CADENCE_TICKS === 0) {
      const next = pickFromCycle(SEASONS, Math.floor(nextTick / SEASON_CADENCE_TICKS))
      if (next !== this.season) {
        const before = this.season
        drafts.push(this.factSetDraft(FACT_SEASON, next, SIM_ACTOR_WORLD, nextTick))
        drafts.push(
          this.narrativeDraft('world.season', nextTick, {
            eventType: 'WORLD_SEASON_CHANGED',
            actorId: SIM_ACTOR_WORLD,
            payload: { from: before, to: next },
            narration: `${before}悄然遠去，${next}降臨貪婪之島。`
          })
        )
        this.season = next
      }
    }

    const phase = nextTick % RARE_WINDOW_PERIOD_TICKS
    if (phase === 0 && !this.rareWindowOpen) {
      this.rareWindowOpen = true
      this.rareWindowClosesAtTick = nextTick + RARE_WINDOW_OPEN_TICKS
      drafts.push(this.factSetDraft(FACT_RARE_WINDOW, { open: true, closesAt: this.rareWindowClosesAtTick }, SIM_ACTOR_WORLD, nextTick))
      drafts.push(
        this.narrativeDraft('world.rareWindow', nextTick, {
          eventType: 'WORLD_RARE_WINDOW_OPENED',
          actorId: SIM_ACTOR_WORLD,
          payload: { windowId: 'tide_festival', closesAtTick: this.rareWindowClosesAtTick },
          narration: '潮汐節的窗口開啟了，碼頭區會在二十分鐘內進入慶典。'
        })
      )
    } else if (this.rareWindowOpen && nextTick >= this.rareWindowClosesAtTick) {
      this.rareWindowOpen = false
      drafts.push(this.factSetDraft(FACT_RARE_WINDOW, { open: false, closesAt: null }, SIM_ACTOR_WORLD, nextTick))
      drafts.push(
        this.narrativeDraft('world.rareWindow', nextTick, {
          eventType: 'WORLD_RARE_WINDOW_CLOSED',
          actorId: SIM_ACTOR_WORLD,
          payload: { windowId: 'tide_festival' },
          narration: '潮汐節的窗口悄然閉合，碼頭區回歸日常喧囂。'
        })
      )
    }

    if (this.profiles.length > 0 && nextTick % NPC_HEARTBEAT_CADENCE_TICKS === 0) {
      const idx = (nextTick / NPC_HEARTBEAT_CADENCE_TICKS) % this.profiles.length
      const profile = this.profiles[Math.floor(idx)]!
      const obsIdx = Math.floor(nextTick / NPC_HEARTBEAT_CADENCE_TICKS) % NPC_OBSERVATIONS.length
      const observation = NPC_OBSERVATIONS[obsIdx]!
      const location = this.npcLocations.get(profile.id) ?? profile.defaultLocation
      drafts.push(
        this.narrativeDraft(profile.id, nextTick, {
          eventType: 'NPC_OBSERVE',
          actorId: profile.id,
          payload: { location },
          narration: `${profile.name.zh}${observation}`
        })
      )
      this.npcLastActed.set(profile.id, nextTick)
    }

    const committed = this.store.appendEvents(drafts)
    if (committed.length > 0) {
      this.lastSequence = committed[committed.length - 1]!.sequence
      this.eventCount += committed.length
      for (const ev of committed) {
        const narrative = readNarrativePayload(ev.payload)
        if (narrative) {
          const narrativeEvent: NarrativeEvent = {
            sequence: ev.sequence,
            tick: nextTick,
            eventType: narrative.eventType,
            actorId: narrative.actorId,
            occurredAt: new Date().toISOString(),
            payload: narrative.payload,
            narration: narrative.narration
          }
          this.pushRecent(narrativeEvent)
          for (const listener of this.listeners) {
            try {
              listener(narrativeEvent)
            } catch (err) {
              console.error('[sim] listener error', err)
            }
          }
        }
      }
    }

    this.currentTick = nextTick
  }

  private factSetDraft(
    key: string,
    value: unknown,
    actorId: string,
    tick: number
  ): EventDraft<FactSetPayload> {
    const occurredAt = Date.now()
    const seed = {
      eventType: EVENT_FACT_SET,
      occurredAt,
      actorId,
      tick,
      payload: { key, value },
      rulesetVersion: DEFAULT_RULESET_VERSION,
      version: KERNEL_EVENT_VERSION
    }
    const deterministicKey = hashCanonicalJson(seed)
    return {
      eventType: EVENT_FACT_SET,
      occurredAt,
      actorId,
      tick,
      payload: { key, value },
      rulesetVersion: DEFAULT_RULESET_VERSION,
      version: KERNEL_EVENT_VERSION,
      eventId: `event_${deterministicKey.slice(0, 32)}`,
      deterministicKey
    }
  }

  private narrativeDraft(
    actorId: string,
    tick: number,
    body: NarrativeEventPayload
  ): EventDraft<FactSetPayload> {
    const key = `${NARRATIVE_KEY_PREFIX}${tick}.${actorId}.${body.eventType}`
    return this.factSetDraft(key, body, actorId, tick)
  }

  private composeMoveNarration(
    profile: NpcProfile,
    from: string,
    to: string
  ): string | null {
    if (from === to) return null
    const name = profile.name.zh
    const fromName = TILE_NAME_BY_ID[from] ?? from
    const toName = TILE_NAME_BY_ID[to] ?? to
    return `${name}從${fromName}前往${toName}。`
  }

  private deriveRelationshipScore(profile: NpcProfile): number {
    const base = typeof profile.personality.trustBase === 'number' ? profile.personality.trustBase : 50
    return base
  }

  private pushRecent(event: NarrativeEvent): void {
    this.recentEvents.push(event)
    if (this.recentEvents.length > RECENT_EVENTS_BUFFER) {
      this.recentEvents.splice(0, this.recentEvents.length - RECENT_EVENTS_BUFFER)
    }
  }

  private hydrateFromEventLog(): void {
    const events = this.store.readEvents()
    this.eventCount = events.length
    if (events.length > 0) {
      this.lastSequence = events[events.length - 1]!.sequence
    }
    const state = reduceEventLog(events)
    const tickFact = state.facts[FACT_TICK]
    if (typeof tickFact === 'number' && Number.isFinite(tickFact)) {
      this.currentTick = tickFact
    }
    const weatherFact = state.facts[FACT_WEATHER]
    if (typeof weatherFact === 'string' && (WEATHERS as readonly string[]).includes(weatherFact)) {
      this.weather = weatherFact
    }
    const seasonFact = state.facts[FACT_SEASON]
    if (typeof seasonFact === 'string' && (SEASONS as readonly string[]).includes(seasonFact)) {
      this.season = seasonFact
    }
    const rareFact = state.facts[FACT_RARE_WINDOW]
    if (rareFact && typeof rareFact === 'object' && 'open' in (rareFact as Record<string, unknown>)) {
      const r = rareFact as { open: boolean; closesAt: number | null }
      this.rareWindowOpen = !!r.open
      this.rareWindowClosesAtTick = r.closesAt ?? 0
    }
    for (const profile of this.profiles) {
      const k = `${NPC_LOCATION_PREFIX}${profile.id}${NPC_LOCATION_SUFFIX}`
      const loc = state.facts[k]
      this.npcLocations.set(profile.id, typeof loc === 'string' ? loc : profile.defaultLocation)
    }
    for (const event of events.slice(-RECENT_EVENTS_BUFFER * 4)) {
      const narrative = readNarrativePayload(event.payload)
      if (!narrative) continue
      this.pushRecent({
        sequence: event.sequence,
        tick: event.tick ?? 0,
        eventType: narrative.eventType,
        actorId: narrative.actorId,
        occurredAt: new Date(event.occurredAt).toISOString(),
        payload: narrative.payload,
        narration: narrative.narration
      })
    }
  }
}

function findRoutineSlotForTick(profile: NpcProfile, tick: number) {
  const tickOfDay = ((tick % TICKS_PER_DAY) + TICKS_PER_DAY) % TICKS_PER_DAY
  for (const slot of profile.routine) {
    if (tickOfDay >= slot.fromTickOfDay && tickOfDay < slot.toTickOfDay) {
      return slot
    }
  }
  return null
}

function pickFromCycle<T>(values: readonly T[], step: number): T {
  const i = ((step % values.length) + values.length) % values.length
  return values[i]!
}

function readNarrativePayload(payload: unknown): NarrativeEventPayload | null {
  if (!payload || typeof payload !== 'object') return null
  const p = payload as { key?: unknown; value?: unknown }
  if (typeof p.key !== 'string' || !p.key.startsWith(NARRATIVE_KEY_PREFIX)) return null
  const v = p.value
  if (!v || typeof v !== 'object') return null
  const r = v as Record<string, unknown>
  if (typeof r.eventType !== 'string' || typeof r.actorId !== 'string') return null
  return {
    eventType: r.eventType,
    actorId: r.actorId,
    payload: (r.payload as Record<string, unknown> | undefined) ?? {},
    narration: typeof r.narration === 'string' ? r.narration : null
  }
}

const MAP_TILES: ReadonlyArray<{
  id: string
  name: string
  x: number
  y: number
  biome: string
}> = [
  { id: 't_dock', name: '碼頭區', x: 0, y: 4, biome: 'water' },
  { id: 't_central', name: '中央城', x: 3, y: 3, biome: 'grass' },
  { id: 't_temple', name: '湖心神殿', x: 4, y: 1, biome: 'water' },
  { id: 't_forest', name: '北方森林', x: 2, y: 0, biome: 'forest' },
  { id: 't_ruin', name: '南方廢墟', x: 5, y: 5, biome: 'ruin' },
  { id: 't_mountain', name: '東方山脈', x: 7, y: 2, biome: 'mountain' },
  { id: 't_desert', name: '西緣荒地', x: 0, y: 1, biome: 'desert' }
]

const TILE_NAME_BY_ID: Record<string, string> = MAP_TILES.reduce(
  (acc, tile) => {
    acc[tile.id] = tile.name
    return acc
  },
  {} as Record<string, string>
)

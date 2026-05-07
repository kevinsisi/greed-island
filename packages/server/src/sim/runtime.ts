// Simulation runtime — drives a 5-second tick loop on top of the
// append-only kernel event log. Every tick the runtime:
//   1. Increments world.tick
//   2. Hands off to NpcEngine for per-NPC decisioning (move tile-by-tile,
//      activity transitions, mood/health drift, NPC↔NPC interaction)
//   3. On a fixed cadence, rotates weather / season and toggles the
//      tide_festival rare window
//   4. Spawns / expires WorldEventEngine entries
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
  TICKS_PER_HOUR,
  TICKS_PER_MINUTE
} from '../config/world.js'
import type { NpcProfile } from '../npcs/types.js'
import type { CardCatalog } from '../cards/types.js'
import { WorldEventEngine, rebuildActiveEvent } from '../events/engine.js'
import type { ActiveWorldEvent } from '../events/types.js'
import { MAP_TILES, TILE_NAME_BY_ID } from './mapGraph.js'
import { NpcEngine, type NpcActivity, type NpcRuntimeState } from './npcEngine.js'

const SIM_ACTOR_WORLD = 'system'
const NARRATIVE_KEY_PREFIX = 'narrative.'
const FACT_TICK = 'world.tick'
const FACT_WEATHER = 'world.weather'
const FACT_SEASON = 'world.season'
const FACT_RARE_WINDOW = 'world.rareWindow.tide_festival'
const FACT_ACTIVE_EVENTS = 'world.activeEvents'
const NPC_STATE_PREFIX = 'npc.state.'

const WEATHERS = ['晴', '陰', '霧雨', '驟雨', '微風'] as const
const SEASONS = ['霜之月', '雨之月', '潮之月', '熾之月'] as const

const WEATHER_CADENCE_TICKS = TICKS_PER_MINUTE
const SEASON_CADENCE_TICKS = TICKS_PER_HOUR
const RARE_WINDOW_PERIOD_TICKS = TICKS_PER_MINUTE * 10
const RARE_WINDOW_OPEN_TICKS = TICKS_PER_MINUTE * 4

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
  activity: NpcActivity
  mood: number
  health: number
  faction: string
  targetTile: string
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
type TickListener = (tick: number) => void

const RECENT_EVENTS_BUFFER = 200

export class SimulationRuntime {
  private currentTick = 0
  private weather: string = WEATHERS[0]
  private season: string = SEASONS[0]
  private rareWindowOpen = false
  private rareWindowClosesAtTick = 0
  private readonly recentEvents: NarrativeEvent[] = []
  private readonly listeners = new Set<Listener>()
  private readonly tickListeners = new Set<TickListener>()
  private timer: NodeJS.Timeout | null = null
  private lastSequence = 0
  private eventCount = 0
  private readonly eventEngine = new WorldEventEngine()
  private readonly npcEngine: NpcEngine

  constructor(
    private readonly store: SqliteEventStore,
    private readonly profiles: readonly NpcProfile[],
    private readonly cards: CardCatalog,
    private readonly tickDurationMs: number = TICK_DURATION_MS
  ) {
    this.npcEngine = new NpcEngine(profiles)
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

  /** 額外的 per-tick callback。runs after the tick has incremented. */
  subscribeTick(listener: TickListener): () => void {
    this.tickListeners.add(listener)
    return () => this.tickListeners.delete(listener)
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
        rareWindowClosesAtTick: this.rareWindowOpen ? this.rareWindowClosesAtTick : null,
        activeEvents: this.eventEngine.getActive()
      },
      generatedAt: new Date().toISOString()
    }
  }

  getActiveWorldEvents(): readonly ActiveWorldEvent[] {
    return this.eventEngine.getActive()
  }

  getNpcs(): SimNpcState[] {
    return this.profiles.map((profile) => {
      const s =
        this.npcEngine.getState(profile.id) ??
        ({
          tile: profile.defaultLocation,
          mood: 60,
          health: 80,
          activity: 'idle',
          faction: 'neutral',
          targetTile: profile.defaultLocation,
          lastActedTick: 0
        } as NpcRuntimeState)
      return {
        id: profile.id,
        name: { zh: profile.name.zh, en: profile.name.en },
        role: { zh: profile.role.zh, en: profile.role.en },
        location: s.tile,
        relationshipScore: this.deriveRelationshipScore(profile),
        lastActedTick: s.lastActedTick,
        internalState: {
          patience: profile.personality.patience ?? null,
          greed: profile.personality.greed ?? null
        },
        activity: s.activity,
        mood: Math.round(s.mood),
        health: Math.round(s.health),
        faction: s.faction,
        targetTile: s.targetTile
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
        .filter((p) => (this.npcEngine.getState(p.id)?.tile ?? p.defaultLocation) === tile.id)
        .map((p) => p.id)
    }))
    return { width: 8, height: 6, tiles }
  }

  isRareWindowOpen(): boolean {
    return this.rareWindowOpen
  }

  getCurrentTick(): number {
    return this.currentTick
  }

  findProfile(npcId: string): NpcProfile | null {
    for (const profile of this.profiles) {
      if (profile.id === npcId) return profile
    }
    return null
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

    // ---- NPC engine：tile-by-tile 移動、活動、互動 ----
    const npcResult = this.npcEngine.tick(nextTick)
    for (const event of npcResult.events) {
      const profile = this.profiles.find((p) => p.id === ('npcId' in event ? event.npcId : ''))
      if (event.kind === 'move') {
        const name = profile?.name.zh ?? event.npcId
        const fromName = TILE_NAME_BY_ID[event.from] ?? event.from
        const toName = TILE_NAME_BY_ID[event.to] ?? event.to
        // 檢查 NPC 是否已到達目的地（next.tile === target_tile）以給更明確的敘事
        const npcState = this.npcEngine.getState(event.npcId)
        const reachedDest = npcState !== null && npcState.tile === npcState.targetTile
        const narration = reachedDest
          ? `${name}抵達了${toName}。`
          : `${name}離開了${fromName}，前往${toName}。`
        drafts.push(
          this.narrativeDraft(event.npcId, nextTick, {
            eventType: 'NPC_MOVE',
            actorId: event.npcId,
            payload: {
              from: event.from,
              to: event.to,
              activity: event.activity,
              reachedDest
            },
            narration
          })
        )
      } else if (event.kind === 'activity') {
        const name = profile?.name.zh ?? event.npcId
        const tileName = TILE_NAME_BY_ID[event.tile] ?? event.tile
        drafts.push(
          this.narrativeDraft(event.npcId, nextTick, {
            eventType: 'NPC_ACTIVITY',
            actorId: event.npcId,
            payload: { tile: event.tile, from: event.from, to: event.to },
            narration: `${name}在${tileName}${activityVerb(event.to)}。`
          })
        )
      } else if (event.kind === 'interact') {
        const [a, b] = event.participants
        drafts.push(
          this.narrativeDraft(`${a}.${b}`, nextTick, {
            eventType: 'NPC_INTERACT',
            actorId: a,
            payload: {
              tile: event.tile,
              with: b,
              mode: event.mode
            },
            narration: event.narration
          })
        )
      }
    }
    // 把 NPC state 變更寫回 FACT_SET，讓重啟可 hydrate
    for (const change of npcResult.changedStates) {
      drafts.push(
        this.factSetDraft(
          `${NPC_STATE_PREFIX}${change.npcId}`,
          { ...change.state },
          change.npcId,
          nextTick
        )
      )
    }

    // ---- 天氣 / 季節 / 稀有窗口 / 世界事件 ----
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
      drafts.push(
        this.factSetDraft(
          FACT_RARE_WINDOW,
          { open: true, closesAt: this.rareWindowClosesAtTick },
          SIM_ACTOR_WORLD,
          nextTick
        )
      )
      drafts.push(
        this.narrativeDraft('world.rareWindow', nextTick, {
          eventType: 'WORLD_RARE_WINDOW_OPENED',
          actorId: SIM_ACTOR_WORLD,
          payload: { windowId: 'tide_festival', closesAtTick: this.rareWindowClosesAtTick },
          narration: '潮汐節的窗口開啟了，浪花區會在二十分鐘內進入慶典。'
        })
      )
    } else if (this.rareWindowOpen && nextTick >= this.rareWindowClosesAtTick) {
      this.rareWindowOpen = false
      drafts.push(
        this.factSetDraft(FACT_RARE_WINDOW, { open: false, closesAt: null }, SIM_ACTOR_WORLD, nextTick)
      )
      drafts.push(
        this.narrativeDraft('world.rareWindow', nextTick, {
          eventType: 'WORLD_RARE_WINDOW_CLOSED',
          actorId: SIM_ACTOR_WORLD,
          payload: { windowId: 'tide_festival' },
          narration: '潮汐節的窗口悄然閉合，浪花區回歸日常喧囂。'
        })
      )
    }

    const eventDelta = this.eventEngine.tick(nextTick, {
      weather: this.weather,
      season: this.season
    })
    if (eventDelta.spawned.length > 0 || eventDelta.expired.length > 0) {
      drafts.push(this.factSetDraft(FACT_ACTIVE_EVENTS, eventDelta.active, SIM_ACTOR_WORLD, nextTick))
      for (const event of eventDelta.spawned) {
        drafts.push(
          this.narrativeDraft(`world.event.${event.id}`, nextTick, {
            eventType: 'WORLD_EVENT_SPAWNED',
            actorId: SIM_ACTOR_WORLD,
            payload: {
              templateId: event.templateId,
              type: event.type,
              scope: event.scope,
              endsAtTick: event.endsAtTick,
              text: event.text,
              data: event.payload
            },
            narration: event.text.zh
          })
        )
      }
      for (const event of eventDelta.expired) {
        drafts.push(
          this.narrativeDraft(`world.event.${event.id}.end`, nextTick, {
            eventType: 'WORLD_EVENT_ENDED',
            actorId: SIM_ACTOR_WORLD,
            payload: { templateId: event.templateId, type: event.type, scope: event.scope },
            narration: null
          })
        )
      }
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

    for (const tl of this.tickListeners) {
      try {
        tl(nextTick)
      } catch (err) {
        console.error('[sim] tick listener error', err)
      }
    }
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
    // Hydrate NPC state from the new npc.state.<id> facts. Backward-
    // compatible：若這些 keys 不存在但舊版本的 npc.<id>.location 存在，
    // 就把舊的位置補上去。
    for (const profile of this.profiles) {
      const newKey = `${NPC_STATE_PREFIX}${profile.id}`
      const newRaw = state.facts[newKey]
      if (newRaw) {
        this.npcEngine.hydrate(profile.id, newRaw)
        continue
      }
      const legacyKey = `npc.${profile.id}.location`
      const legacy = state.facts[legacyKey]
      if (typeof legacy === 'string') {
        this.npcEngine.hydrate(profile.id, { tile: legacy, targetTile: legacy })
      }
    }
    const activeEventsFact = state.facts[FACT_ACTIVE_EVENTS]
    if (Array.isArray(activeEventsFact)) {
      const restored: ActiveWorldEvent[] = []
      for (const item of activeEventsFact) {
        if (!item || typeof item !== 'object') continue
        const candidate = item as Partial<ActiveWorldEvent> & {
          templateId?: unknown
          startedAtTick?: unknown
        }
        if (
          typeof candidate.templateId === 'string' &&
          typeof candidate.startedAtTick === 'number'
        ) {
          const rebuilt = rebuildActiveEvent(candidate.templateId, candidate.startedAtTick, {
            weather: this.weather,
            season: this.season
          })
          if (rebuilt) restored.push(rebuilt)
        }
      }
      this.eventEngine.hydrate(restored, this.currentTick)
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

function activityVerb(activity: NpcActivity): string {
  switch (activity) {
    case 'work':
      return '開始工作'
    case 'eat':
      return '正在用餐'
    case 'sleep':
      return '進入休息狀態'
    case 'trade':
      return '擺出交易陣式'
    case 'patrol':
      return '巡視四周'
    case 'idle':
      return '稍作停留'
    case 'move':
      return '正在移動'
  }
}

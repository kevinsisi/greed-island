// AreaState engine — Living World Priority 2: World Pressure System.
//
// 為每個 tile 維護兩組可觀測狀態：
//   1. factionControl：四個派系（潮獵會 / 自由潮感者 / 公會 / 平民）在
//      該 tile 的影響力 0..100。NPC 在 tile 上活動會推升其派系分；
//      其他派系緩慢回歸中性；分數超過 80 時，tile 進入「派系控制」狀態。
//   2. resources：food / safety / economy 0..100。每 N tick 自然衰退；
//      NPC 活動（trade=+economy、patrol=+safety、fight=-safety、
//      eat=-food）即時影響；任一資源 < 30 時觸發壓力事件。
//
// 此 engine 不直接寫 EventLog；它產出 `AreaStateTickResult`，由
// SimulationRuntime 包成 FACT_SET / 敘事事件寫進 kernel。重啟時透過
// `area.state.<tileId>` 的 fact 還原。
//
// 天氣亦會影響 area：暴風雨/驟雨會把 safety 拉低；晴/微風會把 economy
// 微推。weather 字串由 runtime 餵進 `tick()` 的 facts 參數。

import { TICKS_PER_HOUR } from '../config/world.js'
import { MAP_TILES, TILE_NAME_BY_ID } from './mapGraph.js'
import type { NpcActivity, NpcRuntimeState } from './npcEngine.js'

export const FACTIONS = [
  'tide_hunters',
  'free_runners',
  'guild',
  'civilian'
] as const
export type FactionId = (typeof FACTIONS)[number]

export const FACTION_LABEL_ZH: Readonly<Record<FactionId, string>> = {
  tide_hunters: '潮獵會',
  free_runners: '自由潮感者',
  guild: '公會',
  civilian: '平民'
}

export const FACTION_LABEL_EN: Readonly<Record<FactionId, string>> = {
  tide_hunters: 'Tide-Hunters',
  free_runners: 'Free-Runners',
  guild: 'Guild',
  civilian: 'Civilians'
}

const FACTION_DOMINANCE_THRESHOLD = 80
const FACTION_SHIFT_PER_NPC_TICK = 0.6
const FACTION_DECAY_PER_TICK = 0.08

const RESOURCE_MIN = 0
const RESOURCE_MAX = 100
const RESOURCE_NATURAL_DECAY_PER_HOUR = 4
const RESOURCE_PRESSURE_THRESHOLD = 30
const RESOURCE_PRESSURE_COOLDOWN_TICKS = TICKS_PER_HOUR

type ResourceKey = 'food' | 'safety' | 'economy'
const RESOURCE_KEYS: readonly ResourceKey[] = ['food', 'safety', 'economy']

export type FactionControlMap = Readonly<Record<FactionId, number>>
export type ResourceMap = Readonly<Record<ResourceKey, number>>

export type AreaState = Readonly<{
  tileId: string
  factionControl: FactionControlMap
  dominantFaction: FactionId | null
  resources: ResourceMap
  lastUpdatedTick: number
  recentEvents: ReadonlyArray<AreaLocalEvent>
}>

export type AreaLocalEvent = Readonly<{
  tick: number
  kind:
    | 'faction.dominance'
    | 'faction.lost'
    | 'pressure.food_shortage'
    | 'pressure.crime_spike'
    | 'pressure.price_hike'
  narration: string
  detail: Record<string, string | number>
}>

export type AreaStatePressureEvent = Readonly<{
  tileId: string
  kind: AreaLocalEvent['kind']
  narration: string
  detail: Record<string, string | number>
}>

export type AreaStateTickFacts = Readonly<{
  weather: string
  npcStates: ReadonlyMap<string, NpcRuntimeState>
  npcFactionLean: ReadonlyMap<string, FactionId>
}>

export type AreaStateTickResult = Readonly<{
  changed: ReadonlyArray<AreaState>
  pressureEvents: ReadonlyArray<AreaStatePressureEvent>
}>

const INITIAL_RESOURCES: ResourceMap = { food: 70, safety: 70, economy: 65 }
const INITIAL_FACTION: FactionControlMap = {
  tide_hunters: 15,
  free_runners: 5,
  guild: 15,
  civilian: 30
}

function makeInitialState(tileId: string): AreaState {
  return {
    tileId,
    factionControl: { ...INITIAL_FACTION },
    dominantFaction: null,
    resources: { ...INITIAL_RESOURCES },
    lastUpdatedTick: 0,
    recentEvents: []
  }
}

function clamp(value: number, lo: number, hi: number): number {
  if (!Number.isFinite(value)) return lo
  if (value < lo) return lo
  if (value > hi) return hi
  return value
}

function isFactionId(v: unknown): v is FactionId {
  return typeof v === 'string' && (FACTIONS as readonly string[]).includes(v)
}

const ACTIVITY_RESOURCE_DELTA: Readonly<
  Record<NpcActivity, Partial<ResourceMap>>
> = {
  idle: {},
  move: {},
  work: { economy: 0.05 },
  eat: { food: -0.25 },
  sleep: {},
  trade: { economy: 0.4 },
  patrol: { safety: 0.25 }
}

const WEATHER_RESOURCE_DELTA: Readonly<
  Record<string, Partial<ResourceMap>>
> = {
  晴: { economy: 0.05 },
  微風: { economy: 0.04 },
  陰: {},
  霧雨: { safety: -0.06 },
  驟雨: { safety: -0.18, economy: -0.05 }
}

export class AreaStateEngine {
  private states: Map<string, AreaState> = new Map()
  private lastPressureTickByKey: Map<string, number> = new Map()

  constructor(private readonly tileIds: readonly string[] = MAP_TILES.map((t) => t.id)) {
    for (const id of tileIds) {
      this.states.set(id, makeInitialState(id))
    }
  }

  hydrate(tileId: string, raw: unknown): void {
    if (!raw || typeof raw !== 'object') return
    const r = raw as Partial<AreaState>
    const fallback = this.states.get(tileId) ?? makeInitialState(tileId)

    const factionControl: Record<FactionId, number> = { ...fallback.factionControl }
    if (r.factionControl && typeof r.factionControl === 'object') {
      for (const f of FACTIONS) {
        const v = (r.factionControl as Record<string, unknown>)[f]
        if (typeof v === 'number') factionControl[f] = clamp(v, 0, 100)
      }
    }

    const resources: Record<ResourceKey, number> = { ...fallback.resources }
    if (r.resources && typeof r.resources === 'object') {
      for (const k of RESOURCE_KEYS) {
        const v = (r.resources as Record<string, unknown>)[k]
        if (typeof v === 'number') resources[k] = clamp(v, RESOURCE_MIN, RESOURCE_MAX)
      }
    }

    const recentEvents: AreaLocalEvent[] = []
    if (Array.isArray(r.recentEvents)) {
      for (const item of r.recentEvents.slice(-8)) {
        if (!item || typeof item !== 'object') continue
        const it = item as Partial<AreaLocalEvent>
        if (
          typeof it.tick === 'number' &&
          typeof it.kind === 'string' &&
          typeof it.narration === 'string'
        ) {
          recentEvents.push({
            tick: it.tick,
            kind: it.kind as AreaLocalEvent['kind'],
            narration: it.narration,
            detail: (it.detail as Record<string, string | number>) ?? {}
          })
        }
      }
    }

    const dominantFaction = isFactionId(r.dominantFaction) ? r.dominantFaction : null

    this.states.set(tileId, {
      tileId,
      factionControl,
      dominantFaction,
      resources,
      lastUpdatedTick: typeof r.lastUpdatedTick === 'number' ? r.lastUpdatedTick : 0,
      recentEvents
    })
  }

  getState(tileId: string): AreaState | null {
    return this.states.get(tileId) ?? null
  }

  snapshotAll(): AreaState[] {
    return [...this.states.values()].map(cloneState)
  }

  tick(currentTick: number, facts: AreaStateTickFacts): AreaStateTickResult {
    const changed: AreaState[] = []
    const pressureEvents: AreaStatePressureEvent[] = []

    const npcsByTile = new Map<string, Array<{ npcId: string; faction: FactionId; activity: NpcActivity }>>()
    for (const [npcId, state] of facts.npcStates) {
      if (state.activity === 'move') continue
      const fac = facts.npcFactionLean.get(npcId) ?? 'civilian'
      const list = npcsByTile.get(state.tile) ?? []
      list.push({ npcId, faction: fac, activity: state.activity })
      npcsByTile.set(state.tile, list)
    }

    for (const tileId of this.tileIds) {
      const before = this.states.get(tileId)
      if (!before) continue

      const occupants = npcsByTile.get(tileId) ?? []

      const factionControl: Record<FactionId, number> = { ...before.factionControl }

      for (const f of FACTIONS) {
        factionControl[f] = clamp(factionControl[f] - FACTION_DECAY_PER_TICK, 0, 100)
      }

      for (const occupant of occupants) {
        factionControl[occupant.faction] = clamp(
          factionControl[occupant.faction] + FACTION_SHIFT_PER_NPC_TICK,
          0,
          100
        )
      }

      let dominantFaction: FactionId | null = null
      let topScore = FACTION_DOMINANCE_THRESHOLD
      for (const f of FACTIONS) {
        if (factionControl[f] > topScore) {
          topScore = factionControl[f]
          dominantFaction = f
        }
      }

      const resources: Record<ResourceKey, number> = { ...before.resources }

      const naturalDecayPerTick = RESOURCE_NATURAL_DECAY_PER_HOUR / TICKS_PER_HOUR
      for (const k of RESOURCE_KEYS) {
        resources[k] = clamp(resources[k] - naturalDecayPerTick, RESOURCE_MIN, RESOURCE_MAX)
      }

      for (const occupant of occupants) {
        const delta = ACTIVITY_RESOURCE_DELTA[occupant.activity] ?? {}
        for (const k of RESOURCE_KEYS) {
          const d = delta[k]
          if (typeof d === 'number') {
            resources[k] = clamp(resources[k] + d, RESOURCE_MIN, RESOURCE_MAX)
          }
        }
      }

      const weatherDelta = WEATHER_RESOURCE_DELTA[facts.weather] ?? {}
      for (const k of RESOURCE_KEYS) {
        const d = weatherDelta[k]
        if (typeof d === 'number') {
          resources[k] = clamp(resources[k] + d, RESOURCE_MIN, RESOURCE_MAX)
        }
      }

      if (dominantFaction === 'tide_hunters') {
        resources.safety = clamp(resources.safety - 0.05, RESOURCE_MIN, RESOURCE_MAX)
      } else if (dominantFaction === 'guild') {
        resources.economy = clamp(resources.economy + 0.04, RESOURCE_MIN, RESOURCE_MAX)
      }

      const newRecentEvents: AreaLocalEvent[] = [...before.recentEvents]
      const pushLocalEvent = (ev: AreaLocalEvent) => {
        newRecentEvents.push(ev)
        while (newRecentEvents.length > 8) newRecentEvents.shift()
      }

      if (dominantFaction !== before.dominantFaction) {
        const tileName = TILE_NAME_BY_ID[tileId] ?? tileId
        if (dominantFaction !== null) {
          const factionName = FACTION_LABEL_ZH[dominantFaction]
          const narration = `${factionName}在${tileName}的影響力跨過 80 — 此區進入${factionName}控制下。`
          pushLocalEvent({
            tick: currentTick,
            kind: 'faction.dominance',
            narration,
            detail: { faction: dominantFaction }
          })
          pressureEvents.push({
            tileId,
            kind: 'faction.dominance',
            narration,
            detail: { faction: dominantFaction }
          })
        } else if (before.dominantFaction !== null) {
          const factionName = FACTION_LABEL_ZH[before.dominantFaction]
          const narration = `${tileName}脫離${factionName}的掌控，影響力重新流動。`
          pushLocalEvent({
            tick: currentTick,
            kind: 'faction.lost',
            narration,
            detail: { faction: before.dominantFaction }
          })
          pressureEvents.push({
            tileId,
            kind: 'faction.lost',
            narration,
            detail: { faction: before.dominantFaction }
          })
        }
      }

      for (const k of RESOURCE_KEYS) {
        if (resources[k] < RESOURCE_PRESSURE_THRESHOLD) {
          const pkey = `${tileId}:${k}`
          const lastTick = this.lastPressureTickByKey.get(pkey) ?? -RESOURCE_PRESSURE_COOLDOWN_TICKS
          if (currentTick - lastTick < RESOURCE_PRESSURE_COOLDOWN_TICKS) continue
          this.lastPressureTickByKey.set(pkey, currentTick)
          const tileName = TILE_NAME_BY_ID[tileId] ?? tileId
          const kind: AreaLocalEvent['kind'] =
            k === 'food'
              ? 'pressure.food_shortage'
              : k === 'safety'
                ? 'pressure.crime_spike'
                : 'pressure.price_hike'
          const narration = composePressureNarration(kind, tileName, resources[k])
          pushLocalEvent({
            tick: currentTick,
            kind,
            narration,
            detail: { resource: k, value: Math.round(resources[k]) }
          })
          pressureEvents.push({
            tileId,
            kind,
            narration,
            detail: { resource: k, value: Math.round(resources[k]) }
          })
        }
      }

      const next: AreaState = {
        tileId,
        factionControl,
        dominantFaction,
        resources,
        lastUpdatedTick: currentTick,
        recentEvents: newRecentEvents
      }
      if (areaStatesEqualForPersist(before, next)) {
        const merged: AreaState = { ...before, lastUpdatedTick: currentTick }
        this.states.set(tileId, merged)
        continue
      }

      this.states.set(tileId, next)
      changed.push(cloneState(next))
    }

    return { changed, pressureEvents }
  }
}

function areaStatesEqualForPersist(a: AreaState, b: AreaState): boolean {
  if (a.dominantFaction !== b.dominantFaction) return false
  if (a.recentEvents.length !== b.recentEvents.length) return false
  const lastA = a.recentEvents[a.recentEvents.length - 1]
  const lastB = b.recentEvents[b.recentEvents.length - 1]
  if ((lastA?.tick ?? -1) !== (lastB?.tick ?? -1)) return false
  for (const f of FACTIONS) {
    if (Math.round(a.factionControl[f]) !== Math.round(b.factionControl[f])) return false
  }
  for (const k of RESOURCE_KEYS) {
    if (Math.round(a.resources[k]) !== Math.round(b.resources[k])) return false
  }
  return true
}

function cloneState(s: AreaState): AreaState {
  return {
    tileId: s.tileId,
    factionControl: { ...s.factionControl },
    dominantFaction: s.dominantFaction,
    resources: { ...s.resources },
    lastUpdatedTick: s.lastUpdatedTick,
    recentEvents: s.recentEvents.map((e) => ({ ...e, detail: { ...e.detail } }))
  }
}

function composePressureNarration(
  kind: AreaLocalEvent['kind'],
  tileName: string,
  value: number
): string {
  const v = Math.round(value)
  switch (kind) {
    case 'pressure.food_shortage':
      return `${tileName}出現食物短缺（存量 ${v}），居民開始排隊搶米。`
    case 'pressure.crime_spike':
      return `${tileName}治安惡化（指數 ${v}），夜裡傳出多起鬧事與搶劫。`
    case 'pressure.price_hike':
      return `${tileName}經濟蕭條（指數 ${v}），物價飆漲讓商戶都皺起眉頭。`
    default:
      return `${tileName}承受著未知的壓力。`
  }
}

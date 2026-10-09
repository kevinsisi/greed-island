import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  api,
  streamUrl,
  type ServerActiveWorldEvent,
  type ServerCardCatalog,
  type ServerMap,
  type ServerNarrativeEvent,
  type ServerNpc,
  type ServerDashboard,
  type ServerWorldSnapshot
} from '../api/client'
import type {
  CardCatalogEntry,
  DashboardSummary,
  EventSummary,
  MapTile,
  NpcSummary,
  WorldMap,
  WorldSnapshot
} from './types'
import { useI18n, type Locale } from '../i18n'
import { useAuth } from './AuthContext'
import { createFixtureRecoveryScheduler } from './fixtureRecoveryRetry'
import { installMobileRefreshTriggers } from './mobileRefreshTriggers'
import { createRefreshGenerationGuard } from './refreshGeneration'
import { resilientLoad } from './resilientLoad'
import { createSingleFlight } from './singleFlight'

interface WorldStateValue {
  world: WorldSnapshot
  npcs: NpcSummary[]
  events: EventSummary[]
  cards: CardCatalogEntry[]
  map: WorldMap
  dashboard: DashboardSummary | null
  worldEvents: ServerActiveWorldEvent[]
  liveConnected: boolean
  source: 'fixture' | 'server'
  loadError: string | null
  refreshWorld: () => Promise<void>
}

const WorldStateContext = createContext<WorldStateValue | null>(null)

const RECENT_EVENT_LIMIT = 100
// SSE snapshot is emitted after each backend tick; polling remains a slower
// fallback for browsers or proxies that cannot keep EventSource open.
const POLL_FALLBACK_MS = 15_000
const SSE_RECONNECT_MS = 5_000
const VALID_BIOMES: readonly MapTile['biome'][] = [
  'grass',
  'forest',
  'mountain',
  'desert',
  'water',
  'ruin'
]

export function WorldStateProvider({ children }: { children: ReactNode }) {
  const { locale } = useI18n()
  const { accountId } = useAuth()
  // Long-lived poll/SSE handlers read the latest account identity without recreating
  // connections on login/logout.
  const accountIdRef = useRef<number | null>(accountId)
  accountIdRef.current = accountId

  const [serverDashboard, setServerDashboard] = useState<ServerDashboard | null>(null)
  const [serverWorld, setServerWorld] = useState<ServerWorldSnapshot | null>(null)
  const [serverNpcs, setServerNpcs] = useState<ServerNpc[] | null>(null)
  const [serverEvents, setServerEvents] = useState<ServerNarrativeEvent[] | null>(null)
  const [serverCards, setServerCards] = useState<ServerCardCatalog | null>(null)
  const [serverMap, setServerMap] = useState<ServerMap | null>(null)
  const [liveConnected, setLiveConnected] = useState<boolean>(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const mountedRef = useRef(true)
  const hasServerWorldRef = useRef(false)
  hasServerWorldRef.current = serverWorld !== null

  const eventsRef = useRef<ServerNarrativeEvent[]>([])
  eventsRef.current = serverEvents ?? []

  const refreshWorld = useCallback(async () => {
    try {
      const world = await resilientLoad(() => api.world())
      if (!mountedRef.current) return
      hasServerWorldRef.current = true
      setServerWorld(world)
      setLoadError(null)
    } catch (error) {
      if (!mountedRef.current) return
      setLoadError(error instanceof Error ? error.message : 'Failed to load world state.')
      throw error
    }
  }, [])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    const refreshGuard = createRefreshGenerationGuard()
    const refreshSingleFlight = createSingleFlight<void>()
    const fixtureRecovery = createFixtureRecoveryScheduler({
      hasServerWorld: () => hasServerWorldRef.current,
      refresh: () => void refreshAll(),
      windowTarget: window
    })

    const isCurrentRefresh = (generation: number) => !cancelled && refreshGuard.isCurrent(generation)

    const acceptServerWorld = (world: ServerWorldSnapshot) => {
      if (cancelled) return
      hasServerWorldRef.current = true
      fixtureRecovery.cancel()
      setServerWorld(world)
    }

    const refreshNpcs = async (generation?: number) => {
      const expectedAccountId = accountIdRef.current
      const npcs = await resilientLoad(() => api.npcs(expectedAccountId))
      if (!cancelled && expectedAccountId === accountIdRef.current && (generation === undefined || isCurrentRefresh(generation))) setServerNpcs(npcs)
    }

    const refreshAll = () => refreshSingleFlight.run(async () => {
      const generation = refreshGuard.next()
      const expectedAccountId = accountIdRef.current
      const requests = [
        refreshWorld(),
        expectedAccountId === null ? Promise.resolve() : resilientLoad(() => api.dashboard(expectedAccountId)).then(next => { if (expectedAccountId === accountIdRef.current && isCurrentRefresh(generation)) setServerDashboard(next) }),
        refreshNpcs(generation),
        resilientLoad(() => api.events(RECENT_EVENT_LIMIT)).then((events) => {
          if (isCurrentRefresh(generation)) setServerEvents(events)
        }),
        resilientLoad(() => api.cards()).then((cards) => {
          if (isCurrentRefresh(generation)) setServerCards(cards)
        }),
        resilientLoad(() => api.map()).then((map) => {
          if (isCurrentRefresh(generation)) setServerMap(map)
        })
      ]

      const results = await Promise.allSettled(requests)
      if (!isCurrentRefresh(generation)) return
      const failed = results.find((result) => result.status === 'rejected')
      setLoadError(
        failed && failed.status === 'rejected'
          ? failed.reason instanceof Error
            ? failed.reason.message
            : 'Failed to load part of world state.'
          : null
      )
      if (failed) fixtureRecovery.schedule()
    })

    refreshAll()
    const pollTimer = window.setInterval(refreshAll, POLL_FALLBACK_MS)
    const cleanupMobileRefreshTriggers = installMobileRefreshTriggers({
      windowTarget: window,
      documentTarget: document,
      getVisibilityState: () => document.visibilityState,
      refresh: () => void refreshAll()
    })

    let source: EventSource | null = null
    let reconnectTimer: number | null = null
    let stopped = false

    const connect = () => {
      if (stopped) return
      try {
        source = new EventSource(streamUrl(), { withCredentials: true })
      } catch {
        return
      }
      source.addEventListener('open', () => setLiveConnected(true))
      source.addEventListener('error', () => {
        setLiveConnected(false)
        if (source) {
          source.close()
          source = null
        }
        if (!stopped && reconnectTimer === null) {
          reconnectTimer = window.setTimeout(() => {
            reconnectTimer = null
            connect()
          }, SSE_RECONNECT_MS)
        }
      })
      source.addEventListener('snapshot', (ev) => {
        try {
          const snap = JSON.parse((ev as MessageEvent).data) as ServerWorldSnapshot
          const generation = refreshGuard.next()
          acceptServerWorld(snap)
          void refreshNpcs(generation).catch(() => {
            // surfaced via the periodic poller
          })
        } catch {
          // ignore malformed snapshot
        }
      })
      source.addEventListener('event', (ev) => {
        try {
          const event = JSON.parse((ev as MessageEvent).data) as ServerNarrativeEvent
          const next = [event, ...eventsRef.current].slice(0, RECENT_EVENT_LIMIT)
          eventsRef.current = next
          setServerEvents(next)
        } catch {
          // ignore malformed event
        }
      })
    }
    connect()

    return () => {
      cancelled = true
      stopped = true
      window.clearInterval(pollTimer)
      fixtureRecovery.cancel()
      cleanupMobileRefreshTriggers()
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer)
      if (source) source.close()
    }
  }, [refreshWorld])

  useEffect(() => {
    let cancelled = false
    api
      .npcs(accountId)
      .then((npcs) => {
        if (!cancelled) setServerNpcs(npcs)
      })
      .catch(() => {
        // surfaced via the periodic poller
      })
    return () => {
      cancelled = true
    }
  }, [accountId])

  const value = useMemo<WorldStateValue | null>(() => {
    if (serverWorld === null || serverNpcs === null || serverEvents === null || serverCards === null || serverMap === null) return null

    const world: WorldSnapshot = {
      tick: serverWorld.tick, lastSequence: serverWorld.lastSequence, eventCount: serverWorld.eventCount,
      npcCount: serverWorld.npcCount, facts: serverWorld.facts,
      worldCivilization: serverWorld.worldCivilization ?? { goals: [], technologies: [] },
      worldConfig: normalizeWorldConfig(serverWorld.worldConfig), generatedAt: serverWorld.generatedAt,
    }
    const events = serverEvents.map(toEventSummary)
    const npcs = serverNpcs.map(n => toNpcSummary(n, locale)).filter(n => !n.deceased)
    const cards = serverCards.entries.map(c => toCardEntry(c, locale))
    const map = toWorldMap(serverMap)

    const worldEvents: ServerActiveWorldEvent[] = (() => {
      const raw = world.facts['activeEvents']
      return Array.isArray(raw) ? (raw as ServerActiveWorldEvent[]) : []
    })()

    const dashboard: DashboardSummary | null = serverDashboard ? { ...serverDashboard, world, recentEvents: serverDashboard.recentEvents.map(toEventSummary) } : null

    return {
      world,
      npcs,
      events,
      cards,
      map,
      dashboard,
      worldEvents,
      liveConnected,
      source: 'server',
      loadError,
      refreshWorld
    }
  }, [serverWorld, serverDashboard, serverNpcs, serverEvents, serverCards, serverMap, liveConnected, loadError, locale, refreshWorld])

  if (!value) return <section className="gi-panel p-5" role={loadError ? 'alert' : 'status'}><p>{loadError || '正在取得伺服器世界資料…'}</p><p>資料未就緒時，這些世界檢視不會以示範資料代替。</p><button type="button" onClick={() => { void refreshWorld().catch(() => {}) }}>重新載入</button></section>
  return <WorldStateContext.Provider value={value}>{children}</WorldStateContext.Provider>
}

export function useWorldState(): WorldStateValue {
  const value = useContext(WorldStateContext)
  if (!value) {
    throw new Error('useWorldState must be used inside <WorldStateProvider>')
  }
  return value
}

function normalizeWorldConfig(
  config: ServerWorldSnapshot['worldConfig']
): WorldSnapshot['worldConfig'] {
  return {
    tickDurationMs: config?.tickDurationMs ?? 5_000,
    ticksPerDay: config?.ticksPerDay ?? 17_280,
    timezone: config?.timezone ?? 'GMT+8',
    timezoneOffsetMinutes:
      config?.timezoneOffsetMinutes ?? 480
  }
}

function toEventSummary(event: ServerNarrativeEvent): EventSummary {
  return {
    sequence: event.sequence,
    tick: event.tick,
    eventType: event.eventType,
    actorId: event.actorId,
    occurredAt: event.occurredAt,
    payload: event.payload,
    narration: event.narration
  }
}

function toNpcSummary(npc: ServerNpc, locale: Locale): NpcSummary {
  const name = pickLocaleString(npc.name, locale)
  const role = pickLocaleString(npc.role, locale)
  // exactOptionalPropertyTypes forbids assigning `undefined` to optional fields;
  // build with conditional spreads instead.
  const summary: NpcSummary = {
    id: npc.id,
    name,
    role,
    location: npc.location,
    relationshipScore: npc.relationshipScore,
    lastActedTick: npc.lastActedTick,
    internalState: { ...npc.internalState },
    // v0.87.3+: undefined from legacy servers means alive; only `=== true` blocks dialog.
    deceased: npc.deceased === true,
    ...(npc.activity ? { activity: npc.activity } : {}),
    ...(typeof npc.mood === 'number' ? { mood: npc.mood } : {}),
    ...(typeof npc.health === 'number' ? { health: npc.health } : {}),
    ...(typeof npc.faction === 'string' ? { faction: npc.faction } : {}),
    ...(typeof npc.targetTile === 'string' ? { targetTile: npc.targetTile } : {}),
    ...(typeof npc.subCol === 'number' ? { subCol: npc.subCol } : {}),
    ...(typeof npc.subRow === 'number' ? { subRow: npc.subRow } : {}),
    ...(typeof npc.subZ === 'number' ? { subZ: npc.subZ } : {}),
    ...(typeof npc.buildingId === 'string' || npc.buildingId === null
      ? { buildingId: npc.buildingId }
      : {}),
    ...(isTravelRoute(npc.travelRoute)
      ? { travelRoute: { ...npc.travelRoute } }
      : npc.travelRoute === null
        ? { travelRoute: null }
        : {}),
    ...(typeof npc.color === 'number' ? { color: npc.color } : {}),
    ...(npc.greetLine && typeof npc.greetLine.zh === 'string' && typeof npc.greetLine.en === 'string'
      ? { greetLine: { zh: npc.greetLine.zh, en: npc.greetLine.en } }
      : {}),
    ...(npc.intentLine && typeof npc.intentLine.zh === 'string' && typeof npc.intentLine.en === 'string'
      ? { intentLine: { zh: npc.intentLine.zh, en: npc.intentLine.en } }
      : {}),
    ...(npc.cognitiveLine && typeof npc.cognitiveLine.zh === 'string' && typeof npc.cognitiveLine.en === 'string'
      ? { cognitiveLine: { zh: npc.cognitiveLine.zh, en: npc.cognitiveLine.en } }
      : {}),
    ...(isCognitiveEvolution(npc.cognitiveEvolution)
      ? { cognitiveEvolution: npc.cognitiveEvolution }
      : {}),
    ...(npc.life && npc.life.goal && npc.life.needs
      ? { life: npc.life }
      : {}),
    ...(npc.recentUtterance && typeof npc.recentUtterance.text === 'string'
      ? { recentUtterance: npc.recentUtterance }
      : npc.recentUtterance === null
        ? { recentUtterance: null }
        : {}),
  }
  return summary
}


function isCognitiveEvolution(value: unknown): value is NonNullable<NpcSummary['cognitiveEvolution']> {
  if (!value || typeof value !== 'object') return false
  const row = value as Partial<NonNullable<NpcSummary['cognitiveEvolution']>>
  return (
    typeof row.reflectionCount === 'number' &&
    typeof row.currentThoughtZh === 'string' &&
    (row.lastReflectionZh === null || typeof row.lastReflectionZh === 'string') &&
    (row.personalityTraceZh === null || typeof row.personalityTraceZh === 'string') &&
    (row.lifeGoalTraceZh === null || typeof row.lifeGoalTraceZh === 'string') &&
    (row.relationshipTraceZh === null || typeof row.relationshipTraceZh === 'string')
  )
}

function isTravelRoute(value: unknown): value is NonNullable<NpcSummary['travelRoute']> {
  if (!value || typeof value !== 'object') return false
  const route = value as Partial<NonNullable<NpcSummary['travelRoute']>>
  return (
    typeof route.fromTile === 'string' &&
    typeof route.toTile === 'string' &&
    typeof route.targetTile === 'string' &&
    typeof route.startedAtTick === 'number'
  )
}

function toCardEntry(
  card: {
    id: number
    rank: string
    category?: string
    nameZh: string
    nameEn: string
    description: string
    story: string
    maxCopies?: number
    acquisitionMethod?: string
    acquisitionDetail?: string
    effectDescription?: string
    imageUrl?: string
  },
  locale: Locale
): CardCatalogEntry {
  const rank = (card.rank as CardCatalogEntry['rank']) ?? 'D'
  const result: CardCatalogEntry = {
    id: card.id,
    rank,
    name: locale === 'zh' ? card.nameZh : card.nameEn,
    description: card.description,
    story: card.story,
    owned: false
  }
  if (typeof card.category === 'string') {
    result.category = card.category as NonNullable<CardCatalogEntry['category']>
  }
  if (typeof card.maxCopies === 'number') result.maxCopies = card.maxCopies
  if (typeof card.acquisitionMethod === 'string') {
    result.acquisitionMethod = card.acquisitionMethod as NonNullable<
      CardCatalogEntry['acquisitionMethod']
    >
  }
  if (card.acquisitionDetail) result.acquisitionDetail = card.acquisitionDetail
  if (card.effectDescription) result.effectDescription = card.effectDescription
  if (card.imageUrl) result.imageUrl = card.imageUrl
  return result
}

function toWorldMap(map: ServerMap): WorldMap {
  return {
    width: map.width,
    height: map.height,
    tiles: map.tiles.map((tile) => ({
      id: tile.id,
      name: tile.name,
      x: tile.x,
      y: tile.y,
      biome: (VALID_BIOMES as readonly string[]).includes(tile.biome)
        ? (tile.biome as MapTile['biome'])
        : 'grass',
      npcIds: tile.npcIds
    }))
  }
}

function pickLocaleString(value: { zh: string; en: string }, locale: Locale): string {
  return locale === 'zh' ? value.zh : value.en
}

// v0.87.3 — exposed for unit tests that verify the ServerNpc → NpcSummary mapping
// (e.g. deceased flag propagation). Not for production callers.
export const __testHooks__ = { toNpcSummary }

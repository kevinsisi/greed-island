import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  api,
  streamUrl,
  type ServerActiveWorldEvent,
  type ServerCardCatalog,
  type ServerMap,
  type ServerNarrativeEvent,
  type ServerNpc,
  type ServerWorldSnapshot
} from '../api/client'
import {
  fixtureCards,
  fixtureDashboard,
  fixtureEvents,
  fixtureMap,
  fixtureNpcs,
  fixtureWorld
} from './fixtures'
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
import { installMobileRefreshTriggers } from './mobileRefreshTriggers'
import { createRefreshGenerationGuard } from './refreshGeneration'
import { resilientLoad } from './resilientLoad'

interface WorldStateValue {
  world: WorldSnapshot
  npcs: NpcSummary[]
  events: EventSummary[]
  cards: CardCatalogEntry[]
  map: WorldMap
  dashboard: DashboardSummary
  worldEvents: ServerActiveWorldEvent[]
  liveConnected: boolean
  source: 'fixture' | 'server'
  loadError: string | null
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
  const { token } = useAuth()
  // Long-lived poll/SSE handlers read the latest token without recreating
  // connections on login/logout.
  const tokenRef = useRef<string | null>(token)
  tokenRef.current = token

  const [serverWorld, setServerWorld] = useState<ServerWorldSnapshot | null>(null)
  const [serverNpcs, setServerNpcs] = useState<ServerNpc[] | null>(null)
  const [serverEvents, setServerEvents] = useState<ServerNarrativeEvent[] | null>(null)
  const [serverCards, setServerCards] = useState<ServerCardCatalog | null>(null)
  const [serverMap, setServerMap] = useState<ServerMap | null>(null)
  const [liveConnected, setLiveConnected] = useState<boolean>(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  const eventsRef = useRef<ServerNarrativeEvent[]>([])
  eventsRef.current = serverEvents ?? []

  useEffect(() => {
    let cancelled = false
    const refreshGuard = createRefreshGenerationGuard()

    const isCurrentRefresh = (generation: number) => !cancelled && refreshGuard.isCurrent(generation)

    const refreshNpcs = async (generation?: number) => {
      const npcs = await resilientLoad(() => api.npcs(tokenRef.current))
      if (!cancelled && (generation === undefined || isCurrentRefresh(generation))) setServerNpcs(npcs)
    }

    const refreshAll = async () => {
      const generation = refreshGuard.next()
      const requests = [
        resilientLoad(() => api.world()).then((world) => {
          if (isCurrentRefresh(generation)) setServerWorld(world)
        }),
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
    }

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
        source = new EventSource(streamUrl())
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
          setServerWorld(snap)
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
      cleanupMobileRefreshTriggers()
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer)
      if (source) source.close()
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    api
      .npcs(token)
      .then((npcs) => {
        if (!cancelled) setServerNpcs(npcs)
      })
      .catch(() => {
        // surfaced via the periodic poller
      })
    return () => {
      cancelled = true
    }
  }, [token])

  const value = useMemo<WorldStateValue>(() => {
    const usingServer = serverWorld !== null

    const world: WorldSnapshot = serverWorld
      ? {
          tick: serverWorld.tick,
          lastSequence: serverWorld.lastSequence,
          eventCount: serverWorld.eventCount,
          npcCount: serverWorld.npcCount,
          facts: serverWorld.facts,
          worldConfig: normalizeWorldConfig(serverWorld.worldConfig),
          generatedAt: serverWorld.generatedAt
        }
      : fixtureWorld

    const events: EventSummary[] =
      serverEvents !== null
        ? serverEvents.map(toEventSummary)
        : fixtureEvents

    const npcs: NpcSummary[] =
      serverNpcs !== null
        ? serverNpcs.map((n) => toNpcSummary(n, locale))
        : fixtureNpcs

    const cards: CardCatalogEntry[] =
      serverCards !== null
        ? serverCards.entries.map((c) => toCardEntry(c, locale))
        : fixtureCards

    const map: WorldMap = serverMap !== null ? toWorldMap(serverMap) : fixtureMap

    const cardsOwned = cards.filter((c) => c.owned).length
    const recentEvents = events.slice(0, 5)
    const rareWindowOpen = Boolean(world.facts['rareWindowOpen']) || fixtureDashboard.rareWindowOpen
    const worldEvents: ServerActiveWorldEvent[] = (() => {
      const raw = world.facts['activeEvents']
      return Array.isArray(raw) ? (raw as ServerActiveWorldEvent[]) : []
    })()

    const dashboard: DashboardSummary = usingServer
      ? {
          world,
          cardsOwned,
          cardsTotal: cards.length,
          recentEvents,
          rareWindowOpen,
          ticksSinceLastVisit: 0
        }
      : { ...fixtureDashboard, world }

    return {
      world,
      npcs,
      events,
      cards,
      map,
      dashboard,
      worldEvents,
      liveConnected,
      source: usingServer ? 'server' : 'fixture',
      loadError
    }
  }, [serverWorld, serverNpcs, serverEvents, serverCards, serverMap, liveConnected, loadError, locale])

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
    tickDurationMs: config?.tickDurationMs ?? fixtureWorld.worldConfig.tickDurationMs,
    ticksPerDay: config?.ticksPerDay ?? fixtureWorld.worldConfig.ticksPerDay,
    timezone: config?.timezone ?? fixtureWorld.worldConfig.timezone,
    timezoneOffsetMinutes:
      config?.timezoneOffsetMinutes ?? fixtureWorld.worldConfig.timezoneOffsetMinutes
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
      : {})
  }
  return summary
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

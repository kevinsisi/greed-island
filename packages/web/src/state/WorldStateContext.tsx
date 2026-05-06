import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  fixtureCards,
  fixtureDashboard,
  fixtureEvents,
  fixtureMap,
  fixtureNpcs,
  fixtureWorld,
} from './fixtures'
import type {
  CardCatalogEntry,
  DashboardSummary,
  EventSummary,
  NpcSummary,
  WorldMap,
  WorldSnapshot,
} from './types'

interface WorldStateValue {
  world: WorldSnapshot
  npcs: NpcSummary[]
  events: EventSummary[]
  cards: CardCatalogEntry[]
  map: WorldMap
  dashboard: DashboardSummary
  liveConnected: boolean
  source: 'fixture' | 'server'
}

const WorldStateContext = createContext<WorldStateValue | null>(null)

export function WorldStateProvider({ children }: { children: ReactNode }) {
  // v1 placeholder: render fixture data when the server is unreachable.
  // The real wire-up will subscribe to `/api/events/stream` and update
  // the snapshot on each tick boundary.
  const [world, setWorld] = useState<WorldSnapshot>(fixtureWorld)
  const [events] = useState<EventSummary[]>(fixtureEvents)
  const [liveConnected] = useState<boolean>(false)

  useEffect(() => {
    let cancelled = false
    fetch('/api/world')
      .then((res) => (res.ok ? (res.json() as Promise<WorldSnapshot>) : null))
      .then((data) => {
        if (!cancelled && data) setWorld(data)
      })
      .catch(() => {
        // Server not yet running — keep fixtures so the UI still renders.
      })
    return () => {
      cancelled = true
    }
  }, [])

  const value = useMemo<WorldStateValue>(
    () => ({
      world,
      npcs: fixtureNpcs,
      events,
      cards: fixtureCards,
      map: fixtureMap,
      dashboard: { ...fixtureDashboard, world },
      liveConnected,
      source: 'fixture',
    }),
    [world, events, liveConnected]
  )

  return <WorldStateContext.Provider value={value}>{children}</WorldStateContext.Provider>
}

export function useWorldState(): WorldStateValue {
  const value = useContext(WorldStateContext)
  if (!value) {
    throw new Error('useWorldState must be used inside <WorldStateProvider>')
  }
  return value
}

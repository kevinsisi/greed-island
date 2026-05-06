// Thin fetch wrapper for the greed-island server. The frontend is
// served from the same origin as the server (Caddy proxies /api/*),
// so requests are relative URLs.

const API_BASE = '/api'

export type ServerWorldSnapshot = {
  tick: number
  lastSequence: number
  eventCount: number
  npcCount: number
  facts: Record<string, unknown>
  generatedAt: string
}

export type ServerNarrativeEvent = {
  sequence: number
  tick: number
  eventType: string
  actorId: string
  occurredAt: string
  payload: Record<string, unknown>
  narration: string | null
}

export type ServerNpc = {
  id: string
  name: { zh: string; en: string }
  role: { zh: string; en: string }
  location: string
  relationshipScore: number
  lastActedTick: number
  internalState: Record<string, unknown>
}

export type ServerCardCatalogEntry = {
  id: number
  rank: 'SS' | 'S' | 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H'
  nameZh: string
  nameEn: string
  description: string
  story: string
  discoveryRuleId: string
  restrictionRuleId: string
}

export type ServerCardCatalog = {
  version: string
  entries: ServerCardCatalogEntry[]
}

export type ServerMap = {
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
}

export type ServerDashboard = {
  world: ServerWorldSnapshot
  cardsOwned: number
  cardsTotal: number
  recentEvents: ServerNarrativeEvent[]
  rareWindowOpen: boolean
  ticksSinceLastVisit: number
}

export type ServerAccount = {
  id: number
  email: string
  createdAt: number
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

async function jsonFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init?.headers ?? {})
    }
  })
  if (!response.ok) {
    let code: string | undefined
    let message = `Request to ${path} failed with status ${response.status}`
    try {
      const body = (await response.json()) as { error?: string; message?: string }
      if (typeof body.error === 'string') code = body.error
      if (typeof body.message === 'string') message = body.message
    } catch {
      // body wasn't JSON — keep the default message
    }
    throw new ApiError(message, response.status, code)
  }
  return (await response.json()) as T
}

export const api = {
  world: () => jsonFetch<ServerWorldSnapshot>('/world'),
  npcs: () => jsonFetch<ServerNpc[]>('/npcs'),
  events: (limit = 50) => jsonFetch<ServerNarrativeEvent[]>(`/events?limit=${limit}`),
  cards: () => jsonFetch<ServerCardCatalog>('/cards'),
  map: () => jsonFetch<ServerMap>('/map'),
  dashboard: () => jsonFetch<ServerDashboard>('/dashboard'),
  register: (email: string, password: string) =>
    jsonFetch<{ token: string; account: ServerAccount }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    }),
  login: (email: string, password: string) =>
    jsonFetch<{ token: string; account: ServerAccount }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    }),
  me: (token: string) =>
    jsonFetch<{ account: ServerAccount }>('/auth/me', {
      headers: { Authorization: `Bearer ${token}` }
    })
}

export function streamUrl(): string {
  return `${API_BASE}/events/stream`
}

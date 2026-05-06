// Thin fetch wrapper for the greed-island server. The frontend is
// served from the same origin as the server (Caddy proxies /api/*),
// so requests are relative URLs.

const API_BASE = '/api'

export type ServerActiveWorldEvent = {
  id: string
  templateId: string
  type: 'weather' | 'npc' | 'card' | 'city'
  scope: { kind: 'world' } | { kind: 'region'; tileIds: readonly string[] }
  startedAtTick: number
  endsAtTick: number
  text: { zh: string; en: string }
  payload: Record<string, unknown>
}

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
  interactionCount?: number
  lastInteractionTick?: number
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

export type NpcInteractIntent = 'greet' | 'ask' | 'trade' | 'leave'

export type LocalizedLine = { zh: string; en: string }

export type ServerNpcInteraction = {
  npcId: string
  intent: NpcInteractIntent
  tick: number
  line: LocalizedLine
  relationship: {
    trust: number
    previousTrust: number
    delta: number
    tier: 'low' | 'mid' | 'high'
    interactionCount: number
    min: number
    max: number
  }
  personalEvent: {
    id: number
    occurredAt: string
    intent: NpcInteractIntent
  }
}

export type ServerNpcHistoryEvent = {
  id: number
  intent: NpcInteractIntent
  line: LocalizedLine
  tick: number
  occurredAt: string
  trustAfter: number
}

export type ServerNpcHistory = {
  npcId: string
  relationship: {
    trust: number
    tier: 'low' | 'mid' | 'high'
    interactionCount: number
    lastInteractionTick: number
    min: number
    max: number
    seeded: boolean
  }
  events: ServerNpcHistoryEvent[]
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

function authHeaders(token: string | null): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export const api = {
  world: () => jsonFetch<ServerWorldSnapshot>('/world'),
  npcs: (token: string | null = null) =>
    jsonFetch<ServerNpc[]>('/npcs', { headers: authHeaders(token) }),
  events: (limit = 50) => jsonFetch<ServerNarrativeEvent[]>(`/events?limit=${limit}`),
  cards: () => jsonFetch<ServerCardCatalog>('/cards'),
  map: () => jsonFetch<ServerMap>('/map'),
  dashboard: () => jsonFetch<ServerDashboard>('/dashboard'),
  worldEvents: () => jsonFetch<{ active: ServerActiveWorldEvent[] }>('/world-events'),
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
      headers: authHeaders(token)
    }),
  npcInteract: (token: string, npcId: string, intent: NpcInteractIntent) =>
    jsonFetch<ServerNpcInteraction>(
      `/npc/${encodeURIComponent(npcId)}/interact`,
      {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({ intent })
      }
    ),
  npcHistory: (token: string, npcId: string, limit = 20) =>
    jsonFetch<ServerNpcHistory>(
      `/npc/${encodeURIComponent(npcId)}/history?limit=${limit}`,
      {
        headers: authHeaders(token)
      }
    )
}

export function streamUrl(): string {
  return `${API_BASE}/events/stream`
}

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

export type AccountRole = 'player' | 'gm' | 'admin'

export type ServerAccount = {
  id: number
  email: string
  createdAt: number
  role: AccountRole
}

export type ServerAdminUser = {
  id: number
  email: string
  role: AccountRole
  createdAt: string
}

export type NpcInteractIntent = 'greet' | 'ask' | 'trade' | 'leave'

export type LocalizedLine = { zh: string; en: string }

export type ServerNpcInteraction = {
  npcId: string
  intent: NpcInteractIntent
  tick: number
  line: LocalizedLine
  replySource: 'ai' | 'fallback'
  aiError: string | null
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

export type ServerApiKeySummary = {
  id: number
  fingerprint: string
  source: 'env' | 'admin'
  status: 'active' | 'disabled'
  lastError: string | null
  lastUsedAt: number | null
  failureCount: number
  createdAt: number
}

export type ServerSettingsHealth = {
  activeKeys: number
  totalKeys: number
  adminAllowList: boolean
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

export type ServerVersion = { version: string }

export type ServerPublicAccount = {
  id: number
  email: string
  displayName: string
}

export type ServerFriendDto = {
  id: number
  status: 'pending' | 'accepted' | 'rejected'
  requester: ServerPublicAccount
  addressee: ServerPublicAccount
  createdAt: string
  respondedAt: string | null
  peer?: ServerPublicAccount
}

export type ServerFriendRequestList = {
  incoming: ServerFriendDto[]
  outgoing: ServerFriendDto[]
}

export type ServerMessageDto = {
  id: number
  senderId: number
  receiverId: number
  content: string
  createdAt: string
  readAt: string | null
}

export type ServerConversationItem = {
  peer: ServerPublicAccount
  lastMessage: ServerMessageDto
  unread: number
}

export type ServerNearbyPlayer = ServerPublicAccount & {
  tileId: string
  lastSeenTick: number
}

export type ServerAllianceMember = ServerPublicAccount & {
  joinedAt: string
  isLeader: boolean
}

export type ServerAllianceDto = {
  id: number
  name: string
  leaderId: number
  createdAt: string
  members: ServerAllianceMember[]
  maxMembers: number
}

export type SocialStreamEvent =
  | { type: 'friend.request'; from: number; requestId: number; occurredAt: string }
  | { type: 'friend.accepted'; from: number; requestId: number; occurredAt: string }
  | { type: 'friend.rejected'; from: number; requestId: number; occurredAt: string }
  | { type: 'friend.removed'; from: number; occurredAt: string }
  | { type: 'message.new'; from: number; messageId: number; preview: string; occurredAt: string }
  | { type: 'presence.enter'; userId: number; tileId: string; occurredAt: string }
  | { type: 'presence.leave'; userId: number; tileId: string; occurredAt: string }
  | { type: 'alliance.invited'; from: number; allianceId: number; occurredAt: string }

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
  npcInteract: (
    token: string,
    npcId: string,
    payload: { message?: string; intent?: NpcInteractIntent }
  ) =>
    jsonFetch<ServerNpcInteraction>(
      `/npc/${encodeURIComponent(npcId)}/interact`,
      {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify(payload)
      }
    ),
  npcHistory: (token: string, npcId: string, limit = 20) =>
    jsonFetch<ServerNpcHistory>(
      `/npc/${encodeURIComponent(npcId)}/history?limit=${limit}`,
      {
        headers: authHeaders(token)
      }
    ),
  settingsHealth: (token: string) =>
    jsonFetch<ServerSettingsHealth>('/settings/health', {
      headers: authHeaders(token)
    }),
  settingsListKeys: (token: string) =>
    jsonFetch<{ keys: ServerApiKeySummary[] }>('/settings/keys', {
      headers: authHeaders(token)
    }),
  settingsAddKeys: (token: string, keys: string) =>
    jsonFetch<{
      inserted: number
      submitted: number
      duplicates: number
      keys: ServerApiKeySummary[]
    }>('/settings/keys', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ keys })
    }),
  settingsDeleteKey: (token: string, id: number) =>
    jsonFetch<{ ok: true; keys: ServerApiKeySummary[] }>(
      `/settings/keys/${id}`,
      {
        method: 'DELETE',
        headers: authHeaders(token)
      }
    ),
  settingsReactivateKeys: (token: string) =>
    jsonFetch<{ reactivated: number; keys: ServerApiKeySummary[] }>(
      '/settings/keys/reactivate-all',
      {
        method: 'POST',
        headers: authHeaders(token)
      }
    ),
  // -- version --------------------------------------------------------
  version: () => jsonFetch<ServerVersion>('/version'),
  // -- social: friends -----------------------------------------------
  socialFriends: (token: string) =>
    jsonFetch<{ friends: ServerFriendDto[] }>('/social/friends', {
      headers: authHeaders(token)
    }),
  socialFriendRequests: (token: string) =>
    jsonFetch<ServerFriendRequestList>('/social/friend-requests', {
      headers: authHeaders(token)
    }),
  socialFriendRequest: (token: string, targetUserId: number) =>
    jsonFetch<{ request: ServerFriendDto }>(
      `/social/friend-request/${targetUserId}`,
      { method: 'POST', headers: authHeaders(token) }
    ),
  socialFriendAccept: (token: string, requestId: number) =>
    jsonFetch<{ request: ServerFriendDto }>(
      `/social/friend-accept/${requestId}`,
      { method: 'POST', headers: authHeaders(token) }
    ),
  socialFriendReject: (token: string, requestId: number) =>
    jsonFetch<{ request: ServerFriendDto }>(
      `/social/friend-reject/${requestId}`,
      { method: 'POST', headers: authHeaders(token) }
    ),
  socialFriendRemove: (token: string, friendId: number) =>
    jsonFetch<{ removed: true }>(`/social/friends/${friendId}`, {
      method: 'DELETE',
      headers: authHeaders(token)
    }),
  // -- social: messages ----------------------------------------------
  socialSendMessage: (token: string, targetUserId: number, content: string) =>
    jsonFetch<{ message: ServerMessageDto }>(
      `/social/message/${targetUserId}`,
      {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({ content })
      }
    ),
  socialMessages: (token: string, peerId: number, limit = 50) =>
    jsonFetch<{ peer: ServerPublicAccount; messages: ServerMessageDto[] }>(
      `/social/messages/${peerId}?limit=${limit}`,
      { headers: authHeaders(token) }
    ),
  socialConversations: (token: string) =>
    jsonFetch<{ conversations: ServerConversationItem[] }>(
      '/social/conversations',
      { headers: authHeaders(token) }
    ),
  // -- social: presence ----------------------------------------------
  socialPresence: (token: string, tileId: string) =>
    jsonFetch<{
      location: { userId: number; tileId: string; lastSeenTick: number; updatedAt: string }
    }>('/social/presence', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ tileId })
    }),
  socialNearby: (token: string, tileId?: string) =>
    jsonFetch<{ tileId: string | null; players: ServerNearbyPlayer[] }>(
      tileId ? `/social/nearby?tileId=${encodeURIComponent(tileId)}` : '/social/nearby',
      { headers: authHeaders(token) }
    ),
  // -- social: alliance ----------------------------------------------
  socialAlliance: (token: string) =>
    jsonFetch<{ alliance: ServerAllianceDto | null }>('/social/alliance', {
      headers: authHeaders(token)
    }),
  socialAllianceCreate: (token: string, name: string) =>
    jsonFetch<{ alliance: ServerAllianceDto }>('/social/alliance/create', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ name })
    }),
  socialAllianceInvite: (token: string, userId: number) =>
    jsonFetch<{ alliance: ServerAllianceDto }>(
      `/social/alliance/invite/${userId}`,
      { method: 'POST', headers: authHeaders(token) }
    ),
  socialAllianceLeave: (token: string) =>
    jsonFetch<{ left: true; disbanded: boolean; nextLeaderId: number | null }>(
      '/social/alliance/leave',
      { method: 'POST', headers: authHeaders(token) }
    ),
  // -- admin ---------------------------------------------------------
  adminUsers: (token: string) =>
    jsonFetch<{ users: ServerAdminUser[] }>('/admin/users', {
      headers: authHeaders(token)
    }),
  adminSetRole: (token: string, userId: number, role: AccountRole) =>
    jsonFetch<{ user: ServerAdminUser }>(`/admin/users/${userId}/role`, {
      method: 'PUT',
      headers: authHeaders(token),
      body: JSON.stringify({ role })
    })
}

export function streamUrl(): string {
  return `${API_BASE}/events/stream`
}

export function socialStreamUrl(): string {
  return `${API_BASE}/social/stream`
}

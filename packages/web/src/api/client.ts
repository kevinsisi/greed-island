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

export type ServerSettlement = {
  id: string
  tileId: string
  formedAtTick: number
  founderNpcIds: readonly string[]
}

export type ServerTickCommandStats = {
  lastTick: number
  peak: number
  softCap: number
  softCapHitCount: number
  hardCap?: number
  hardCapRejectedSinceBoot?: number
}

export type ServerNpcPartitionStats = {
  activeCount: number
  totalCount: number
  period: number
}

export type ServerWorldSnapshot = {
  tick: number
  lastSequence: number
  eventCount: number
  npcCount: number
  facts: Record<string, unknown>
  worldConfig?: {
    tickDurationMs: number
    ticksPerDay: number
    timezone?: string
    timezoneOffsetMinutes?: number
  }
  tickCommandStats?: ServerTickCommandStats
  npcPartition?: ServerNpcPartitionStats
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

export type ServerNpcActivity =
  | 'idle'
  | 'move'
  | 'work'
  | 'eat'
  | 'sleep'
  | 'trade'
  | 'patrol'

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
  // Living-world v0.9+
  activity?: ServerNpcActivity
  mood?: number
  health?: number
  faction?: string
  targetTile?: string
  // Living-world v0.12+：後端權威的 area canvas 子格座標 + 主色
  subCol?: number
  subRow?: number
  subZ?: number
  // v0.15.3+：null 表示在區域室外；非 null 表示已進建築，區域地圖不可再畫一次
  buildingId?: string | null
  // v0.15.12+：跨區移動中的 worldline segment；非移動時為 null
  travelRoute?: {
    fromTile: string
    toTile: string
    targetTile: string
    startedAtTick: number
  } | null
  color?: number
  // v0.14.1+：personality-shaped greet placeholder 顯示在玩家還沒輸入時
  greetLine?: { zh: string; en: string }
  // v0.15.28+：server-authoritative short summary of the current NPC task
  intentLine?: { zh: string; en: string }
  // v0.15.32+：deterministic needs and long-term life goal projection
  life?: {
    needs: Record<'food' | 'rest' | 'money' | 'housing' | 'safety', number>
    goal: { kind: string; pressure: number; narration: string }
    householdId: string | null
  }
}

export type ServerCardCategory =
  | '潮源系'
  | '食飲系'
  | '技藝系'
  | '地景系'
  | '潮器系'
  | '生靈系'
  | '契約系'
  | '秘聞系'
  | '潮術系'
  | '深淵系'

export type ServerCardAcquisitionMethod =
  | 'main_quest'
  | 'side_quest'
  | 'affinity_bond'
  | 'combat_victory'
  | 'shop_purchase'
  | 'location_trigger'
  | 'puzzle_solve'
  | 'random_drop'

export type ServerCardCatalogEntry = {
  id: number
  rank: 'S' | 'A' | 'B' | 'C' | 'D'
  category: ServerCardCategory
  nameZh: string
  nameEn: string
  description: string
  story: string
  maxCopies: number
  acquisitionMethod: ServerCardAcquisitionMethod
  acquisitionDetail: string
  effectDescription: string
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
  nickname: string | null
  avatar: string
  displayName: string
}

export type ServerNpcStatsBirth = {
  tick: number
  childId: string
  householdId: string
  nameZh: string
  nameEn: string
  motivation: string | null
}

export type ServerNpcStatsHousehold = {
  tick: number
  householdId: string
  partnerNpcIds: readonly string[]
  homeTileId: string
  motivation: string | null
}

export type ServerNpcStats = {
  totalNpcs: number
  byOrigin: { manual: number; born: number }
  births: { totalEventCount: number; recent: readonly ServerNpcStatsBirth[] }
  households: { totalEventCount: number; recent: readonly ServerNpcStatsHousehold[] }
  deaths: { available: false; reason: string; plannedAt: string }
  generatedAtTick: number
}

export type ServerAdminUser = {
  id: number
  email: string
  role: AccountRole
  createdAt: string
  nickname: string | null
  avatar: string
  displayName: string
}

export type ServerAdminResetIssue = {
  ok: true
  target: { id: number; email: string }
  token: string
  expiresAt: string
  resetPath: string
}

export type ServerForgotPasswordResponse = {
  ok: true
  issued: boolean
  token?: string
  expiresAt?: string
  message?: string
}

export type ServerProfile = {
  account: ServerAccount
  avatarPresets: string[]
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
  playerMessage: string
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

export type ServerChronicleResponse = {
  latestTick: number
  chronicle: {
    source: 'ai' | 'fallback'
    textZh: string
    textEn: string
    aiError: string | null
    aiMeta: {
      requested: boolean
      activeKeys: number
      fallbackReason: string | null
    }
  }
}

export type ServerNpcDialogHold = {
  npcId: string
  held: boolean
  tick: number
  expiresAtTick: number | null
}

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
  x: number | null
  y: number | null
  z: number | null
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

export type ServerCardDrop = {
  id: number
  cardId: number
  tileId: string
  x: number
  y: number
  droppedAtTick: number
  expiresAtTick: number
  state: 'available' | 'held' | 'expired' | 'stored'
  holderAccountId: number | null
  pickupAtTick: number | null
  storeDeadlineTick: number | null
  /** v0.13.0：後端算過 ±N 秒精力誤差後給玩家看的剩餘秒數 */
  perceivedSecondsLeft?: number | null
  /** v0.13.0：後端真實秒數（不含誤差），給除錯/日誌用 */
  rawSecondsLeft?: number | null
}

/** v0.13.0：玩家不在時的紋卡摘要 */
export type ServerSinceLastVisit = {
  dropsSpawned: number
  dropsCollectedByOthers: number
  dropsExpired: number
  sinceTick: number
  currentTick: number
}

/** v0.14.0：玩家不在時的 living-world 完整摘要（catch-up summary） */
export type ServerCatchUpSummary = {
  sinceTick: number
  untilTick: number
  totalEvents: number
  byNpc: Record<string, number>
  byArea: Record<string, number>
  worldEvents: Array<{
    tick: number
    templateId: string
    type: string
    scope: string
    narration: string
  }>
  weatherChanges: Array<{ tick: number; from: string; to: string }>
  seasonChanges: Array<{ tick: number; from: string; to: string }>
  pressureMoments: Array<{
    tick: number
    tileId: string
    kind: string
    narration: string
  }>
  productiveActions: Array<{
    tick: number
    tile: string
    npcId: string
    domain: string
    metric: string
    delta: number
    narration: string
  }>
  constructionProgress: Array<{
    tick: number
    projectId: string
    targetTileId: string
    progressAfter: number
    targetProgress: number
    motivation?: ServerConstructionMotivation
    narration: string
  }>
  expansions: Array<{
    tick: number
    kind: 'building' | 'map_tile'
    projectId: string
    id: string
    tileId: string
    motivation?: ServerConstructionMotivation
    narration: string
  }>
  households: Array<{
    tick: number
    kind: 'formed' | 'child_born'
    householdId: string
    narration: string
  }>
  lifeGoals: Array<{
    tick: number
    npcId: string
    tile: string
    goalKind: string
    pressure: number
    narration: string
  }>
  interactions: Array<{
    tick: number
    tile: string
    a: string
    b: string
    mode: 'chat' | 'argue'
  }>
  digest: string
}

export type ServerConstructionMotivation = {
  projectPurpose: string
  primaryPressure: 'food' | 'rest' | 'money' | 'housing' | 'safety' | 'infrastructure'
  pressureScore: number
  sourceGoalKind: string
  sourceNpcId: string
  sourceTileId: string
  explanation: string
}

export type ServerWorldSinceLastVisit = {
  previousLastSeenTick: number
  latestTick: number
  summary: ServerCatchUpSummary
}

export type ServerCardSlotType = 'sequencing' | 'carry'

export type ServerCodexEntry = {
  id: number
  cardId: number
  slotType: ServerCardSlotType
  slotIndex: number
  obtainedTick: number
  obtainedAt: string
}

export type ServerCodexResponse = {
  sequencingSlotCount: number
  carrySlotCount: number
  entries: ServerCodexEntry[]
}

export type ServerTradeStatus = 'pending' | 'accepted' | 'rejected' | 'cancelled' | 'expired'

export type ServerTradeDto = {
  id: number
  proposerId: number
  targetId: number
  proposerName: string
  targetName: string
  offeredCodexId: number
  offeredCardId: number
  requestedCardId: number
  status: ServerTradeStatus
  createdAt: string
  resolvedAt: string | null
}

export type ServerTradeList = {
  incoming: ServerTradeDto[]
  outgoing: ServerTradeDto[]
}

export type ServerCardConfig = {
  sixtySecondRuleTicks: number
  sequencingSlotCount: number
  carrySlotCount: number
}

export type ServerFactionId = 'tide_hunters' | 'free_runners' | 'guild' | 'civilian'

export type ServerAreaState = {
  tileId: string
  factionControl: Record<ServerFactionId, number>
  dominantFaction: ServerFactionId | null
  resources: { food: number; safety: number; economy: number }
  lastUpdatedTick: number
  recentEvents: Array<{
    tick: number
    kind: string
    narration: string
    detail: Record<string, string | number>
  }>
}

export type ServerAmbient = {
  tileId: string
  text: string
  source: 'ai' | 'fallback'
  generatedAtTick: number
  generatedAt: string
  aiError: string | null
}

export type ServerShift = 'morning' | 'afternoon' | 'night'

export type ServerBuildingDef = {
  id: string
  tileId: string
  nameZh: string
  nameEn: string
  descriptionZh: string
  type: string
  placement: { col: number; row: number; glyph: string; size: number }
  interior: {
    cols: number
    rows: number
    props: Array<{ col: number; row: number; glyph: string; size?: number; label?: string }>
    backgroundColor?: number
  }
  ownerNpcId: string | null
  hiring: Array<{ shift: ServerShift; capacity: number; wage: number; taskZh: string }>
  enterable: boolean
  restorative: boolean
}

export type ServerBuildingView = {
  def: ServerBuildingDef
  occupants: Array<{ npcId: string; shift: ServerShift | null; isOwner: boolean }>
}

export type ServerConstructionProject = {
  projectId: string
  kind: 'settlement'
  targetTileId: string
  buildingId: string
  progress: number
  targetProgress: number
  startedAtTick: number
  completedAtTick: number | null
  initiatedByNpcId: string
  builderNpcIds: readonly string[]
}

export type ServerPlayerJob = {
  accountId: number
  buildingId: string
  shift: ServerShift
  hiredAtTick: number
  totalEarnings: number
  shiftsCompleted: number
  lastShiftTick: number
}

export type ServerPlayerWallet = {
  accountId: number
  gold: number
  energy: number
  updatedAt: number
}

export type ServerWalletResponse = {
  wallet: ServerPlayerWallet
  jobs: ServerPlayerJob[]
  currentTick: number
  currentShift: ServerShift | null
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
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
      'Cache-Control': 'no-store',
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
  worldChronicle: (limit = 40, useAi = true) =>
    jsonFetch<ServerChronicleResponse>(`/world/chronicle?limit=${limit}&ai=${useAi ? '1' : '0'}`),
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
  npcDialogHold: (token: string, npcId: string) =>
    jsonFetch<ServerNpcDialogHold>(
      `/npc/${encodeURIComponent(npcId)}/dialog-hold`,
      {
        method: 'POST',
        headers: authHeaders(token)
      }
    ),
  /** v0.14.0：玩家介入兩位 NPC 的爭執。回傳介入後的好感變化。 */
  npcIntervene: (
    token: string,
    npcA: string,
    npcB: string,
    mode: 'mediate' | 'provoke' | 'watch'
  ) =>
    jsonFetch<{
      ok: true
      mode: 'mediate' | 'provoke' | 'watch'
      tile: string
      effects: {
        npcA: { npcId: string; trust: number; trustDelta: number; moodDelta: number }
        npcB: { npcId: string; trust: number; trustDelta: number; moodDelta: number }
      }
      line: LocalizedLine
    }>('/npc/intervene', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ npcA, npcB, mode })
    }),
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
  socialPresence: (token: string, tileId: string, position?: { x: number; y: number; z: number } | null) =>
    jsonFetch<{
      location: {
        userId: number
        tileId: string
        x: number | null
        y: number | null
        z: number | null
        lastSeenTick: number
        updatedAt: string
      }
    }>('/social/presence', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify(
        position
          ? { tileId, x: position.x, y: position.y, z: position.z, clientUpdatedAt: Date.now() }
          : { tileId, clientUpdatedAt: Date.now() }
      )
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
    }),
  adminResetUserPassword: (token: string, userId: number) =>
    jsonFetch<ServerAdminResetIssue>(`/admin/users/${userId}/reset-password`, {
      method: 'POST',
      headers: authHeaders(token)
    }),
  adminNpcStats: (token: string) =>
    jsonFetch<ServerNpcStats>('/admin/npc-stats', { headers: authHeaders(token) }),
  settlements: () =>
    jsonFetch<{ settlements: readonly ServerSettlement[] }>('/settlements'),
  settlementById: (id: string) =>
    jsonFetch<ServerSettlement>(`/settlements/${encodeURIComponent(id)}`),
  // -- profile -------------------------------------------------------
  profile: (token: string) =>
    jsonFetch<ServerProfile>('/profile', { headers: authHeaders(token) }),
  updateProfile: (
    token: string,
    patch: { nickname?: string | null; avatar?: string }
  ) =>
    jsonFetch<{ account: ServerAccount }>('/profile', {
      method: 'PATCH',
      headers: authHeaders(token),
      body: JSON.stringify(patch)
    }),
  changePassword: (token: string, currentPassword: string, newPassword: string) =>
    jsonFetch<{ ok: true; account: ServerAccount }>('/profile/password', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ currentPassword, newPassword })
    }),
  // -- password reset ------------------------------------------------
  forgotPassword: (email: string) =>
    jsonFetch<ServerForgotPasswordResponse>('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email })
    }),
  resetPassword: (resetToken: string, password: string) =>
    jsonFetch<{ ok: true; token: string; account: ServerAccount }>('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token: resetToken, password })
    }),
  // -- card drops / codex / trade ----------------------------------
  cardConfig: () => jsonFetch<ServerCardConfig>('/cards/config'),
  cardsActive: (token: string, tileId: string) =>
    jsonFetch<{ tileId: string; tick: number; drops: ServerCardDrop[] }>(
      `/cards/active?tileId=${encodeURIComponent(tileId)}`,
      { headers: authHeaders(token) }
    ),
  cardsHeld: (token: string) =>
    jsonFetch<{ tick: number; drops: ServerCardDrop[] }>('/cards/held', {
      headers: authHeaders(token)
    }),
  cardsPickup: (token: string, dropId: number) =>
    jsonFetch<{ drop: ServerCardDrop }>('/cards/pickup', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ dropId })
    }),
  cardsStore: (
    token: string,
    dropId: number,
    slotType: ServerCardSlotType
  ) =>
    jsonFetch<{ drop: ServerCardDrop; codex: ServerCodexEntry }>('/cards/store', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ dropId, slotType })
    }),
  cardsRelease: (token: string, dropId: number) =>
    jsonFetch<{ drop: ServerCardDrop }>('/cards/release', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ dropId })
    }),
  cardsSinceLastVisit: (token: string) =>
    jsonFetch<ServerSinceLastVisit>('/cards/since-last-visit', {
      headers: authHeaders(token)
    }),
  /** v0.14.0：完整 living-world catch-up（pressure / world events / NPC 互動） */
  worldSinceLastVisit: (token: string) =>
    jsonFetch<ServerWorldSinceLastVisit>('/world/since-last-visit', {
      headers: authHeaders(token)
    }),
  codex: (token: string) =>
    jsonFetch<ServerCodexResponse>('/codex', { headers: authHeaders(token) }),
  codexMaterialize: (token: string, codexId: number) =>
    jsonFetch<{ materialized: ServerCodexEntry }>('/codex/materialize', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ codexId })
    }),
  tradeList: (token: string) =>
    jsonFetch<ServerTradeList>('/trade/list', { headers: authHeaders(token) }),
  tradePropose: (
    token: string,
    targetUserId: number,
    offeredCodexId: number,
    requestedCardId: number
  ) =>
    jsonFetch<{ trade: ServerTradeDto }>('/trade/propose', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ targetUserId, offeredCodexId, requestedCardId })
    }),
  tradeAccept: (token: string, tradeId: number) =>
    jsonFetch<{ trade: ServerTradeDto }>(`/trade/accept/${tradeId}`, {
      method: 'POST',
      headers: authHeaders(token)
    }),
  tradeReject: (token: string, tradeId: number) =>
    jsonFetch<{ trade: ServerTradeDto }>(`/trade/reject/${tradeId}`, {
      method: 'POST',
      headers: authHeaders(token)
    }),
  tradeCancel: (token: string, tradeId: number) =>
    jsonFetch<{ trade: ServerTradeDto }>(`/trade/cancel/${tradeId}`, {
      method: 'POST',
      headers: authHeaders(token)
    }),
  // -- Living World v0.10.0 --
  areaState: (tileId: string) =>
    jsonFetch<{ areaState: ServerAreaState; ambient: ServerAmbient | null }>(
      `/areas/${encodeURIComponent(tileId)}`
    ),
  areaStates: () => jsonFetch<{ areas: ServerAreaState[] }>('/areas'),
  buildings: (tileId?: string) =>
    jsonFetch<{ buildings: ServerBuildingView[]; inProgress?: ServerConstructionProject[] }>(
      tileId ? `/buildings?tileId=${encodeURIComponent(tileId)}` : '/buildings'
    ),
  buildingDetail: (buildingId: string) =>
    jsonFetch<{ building: ServerBuildingView }>(`/buildings/${encodeURIComponent(buildingId)}`),
  buildingApply: (token: string, buildingId: string, shift: ServerShift) =>
    jsonFetch<{ job: ServerPlayerJob; building: ServerBuildingDef }>(
      `/buildings/${encodeURIComponent(buildingId)}/apply`,
      {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({ shift })
      }
    ),
  buildingQuit: (token: string, buildingId: string, shift: ServerShift) =>
    jsonFetch<{ removed: boolean }>(
      `/buildings/${encodeURIComponent(buildingId)}/quit`,
      {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({ shift })
      }
    ),
  buildingWork: (token: string, buildingId: string) =>
    jsonFetch<{
      job: ServerPlayerJob
      wallet: ServerPlayerWallet
      wage: number
    }>(`/buildings/${encodeURIComponent(buildingId)}/work`, {
      method: 'POST',
      headers: authHeaders(token)
    }),
  buildingRest: (token: string, buildingId: string) =>
    jsonFetch<{ wallet: ServerPlayerWallet; restoredAt: number; building: ServerBuildingDef }>(
      `/buildings/${encodeURIComponent(buildingId)}/rest`,
      {
        method: 'POST',
        headers: authHeaders(token)
      }
    ),
  wallet: (token: string) =>
    jsonFetch<ServerWalletResponse>('/wallet', {
      headers: authHeaders(token)
    }),
  // ── Combat (Phase B, v0.15.0) ──
  combatActive: (token: string) =>
    jsonFetch<{ active: ServerCombatSession | null; log?: ServerCombatLogRow[] }>(
      '/combat/active',
      { headers: authHeaders(token) }
    ),
  combatGet: (token: string, combatId: string) =>
    jsonFetch<{ session: ServerCombatSession; log: ServerCombatLogRow[] }>(
      `/combat/${encodeURIComponent(combatId)}`,
      { headers: authHeaders(token) }
    ),
  combatInitiate: (token: string, targetNpcId: string) =>
    jsonFetch<{ session: ServerCombatSession; log: ServerCombatLogRow[] }>(
      '/combat/initiate',
      {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({ targetNpcId })
      }
    ),
  combatAction: (
    token: string,
    combatId: string,
    action: 'attack' | 'defend' | 'flee',
    cardId?: number
  ) =>
    jsonFetch<{
      session: ServerCombatSession
      events: Array<{ eventType: string; payload: Record<string, unknown> }>
      resolved: null | { outcome: 'player_victory' | 'npc_victory' | 'fled' }
      log: ServerCombatLogRow[]
    }>(`/combat/${encodeURIComponent(combatId)}/action`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify(cardId !== undefined ? { action, cardId } : { action })
    }),
  // ── Technique shop (Phase B, v0.15.0) ──
  shopTechniques: (token: string) =>
    jsonFetch<{ items: ServerTechniqueShopItem[]; locationTile: string }>(
      '/shop/techniques',
      { headers: authHeaders(token) }
    ),
  shopBuyTechnique: (token: string, cardId: number) =>
    jsonFetch<{ owned: { card_id: number; count: number }; wallet: ServerPlayerWallet }>(
      `/shop/techniques/${cardId}/buy`,
      { method: 'POST', headers: authHeaders(token) }
    ),
  myTechniques: (token: string) =>
    jsonFetch<{
      owned: Array<{
        cardId: number
        count: number
        lastPurchasedAt: number
        card: {
          nameZh: string
          nameEn: string
          category: 'combat' | 'explore' | 'social'
          description: string
          effectDescription: string
        } | null
      }>
    }>('/me/techniques', { headers: authHeaders(token) }),
  // ── Per-player dynamic NPC greet (Phase B) ──
  npcGreet: (token: string, npcId: string) =>
    jsonFetch<{
      npcId: string
      greetLine: { zh: string; en: string }
      relationship: { trust: number; tier: 'low' | 'mid' | 'high'; interactionCount: number }
    }>(`/npc/${encodeURIComponent(npcId)}/greet`, {
      headers: authHeaders(token)
    })
}

export type ServerCombatSession = {
  combatId: string
  playerAccountId: number
  npcId: string
  tileId: string
  startedTick: number
  playerHp: number
  npcHp: number
  combatRound: number
  state: 'active' | 'resolved'
  outcome: 'player_victory' | 'npc_victory' | 'fled' | null
  resolvedTick: number | null
  initialHp: number
  npcIncapTicks: number
}

export type ServerCombatLogRow = {
  id: number
  combat_id: string
  tick: number
  combat_round: number
  event_type: string
  payload_json: string
  occurred_at: number
}

export type ServerTechniqueShopItem = {
  id: number
  nameZh: string
  nameEn: string
  category: 'combat' | 'explore' | 'social'
  priceGold: number
  maxOwnedPerPlayer: number
  description: string
  effectDescription: string
  ownedCount: number
}

export function streamUrl(): string {
  return `${API_BASE}/events/stream`
}

export function socialStreamUrl(): string {
  return `${API_BASE}/social/stream`
}

import { parseAdminWorldSnapshot } from './adminWorld'
import type { AccountProfile } from '../multiplayer3d/types'
import { isAccountProfile } from '../multiplayer3d/protocol'
import { parseWalletResponse } from './wallet'
import { parseCardRead } from './cardRead'
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

// Sprint 2A — world-visibility-ecology
export type AnimalGroupRow = {
  speciesId: string
  tileId: string
  biomeRegion: 'salt_marsh' | 'forest' | 'mountain' | 'desert' | 'ruin'
  count: number
  animalIds: readonly string[]
  intent: 'foraging' | 'herding' | 'migrating' | 'hunting'
  thoughtZh: string
}

export type FisheryRow = {
  tileId: string
  density: number
  harvestedTotal: number
  collapsed: boolean
  lastUpdatedTick: number
}

export type MigrationRow = {
  waveId: string
  speciesId: string
  fromTileId: string
  toTileId: string
  migrationType: 'pressure' | 'seasonal'
  startedAtTick: number
  count: number
}

export type PredatorWarningRow = {
  predatorSpeciesId: string
  tileId: string
  lastKillAtTick: number
}

export type PlantNodeRow = {
  speciesId: string
  density: number
  capacity: number
  saturationPct: number
  state: 'struggling' | 'regrowing' | 'spreading' | 'mature'
  thoughtZh: string
}

export type AreaEcologyView = {
  tileId: string
  animals: readonly AnimalGroupRow[]
  fishery: FisheryRow | null
  migrationsArriving: readonly MigrationRow[]
  migrationsDeparting: readonly MigrationRow[]
  predatorWarnings: readonly PredatorWarningRow[]
  plants: readonly PlantNodeRow[]
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

export type ServerWorldCivilizationGoal = {
  goalId: string
  domain: string
  title: string
  rationale?: string
  targetProgress: number
  progress: number
  declaredAtTick: number
  completed: boolean
  completedAtTick: number | null
}

export type ServerWorldTechnology = {
  techId: string
  domain: string
  title: string
  discoveredAtTick: number
  evidenceEventIds?: readonly string[]
  evidenceCount?: number
  unlocks: readonly string[]
}

export type ServerWorldCivilizationSnapshot = {
  goals: readonly ServerWorldCivilizationGoal[]
  technologies: readonly ServerWorldTechnology[]
}

export type ServerWorldSnapshot = {
  tick: number
  lastSequence: number
  eventCount: number
  npcCount: number
  facts: Record<string, unknown>
  worldCivilization?: ServerWorldCivilizationSnapshot
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
  // v0.95.0+：deterministic cognitive thought derived from personality/memory/beliefs
  cognitiveLine?: { zh: string; en: string }
  // v0.96.0+：Mini-Hermes long-term reflection/personality/goal/relationship evolution summary
  cognitiveEvolution?: {
    reflectionCount: number
    currentThoughtZh: string
    lastReflectionZh: string | null
    personalityTraceZh: string | null
    lifeGoalTraceZh: string | null
    relationshipTraceZh: string | null
  }
  // v0.15.32+：deterministic needs and long-term life goal projection
  life?: {
    needs: Record<'food' | 'rest' | 'money' | 'housing' | 'safety', number>
    goal: { kind: string; pressure: number; narration: string }
    householdId: string | null
  }
  // v0.87.3+：server may include `deceased: true` for entries returned via
  // admin / lineage / chronicle paths. The public `/api/npcs` endpoint filters
  // deceased NPCs out, so this field is typically false or absent there. UI
  // treats `undefined` as `false` for back-compat with pre-0.87.3 servers.
  deceased?: boolean
  // v0.92.0+：most recent accepted AI freeform utterance within the visibility window;
  // null / absent when expired or no utterance yet.
  recentUtterance?: { text: string; tick: number } | null
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
  imageUrl?: string
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
  cardsOwned: number | null
  cardsOwnedReady: boolean
  cardsTotal: number
  recentEvents: ServerNarrativeEvent[]
  rareWindowOpen: boolean
  ticksSinceLastVisit: number | null
  wallet: ServerPlayerWallet | null
  walletInitialized: boolean
  accountContext: number | null
}

export type AccountRole = AccountProfile['role']

export type ServerAccount = AccountProfile & { id: number }

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

export type ServerNpcStatsDeath = {
  tick: number
  npcId: string
  tileId: string
  householdId: string
  narration: string
}

export type ServerNpcStatsMatured = {
  tick: number
  npcId: string
  householdId: string
  homeTileId: string
  nameZh: string
  nameEn: string
}

export type ServerLineageMember = {
  npcId: string
  nameZh: string
  deceased: boolean
}

export type ServerLineageChild = {
  childId: string
  nameZh: string
  nameEn: string
  bornAtTick: number
  matured: boolean
  deceased: boolean
}

export type ServerLineageHousehold = {
  householdId: string
  homeTileId: string
  formedAtTick: number
  partners: readonly ServerLineageMember[]
  children: readonly ServerLineageChild[]
}

export type ServerLineageResponse = {
  generatedAtTick: number
  households: readonly ServerLineageHousehold[]
}

export type ServerNpcStatsInherited = {
  npcId: string
  parentNpcIds: readonly string[]
  gold: number
  skillXpTotal: number
  grantedAtTick: number
}

export type ServerNpcStats = {
  totalNpcs: number
  byOrigin: { manual: number; born: number }
  births: { totalEventCount: number; recent: readonly ServerNpcStatsBirth[] }
  households: { totalEventCount: number; recent: readonly ServerNpcStatsHousehold[] }
  matured: { totalEventCount: number; recent: readonly ServerNpcStatsMatured[] }
  deaths: { totalEventCount: number; recent: readonly ServerNpcStatsDeath[] }
  inheritedRecent: readonly ServerNpcStatsInherited[]
  generatedAtTick: number
}

export type ServerAdminUser = AccountProfile & { status: 'active' | 'disabled' }
export type ServerAdminResetIssue = { ok: true; target: ServerAdminUser; token: string; expiresAt: number; resetPath: '/reset-password' }
export type ServerProfile = { profile: AccountProfile }

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
  worldEventId?: string | null
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

// v0.65.0 — OpenCode settings (contract-aligned).
export type ServerOpenCodeSource = 'setting' | 'env' | 'default' | 'none'
export type ServerOpenCodeServerEntry = { id: string; label: string; base_url: string }
export type ServerOpenCodeStatus = {
  servers: ServerOpenCodeServerEntry[]
  servers_source: ServerOpenCodeSource
  text_model: string
  text_model_source: ServerOpenCodeSource
}
export type ServerOpenCodeModelGroup = {
  provider: string
  name: string
  authed: boolean
  models: Array<{ id: string; name: string; free: boolean }>
}
export type ServerOpenCodeModels = {
  groups: ServerOpenCodeModelGroup[]
  server: ServerOpenCodeServerEntry | null
  error?: string
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
  email: string | null
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
export type ServerCardRead = { tick: number; drops: ServerCardDrop[] }
  & ({ walletInitialized: false; energy: null } | { walletInitialized: true; energy: number })

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

export type BuildingState = 'under_construction' | 'operational' | 'damaged' | 'abandoned'

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
  // v0.49.0 — building lifecycle state (from BuildingStateProjection)
  state?: BuildingState
  health?: number
  constructionProgress?: number
}

export type BuildingOccupantView = {
  npcId: string
  nameZh: string
  shift: ServerShift | null
  isOwner: boolean
  activity: string          // e.g. 'work' | 'idle' | 'move' — from NPC state
  domain?: string           // e.g. 'build' | 'learn' | 'trade' | 'service'
  narration?: string        // last productive action narration, shown as tooltip
}

export type ServerBuildingView = {
  def: ServerBuildingDef
  occupants: Array<BuildingOccupantView>
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
  jobs: ServerPlayerJob[]
  currentTick: number
  currentShift: ServerShift | null
} & ({ walletInitialized: false; wallet: null } | { walletInitialized: true; wallet: ServerPlayerWallet })

export type SocialStreamEvent =
  | { type: 'friend.request'; from: number; requestId: number; occurredAt: string }
  | { type: 'friend.accepted'; from: number; requestId: number; occurredAt: string }
  | { type: 'friend.rejected'; from: number; requestId: number; occurredAt: string }
  | { type: 'friend.removed'; from: number; occurredAt: string }
  | { type: 'message.new'; from: number; messageId: number; preview: string; occurredAt: string }
  | { type: 'presence.enter'; userId: number; tileId: string; occurredAt: string }
  | { type: 'presence.leave'; userId: number; tileId: string; occurredAt: string }
  | { type: 'alliance.invited'; from: number; allianceId: number; occurredAt: string }

export type ServerPropertyListing = Readonly<{
  id: string
  title: string
  price: number
  address: string
  lat: number
  lng: number
  rooms: number
  hall: number
  bath: number
  sizePing: number
  buildingType: string
  floor: string | null
  age: number | null
  photoUrls: readonly string[]
  agentName: string
  agentContact: string
}>

export type ServerPropertyListResponse = Readonly<{
  listings: readonly ServerPropertyListing[]
  total: number
  page: number
  pageSize: number
}>

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
    credentials: 'include',
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
    if (typeof window !== 'undefined' && code === 'WORLD_CONNECTION_REQUIRED') window.dispatchEvent(new Event('greed-world-connection-invalidated'))
    if (typeof window !== 'undefined' && (response.status === 401 || code === 'ACCOUNT_CHANGED' || code === 'ACCOUNT_CONTEXT_REQUIRED')) window.dispatchEvent(new Event('greed-session-invalidated'))
    throw new ApiError(message, response.status, code)
  }
  return (await response.json()) as T
}

export function authHeaders(accountId: number | null): Record<string, string> {
  return accountId !== null && Number.isSafeInteger(accountId) && accountId > 0 ? { 'X-Greed-Account-Id': String(accountId) } : {}
}
function ownProfile(value: unknown, expectedAccountId?: number): { profile: AccountProfile } {
  if (!value || typeof value !== 'object' || !('profile' in value) || !isAccountProfile(value.profile)
    || expectedAccountId !== undefined && value.profile.accountId !== expectedAccountId) {
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('greed-session-invalidated'))
    throw new ApiError('Account profile response mismatch.', 409, 'ACCOUNT_CHANGED')
  }
  return { profile: value.profile }
}

export const api = {
  world: () => jsonFetch<ServerWorldSnapshot>('/world'),
  adminWorld: (accountId: number, signal?: AbortSignal) => {
    if (!Number.isSafeInteger(accountId) || accountId <= 0) throw new Error('Operator account context is required.')
    return jsonFetch<unknown>('/admin/world', { headers: authHeaders(accountId), ...(signal ? { signal } : {}) }).then(parseAdminWorldSnapshot)
  },
  npcs: (accountId: number | null = null) =>
    jsonFetch<ServerNpc[]>('/npcs', { headers: authHeaders(accountId) }),
  events: (limit = 50) => jsonFetch<ServerNarrativeEvent[]>(`/events?limit=${limit}`),
  cards: () => jsonFetch<ServerCardCatalog>('/cards'),
  map: () => jsonFetch<ServerMap>('/map'),
  dashboard: (accountId: number | null = null) => jsonFetch<ServerDashboard>('/dashboard', { headers: authHeaders(accountId) }),
  worldEvents: () => jsonFetch<{ active: ServerActiveWorldEvent[] }>('/world-events'),
  worldChronicle: (limit = 40, useAi = true) =>
    jsonFetch<ServerChronicleResponse>(`/world/chronicle?limit=${limit}&ai=${useAi ? '1' : '0'}`),
  register: (username: string, password: string) => jsonFetch<unknown>('/auth/register', { method: 'POST', body: JSON.stringify({ username, password }) }).then(value => ownProfile(value)),
  login: (identifier: string, password: string) => jsonFetch<unknown>('/auth/login', { method: 'POST', body: JSON.stringify({ identifier, password }) }).then(value => ownProfile(value)),
  me: (accountId: number) => jsonFetch<unknown>('/auth/me', { headers: authHeaders(accountId) }).then(value => ownProfile(value, accountId)),
  npcInteract: (
    accountId: number,
    npcId: string,
    payload: { message?: string; intent?: NpcInteractIntent },
    options?: { timeoutMs?: number }
  ) => {
    const timeoutMs = options?.timeoutMs
    if (!timeoutMs) {
      return jsonFetch<ServerNpcInteraction>(
        `/npc/${encodeURIComponent(npcId)}/interact`,
        {
          method: 'POST',
          headers: authHeaders(accountId),
          body: JSON.stringify(payload)
        }
      )
    }
    const controller = new AbortController()
    const timer = window.setTimeout(() => controller.abort(), timeoutMs)
    return jsonFetch<ServerNpcInteraction>(
      `/npc/${encodeURIComponent(npcId)}/interact`,
      {
        method: 'POST',
        headers: authHeaders(accountId),
        body: JSON.stringify(payload),
        signal: controller.signal,
      }
    ).finally(() => window.clearTimeout(timer))
  },
  npcLocalShout: (
    accountId: number,
    payload: { tileId: string; candidateNpcIds: readonly string[]; message: string },
    options?: { timeoutMs?: number }
  ) => {
    const timeoutMs = options?.timeoutMs
    const init: RequestInit = {
      method: 'POST',
      headers: authHeaders(accountId),
      body: JSON.stringify(payload),
    }
    if (!timeoutMs) return jsonFetch<ServerNpcInteraction>('/npc/local-shout', init)
    const controller = new AbortController()
    const timer = window.setTimeout(() => controller.abort(), timeoutMs)
    return jsonFetch<ServerNpcInteraction>('/npc/local-shout', {
      ...init,
      signal: controller.signal,
    }).finally(() => window.clearTimeout(timer))
  },
  npcDialogHold: (accountId: number, npcId: string) =>
    jsonFetch<ServerNpcDialogHold>(
      `/npc/${encodeURIComponent(npcId)}/dialog-hold`,
      {
        method: 'POST',
        headers: authHeaders(accountId)
      }
    ),
  /** v0.14.0：玩家介入兩位 NPC 的爭執。回傳介入後的好感變化。 */
  npcIntervene: (
    accountId: number,
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
      headers: authHeaders(accountId),
      body: JSON.stringify({ npcA, npcB, mode })
    }),
  npcHistory: (accountId: number, npcId: string, limit = 20) =>
    jsonFetch<ServerNpcHistory>(
      `/npc/${encodeURIComponent(npcId)}/history?limit=${limit}`,
      {
        headers: authHeaders(accountId)
      }
    ),
  settingsHealth: (accountId: number) =>
    jsonFetch<ServerSettingsHealth>('/settings/health', {
      headers: authHeaders(accountId)
    }),
  settingsListKeys: (accountId: number) =>
    jsonFetch<{ keys: ServerApiKeySummary[] }>('/settings/keys', {
      headers: authHeaders(accountId)
    }),
  settingsAddKeys: (accountId: number, keys: string) =>
    jsonFetch<{
      inserted: number
      submitted: number
      duplicates: number
      keys: ServerApiKeySummary[]
    }>('/settings/keys', {
      method: 'POST',
      headers: authHeaders(accountId),
      body: JSON.stringify({ keys })
    }),
  settingsDeleteKey: (accountId: number, id: number) =>
    jsonFetch<{ ok: true; keys: ServerApiKeySummary[] }>(
      `/settings/keys/${id}`,
      {
        method: 'DELETE',
        headers: authHeaders(accountId)
      }
    ),
  settingsReactivateKeys: (accountId: number) =>
    jsonFetch<{ reactivated: number; keys: ServerApiKeySummary[] }>(
      '/settings/keys/reactivate-all',
      {
        method: 'POST',
        headers: authHeaders(accountId)
      }
    ),
  // v0.42.0 — provider configuration (OpenCode URL/model + priority order).
  settingsGetProviders: (accountId: number) =>
    jsonFetch<{
      openCodeBaseUrl: string | null
      openCodeModel: string | null
      providerPriority: string
    }>('/settings/providers', { headers: authHeaders(accountId) }),
  settingsUpdateProviders: (
    accountId: number,
    body: {
      openCodeBaseUrl?: string | null
      openCodeModel?: string | null
      providerPriority?: string
    }
  ) =>
    jsonFetch<{
      openCodeBaseUrl: string | null
      openCodeModel: string | null
      providerPriority: string
    }>('/settings/providers', {
      method: 'PUT',
      headers: authHeaders(accountId),
      body: JSON.stringify(body)
    }),
  // v0.65.0 — contract-aligned OpenCode settings (servers, model select).
  settingsGetOpenCode: (accountId: number) =>
    jsonFetch<ServerOpenCodeStatus>('/settings/opencode', { headers: authHeaders(accountId) }),
  settingsUpdateOpenCode: (
    accountId: number,
    body: { servers?: string; text_model?: string }
  ) =>
    jsonFetch<ServerOpenCodeStatus>('/settings/opencode', {
      method: 'POST',
      headers: authHeaders(accountId),
      body: JSON.stringify(body),
    }),
  settingsDeleteOpenCode: (accountId: number) =>
    jsonFetch<ServerOpenCodeStatus>('/settings/opencode', {
      method: 'DELETE',
      headers: authHeaders(accountId),
    }),
  settingsGetOpenCodeModels: (accountId: number) =>
    jsonFetch<ServerOpenCodeModels>('/settings/opencode/models', { headers: authHeaders(accountId) }),
  // -- version --------------------------------------------------------
  version: () => jsonFetch<ServerVersion>('/version'),
  // -- social: friends -----------------------------------------------
  socialFriends: (accountId: number) =>
    jsonFetch<{ friends: ServerFriendDto[] }>('/social/friends', {
      headers: authHeaders(accountId)
    }),
  socialFriendRequests: (accountId: number) =>
    jsonFetch<ServerFriendRequestList>('/social/friend-requests', {
      headers: authHeaders(accountId)
    }),
  socialFriendRequest: (accountId: number, targetUserId: number) =>
    jsonFetch<{ request: ServerFriendDto }>(
      `/social/friend-request/${targetUserId}`,
      { method: 'POST', headers: authHeaders(accountId) }
    ),
  socialFriendAccept: (accountId: number, requestId: number) =>
    jsonFetch<{ request: ServerFriendDto }>(
      `/social/friend-accept/${requestId}`,
      { method: 'POST', headers: authHeaders(accountId) }
    ),
  socialFriendReject: (accountId: number, requestId: number) =>
    jsonFetch<{ request: ServerFriendDto }>(
      `/social/friend-reject/${requestId}`,
      { method: 'POST', headers: authHeaders(accountId) }
    ),
  socialFriendRemove: (accountId: number, friendId: number) =>
    jsonFetch<{ removed: true }>(`/social/friends/${friendId}`, {
      method: 'DELETE',
      headers: authHeaders(accountId)
    }),
  // -- social: messages ----------------------------------------------
  socialSendMessage: (accountId: number, targetUserId: number, content: string) =>
    jsonFetch<{ message: ServerMessageDto }>(
      `/social/message/${targetUserId}`,
      {
        method: 'POST',
        headers: authHeaders(accountId),
        body: JSON.stringify({ content })
      }
    ),
  socialMessages: (accountId: number, peerId: number, limit = 50) =>
    jsonFetch<{ peer: ServerPublicAccount; messages: ServerMessageDto[] }>(
      `/social/messages/${peerId}?limit=${limit}`,
      { headers: authHeaders(accountId) }
    ),
  socialConversations: (accountId: number) =>
    jsonFetch<{ conversations: ServerConversationItem[] }>(
      '/social/conversations',
      { headers: authHeaders(accountId) }
    ),
  // -- social: presence ----------------------------------------------
  socialPresence: (accountId: number, _tileId: string, _position?: { x: number; y: number; z: number } | null) =>
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
      headers: authHeaders(accountId),
      body: JSON.stringify({})
    }),
  socialNearby: (accountId: number, tileId?: string) =>
    jsonFetch<{ tileId: string | null; players: ServerNearbyPlayer[] }>(
      tileId ? `/social/nearby?tileId=${encodeURIComponent(tileId)}` : '/social/nearby',
      { headers: authHeaders(accountId) }
    ),
  // -- social: alliance ----------------------------------------------
  socialAlliance: (accountId: number) =>
    jsonFetch<{ alliance: ServerAllianceDto | null }>('/social/alliance', {
      headers: authHeaders(accountId)
    }),
  socialAllianceCreate: (accountId: number, name: string) =>
    jsonFetch<{ alliance: ServerAllianceDto }>('/social/alliance/create', {
      method: 'POST',
      headers: authHeaders(accountId),
      body: JSON.stringify({ name })
    }),
  socialAllianceInvite: (accountId: number, userId: number) =>
    jsonFetch<{ alliance: ServerAllianceDto }>(
      `/social/alliance/invite/${userId}`,
      { method: 'POST', headers: authHeaders(accountId) }
    ),
  socialAllianceLeave: (accountId: number) =>
    jsonFetch<{ left: true; disbanded: boolean; nextLeaderId: number | null }>(
      '/social/alliance/leave',
      { method: 'POST', headers: authHeaders(accountId) }
    ),
  // -- admin ---------------------------------------------------------
  adminUsers: (accountId: number) =>
    jsonFetch<{ users: ServerAdminUser[] }>('/admin/users', {
      headers: authHeaders(accountId)
    }),
  adminSetRole: (accountId: number, userId: number, role: AccountRole) =>
    jsonFetch<{ profile: AccountProfile }>(`/admin/users/${userId}/role`, {
      method: 'PUT',
      headers: authHeaders(accountId),
      body: JSON.stringify({ role })
    }),
  adminResetUserPassword: (accountId: number, userId: number) =>
    jsonFetch<ServerAdminResetIssue>(`/admin/users/${userId}/reset-password`, {
      method: 'POST', headers: authHeaders(accountId), body: JSON.stringify({}),
    }),
  adminNpcStats: (accountId: number) =>
    jsonFetch<ServerNpcStats>('/admin/npc-stats', { headers: authHeaders(accountId) }),
  adminLineage: (accountId: number) =>
    jsonFetch<ServerLineageResponse>('/admin/lineage', { headers: authHeaders(accountId) }),
  adminSimAdvance: (accountId: number, ticks: number) =>
    jsonFetch<{ ok: boolean; beforeTick: number; afterTick: number; requestedTicks: number; advancedTicks: number; elapsedMs: number; capped: boolean }>(
      '/admin/sim/advance',
      {
        method: 'POST',
        headers: authHeaders(accountId),
        body: JSON.stringify({ ticks }),
      }
    ),
  adminCardImages: (accountId: number) =>
    jsonFetch<{ images: Record<number, string> }>('/admin/cards/images', { headers: authHeaders(accountId) }),
  adminUploadCardImage: (accountId: number, id: number, imageBase64: string, mimeType: string) =>
    jsonFetch<{ ok: boolean; imageUrl: string }>(`/admin/cards/${id}/image`, {
      method: 'PUT',
      headers: authHeaders(accountId),
      body: JSON.stringify({ imageBase64, mimeType }),
    }),
  adminDeleteCardImage: (accountId: number, id: number) =>
    jsonFetch<{ ok: boolean }>(`/admin/cards/${id}/image`, {
      method: 'DELETE',
      headers: authHeaders(accountId),
    }),
  settlements: () =>
    jsonFetch<{ settlements: readonly ServerSettlement[] }>('/settlements'),
  settlementById: (id: string) =>
    jsonFetch<ServerSettlement>(`/settlements/${encodeURIComponent(id)}`),
  // Sprint 2A — per-tile ecology rollup (animals + fishery + migration + predator warnings)
  areaEcology: (tileId: string) =>
    jsonFetch<AreaEcologyView>(`/area/${encodeURIComponent(tileId)}/ecology`),
  // Goods and market
  marketPrices: () =>
    jsonFetch<readonly MarketPriceEntry[]>('/goods/market-prices'),
  properties: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : ''
    return jsonFetch<ServerPropertyListResponse>(`/properties${qs}`)
  },
  goodsInventory: (ownerId: string) =>
    jsonFetch<readonly GoodsInventoryEntry[]>(`/goods/inventory/${encodeURIComponent(ownerId)}`),
  // -- profile -------------------------------------------------------
  profile: (accountId: number) => jsonFetch<unknown>('/profile', { headers: authHeaders(accountId) }).then(value => ownProfile(value, accountId)),
  updateProfile: (accountId: number, patch: { nickname?: string | null; avatar?: string }) => jsonFetch<unknown>('/profile', {
    method: 'PATCH', headers: authHeaders(accountId), body: JSON.stringify(patch),
  }).then(value => ownProfile(value, accountId)),
  changePassword: (accountId: number, currentPassword: string, newPassword: string) => jsonFetch<{ ok: true }>('/profile/password', {
    method: 'POST', headers: authHeaders(accountId), body: JSON.stringify({ currentPassword, newPassword }),
  }),
  // -- card drops / codex / trade ----------------------------------
  cardConfig: () => jsonFetch<ServerCardConfig>('/cards/config'),
  cardsActive: (accountId: number, tileId: string) =>
    jsonFetch<unknown>(
      `/cards/active?tileId=${encodeURIComponent(tileId)}`,
      { headers: authHeaders(accountId) }
    ).then(value => {
      const read = parseCardRead(value)
      if (!value || typeof value !== 'object' || !('tileId' in value) || value.tileId !== tileId) throw new Error('Owned-card region response mismatch.')
      return { ...read, tileId }
    }),
  cardsHeld: (accountId: number) =>
    jsonFetch<unknown>('/cards/held', {
      headers: authHeaders(accountId)
    }).then(parseCardRead),
  cardsPickup: (accountId: number, dropId: number) =>
    jsonFetch<{ drop: ServerCardDrop }>('/cards/pickup', {
      method: 'POST',
      headers: authHeaders(accountId),
      body: JSON.stringify({ dropId })
    }),
  cardsStore: (
    accountId: number,
    dropId: number,
    slotType: ServerCardSlotType
  ) =>
    jsonFetch<{ drop: ServerCardDrop; codex: ServerCodexEntry }>('/cards/store', {
      method: 'POST',
      headers: authHeaders(accountId),
      body: JSON.stringify({ dropId, slotType })
    }),
  cardsRelease: (accountId: number, dropId: number) =>
    jsonFetch<{ drop: ServerCardDrop }>('/cards/release', {
      method: 'POST',
      headers: authHeaders(accountId),
      body: JSON.stringify({ dropId })
    }),
  cardsSinceLastVisit: (accountId: number) =>
    jsonFetch<ServerSinceLastVisit>('/cards/since-last-visit', {
      headers: authHeaders(accountId)
    }),
  /** v0.14.0：完整 living-world catch-up（pressure / world events / NPC 互動） */
  worldSinceLastVisit: (accountId: number) =>
    jsonFetch<ServerWorldSinceLastVisit>('/world/since-last-visit', {
      headers: authHeaders(accountId)
    }),
  codex: (accountId: number) =>
    jsonFetch<ServerCodexResponse>('/codex', { headers: authHeaders(accountId) }),
  codexMaterialize: (accountId: number, codexId: number) =>
    jsonFetch<{ materialized: ServerCodexEntry }>('/codex/materialize', {
      method: 'POST',
      headers: authHeaders(accountId),
      body: JSON.stringify({ codexId })
    }),
  tradeList: (accountId: number) =>
    jsonFetch<ServerTradeList>('/trade/list', { headers: authHeaders(accountId) }),
  tradePropose: (
    accountId: number,
    targetUserId: number,
    offeredCodexId: number,
    requestedCardId: number
  ) =>
    jsonFetch<{ trade: ServerTradeDto }>('/trade/propose', {
      method: 'POST',
      headers: authHeaders(accountId),
      body: JSON.stringify({ targetUserId, offeredCodexId, requestedCardId })
    }),
  tradeAccept: (accountId: number, tradeId: number) =>
    jsonFetch<{ trade: ServerTradeDto }>(`/trade/accept/${tradeId}`, {
      method: 'POST',
      headers: authHeaders(accountId)
    }),
  tradeReject: (accountId: number, tradeId: number) =>
    jsonFetch<{ trade: ServerTradeDto }>(`/trade/reject/${tradeId}`, {
      method: 'POST',
      headers: authHeaders(accountId)
    }),
  tradeCancel: (accountId: number, tradeId: number) =>
    jsonFetch<{ trade: ServerTradeDto }>(`/trade/cancel/${tradeId}`, {
      method: 'POST',
      headers: authHeaders(accountId)
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
  buildingApply: (accountId: number, buildingId: string, shift: ServerShift) =>
    jsonFetch<{ job: ServerPlayerJob; building: ServerBuildingDef }>(
      `/buildings/${encodeURIComponent(buildingId)}/apply`,
      {
        method: 'POST',
        headers: authHeaders(accountId),
        body: JSON.stringify({ shift })
      }
    ),
  buildingQuit: (accountId: number, buildingId: string, shift: ServerShift) =>
    jsonFetch<{ removed: boolean }>(
      `/buildings/${encodeURIComponent(buildingId)}/quit`,
      {
        method: 'POST',
        headers: authHeaders(accountId),
        body: JSON.stringify({ shift })
      }
    ),
  buildingWork: (accountId: number, buildingId: string) =>
    jsonFetch<{
      job: ServerPlayerJob
      wallet: ServerPlayerWallet
      wage: number
    }>(`/buildings/${encodeURIComponent(buildingId)}/work`, {
      method: 'POST',
      headers: authHeaders(accountId)
    }),
  buildingRest: (accountId: number, buildingId: string) =>
    jsonFetch<{ wallet: ServerPlayerWallet; restoredAt: number; building: ServerBuildingDef }>(
      `/buildings/${encodeURIComponent(buildingId)}/rest`,
      {
        method: 'POST',
        headers: authHeaders(accountId)
      }
    ),
  wallet: (accountId: number) =>
    jsonFetch<unknown>('/wallet', {
      headers: authHeaders(accountId)
    }).then(value => parseWalletResponse(value, accountId)),
  // ── Combat (Phase B, v0.15.0；v0.90.0 加術式卡手牌) ──
  combatActive: (accountId: number) =>
    jsonFetch<{ active: ServerCombatSession | null; log?: ServerCombatLogRow[]; hand?: ServerCombatHandCard[]; usedCardClasses?: string[] }>(
      '/combat/active',
      { headers: authHeaders(accountId) }
    ),
  combatGet: (accountId: number, combatId: string) =>
    jsonFetch<{ session: ServerCombatSession; log: ServerCombatLogRow[]; hand?: ServerCombatHandCard[]; usedCardClasses?: string[] }>(
      `/combat/${encodeURIComponent(combatId)}`,
      { headers: authHeaders(accountId) }
    ),
  combatInitiate: (accountId: number, targetNpcId: string) =>
    jsonFetch<{ session: ServerCombatSession; log: ServerCombatLogRow[]; hand?: ServerCombatHandCard[]; usedCardClasses?: string[] }>(
      '/combat/initiate',
      {
        method: 'POST',
        headers: authHeaders(accountId),
        body: JSON.stringify({ targetNpcId })
      }
    ),
  combatInitiateAnimal: (accountId: number, targetAnimalId: string, speciesId: string) =>
    jsonFetch<{ session: ServerCombatSession; log: ServerCombatLogRow[]; hand?: ServerCombatHandCard[]; usedCardClasses?: string[] }>(
      '/combat/initiate-animal',
      {
        method: 'POST',
        headers: authHeaders(accountId),
        body: JSON.stringify({ targetAnimalId, speciesId })
      }
    ),
  combatAction: (
    accountId: number,
    combatId: string,
    action: 'attack' | 'defend' | 'flee',
    cardId?: number,
    cardClass?: string
  ) =>
    jsonFetch<{
      session: ServerCombatSession
      events: Array<{ eventType: string; payload: Record<string, unknown> }>
      resolved: null | { outcome: 'player_victory' | 'npc_victory' | 'fled' }
      log: ServerCombatLogRow[]
    }>(`/combat/${encodeURIComponent(combatId)}/action`, {
      method: 'POST',
      headers: authHeaders(accountId),
      body: JSON.stringify({
        action,
        ...(cardId !== undefined ? { cardId } : {}),
        ...(cardClass !== undefined ? { cardClass } : {}),
      })
    }),
  // ── Combat (Phase C, v0.25.x) ──
  combatPlay: (accountId: number, combatId: string, cardClass: string, targetActorId: string) =>
    jsonFetch<{ accepted: true; commandId: string }>(
      `/combat/${encodeURIComponent(combatId)}/play`,
      {
        method: 'POST',
        headers: authHeaders(accountId),
        body: JSON.stringify({ cardClass, targetActorId }),
      }
    ),
  combatCancel: (accountId: number, combatId: string, commandId: string) =>
    jsonFetch<{ cancelled: boolean; commandId: string }>(
      `/combat/${encodeURIComponent(combatId)}/cancel`,
      {
        method: 'POST',
        headers: authHeaders(accountId),
        body: JSON.stringify({ commandId }),
      }
    ),
  combatSnapshot: (accountId: number, combatId: string) =>
    jsonFetch<import('../state/CombatProjection.js').CombatSseSnapshot>(
      `/combat/${encodeURIComponent(combatId)}/snapshot`,
      { headers: authHeaders(accountId) }
    ),
  combatStreamUrl: (combatId: string): string =>
    `${API_BASE}/combat/${encodeURIComponent(combatId)}/stream`,
  // ── Technique shop (Phase B, v0.15.0) ──
  shopTechniques: (accountId: number) =>
    jsonFetch<{ items: ServerTechniqueShopItem[]; locationTile: string }>(
      '/shop/techniques',
      { headers: authHeaders(accountId) }
    ),
  shopBuyTechnique: (accountId: number, cardId: number) =>
    jsonFetch<{ owned: { card_id: number; count: number }; wallet: ServerPlayerWallet }>(
      `/shop/techniques/${cardId}/buy`,
      { method: 'POST', headers: authHeaders(accountId) }
    ),
  myTechniques: (accountId: number) =>
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
    }>('/me/techniques', { headers: authHeaders(accountId) }),
  // ── Per-player dynamic NPC greet (Phase B) ──
  npcGreet: (accountId: number, npcId: string) =>
    jsonFetch<{
      npcId: string
      greetLine: { zh: string; en: string }
      relationship: { trust: number; tier: 'low' | 'mid' | 'high'; interactionCount: number }
    }>(`/npc/${encodeURIComponent(npcId)}/greet`, {
      headers: authHeaders(accountId)
    }),
  // ── Phase 6 — Player Civilization ──
  playerState: (accountId: number) =>
    jsonFetch<PlayerCivilizationSnapshot>('/world/player-state', {
      headers: authHeaders(accountId)
    }),
  playerAction: (accountId: number, type: string, payload: Record<string, unknown>) =>
    jsonFetch<PlayerActionResult>('/world/player-action', {
      method: 'POST',
      headers: { ...authHeaders(accountId), 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, payload })
    }),
  // ── v0.96.0  MindSheet — NPC 意圖 ──
  npcIntent: (accountId: number, npcId: string) =>
    jsonFetch<NpcIntentResponse>(`/npc/${encodeURIComponent(npcId)}/intent`, {
      headers: authHeaders(accountId)
    }),
  // ── v0.96.0  MindSheet — NPC 信念 ──
  npcBeliefs: (accountId: number, npcId: string) =>
    jsonFetch<NpcBeliefsResponse>(`/npc/${encodeURIComponent(npcId)}/beliefs`, {
      headers: authHeaders(accountId)
    }),
  // ── SP1 — Player Survival Needs ──
  playerNeeds: (accountId: number) =>
    jsonFetch<PlayerNeedsState>('/player/needs', { headers: authHeaders(accountId) }),
  eatRation: (accountId: number) =>
    jsonFetch<{ accepted: boolean; needs: PlayerNeedsState }>('/player/eat', {
      method: 'POST',
      headers: { ...authHeaders(accountId), 'Content-Type': 'application/json' },
    })
}

export type PlayerCivilizationSnapshot = {
  accountId: string
  wallet: number
  hiredNpcIds: readonly string[]
  factionIds: readonly string[]
  claimedTileIds: readonly string[]
}

export type PlayerActionResult = {
  accepted: boolean
  tick?: number
  reason?: string
}

/** v0.90.0 — 戰鬥手牌卡（基本牌 + 已購術式卡解鎖）。 */
export type ServerCombatHandCard = {
  cardClass: string
  source: 'basic' | 'technique'
  techniqueId: number | null
  labelZh: string
  labelEn: string
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
  enemyType?: 'npc' | 'animal'
  speciesId?: string | null
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

export type MarketPriceEntry = {
  marketId: string
  settlementId: string
  goodsId: string
  nameZh: string
  supplyQuantity: number
  demandQuantity: number
  priceGold: number
}

export type GoodsInventoryEntry = {
  goodsId: string
  quantity: number
  nameZh: string
  unit: string
}

export type PlayerNeedsState = {
  nourishment: number
  vigor: number
  collapsed: boolean
  asOfTick: number
}

export type NpcIntentEntry = {
  kind: string
  label: string
  urgencyLabel: string
  reasonZh: string
}

export type NpcLesson = {
  kind: string
  text: string
}

export type NpcIntentResponse = {
  intents: NpcIntentEntry[]
  lessons: NpcLesson[]
}

export type NpcBeliefEntry = {
  label: string
  confidenceLabel: string
  kind: string
}

export type NpcBeliefsResponse = {
  beliefs: NpcBeliefEntry[]
}

export function streamUrl(): string {
  return `${API_BASE}/events/stream`
}

export function socialStreamUrl(expectedAccountId: number): string {
  if (!Number.isSafeInteger(expectedAccountId) || expectedAccountId <= 0) throw new Error('Invalid social stream account context.')
  return `${API_BASE}/social/stream?expectedAccountId=${expectedAccountId}`
}

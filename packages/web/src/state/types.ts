// Mirrors the kernel + planned runtime contracts so the frontend has
// stable shapes to render. These intentionally duplicate the server
// types here in v1 — once a packages/shared workspace exists, they
// will move there.

export interface WorldSnapshot {
  tick: number
  lastSequence: number
  eventCount: number
  npcCount: number
  facts: Record<string, unknown>
  worldConfig: {
    tickDurationMs: number
    ticksPerDay: number
    timezone: string
    timezoneOffsetMinutes: number
  }
  generatedAt: string
}

export interface EventSummary {
  sequence: number
  tick: number
  eventType: string
  actorId: string
  occurredAt: string
  payload: Record<string, unknown>
  narration?: string | null
}

export type NpcActivity =
  | 'idle'
  | 'move'
  | 'work'
  | 'eat'
  | 'sleep'
  | 'trade'
  | 'patrol'

export interface NpcSummary {
  id: string
  name: string
  role: string
  location: string
  relationshipScore: number
  lastActedTick: number
  internalState: Record<string, unknown>
  /** Living-world fields (server v0.9+, optional for backward compat) */
  activity?: NpcActivity
  mood?: number
  health?: number
  faction?: string
  targetTile?: string
  /** Server-driven area canvas 子格座標（v0.12+） */
  subCol?: number
  subRow?: number
  /** 高度 / 樓層座標。現在多數為 0，未來用於高低差與室內樓層。 */
  subZ?: number
  /** null/undefined = 室外；有值 = 在該建築內，不應同時畫在區域街道上 */
  buildingId?: string | null
  /** NPC 正在跨區移動時的單一 worldline segment；非移動時為 null */
  travelRoute?: {
    fromTile: string
    toTile: string
    targetTile: string
    startedAtTick: number
  } | null
  /** 24-bit RGB sprite 主色（v0.12+） */
  color?: number
  /** Personality-shaped placeholder shown before player types in NpcDialog (v0.14.1+) */
  greetLine?: { zh: string; en: string }
  /** Server-authoritative short summary of current deterministic NPC task (v0.15.28+) */
  intentLine?: { zh: string; en: string }
  /** Deterministic life pressure and long-term goal projection (v0.15.32+) */
  life?: {
    needs: Record<'food' | 'rest' | 'money' | 'housing' | 'safety', number>
    goal: { kind: string; pressure: number; narration: string }
    householdId: string | null
  }
  /** Deterministic personal economy/skill projection derived from productive NPC actions. */
  civic?: {
    npcId: string
    gold: number
    skillXp: Record<'construction' | 'knowledge' | 'commerce' | 'civic', number>
    lastProductiveTick: number | null
  } | null
  /**
   * v0.87.3+：death-state propagation. The public `/api/npcs` endpoint excludes
   * deceased NPCs, so `deceased` is `false` in steady state. Frontend treats
   * a true value as an SSE/poll race and refuses to open a dialog (defense in depth).
   */
  deceased: boolean
}

export type CardRank = 'S' | 'A' | 'B' | 'C' | 'D'

export type CardCategory =
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

export type CardAcquisitionMethod =
  | 'main_quest'
  | 'side_quest'
  | 'affinity_bond'
  | 'combat_victory'
  | 'shop_purchase'
  | 'location_trigger'
  | 'puzzle_solve'
  | 'random_drop'

export interface CardCatalogEntry {
  id: number
  rank: CardRank
  category?: CardCategory
  name: string
  description: string
  story: string
  maxCopies?: number
  acquisitionMethod?: CardAcquisitionMethod
  acquisitionDetail?: string
  effectDescription?: string
  imageUrl?: string
  owned: boolean
  discoveredAtTick?: number
}

export interface MapTile {
  id: string
  name: string
  x: number
  y: number
  biome: 'grass' | 'forest' | 'mountain' | 'desert' | 'water' | 'ruin'
  npcIds: string[]
}

export interface WorldMap {
  width: number
  height: number
  tiles: MapTile[]
}

export interface DashboardSummary {
  world: WorldSnapshot
  cardsOwned: number
  cardsTotal: number
  recentEvents: EventSummary[]
  rareWindowOpen: boolean
  ticksSinceLastVisit: number
}

// ─── Living World v0.10.0 — Areas + Buildings ───────────────────

export type FactionId = 'tide_hunters' | 'free_runners' | 'guild' | 'civilian'

export interface AreaResources {
  food: number
  safety: number
  economy: number
}

export interface AreaLocalEvent {
  tick: number
  kind:
    | 'faction.dominance'
    | 'faction.lost'
    | 'pressure.food_shortage'
    | 'pressure.crime_spike'
    | 'pressure.price_hike'
  narration: string
  detail: Record<string, string | number>
}

export interface AreaStateView {
  tileId: string
  factionControl: Record<FactionId, number>
  dominantFaction: FactionId | null
  resources: AreaResources
  lastUpdatedTick: number
  recentEvents: AreaLocalEvent[]
}

export type BuildingType =
  | 'residential'
  | 'shop'
  | 'restaurant'
  | 'office'
  | 'factory'
  | 'library'
  | 'exchange'
  | 'temple'
  | 'landmark'

export type Shift = 'morning' | 'afternoon' | 'night'

export interface BuildingHiringSlot {
  shift: Shift
  capacity: number
  wage: number
  taskZh: string
}

export interface InteriorProp {
  col: number
  row: number
  glyph: string
  size?: number
  label?: string
}

export interface InteriorLayout {
  cols: number
  rows: number
  props: InteriorProp[]
  backgroundColor?: number
}

export interface BuildingDef {
  id: string
  tileId: string
  nameZh: string
  nameEn: string
  descriptionZh: string
  type: BuildingType
  placement: { col: number; row: number; glyph: string; size: number }
  interior: InteriorLayout
  ownerNpcId: string | null
  hiring: BuildingHiringSlot[]
  enterable: boolean
  restorative: boolean
}

export interface BuildingOccupant {
  npcId: string
  shift: Shift | null
  isOwner: boolean
}

export interface BuildingView {
  def: BuildingDef
  occupants: BuildingOccupant[]
}

export interface PlayerJob {
  accountId: number
  buildingId: string
  shift: Shift
  hiredAtTick: number
  totalEarnings: number
  shiftsCompleted: number
  lastShiftTick: number
}

export interface PlayerWallet {
  accountId: number
  gold: number
  energy: number
  updatedAt: number
}

export interface AmbientResult {
  tileId: string
  text: string
  source: 'ai' | 'fallback'
  generatedAtTick: number
  generatedAt: string
  aiError: string | null
}

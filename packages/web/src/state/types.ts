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
}

export type CardRank = 'SS' | 'S' | 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H'

export interface CardCatalogEntry {
  id: number
  rank: CardRank
  name: string
  description: string
  story: string
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

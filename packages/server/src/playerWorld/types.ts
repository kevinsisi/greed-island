import { HARBOR_BEACON_EVENT_TYPES } from './harborBeaconData.js'
import type { AccountId } from '../identity/principal.js'
import type { MapEdgeCrossingType, MapTileDef } from '../sim/mapGraph.js'

export const PLAYER_WORLD_POSITION_EVENT_TYPES = ['PLAYER_WORLD_ENTERED', 'PLAYER_WORLD_MOVED', 'PLAYER_REGION_TRANSITIONED', 'PLAYER_BUILDING_ENTERED', 'PLAYER_BUILDING_EXITED'] as const
export const PLAYER_WORLD_EVENT_TYPES = [...PLAYER_WORLD_POSITION_EVENT_TYPES, 'PLAYER_WORLD_CHAT_POSTED', ...HARBOR_BEACON_EVENT_TYPES] as const
export type PlayerWorldEventType = (typeof PLAYER_WORLD_EVENT_TYPES)[number]
export const PLAYER_MOVEMENT_STEP_MS = 100
export const PLAYER_WORLD_MAX_BATCH = 100
export const PLAYER_WORLD_MAX_PENDING = 1000
export const PLAYER_WORLD_RULESET = 'canonical-player-world@1'
export type Point = Readonly<{ x: number; z: number }>
// Catalogs provide one layout, no floor or indoor player coordinates.
export type PlayerWorldInterior = Readonly<{ buildingId: string; returnPose: Point }>
export type PlayerWorldPosition = Point & Readonly<{
  accountId: AccountId
  tileId: string
  movementStep: number
  sequence: number
  interior?: PlayerWorldInterior
}>
export type PlayerWorldIntent = Readonly<{ commandId: string }> & (
  | Readonly<{ type: 'enter'; payload: Record<string, never> }>
  | Readonly<{ type: 'move'; payload: { dx: number; dz: number } }>
  | Readonly<{ type: 'transition'; payload: { toTileId: string } }>
  | Readonly<{ type: 'chat'; payload: { text: string } }>
  | Readonly<{ type: 'contribute'; payload: Record<string, never> }>
  | Readonly<{ type: 'enter-building'; payload: { buildingId: string } }>
  | Readonly<{ type: 'exit-building'; payload: Record<string, never> }>
)
/** Complete position events support indexed latest-per-actor restart hydration. */
export type PlayerWorldEventData = Readonly<{
  accountId: number
  tileId: string
  x: number
  z: number
  movementStep: number
  clientCommandId: string
  intentDigest: string
  fromTileId?: string
  crossingType?: MapEdgeCrossingType
  interior?: PlayerWorldInterior
  fromBuildingId?: string
}>
export type PlayerWorldAuthorize = () => void
export type PlayerWorldDisplayNameResolver = (id: AccountId) => string | null
export type PlayerWorldAck = Readonly<{
  accepted: true
  commandId: string
  revision: number
  duplicate?: true
}>
export type WorldRegion = MapTileDef & Readonly<{ available: boolean; generated: boolean }>
export type WorldEdge = Readonly<{ fromTileId: string; toTileId: string; crossingType: MapEdgeCrossingType; available: boolean }>
export type PlayerWorldMap = Readonly<{
  regions: readonly WorldRegion[]
  adjacency: Readonly<Record<string, readonly string[]>>
  edges: readonly WorldEdge[]
}>
export type PlayerWorldNpc = Readonly<{
  id: string
  name: Readonly<{ zh: string; en: string }>
  color: number
  location: string
  activity: string
  buildingId: string | null
  travelRoute: unknown | null
  deceased: boolean
  subCol: number
  subRow: number
  subZ: number
}>
export interface CanonicalPlayerWorldSource {
  getBuilding?(buildingId: string, tileId: string): import('../buildings/types.js').BuildingDef | null
  getGeometry?(tileId: string): import('./geometry.js').RegionGeometry | null
  getMap(): PlayerWorldMap
  getTick(): number
  getRevision(): number
  getNpcs(): readonly PlayerWorldNpc[]
}
export class PlayerWorldError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) { super(message) }
}

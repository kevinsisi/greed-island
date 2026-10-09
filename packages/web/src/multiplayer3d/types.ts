/** Wire DTOs mirrored from the canonical identity/playerWorld services, never a second room. */
export interface AccountProfile {
  accountId: number
  email: string | null
  username: string | null
  nickname: string | null
  avatar: string
  displayName: string
  role: 'player' | 'gm' | 'admin' | 'agent'
  createdAt: number
}
export interface WorldPoint { x: number; z: number }
export type HarborProgress = { status: 'ready'; supplies: number; rewards: number }
  | { status: 'legacy-review-required'; supplies: null; rewards: null }
export interface HarborBeacon extends WorldPoint {
  id: 'harbor-beacon-1'
  tileId: 't_dock'
  radius: number
  required: number
  participationWindowTicks: number
  tick: number
  tickMs: 100
  closesAtTick: number | null
  contributors: number[]
  awardedAccountIds: number[]
  completed: boolean
  phase: 'gathering' | 'collecting' | 'completed'
}
export interface WorldPlayer extends WorldPoint {
  accountId: number
  tileId: string
  movementStep: number
  sequence: number
  online: boolean
  harborProgress: HarborProgress
  displayName?: string
}
export interface WorldNpc {
  id: string
  name: { zh: string; en: string }
  color: number
  location: string
  activity: string
  subCol: number
  subRow: number
  subZ: number
  presentationPosition: WorldPoint
}
export interface WorldMessage {
  id: string; accountId: number; tileId: string; text: string; displayName?: string
  sequence: number; worldTick: number; postedAtMovementStep: number
}
export interface RegionGeometry {
  tileId: string
  presentation: 'harbor-3d' | 'canonical-area-grid'
  minX: number; maxX: number; minZ: number; maxZ: number
  playerRadius: number
  movePerStep: number
  spawn: WorldPoint
  terrain?: readonly string[]
  obstacles: Array<WorldPoint & { id?: string; width: number; depth: number }>
  portals: Array<WorldPoint & { toTileId: string; radius: number; arrival: WorldPoint }>
}
export interface WorldRegion {
  id: string
  name: string
  x: number
  y: number
  biome: string
  available: boolean
  generated: boolean
  geometrySupported: boolean
}
export interface WorldEdge {
  fromTileId: string
  toTileId: string
  crossingType: 'land' | 'water-crossing'
  available: boolean
}
export interface PlayerWorldSnapshot {
  version: 1
  worldId: 'canonical-world'
  selfId: number
  tileId: string
  revision: number
  presenceRevision: number
  movementStep: number
  worldTick: number
  players: WorldPlayer[]
  npcs: WorldNpc[]
  messages: WorldMessage[]
  beacon: HarborBeacon
  harborProgress: HarborProgress
  geometry: RegionGeometry
  map: {
    regions: WorldRegion[]
    adjacency: Record<string, string[]>
    edges: WorldEdge[]
    regionOnlineCounts: Record<string, number>
  }
}
export type WorldCommand = { type: 'enter'; payload: Record<string, never> }
  | { type: 'move'; payload: { dx: number; dz: number } }
  | { type: 'chat'; payload: { text: string } }
  | { type: 'contribute'; payload: Record<string, never> }
  | { type: 'transition'; payload: { toTileId: string } }
export interface CommandAcknowledgement { accepted: true; commandId: string; revision: number; duplicate?: true }
export type ConnectionStatus = 'checking' | 'unauthenticated' | 'connecting' | 'online' | 'offline'
export interface MultiplayerControls { x: number; y: number; paused: boolean; recenter: boolean; cancelNavigation?: () => void }
export interface MultiplayerSceneOptions {
  getSnapshot: () => PlayerWorldSnapshot | null
  getSelfId: () => number | null
  controls: MultiplayerControls
  onMove: (dx: number, dz: number) => void
  onNavigationStatus?: (message: string) => void
  onReady: () => void
  onError: (message: string) => void
}

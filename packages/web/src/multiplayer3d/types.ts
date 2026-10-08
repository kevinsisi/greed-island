export interface RoomPlayer {
  id: string
  name: string
  x: number
  z: number
  supplies: number
  rewards: number
  online: boolean
}

export interface RoomMessage {
  id: string
  playerId: string
  name: string
  text: string
  tick: number
}

export interface RoomSnapshot {
  roomId: string
  revision: number
  presenceRevision: number
  tick: number
  selfId: string
  selfRole?: 'player' | 'admin'
  capacity: { maxOnlinePlayers: number; onlinePlayers: number; reservedPlayers: number; selfHasSlot: boolean }
  players: RoomPlayer[]
  messages: RoomMessage[]
  beacon: { id: string; x: number; z: number; radius: number; required: number; contributors: string[]; completed: boolean; phase: 'gathering' | 'collecting' | 'completed'; closesAtTick: number | null }
  /** Older room servers may omit navigation metadata; click-to-move then stays disabled. */
  world: { minX: number; maxX: number; minZ: number; maxZ: number; playerRadius?: number; movePerTick?: number; obstacles: Array<{ x: number; z: number; width: number; depth: number }> }
  npcIntegrated: false
}

export type RoomCommand = { type: 'move'; payload: { dx: number; dz: number } } | { type: 'chat'; payload: { text: string } } | { type: 'contribute'; payload: Record<string, never> }
export interface CommandAcknowledgement { accepted: true; commandId: string; revision: number; duplicate?: boolean }
export type ConnectionStatus = 'checking' | 'unauthenticated' | 'connecting' | 'online' | 'offline'

export interface MultiplayerControls { x: number; y: number; paused: boolean; recenter: boolean; cancelNavigation?: () => void }

export interface MultiplayerSceneOptions {
  getSnapshot: () => RoomSnapshot | null
  getSelfId: () => string | null
  controls: MultiplayerControls
  onMove: (dx: number, dz: number) => void
  onNavigationStatus?: (message: string) => void
  onReady: () => void
  onError: (message: string) => void
}


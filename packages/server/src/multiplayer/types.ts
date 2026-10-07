export type RoomPlayer = { id: string; name: string; x: number; z: number; supplies: number; rewards: number }
export type RosterPlayer = Pick<RoomPlayer, 'id' | 'name' | 'x' | 'z'>
export type RoomConfig = { maxOnlinePlayers: number; minParticipants: number; participationWindowTicks: number }
export type RoomMessage = { id: string; playerId: string; name: string; text: string; tick: number }
export type RoomState = {
  sequence: number
  tick: number
  config: RoomConfig
  players: RoomPlayer[]
  messages: RoomMessage[]
  contributors: string[]
  completed: boolean
  closesAtTick: number | null
  awardedPlayerIds: string[]
  movedAt: Record<string, number>
}
export type RoomSnapshot = {
  roomId: string
  revision: number
  presenceRevision: number
  tick: number
  selfId: string
  capacity: { maxOnlinePlayers: number; onlinePlayers: number; reservedPlayers: number; selfHasSlot: boolean }
  players: Array<RoomPlayer & { online: boolean }>
  messages: RoomMessage[]
  beacon: { id: string; x: number; z: number; radius: number; required: number; contributors: string[]; completed: boolean; phase: 'gathering' | 'collecting' | 'completed'; closesAtTick: number | null }
  world: { minX: number; maxX: number; minZ: number; maxZ: number; obstacles: Array<{ x: number; z: number; width: number; depth: number }> }
  npcIntegrated: false
}
export type RoomCommand = { commandId: string; type: 'move' | 'chat' | 'contribute'; payload: Record<string, unknown> }
export type FixtureIdentity = { id: string; name: string; username: string; passwordHash: string }
export type CommandAcknowledgement = { accepted: true; commandId: string; revision: number; duplicate?: boolean }

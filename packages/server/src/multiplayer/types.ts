export type RoomPlayer = { id: string; name: string; x: number; z: number; supplies: number; rewards: number }
export type RoomMessage = { id: string; playerId: string; name: string; text: string; tick: number }
export type RoomState = {
  sequence: number
  tick: number
  players: RoomPlayer[]
  messages: RoomMessage[]
  contributors: string[]
  completed: boolean
  movedAt: Record<string, number>
}
export type RoomSnapshot = {
  roomId: string
  revision: number
  presenceRevision: number
  tick: number
  selfId: string
  players: Array<RoomPlayer & { online: boolean }>
  messages: RoomMessage[]
  beacon: { id: string; x: number; z: number; radius: number; required: number; contributors: string[]; completed: boolean }
  world: { minX: number; maxX: number; minZ: number; maxZ: number; obstacles: Array<{ x: number; z: number; width: number; depth: number }> }
  npcIntegrated: false
}
export type RoomCommand = { commandId: string; type: 'move' | 'chat' | 'contribute'; payload: Record<string, unknown> }
export type FixtureIdentity = { id: string; name: string; username: string; passwordHash: string }

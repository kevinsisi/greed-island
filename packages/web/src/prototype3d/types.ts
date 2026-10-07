export type Position = { x: number; z: number }
export type CardId = 'ember' | 'tide' | 'wind'
export type QuestStage = 'arrival' | 'forest' | 'gate' | 'relic' | 'return' | 'complete'
export type NpcId = 'guide' | 'herbalist' | 'scout' | 'sentinel'
export type NpcGoal = 'gather' | 'study' | 'rest' | 'guard' | 'observe' | 'sleep'
export type NpcSkill = 'gathering' | 'study' | 'guarding'
export interface NpcMemory { time: number; kind: 'work' | 'talk' | 'world' | 'card'; text: string }
export interface NpcState {
  id: NpcId
  position: Position
  target: Position
  goal: NpcGoal
  energy: number
  curiosity: number
  skills: Record<NpcSkill, number>
  trust: number
  supplies: number
  completedActions: number
  actionProgress: number
  memories: NpcMemory[]
}
export interface DemoState {
  version: 1
  runId: string
  stage: QuestStage
  hp: number
  energy: number
  seeds: number[]
  enemyHp: number
  bridgeOpen: boolean
  relic: boolean
  position: Position
  selectedCard: CardId
  worldTime: number
  npcs: Record<NpcId, NpcState>
}
export type DemoAction =
  | { type: 'move'; position: Position }
  | { type: 'interact' }
  | { type: 'cast'; card: CardId }
  | { type: 'select-card'; card: CardId }
  | { type: 'enemy-hit'; amount: number }
  | { type: 'recover'; delta: number }
  | { type: 'respawn' }
  | { type: 'tick'; delta: number }
  | { type: 'npc-talk'; id: NpcId }
export interface Objective { title: string; detail: string; destination: string; position: Position }
export interface Interaction { label: string; kind: 'guide' | 'seed' | 'gate' | 'relic' | 'camp' | 'npc'; npcId?: NpcId }
export interface SceneTelemetry {
  zone: string
  distance: number
  nearby: Interaction | null
  enemyNearby: boolean
  cameraOccluded: boolean
  heading: number
}
export interface DemoControls {
  x: number
  y: number
  lookX: number
  lookY: number
  sprint: boolean
  paused: boolean
  recenter: boolean
}
export const WORLD = {
  spawn: { x: 0, z: -22 },
  guide: { x: 0, z: -18 },
  seeds: [{ x: -5, z: -3 }, { x: 5, z: 3 }, { x: -4, z: 9 }],
  enemy: { x: 1, z: 10 },
  gate: { x: 0, z: 18 },
  relic: { x: 0, z: 29 },
  bounds: { minX: -13, maxX: 13, minZ: -28, maxZ: 34 },
} as const
export const PROTOTYPE_VERSION = '0.2.2'
export const SAVE_KEY = 'greed-island.prototype3d.v1'

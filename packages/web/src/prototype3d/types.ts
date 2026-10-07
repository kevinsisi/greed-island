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
export type EncounterId = 'forestCache' | 'ruinSentinel'
export type EncounterChoice = 'safe' | 'fight'
export type EncounterResult = 'safe' | 'won' | 'skipped' | 'abandoned'
export interface EncounterState {
  phase: 'available' | 'fighting' | 'resolved'
  choice: EncounterChoice | null
  enemyHp: number
}
export interface EncounterDefinition {
  id: EncounterId
  name: string
  position: Position
  safeCard: CardId
  energyCost: number
  safeReward: number
  fightReward: number
  maxHp: number
  damage: number
  range: number
  eligibleStages: QuestStage[]
}
export interface ExpeditionState {
  number: number
  seals: number
  shield: number
  campSupplies: number
  emberCooldown: number
  encounters: Record<EncounterId, EncounterState>
  history: Record<EncounterId, { safe: number; fights: number; wins: number }>
  pendingSealBonus: 0 | 1
  previousTrip: {
    number: number
    results: Record<EncounterId, EncounterResult>
    shieldGranted: number
    extraSealGranted: 0 | 1
  } | null
}
export interface CombatTarget {
  id: 'main' | EncounterId
  name: string
  position: Position
  hp: number
  maxHp: number
  damage: number
  range: number
}
export interface EncounterChoiceView {
  choice: EncounterChoice
  label: string
  detail: string
  enabled: boolean
  reason: string | null
  reward: number
}
export interface NextExpeditionPreview {
  number: number
  spentSupplies: number
  shieldGranted: number
  extraSealGranted: 0 | 1
  seals: number
  canStart: boolean
  reason: string | null
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
  expedition: ExpeditionState
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
  | { type: 'choose-encounter'; runId: string; id: EncounterId; choice: EncounterChoice }
  | { type: 'encounter-hit'; runId: string; id: EncounterId }
  | { type: 'next-expedition'; runId: string; nextRunId: string }
export interface Objective { title: string; detail: string; destination: string; position: Position }
export interface Interaction { label: string; kind: 'guide' | 'seed' | 'gate' | 'relic' | 'camp' | 'npc' | 'encounter'; npcId?: NpcId; encounterId?: EncounterId }
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
export const PROTOTYPE_VERSION = '0.3.0'
export const SAVE_KEY = 'greed-island.prototype3d.v1'

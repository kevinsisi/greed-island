// Living-world domain command catalog. Every actor in the simulation
// (NPC engine, area-state engine, building runtime, world-event engine,
// weather/season cycle, player) expresses intent as a typed Command in
// this file. The Rule Engine is the only path that turns these
// Commands into typed Events that land in `event_log`.
//
// One file per command would explode the surface area; we keep them
// together because the catalog is closed and short, and the validation
// shape is similar across commands.

import { hashCanonicalJson, toCanonicalJson } from './canonicalJson.js'
import {
  DEFAULT_RULESET_VERSION,
  KERNEL_EVENT_VERSION,
  type Command,
  type EventDraft,
  type RuleRejection,
  type RuleResult
} from './types.js'
import type { Animal } from '../ecosystem/species.js'

export const LIVING_WORLD_ACTOR_TYPES = ['player', 'npc', 'system'] as const
export type LivingWorldActorType = (typeof LIVING_WORLD_ACTOR_TYPES)[number]

export const LIVING_WORLD_COMMAND_TYPES = [
  'NPC_MOVE',
  'NPC_ACTIVITY_CHANGE',
  'NPC_STATE_RECORDED',
  'NPC_LIFE_GOAL_SET',
  'NPC_HOUSEHOLD_FORMED',
  'NPC_CHILD_BORN',
  'NPC_PRODUCTIVE_ACTION',
  'CONSTRUCTION_INITIATE',
  'CONSTRUCTION_PROJECT_PROGRESS',
  'BUILDING_CONSTRUCTED',
  'MAP_TILE_UNLOCKED',
  'NPC_INTERACT',
  'AREA_PRESSURE',
  'WEATHER_CHANGE',
  'SEASON_CHANGE',
  'WORLD_EVENT_SPAWN',
  'WORLD_EVENT_END',
  'BUILDING_ENTER',
  'BUILDING_LEAVE',
  'RARE_WINDOW_OPEN',
  'RARE_WINDOW_CLOSE',
  'WORLD_TICK',
  'PLAYER_INTERVENE',
  'NPC_DIALOG_HOLD',
  // v0.15.0 — Combat Phase B (single-shot judgement)
  'COMBAT_INITIATE',
  'COMBAT_PLAYER_ACTION',
  'COMBAT_RESOLVE',
  // Phase 1 §33.4 — Settlement domain (Layer 3 Civilization Runtime)
  'SETTLEMENT_FORMED',
  // Phase E0.2 — Ecosystem Runtime (Layer 2.5)
  'ANIMAL_SPAWNED',
  // Phase E0.3 — Simple hunting
  'ANIMAL_HUNT_STARTED',
  'ANIMAL_HUNT_RESOLVED',
  'ANIMAL_KILLED',
  'CARCASS_CREATED',
  'MEAT_HARVESTED'
] as const
export type LivingWorldCommandType = (typeof LIVING_WORLD_COMMAND_TYPES)[number]

const LIVING_WORLD_COMMAND_TYPE_SET = new Set<string>(LIVING_WORLD_COMMAND_TYPES)
export function isLivingWorldCommandType(value: string): value is LivingWorldCommandType {
  return LIVING_WORLD_COMMAND_TYPE_SET.has(value)
}

export type NpcMoveCmd = Readonly<{
  npcId: string
  from: string
  to: string
  activity: string
  reachedDest: boolean
  motivation?: EventMotivation
  narration: string | null
}>

export type NpcActivityChangeCmd = Readonly<{
  npcId: string
  tile: string
  from: string
  to: string
  motivation?: EventMotivation
  narration: string | null
}>

export type NpcStateRecordedCmd = Readonly<{
  npcId: string
  state: Readonly<Record<string, unknown>>
  narration: string | null
}>

export type NpcLifeGoalSetCmd = Readonly<{
  npcId: string
  tile: string
  needs: Readonly<Record<'food' | 'rest' | 'money' | 'housing' | 'safety', number>>
  goal: Readonly<{ kind: string; pressure: number; narration: string }>
  motivation?: EventMotivation
  narration: string
}>

export type NpcHouseholdFormedCmd = Readonly<{
  householdId: string
  partnerNpcIds: readonly [string, string]
  homeTileId: string
  motivation?: EventMotivation
  narration: string
}>

export type NpcChildBornCmd = Readonly<{
  householdId: string
  childId: string
  nameZh: string
  nameEn: string
  motivation?: EventMotivation
  narration: string
}>

export type NpcProductiveActionCmd = Readonly<{
  npcId: string
  tile: string
  activity: string
  domain: 'build' | 'learn' | 'trade' | 'service'
  metric: 'infrastructure' | 'knowledge' | 'economy' | 'safety' | 'supply'
  delta: number
  motivation?: EventMotivation
  narration: string
}>

export type EventMotivation = Readonly<{
  explanation: string
  projectPurpose?: string
}>

export type ConstructionMotivation = Readonly<{
  projectPurpose: string
  primaryPressure: 'food' | 'rest' | 'money' | 'housing' | 'safety' | 'infrastructure'
  pressureScore: number
  sourceGoalKind: string
  sourceNpcId: string
  sourceTileId: string
  explanation: string
}>

export type ConstructionInitiateCmd = Readonly<{
  npcId: string
  tileId: string
  buildingId: string
  duration: number
  goldCost?: number
  motivation?: ConstructionMotivation
  narration: string
}>

export type ConstructionProjectProgressCmd = Readonly<{
  projectId: string
  kind: 'settlement'
  targetTileId: string
  buildingId: string
  npcId: string
  delta: number
  progressAfter: number
  targetProgress: number
  motivation?: ConstructionMotivation
  narration: string
}>

export type BuildingConstructedCmd = Readonly<{
  projectId: string
  buildingId: string
  tileId: string
  motivation?: ConstructionMotivation
  narration: string
}>

export type MapTileUnlockedCmd = Readonly<{
  projectId: string
  tileId: string
  adjacentTo: readonly string[]
  motivation?: ConstructionMotivation
  narration: string
}>

export type NpcInteractCmd = Readonly<{
  tile: string
  participants: readonly [string, string]
  positions?: Readonly<Record<string, { subCol: number; subRow: number; subZ: number }>>
  mode: 'chat' | 'argue'
  motivation?: EventMotivation
  narration: string
}>

export type AreaPressureCmd = Readonly<{
  tileId: string
  kind: string
  detail: Record<string, string | number>
  motivation?: EventMotivation
  narration: string
}>

export type WeatherChangeCmd = Readonly<{
  from: string
  to: string
  motivation?: EventMotivation
  narration: string
}>

export type SeasonChangeCmd = Readonly<{
  from: string
  to: string
  motivation?: EventMotivation
  narration: string
}>

export type WorldEventSpawnCmd = Readonly<{
  worldEventId: string
  templateId: string
  type: string
  scope: string
  endsAtTick: number
  motivation?: EventMotivation
  narration: string
  data: Record<string, unknown>
}>

export type WorldEventEndCmd = Readonly<{
  worldEventId: string
  templateId: string
  type: string
  scope: string
  motivation?: EventMotivation
}>

export type BuildingEnterCmd = Readonly<{
  npcId: string
  buildingId: string
  tileId: string
  motivation?: EventMotivation
  narration: string
}>

export type BuildingLeaveCmd = Readonly<{
  npcId: string
  buildingId: string
  tileId: string
  motivation?: EventMotivation
  narration: string
}>

export type RareWindowOpenCmd = Readonly<{
  windowId: string
  closesAtTick: number
  motivation?: EventMotivation
  narration: string
}>

export type RareWindowCloseCmd = Readonly<{
  windowId: string
  motivation?: EventMotivation
  narration: string
}>

export type WorldTickCmd = Readonly<{
  tick: number
}>

/**
 * v0.14.0：玩家介入兩位 NPC 的衝突。actor 為 'player'，actorId = accountId
 * 字串形式（保持 Command.actorId 為 string 一致性）。intentClass 由前端傳給
 * 後端 OR 後端用 AI 從 message 判斷後再放進命令裡 — Rule Engine 拿到的是
 * 已分類過的命令。AI 不直接寫 EventLog，符合 ARCHITECTURE §9。
 */
export type PlayerIntervenecmd = Readonly<{
  playerAccountId: string
  npcA: string
  npcB: string
  tile: string
  /**
   * intentClass：mediate=和事佬 / provoke=煽風點火 / watch=旁觀 /
   * threaten=威脅。後端在 AI 失敗時 fallback 到 'watch'。
   */
  intentClass: 'mediate' | 'provoke' | 'watch' | 'threaten'
  /** 玩家自由輸入的原文（可空字串：純按鈕介入） */
  message: string
  /** 一行敘事，給 catch-up summary / SSE listener 用 */
  narration: string
}>

export type NpcDialogHoldCmd = Readonly<{
  playerAccountId: string
  npcId: string
  tile: string
  holdTicks: number
  narration: string | null
}>

/** v0.15.0 Combat Phase B — 全部 combat 動作都走 LivingWorld pipeline */
export type CombatInitiateCmd = Readonly<{
  combatId: string
  playerAccountId: string
  npcId: string
  tile: string
  playerCombatHp: number
  npcCombatHp: number
  reason: 'player_challenge' | 'npc_aggression'
  narration: string
}>

export type CombatPlayerActionCmd = Readonly<{
  combatId: string
  playerAccountId: string
  npcId: string
  combatRound: number
  action: 'attack' | 'defend' | 'flee'
  /** Phase B 預留紋卡欄位；rule engine 看到時寫 COMBAT_CARD_IGNORED warning */
  cardId?: number
  narration: string
}>

export type CombatResolveCmd = Readonly<{
  combatId: string
  playerAccountId: string
  npcId: string
  outcome: 'player_victory' | 'npc_victory' | 'fled'
  durationRounds: number
  finalPlayerHp: number
  finalNpcHp: number
  playerEnergyToZero: boolean
  npcIncapacitatedTicks: number
  narration: string
}>

// Phase 1 §33.4 — Settlement domain (Layer 3 Civilization Runtime).
// Settlements emerge from sustained NPC co-presence; this is the
// founding event. Population / decline / takeover / goods / logistics
// are deferred to follow-up slices per WORLD_CAPABILITIES.md §28.1.
export type SettlementFormedCmd = Readonly<{
  settlementId: string
  tileId: string
  formedAtTick: number
  founderNpcIds: readonly string[]
  motivation?: EventMotivation
  narration: string
}>

export type AnimalSpawnedCmd = Readonly<{
  animal: Animal
  spawnedAtTick: number
  motivation?: EventMotivation
  narration: string | null
}>

export type AnimalHuntStartedCmd = Readonly<{
  huntId: string
  npcId: string
  tileId: string
  targetSpeciesId: string
  targetAnimalId: string
  startedAtTick: number
  motivation?: EventMotivation
  narration: string
}>

export type AnimalHuntResolvedCmd = Readonly<{
  huntId: string
  npcId: string
  tileId: string
  targetSpeciesId: string
  targetAnimalId: string
  outcome: 'success' | 'failed'
  resolvedAtTick: number
  motivation?: EventMotivation
  narration: string
}>

export type AnimalKilledCmd = Readonly<{
  huntId: string
  animalId: string
  speciesId: string
  tileId: string
  killedByNpcId: string
  killedAtTick: number
  motivation?: EventMotivation
  narration: string
}>

export type CarcassCreatedCmd = Readonly<{
  huntId: string
  carcassId: string
  animalId: string
  speciesId: string
  tileId: string
  edibleYield: number
  byproducts: readonly string[]
  createdAtTick: number
  motivation?: EventMotivation
  narration: string
}>

export type MeatHarvestedCmd = Readonly<{
  huntId: string
  carcassId: string
  animalId: string
  speciesId: string
  tileId: string
  npcId: string
  quantity: number
  goldValue: number
  harvestedAtTick: number
  motivation?: EventMotivation
  narration: string
}>

export type LivingWorldCommandPayload =
  | NpcMoveCmd
  | NpcActivityChangeCmd
  | NpcStateRecordedCmd
  | NpcLifeGoalSetCmd
  | NpcHouseholdFormedCmd
  | NpcChildBornCmd
  | NpcProductiveActionCmd
  | ConstructionInitiateCmd
  | ConstructionProjectProgressCmd
  | BuildingConstructedCmd
  | MapTileUnlockedCmd
  | NpcInteractCmd
  | AreaPressureCmd
  | WeatherChangeCmd
  | SeasonChangeCmd
  | WorldEventSpawnCmd
  | WorldEventEndCmd
  | BuildingEnterCmd
  | BuildingLeaveCmd
  | RareWindowOpenCmd
  | RareWindowCloseCmd
  | WorldTickCmd
  | PlayerIntervenecmd
  | NpcDialogHoldCmd
  | CombatInitiateCmd
  | CombatPlayerActionCmd
  | CombatResolveCmd
  | SettlementFormedCmd
  | AnimalSpawnedCmd
  | AnimalHuntStartedCmd
  | AnimalHuntResolvedCmd
  | AnimalKilledCmd
  | CarcassCreatedCmd
  | MeatHarvestedCmd

export type LivingWorldCommand = Command<LivingWorldCommandPayload> &
  Readonly<{
    commandType: LivingWorldCommandType
    actorType: LivingWorldActorType
    tick: number
  }>

export type LivingWorldEventPayload = Readonly<{
  actorType: LivingWorldActorType
  data: LivingWorldCommandPayload
  narration: string | null
}>

export type LivingWorldEventDraft = EventDraft<LivingWorldEventPayload> &
  Readonly<{
    eventType: LivingWorldCommandType
    actorType: LivingWorldActorType
  }>

const VALIDATORS: Readonly<
  Record<LivingWorldCommandType, (payload: unknown) => string | null>
> = {
  NPC_MOVE: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.npcId !== 'string' || p.npcId.length === 0) return 'npcId required'
    if (typeof p.from !== 'string' || p.from.length === 0) return 'from required'
    if (typeof p.to !== 'string' || p.to.length === 0) return 'to required'
    if (typeof p.activity !== 'string') return 'activity required'
    if (typeof p.reachedDest !== 'boolean') return 'reachedDest required'
    return null
  },
  NPC_ACTIVITY_CHANGE: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.npcId !== 'string' || p.npcId.length === 0) return 'npcId required'
    if (typeof p.tile !== 'string' || p.tile.length === 0) return 'tile required'
    if (typeof p.from !== 'string') return 'from required'
    if (typeof p.to !== 'string') return 'to required'
    return null
  },
  NPC_STATE_RECORDED: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.npcId !== 'string' || p.npcId.length === 0) return 'npcId required'
    if (!isRecord(p.state)) return 'state required'
    const err = validateNpcStateSnapshot(p.state)
    if (err) return err
    if (typeof p.narration !== 'string' && p.narration !== null) return 'narration must be string or null'
    return null
  },
  NPC_LIFE_GOAL_SET: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.npcId !== 'string' || p.npcId.length === 0) return 'npcId required'
    if (typeof p.tile !== 'string' || p.tile.length === 0) return 'tile required'
    if (!isRecord(p.needs)) return 'needs required'
    for (const key of ['food', 'rest', 'money', 'housing', 'safety']) {
      const value = p.needs[key]
      if (typeof value !== 'number' || !Number.isFinite(value)) return `${key} need required`
    }
    if (!isRecord(p.goal)) return 'goal required'
    if (typeof p.goal.kind !== 'string' || p.goal.kind.length === 0) return 'goal kind required'
    if (typeof p.goal.pressure !== 'number' || !Number.isFinite(p.goal.pressure)) return 'goal pressure required'
    if (typeof p.goal.narration !== 'string') return 'goal narration required'
    if (typeof p.narration !== 'string') return 'narration required'
    return null
  },
  NPC_HOUSEHOLD_FORMED: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.householdId !== 'string' || p.householdId.length === 0) return 'householdId required'
    if (!Array.isArray(p.partnerNpcIds) || p.partnerNpcIds.length !== 2) return 'partnerNpcIds tuple required'
    const [a, b] = p.partnerNpcIds as readonly unknown[]
    if (typeof a !== 'string' || typeof b !== 'string' || a.length === 0 || b.length === 0) return 'partner npc ids required'
    if (a === b) return 'partner npc ids must differ'
    if (typeof p.homeTileId !== 'string' || p.homeTileId.length === 0) return 'homeTileId required'
    if (typeof p.narration !== 'string') return 'narration required'
    return null
  },
  NPC_CHILD_BORN: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.householdId !== 'string' || p.householdId.length === 0) return 'householdId required'
    if (typeof p.childId !== 'string' || p.childId.length === 0) return 'childId required'
    if (typeof p.nameZh !== 'string' || p.nameZh.length === 0) return 'nameZh required'
    if (typeof p.nameEn !== 'string' || p.nameEn.length === 0) return 'nameEn required'
    if (typeof p.narration !== 'string') return 'narration required'
    return null
  },
  NPC_PRODUCTIVE_ACTION: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.npcId !== 'string' || p.npcId.length === 0) return 'npcId required'
    if (typeof p.tile !== 'string' || p.tile.length === 0) return 'tile required'
    if (typeof p.activity !== 'string') return 'activity required'
    if (p.domain !== 'build' && p.domain !== 'learn' && p.domain !== 'trade' && p.domain !== 'service') {
      return 'invalid domain'
    }
    if (
      p.metric !== 'infrastructure' &&
      p.metric !== 'knowledge' &&
      p.metric !== 'economy' &&
      p.metric !== 'safety' &&
      p.metric !== 'supply'
    ) {
      return 'invalid metric'
    }
    if (typeof p.delta !== 'number' || !Number.isFinite(p.delta)) return 'delta required'
    if (typeof p.narration !== 'string') return 'narration required'
    return null
  },
  CONSTRUCTION_INITIATE: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.npcId !== 'string' || p.npcId.length === 0) return 'npcId required'
    if (typeof p.tileId !== 'string' || p.tileId.length === 0) return 'tileId required'
    if (typeof p.buildingId !== 'string' || p.buildingId.length === 0) return 'buildingId required'
    if (typeof p.duration !== 'number' || !Number.isFinite(p.duration)) return 'duration required'
    if (!Number.isInteger(p.duration) || p.duration < 1 || p.duration > 1000) {
      return 'duration must be an integer in [1, 1000]'
    }
    if (p.goldCost !== undefined && (typeof p.goldCost !== 'number' || !Number.isFinite(p.goldCost) || p.goldCost < 0)) {
      return 'goldCost must be a non-negative number'
    }
    if (p.motivation !== undefined) {
      const err = validateConstructionMotivation(p.motivation)
      if (err) return err
    }
    if (typeof p.narration !== 'string') return 'narration required'
    return null
  },
  CONSTRUCTION_PROJECT_PROGRESS: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.projectId !== 'string' || p.projectId.length === 0) return 'projectId required'
    if (p.kind !== 'settlement') return 'invalid kind'
    if (typeof p.targetTileId !== 'string' || p.targetTileId.length === 0) return 'targetTileId required'
    if (typeof p.buildingId !== 'string' || p.buildingId.length === 0) return 'buildingId required'
    if (typeof p.npcId !== 'string' || p.npcId.length === 0) return 'npcId required'
    if (typeof p.delta !== 'number' || !Number.isFinite(p.delta) || p.delta <= 0) return 'delta required'
    if (typeof p.progressAfter !== 'number' || !Number.isFinite(p.progressAfter)) return 'progressAfter required'
    if (typeof p.targetProgress !== 'number' || !Number.isFinite(p.targetProgress)) return 'targetProgress required'
    if (p.motivation !== undefined) {
      const err = validateConstructionMotivation(p.motivation)
      if (err) return err
    }
    if (typeof p.narration !== 'string') return 'narration required'
    return null
  },
  BUILDING_CONSTRUCTED: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.projectId !== 'string' || p.projectId.length === 0) return 'projectId required'
    if (typeof p.buildingId !== 'string' || p.buildingId.length === 0) return 'buildingId required'
    if (typeof p.tileId !== 'string' || p.tileId.length === 0) return 'tileId required'
    if (p.motivation !== undefined) {
      const err = validateConstructionMotivation(p.motivation)
      if (err) return err
    }
    if (typeof p.narration !== 'string') return 'narration required'
    return null
  },
  MAP_TILE_UNLOCKED: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.projectId !== 'string' || p.projectId.length === 0) return 'projectId required'
    if (typeof p.tileId !== 'string' || p.tileId.length === 0) return 'tileId required'
    if (!Array.isArray(p.adjacentTo) || !p.adjacentTo.every((v) => typeof v === 'string')) return 'adjacentTo required'
    if (p.motivation !== undefined) {
      const err = validateConstructionMotivation(p.motivation)
      if (err) return err
    }
    if (typeof p.narration !== 'string') return 'narration required'
    return null
  },
  NPC_INTERACT: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.tile !== 'string' || p.tile.length === 0) return 'tile required'
    if (!Array.isArray(p.participants) || p.participants.length !== 2) {
      return 'participants must be a tuple of two npcIds'
    }
    const [a, b] = p.participants as readonly unknown[]
    if (typeof a !== 'string' || typeof b !== 'string' || a.length === 0 || b.length === 0) {
      return 'participants must be non-empty strings'
    }
    if (a === b) return 'participants must differ'
    if (p.mode !== 'chat' && p.mode !== 'argue') return 'mode must be chat or argue'
    if (typeof p.narration !== 'string') return 'narration required'
    return null
  },
  AREA_PRESSURE: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.tileId !== 'string' || p.tileId.length === 0) return 'tileId required'
    if (typeof p.kind !== 'string' || p.kind.length === 0) return 'kind required'
    if (!isRecord(p.detail)) return 'detail must be object'
    if (typeof p.narration !== 'string') return 'narration required'
    return null
  },
  WEATHER_CHANGE: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.from !== 'string' || typeof p.to !== 'string') return 'from/to required'
    if (typeof p.narration !== 'string') return 'narration required'
    return null
  },
  SEASON_CHANGE: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.from !== 'string' || typeof p.to !== 'string') return 'from/to required'
    if (typeof p.narration !== 'string') return 'narration required'
    return null
  },
  WORLD_EVENT_SPAWN: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.worldEventId !== 'string' || p.worldEventId.length === 0) return 'worldEventId required'
    if (typeof p.templateId !== 'string') return 'templateId required'
    if (typeof p.type !== 'string') return 'type required'
    if (typeof p.scope !== 'string') return 'scope required'
    if (typeof p.endsAtTick !== 'number' || !Number.isFinite(p.endsAtTick)) return 'endsAtTick required'
    if (typeof p.narration !== 'string') return 'narration required'
    return null
  },
  WORLD_EVENT_END: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.worldEventId !== 'string') return 'worldEventId required'
    if (typeof p.templateId !== 'string') return 'templateId required'
    if (typeof p.type !== 'string') return 'type required'
    if (typeof p.scope !== 'string') return 'scope required'
    return null
  },
  BUILDING_ENTER: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.npcId !== 'string' || p.npcId.length === 0) return 'npcId required'
    if (typeof p.buildingId !== 'string' || p.buildingId.length === 0) return 'buildingId required'
    if (typeof p.tileId !== 'string' || p.tileId.length === 0) return 'tileId required'
    return null
  },
  BUILDING_LEAVE: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.npcId !== 'string' || p.npcId.length === 0) return 'npcId required'
    if (typeof p.buildingId !== 'string' || p.buildingId.length === 0) return 'buildingId required'
    if (typeof p.tileId !== 'string' || p.tileId.length === 0) return 'tileId required'
    return null
  },
  RARE_WINDOW_OPEN: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.windowId !== 'string' || p.windowId.length === 0) return 'windowId required'
    if (typeof p.closesAtTick !== 'number') return 'closesAtTick required'
    if (typeof p.narration !== 'string') return 'narration required'
    return null
  },
  RARE_WINDOW_CLOSE: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.windowId !== 'string' || p.windowId.length === 0) return 'windowId required'
    if (typeof p.narration !== 'string') return 'narration required'
    return null
  },
  WORLD_TICK: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.tick !== 'number' || !Number.isFinite(p.tick)) return 'tick required'
    return null
  },
  COMBAT_INITIATE: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.combatId !== 'string' || p.combatId.length === 0) return 'combatId required'
    if (typeof p.playerAccountId !== 'string' || p.playerAccountId.length === 0)
      return 'playerAccountId required'
    if (typeof p.npcId !== 'string' || p.npcId.length === 0) return 'npcId required'
    if (typeof p.tile !== 'string' || p.tile.length === 0) return 'tile required'
    if (typeof p.playerCombatHp !== 'number' || p.playerCombatHp <= 0) return 'playerCombatHp required'
    if (typeof p.npcCombatHp !== 'number' || p.npcCombatHp <= 0) return 'npcCombatHp required'
    if (p.reason !== 'player_challenge' && p.reason !== 'npc_aggression') return 'invalid reason'
    if (typeof p.narration !== 'string') return 'narration required'
    return null
  },
  COMBAT_PLAYER_ACTION: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.combatId !== 'string' || p.combatId.length === 0) return 'combatId required'
    if (typeof p.playerAccountId !== 'string' || p.playerAccountId.length === 0)
      return 'playerAccountId required'
    if (typeof p.npcId !== 'string' || p.npcId.length === 0) return 'npcId required'
    if (typeof p.combatRound !== 'number' || p.combatRound < 0) return 'combatRound required'
    if (p.action !== 'attack' && p.action !== 'defend' && p.action !== 'flee') return 'invalid action'
    if (typeof p.cardId !== 'undefined' && typeof p.cardId !== 'number') return 'cardId must be number or unset'
    if (typeof p.narration !== 'string') return 'narration required'
    return null
  },
  COMBAT_RESOLVE: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.combatId !== 'string' || p.combatId.length === 0) return 'combatId required'
    if (typeof p.playerAccountId !== 'string' || p.playerAccountId.length === 0)
      return 'playerAccountId required'
    if (typeof p.npcId !== 'string' || p.npcId.length === 0) return 'npcId required'
    if (
      p.outcome !== 'player_victory' &&
      p.outcome !== 'npc_victory' &&
      p.outcome !== 'fled'
    ) return 'invalid outcome'
    if (typeof p.durationRounds !== 'number' || p.durationRounds < 0) return 'durationRounds required'
    if (typeof p.finalPlayerHp !== 'number') return 'finalPlayerHp required'
    if (typeof p.finalNpcHp !== 'number') return 'finalNpcHp required'
    if (typeof p.playerEnergyToZero !== 'boolean') return 'playerEnergyToZero required'
    if (typeof p.npcIncapacitatedTicks !== 'number') return 'npcIncapacitatedTicks required'
    if (typeof p.narration !== 'string') return 'narration required'
    return null
  },
  PLAYER_INTERVENE: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.playerAccountId !== 'string' || p.playerAccountId.length === 0) {
      return 'playerAccountId required'
    }
    if (typeof p.npcA !== 'string' || p.npcA.length === 0) return 'npcA required'
    if (typeof p.npcB !== 'string' || p.npcB.length === 0) return 'npcB required'
    if (p.npcA === p.npcB) return 'npcA and npcB must differ'
    if (typeof p.tile !== 'string' || p.tile.length === 0) return 'tile required'
    if (
      p.intentClass !== 'mediate' &&
      p.intentClass !== 'provoke' &&
      p.intentClass !== 'watch' &&
      p.intentClass !== 'threaten'
    ) {
      return 'intentClass must be mediate / provoke / watch / threaten'
    }
    if (typeof p.message !== 'string') return 'message required (can be empty string)'
    if (typeof p.narration !== 'string') return 'narration required'
    return null
  },
  NPC_DIALOG_HOLD: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.playerAccountId !== 'string' || p.playerAccountId.length === 0) {
      return 'playerAccountId required'
    }
    if (typeof p.npcId !== 'string' || p.npcId.length === 0) return 'npcId required'
    if (typeof p.tile !== 'string' || p.tile.length === 0) return 'tile required'
    if (typeof p.holdTicks !== 'number' || !Number.isFinite(p.holdTicks) || p.holdTicks <= 0) {
      return 'holdTicks must be positive number'
    }
    if (typeof p.narration !== 'string' && p.narration !== null) return 'narration must be string or null'
    return null
  },
  SETTLEMENT_FORMED: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.settlementId !== 'string' || p.settlementId.length === 0) return 'settlementId required'
    if (typeof p.tileId !== 'string' || p.tileId.length === 0) return 'tileId required'
    if (typeof p.formedAtTick !== 'number' || !Number.isInteger(p.formedAtTick) || p.formedAtTick < 0) {
      return 'formedAtTick must be non-negative integer'
    }
    if (!Array.isArray(p.founderNpcIds) || p.founderNpcIds.length === 0) return 'founderNpcIds required (non-empty array)'
    for (const id of p.founderNpcIds) {
      if (typeof id !== 'string' || id.length === 0) return 'founderNpcIds entries must be non-empty strings'
    }
    // Determinism: founderNpcIds must be sorted lex ascending.
    for (let i = 1; i < p.founderNpcIds.length; i += 1) {
      if (p.founderNpcIds[i - 1] >= p.founderNpcIds[i]) {
        return 'founderNpcIds must be sorted ascending and unique'
      }
    }
    if (typeof p.narration !== 'string') return 'narration required'
    return null
  },
  ANIMAL_SPAWNED: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (!isRecord(p.animal)) return 'animal required'
    const err = validateAnimal(p.animal)
    if (err) return err
    if (typeof p.spawnedAtTick !== 'number' || !Number.isInteger(p.spawnedAtTick) || p.spawnedAtTick < 0) {
      return 'spawnedAtTick must be non-negative integer'
    }
    if (typeof p.narration !== 'string' && p.narration !== null) return 'narration must be string or null'
    return null
  },
  ANIMAL_HUNT_STARTED: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    const err = validateHuntCommon(p)
    if (err) return err
    if (typeof p.startedAtTick !== 'number' || !Number.isInteger(p.startedAtTick) || p.startedAtTick < 0) return 'startedAtTick must be non-negative integer'
    if (typeof p.narration !== 'string') return 'narration required'
    return null
  },
  ANIMAL_HUNT_RESOLVED: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    const err = validateHuntCommon(p)
    if (err) return err
    if (p.outcome !== 'success' && p.outcome !== 'failed') return 'outcome invalid'
    if (typeof p.resolvedAtTick !== 'number' || !Number.isInteger(p.resolvedAtTick) || p.resolvedAtTick < 0) return 'resolvedAtTick must be non-negative integer'
    if (typeof p.narration !== 'string') return 'narration required'
    return null
  },
  ANIMAL_KILLED: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.huntId !== 'string' || p.huntId.length === 0) return 'huntId required'
    if (typeof p.animalId !== 'string' || p.animalId.length === 0) return 'animalId required'
    if (typeof p.speciesId !== 'string' || p.speciesId.length === 0) return 'speciesId required'
    if (typeof p.tileId !== 'string' || p.tileId.length === 0) return 'tileId required'
    if (typeof p.killedByNpcId !== 'string' || p.killedByNpcId.length === 0) return 'killedByNpcId required'
    if (typeof p.killedAtTick !== 'number' || !Number.isInteger(p.killedAtTick) || p.killedAtTick < 0) return 'killedAtTick must be non-negative integer'
    if (typeof p.narration !== 'string') return 'narration required'
    return null
  },
  CARCASS_CREATED: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.huntId !== 'string' || p.huntId.length === 0) return 'huntId required'
    if (typeof p.carcassId !== 'string' || p.carcassId.length === 0) return 'carcassId required'
    if (typeof p.animalId !== 'string' || p.animalId.length === 0) return 'animalId required'
    if (typeof p.speciesId !== 'string' || p.speciesId.length === 0) return 'speciesId required'
    if (typeof p.tileId !== 'string' || p.tileId.length === 0) return 'tileId required'
    if (typeof p.edibleYield !== 'number' || !Number.isFinite(p.edibleYield) || p.edibleYield < 0) return 'edibleYield required'
    if (!Array.isArray(p.byproducts) || !p.byproducts.every((value) => typeof value === 'string')) return 'byproducts required'
    if (typeof p.createdAtTick !== 'number' || !Number.isInteger(p.createdAtTick) || p.createdAtTick < 0) return 'createdAtTick must be non-negative integer'
    if (typeof p.narration !== 'string') return 'narration required'
    return null
  },
  MEAT_HARVESTED: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (typeof p.huntId !== 'string' || p.huntId.length === 0) return 'huntId required'
    if (typeof p.carcassId !== 'string' || p.carcassId.length === 0) return 'carcassId required'
    if (typeof p.animalId !== 'string' || p.animalId.length === 0) return 'animalId required'
    if (typeof p.speciesId !== 'string' || p.speciesId.length === 0) return 'speciesId required'
    if (typeof p.tileId !== 'string' || p.tileId.length === 0) return 'tileId required'
    if (typeof p.npcId !== 'string' || p.npcId.length === 0) return 'npcId required'
    if (typeof p.quantity !== 'number' || !Number.isFinite(p.quantity) || p.quantity <= 0) return 'quantity required'
    if (typeof p.goldValue !== 'number' || !Number.isFinite(p.goldValue) || p.goldValue < 0) return 'goldValue required'
    if (typeof p.harvestedAtTick !== 'number' || !Number.isInteger(p.harvestedAtTick) || p.harvestedAtTick < 0) return 'harvestedAtTick must be non-negative integer'
    if (typeof p.narration !== 'string') return 'narration required'
    return null
  }
}

export class LivingWorldRuleEngine {
  evaluate(
    command: LivingWorldCommand,
    options: { rulesetVersion?: string } = {}
  ): RuleResult<LivingWorldEventPayload> {
    if (!isLivingWorldCommandType(command.commandType)) {
      return reject(command, 'UNKNOWN_COMMAND', `Unknown command type: ${command.commandType}`)
    }
    const validate = VALIDATORS[command.commandType]
    const errMsg = validate(command.payload)
    if (errMsg !== null) {
      return reject(command, 'INVALID_PAYLOAD', errMsg)
    }
    if (isRecord(command.payload) && 'motivation' in command.payload) {
      const motivationErr = validateEventMotivation(command.payload.motivation)
      if (motivationErr !== null) return reject(command, 'INVALID_PAYLOAD', motivationErr)
    }
    try {
      toCanonicalJson(command.payload)
    } catch (err) {
      return reject(
        command,
        'INVALID_PAYLOAD',
        err instanceof Error ? err.message : 'payload is not canonical JSON'
      )
    }

    const rulesetVersion = options.rulesetVersion ?? DEFAULT_RULESET_VERSION
    const narration = pickNarration(command.payload)
    const eventPayload: LivingWorldEventPayload = {
      actorType: command.actorType,
      data: command.payload,
      narration
    }
    // Per ARCHITECTURE.md §1.3 — the deterministic key MUST NOT include
    // wall-clock fields. Only `(commandType, actorId, actorType, tick,
    // payload, rulesetVersion, version)` participate. `occurredAt` is
    // pure audit metadata on the resulting Event.
    const seed = {
      eventType: command.commandType,
      actorId: command.actorId,
      actorType: command.actorType,
      tick: command.tick,
      payload: eventPayload,
      rulesetVersion,
      version: KERNEL_EVENT_VERSION
    }
    const deterministicKey = hashCanonicalJson(seed)
    const draft: LivingWorldEventDraft = {
      eventType: command.commandType,
      actorType: command.actorType,
      occurredAt: command.submittedAt,
      actorId: command.actorId,
      commandId: command.commandId,
      tick: command.tick,
      payload: eventPayload,
      rulesetVersion,
      version: KERNEL_EVENT_VERSION,
      eventId: `event_${deterministicKey.slice(0, 32)}`,
      deterministicKey
    }

    return { accepted: true, events: [draft] }
  }
}

export function makeLivingWorldCommand(
  commandType: LivingWorldCommandType,
  actorId: string,
  actorType: LivingWorldActorType,
  tick: number,
  submittedAt: number,
  payload: LivingWorldCommandPayload,
  commandId?: string
): LivingWorldCommand {
  const seed = { commandType, actorId, actorType, tick, payload }
  const id = commandId ?? `cmd_${hashCanonicalJson(seed).slice(0, 32)}`
  return { commandType, actorId, actorType, tick, submittedAt, payload, commandId: id }
}

function pickNarration(payload: LivingWorldCommandPayload): string | null {
  if (
    typeof (payload as { narration?: unknown }).narration === 'string' ||
    (payload as { narration?: unknown }).narration === null
  ) {
    return ((payload as { narration?: string | null }).narration ?? null) as string | null
  }
  return null
}

function reject(
  command: LivingWorldCommand,
  code: string,
  reason: string
): RuleResult<LivingWorldEventPayload> {
  const rejection: RuleRejection = {
    commandId: command.commandId,
    commandType: command.commandType,
    actorId: command.actorId,
    code,
    reason
  }
  return { accepted: false, rejection }
}

function validateConstructionMotivation(value: unknown): string | null {
  if (!isRecord(value)) return 'motivation must be object'
  if (typeof value.projectPurpose !== 'string' || value.projectPurpose.length === 0) return 'motivation projectPurpose required'
  if (
    value.primaryPressure !== 'food' &&
    value.primaryPressure !== 'rest' &&
    value.primaryPressure !== 'money' &&
    value.primaryPressure !== 'housing' &&
    value.primaryPressure !== 'safety' &&
    value.primaryPressure !== 'infrastructure'
  ) return 'motivation primaryPressure invalid'
  if (typeof value.pressureScore !== 'number' || !Number.isFinite(value.pressureScore)) return 'motivation pressureScore required'
  if (typeof value.sourceGoalKind !== 'string' || value.sourceGoalKind.length === 0) return 'motivation sourceGoalKind required'
  if (typeof value.sourceNpcId !== 'string' || value.sourceNpcId.length === 0) return 'motivation sourceNpcId required'
  if (typeof value.sourceTileId !== 'string' || value.sourceTileId.length === 0) return 'motivation sourceTileId required'
  if (typeof value.explanation !== 'string' || value.explanation.length === 0) return 'motivation explanation required'
  return null
}

function validateEventMotivation(value: unknown): string | null {
  if (!isRecord(value)) return 'motivation must be object'
  if (typeof value.explanation !== 'string' || value.explanation.length === 0) return 'motivation explanation required'
  if (value.projectPurpose !== undefined && typeof value.projectPurpose !== 'string') return 'motivation projectPurpose must be string'
  return null
}

function validateNpcStateSnapshot(value: Record<string, unknown>): string | null {
  if (typeof value.tile !== 'string' || value.tile.length === 0) return 'state.tile required'
  if (typeof value.mood !== 'number' || !Number.isFinite(value.mood)) return 'state.mood required'
  if (typeof value.health !== 'number' || !Number.isFinite(value.health)) return 'state.health required'
  if (typeof value.activity !== 'string' || value.activity.length === 0) return 'state.activity required'
  if (typeof value.faction !== 'string' || value.faction.length === 0) return 'state.faction required'
  if (typeof value.targetTile !== 'string' || value.targetTile.length === 0) return 'state.targetTile required'
  if (typeof value.lastActedTick !== 'number' || !Number.isFinite(value.lastActedTick)) return 'state.lastActedTick required'
  if (typeof value.subCol !== 'number' || !Number.isFinite(value.subCol)) return 'state.subCol required'
  if (typeof value.subRow !== 'number' || !Number.isFinite(value.subRow)) return 'state.subRow required'
  if (typeof value.subZ !== 'number' || !Number.isFinite(value.subZ)) return 'state.subZ required'
  if (value.personalityOverride !== undefined && value.personalityOverride !== null) {
    if (!isRecord(value.personalityOverride)) return 'state.personalityOverride must be object or null'
    if (typeof value.personalityOverride.targetTile !== 'string' || value.personalityOverride.targetTile.length === 0) {
      return 'state.personalityOverride.targetTile required'
    }
    if (typeof value.personalityOverride.expiresAtTick !== 'number' || !Number.isFinite(value.personalityOverride.expiresAtTick)) {
      return 'state.personalityOverride.expiresAtTick required'
    }
    if (typeof value.personalityOverride.reason !== 'string') return 'state.personalityOverride.reason required'
  }
  if (value.travelRoute !== undefined && value.travelRoute !== null) {
    if (!isRecord(value.travelRoute)) return 'state.travelRoute must be object or null'
    if (typeof value.travelRoute.fromTile !== 'string' || value.travelRoute.fromTile.length === 0) return 'state.travelRoute.fromTile required'
    if (typeof value.travelRoute.toTile !== 'string' || value.travelRoute.toTile.length === 0) return 'state.travelRoute.toTile required'
    if (typeof value.travelRoute.targetTile !== 'string' || value.travelRoute.targetTile.length === 0) return 'state.travelRoute.targetTile required'
    if (typeof value.travelRoute.startedAtTick !== 'number' || !Number.isFinite(value.travelRoute.startedAtTick)) return 'state.travelRoute.startedAtTick required'
  }
  if (value.agent !== undefined && !isRecord(value.agent)) return 'state.agent must be object when present'
  return null
}

function validateAnimal(value: Record<string, unknown>): string | null {
  if (typeof value.id !== 'string' || value.id.length === 0) return 'animal.id required'
  if (typeof value.speciesId !== 'string' || value.speciesId.length === 0) return 'animal.speciesId required'
  if (typeof value.tileId !== 'string' || value.tileId.length === 0) return 'animal.tileId required'
  if (!isEcosystemRegionId(value.biomeRegion)) return 'animal.biomeRegion invalid'
  if (!isRecord(value.position)) return 'animal.position required'
  if (typeof value.position.subCol !== 'number' || !Number.isInteger(value.position.subCol) || value.position.subCol < 0) {
    return 'animal.position.subCol must be non-negative integer'
  }
  if (typeof value.position.subRow !== 'number' || !Number.isInteger(value.position.subRow) || value.position.subRow < 0) {
    return 'animal.position.subRow must be non-negative integer'
  }
  if (typeof value.position.subZ !== 'number' || !Number.isInteger(value.position.subZ) || value.position.subZ < 0) {
    return 'animal.position.subZ must be non-negative integer'
  }
  if (typeof value.state !== 'string' || value.state.length === 0) return 'animal.state required'
  for (const key of ['hunger', 'health', 'fear', 'aggression', 'reproductionCooldown']) {
    if (typeof value[key] !== 'number' || !Number.isFinite(value[key])) return `animal.${key} required`
  }
  if (value.packId !== undefined && value.packId !== null && typeof value.packId !== 'string') return 'animal.packId must be string or null'
  if (value.migrationTarget !== undefined && value.migrationTarget !== null && typeof value.migrationTarget !== 'string') return 'animal.migrationTarget must be string or null'
  if (value.currentTarget !== undefined && value.currentTarget !== null && typeof value.currentTarget !== 'string') return 'animal.currentTarget must be string or null'
  if (typeof value.lifecycleStage !== 'string' || value.lifecycleStage.length === 0) return 'animal.lifecycleStage required'
  if (value.ownerSettlementId !== undefined && value.ownerSettlementId !== null && typeof value.ownerSettlementId !== 'string') return 'animal.ownerSettlementId must be string or null'
  if (value.domesticatedBy !== undefined && value.domesticatedBy !== null && typeof value.domesticatedBy !== 'string') return 'animal.domesticatedBy must be string or null'
  return null
}

function isEcosystemRegionId(value: unknown): boolean {
  return value === 'salt_marsh' || value === 'forest' || value === 'mountain' || value === 'desert' || value === 'ruin'
}

function validateHuntCommon(value: Record<string, unknown>): string | null {
  if (typeof value.huntId !== 'string' || value.huntId.length === 0) return 'huntId required'
  if (typeof value.npcId !== 'string' || value.npcId.length === 0) return 'npcId required'
  if (typeof value.tileId !== 'string' || value.tileId.length === 0) return 'tileId required'
  if (typeof value.targetSpeciesId !== 'string' || value.targetSpeciesId.length === 0) return 'targetSpeciesId required'
  if (typeof value.targetAnimalId !== 'string' || value.targetAnimalId.length === 0) return 'targetAnimalId required'
  return null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

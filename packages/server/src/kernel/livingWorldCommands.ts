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

export const LIVING_WORLD_ACTOR_TYPES = ['player', 'npc', 'system'] as const
export type LivingWorldActorType = (typeof LIVING_WORLD_ACTOR_TYPES)[number]

export const LIVING_WORLD_COMMAND_TYPES = [
  'NPC_MOVE',
  'NPC_ACTIVITY_CHANGE',
  'NPC_PRODUCTIVE_ACTION',
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
  'COMBAT_RESOLVE'
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
  narration: string | null
}>

export type NpcActivityChangeCmd = Readonly<{
  npcId: string
  tile: string
  from: string
  to: string
  narration: string | null
}>

export type NpcProductiveActionCmd = Readonly<{
  npcId: string
  tile: string
  activity: string
  domain: 'build' | 'learn' | 'trade' | 'service'
  metric: 'infrastructure' | 'knowledge' | 'economy' | 'safety' | 'supply'
  delta: number
  narration: string
}>

export type NpcInteractCmd = Readonly<{
  tile: string
  participants: readonly [string, string]
  positions?: Readonly<Record<string, { subCol: number; subRow: number; subZ: number }>>
  mode: 'chat' | 'argue'
  narration: string
}>

export type AreaPressureCmd = Readonly<{
  tileId: string
  kind: string
  detail: Record<string, string | number>
  narration: string
}>

export type WeatherChangeCmd = Readonly<{
  from: string
  to: string
  narration: string
}>

export type SeasonChangeCmd = Readonly<{
  from: string
  to: string
  narration: string
}>

export type WorldEventSpawnCmd = Readonly<{
  worldEventId: string
  templateId: string
  type: string
  scope: string
  endsAtTick: number
  narration: string
  data: Record<string, unknown>
}>

export type WorldEventEndCmd = Readonly<{
  worldEventId: string
  templateId: string
  type: string
  scope: string
}>

export type BuildingEnterCmd = Readonly<{
  npcId: string
  buildingId: string
  tileId: string
  narration: string
}>

export type BuildingLeaveCmd = Readonly<{
  npcId: string
  buildingId: string
  tileId: string
  narration: string
}>

export type RareWindowOpenCmd = Readonly<{
  windowId: string
  closesAtTick: number
  narration: string
}>

export type RareWindowCloseCmd = Readonly<{
  windowId: string
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

export type LivingWorldCommandPayload =
  | NpcMoveCmd
  | NpcActivityChangeCmd
  | NpcProductiveActionCmd
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

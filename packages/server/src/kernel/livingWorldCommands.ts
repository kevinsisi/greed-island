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
  'WORLD_TICK'
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

export type NpcInteractCmd = Readonly<{
  tile: string
  participants: readonly [string, string]
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

export type LivingWorldCommandPayload =
  | NpcMoveCmd
  | NpcActivityChangeCmd
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
    const seed = {
      eventType: command.commandType,
      occurredAt: command.submittedAt,
      actorId: command.actorId,
      actorType: command.actorType,
      commandId: command.commandId,
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

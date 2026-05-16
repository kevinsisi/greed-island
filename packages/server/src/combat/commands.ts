// Combat Phase B (v0.15.0) — single-shot, deterministic combat domain.
//
// Per COMBAT_ARCHITECTURE.md §9 (phased rollout) Phase B is the
// "minimum viable combat": no sub-tick loop, no card priority table,
// no client prediction. One world tick resolves a full action.
//
// Three command types in the combat domain:
//   COMBAT_INITIATE      — player → NPC，開戰
//   COMBAT_PLAYER_ACTION — player one-button action: attack | defend | flee
//   COMBAT_RESOLVE       — terminal event emitted by rule engine
//
// Phase B 不接紋卡編譯器（COMBAT_CARD_PLAY），但 payload.cardId 已預留欄位。
// 收到時 rule engine 寫一筆 `COMBAT_CARD_IGNORED` warning event 提示 Phase C
// 才會處理。
//
// 全部 commands 都掛在 LIVING_WORLD_COMMAND_TYPES 同一池，由
// LivingWorldRuleEngine 經由 dispatch 對應到本檔的 evaluateCombatCommand。
// Determinism：所有計算 seed 都用 (combatId, actorId, combatRound)，不
// 看 wall-clock；replay 必定一致。

import { toCanonicalJson } from '../kernel/canonicalJson.js'
import { getCombatCard, type CombatCardClass } from './cards/catalog.js'

export type CombatPlayerActionKind = 'attack' | 'defend' | 'flee'

export type CombatInitiatePayload = Readonly<{
  combatId: string
  /** account id 字串化 */
  playerActorId: string
  /** NPC id (deterministic) */
  npcActorId: string
  /** 同 tile 才能戰鬥 — Phase B 強制要求 */
  tile: string
  /** 戰鬥開始時 player + NPC 的 combatHp 起始值 */
  playerCombatHp: number
  npcCombatHp: number
  reason: 'player_challenge' | 'npc_aggression'
  narration: string
}>

export type CombatPlayerActionPayload = Readonly<{
  combatId: string
  /** combat round (single-shot Phase B → 由 store 推遞增) */
  combatRound: number
  action: CombatPlayerActionKind
  /** Phase B 不接紋卡，但欄位預留；rule engine 看到時寫 COMBAT_CARD_IGNORED warning */
  cardId?: number
  narration: string
}>

export type CombatResolvePayload = Readonly<{
  combatId: string
  outcome: 'player_victory' | 'npc_victory' | 'fled'
  durationRounds: number
  /** worldEffects 完整定義留 Phase D；Phase B 只先紀錄勝負 + final hp */
  finalPlayerHp: number
  finalNpcHp: number
  /** 玩家敗北 → energy=0；NPC 敗北 → 倒地 5 秒（1 個世界 tick） */
  playerEnergyToZero: boolean
  npcIncapacitatedTicks: number
  narration: string
}>

export type CombatSubTickPayloadBase = Readonly<{
  combatId: string
  /** Phase C sub-tick inside an active combat loop. */
  combatTick: number
}>

export type CombatCardPlayPayload = CombatSubTickPayloadBase &
  Readonly<{
    cardClass: CombatCardClass
    targetActorId: string
  }>

export type CombatCardCancelPayload = CombatSubTickPayloadBase &
  Readonly<{
    cancelCommandId: string
    reason: 'player_cancel' | 'interrupted' | 'expired'
  }>

export type CombatDamagePayload = CombatSubTickPayloadBase &
  Readonly<{
    sourceActorId: string
    targetActorId: string
    amount: number
    cardClass?: CombatCardClass
    element?: string
  }>

export type CombatHealPayload = CombatSubTickPayloadBase &
  Readonly<{
    sourceActorId: string
    targetActorId: string
    amount: number
    cardClass?: CombatCardClass
  }>

export type CombatStatusApplyPayload = CombatSubTickPayloadBase &
  Readonly<{
    sourceActorId: string
    targetActorId: string
    statusId: string
    remainingTicks: number
    potency?: number
    cardClass?: CombatCardClass
  }>

export type CombatStatusTickPayload = CombatSubTickPayloadBase &
  Readonly<{
    targetActorId: string
    statusId: string
    remainingTicksAfter: number
    potency?: number
  }>

export type CombatStatusEndPayload = CombatSubTickPayloadBase &
  Readonly<{
    targetActorId: string
    statusId: string
    reason: 'expired' | 'cleansed' | 'combat_resolved'
  }>

export type CombatTargetLockPayload = CombatSubTickPayloadBase &
  Readonly<{
    sourceActorId: string
    targetActorId: string
    durationTicks: number
    cardClass?: CombatCardClass
  }>

export type CombatPhaseShiftPayload = CombatSubTickPayloadBase &
  Readonly<{
    actorId: string
    phase: string
    cardClass?: CombatCardClass
  }>

export type CombatFleeAttemptPayload = CombatSubTickPayloadBase &
  Readonly<{
    actorId: string
    cardClass?: CombatCardClass
  }>

export type CombatDefeatPayload = CombatSubTickPayloadBase &
  Readonly<{
    actorId: string
    defeatedByActorId?: string
    finalHp: number
  }>

export const COMBAT_COMMAND_TYPES = [
  'COMBAT_INITIATE',
  'COMBAT_PLAYER_ACTION',
  'COMBAT_RESOLVE',
  // Combat Phase C — Slice 2.3 command payload catalog. These are not
  // registered into LIVING_WORLD_COMMAND_TYPES until Slice 2.4.
  'COMBAT_CARD_PLAY',
  'COMBAT_CARD_CANCEL',
  'COMBAT_DAMAGE',
  'COMBAT_HEAL',
  'COMBAT_STATUS_APPLY',
  'COMBAT_STATUS_TICK',
  'COMBAT_STATUS_END',
  'COMBAT_TARGET_LOCK',
  'COMBAT_PHASE_SHIFT',
  'COMBAT_FLEE_ATTEMPT',
  'COMBAT_DEFEAT',
] as const
export type CombatCommandType = (typeof COMBAT_COMMAND_TYPES)[number]

export type CombatPayload =
  | CombatInitiatePayload
  | CombatPlayerActionPayload
  | CombatResolvePayload
  | CombatCardPlayPayload
  | CombatCardCancelPayload
  | CombatDamagePayload
  | CombatHealPayload
  | CombatStatusApplyPayload
  | CombatStatusTickPayload
  | CombatStatusEndPayload
  | CombatTargetLockPayload
  | CombatPhaseShiftPayload
  | CombatFleeAttemptPayload
  | CombatDefeatPayload

const COMBAT_COMMAND_TYPE_SET = new Set<string>(COMBAT_COMMAND_TYPES)
export function isCombatCommandType(t: string): t is CombatCommandType {
  return COMBAT_COMMAND_TYPE_SET.has(t)
}

export const COMBAT_INITIAL_HP = 100
export const COMBAT_NPC_INCAP_TICKS = 1 // 5 秒（1 世界 tick）

export const COMBAT_CARD_CANCEL_REASONS = ['player_cancel', 'interrupted', 'expired'] as const
export const COMBAT_STATUS_END_REASONS = ['expired', 'cleansed', 'combat_resolved'] as const

// FNV-1a deterministic hash for seeded RNG. No wall-clock.
export function hashSeed(...parts: ReadonlyArray<string | number>): number {
  let h = 2166136261
  const s = parts.map(String).join('|')
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** Seeded uniform integer in [0, max). */
export function seededRandInt(max: number, ...parts: ReadonlyArray<string | number>): number {
  if (max <= 0) return 0
  return hashSeed(...parts) % max
}

export function makeCombatCommandId(input: {
  commandType: CombatCommandType
  actorId: string
  tick: number
  combatTick: number
  payload: unknown
}): string {
  const payloadCanonical = toCanonicalJson(input.payload)
  const hash = hashSeed(input.commandType, input.actorId, input.tick, input.combatTick, payloadCanonical)
  return `cmd_${hash.toString(16).padStart(8, '0')}`
}

export function validateCombatPayload(commandType: CombatCommandType, payload: unknown): string | null {
  return COMBAT_PAYLOAD_VALIDATORS[commandType](payload)
}

const COMBAT_PAYLOAD_VALIDATORS: Readonly<Record<CombatCommandType, (payload: unknown) => string | null>> = {
  COMBAT_INITIATE: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (!isNonEmptyString(p.combatId)) return 'combatId required'
    if (!isNonEmptyString(p.playerActorId)) return 'playerActorId required'
    if (!isNonEmptyString(p.npcActorId)) return 'npcActorId required'
    if (!isNonEmptyString(p.tile)) return 'tile required'
    if (!isPositiveFiniteNumber(p.playerCombatHp)) return 'playerCombatHp required'
    if (!isPositiveFiniteNumber(p.npcCombatHp)) return 'npcCombatHp required'
    if (p.reason !== 'player_challenge' && p.reason !== 'npc_aggression') return 'invalid reason'
    if (typeof p.narration !== 'string') return 'narration required'
    return null
  },
  COMBAT_PLAYER_ACTION: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (!isNonEmptyString(p.combatId)) return 'combatId required'
    if (!isNonNegativeInteger(p.combatRound)) return 'combatRound required'
    if (p.action !== 'attack' && p.action !== 'defend' && p.action !== 'flee') return 'invalid action'
    if (p.cardId !== undefined && typeof p.cardId !== 'number') return 'cardId must be number or unset'
    if (typeof p.narration !== 'string') return 'narration required'
    return null
  },
  COMBAT_RESOLVE: (p) => {
    if (!isRecord(p)) return 'payload must be object'
    if (!isNonEmptyString(p.combatId)) return 'combatId required'
    if (p.outcome !== 'player_victory' && p.outcome !== 'npc_victory' && p.outcome !== 'fled') return 'invalid outcome'
    if (!isNonNegativeInteger(p.durationRounds)) return 'durationRounds required'
    if (!isFiniteNumber(p.finalPlayerHp)) return 'finalPlayerHp required'
    if (!isFiniteNumber(p.finalNpcHp)) return 'finalNpcHp required'
    if (typeof p.playerEnergyToZero !== 'boolean') return 'playerEnergyToZero required'
    if (!isNonNegativeInteger(p.npcIncapacitatedTicks)) return 'npcIncapacitatedTicks required'
    if (typeof p.narration !== 'string') return 'narration required'
    return null
  },
  COMBAT_CARD_PLAY: (p) => {
    const baseErr = validateSubTickBase(p)
    if (baseErr) return baseErr
    if (!isRecord(p)) return 'payload must be object'
    if (!isKnownCombatCardClass(p.cardClass)) return 'cardClass invalid'
    if (!isNonEmptyString(p.targetActorId)) return 'targetActorId required'
    return null
  },
  COMBAT_CARD_CANCEL: (p) => {
    const baseErr = validateSubTickBase(p)
    if (baseErr) return baseErr
    if (!isRecord(p)) return 'payload must be object'
    if (!isNonEmptyString(p.cancelCommandId)) return 'cancelCommandId required'
    if (!includesString(COMBAT_CARD_CANCEL_REASONS, p.reason)) return 'invalid reason'
    return null
  },
  COMBAT_DAMAGE: (p) => {
    const baseErr = validateSubTickBase(p)
    if (baseErr) return baseErr
    if (!isRecord(p)) return 'payload must be object'
    if (!isNonEmptyString(p.sourceActorId)) return 'sourceActorId required'
    if (!isNonEmptyString(p.targetActorId)) return 'targetActorId required'
    if (!isPositiveFiniteNumber(p.amount)) return 'amount must be positive number'
    if (p.cardClass !== undefined && !isKnownCombatCardClass(p.cardClass)) return 'cardClass invalid'
    if (p.element !== undefined && typeof p.element !== 'string') return 'element must be string or unset'
    return null
  },
  COMBAT_HEAL: (p) => {
    const baseErr = validateSubTickBase(p)
    if (baseErr) return baseErr
    if (!isRecord(p)) return 'payload must be object'
    if (!isNonEmptyString(p.sourceActorId)) return 'sourceActorId required'
    if (!isNonEmptyString(p.targetActorId)) return 'targetActorId required'
    if (!isPositiveFiniteNumber(p.amount)) return 'amount must be positive number'
    if (p.cardClass !== undefined && !isKnownCombatCardClass(p.cardClass)) return 'cardClass invalid'
    return null
  },
  COMBAT_STATUS_APPLY: (p) => {
    const baseErr = validateSubTickBase(p)
    if (baseErr) return baseErr
    if (!isRecord(p)) return 'payload must be object'
    if (!isNonEmptyString(p.sourceActorId)) return 'sourceActorId required'
    if (!isNonEmptyString(p.targetActorId)) return 'targetActorId required'
    if (!isNonEmptyString(p.statusId)) return 'statusId required'
    if (!isPositiveInteger(p.remainingTicks)) return 'remainingTicks must be positive integer'
    if (p.potency !== undefined && !isFiniteNumber(p.potency)) return 'potency must be number or unset'
    if (p.cardClass !== undefined && !isKnownCombatCardClass(p.cardClass)) return 'cardClass invalid'
    return null
  },
  COMBAT_STATUS_TICK: (p) => {
    const baseErr = validateSubTickBase(p)
    if (baseErr) return baseErr
    if (!isRecord(p)) return 'payload must be object'
    if (!isNonEmptyString(p.targetActorId)) return 'targetActorId required'
    if (!isNonEmptyString(p.statusId)) return 'statusId required'
    if (!isNonNegativeInteger(p.remainingTicksAfter)) return 'remainingTicksAfter must be non-negative integer'
    if (p.potency !== undefined && !isFiniteNumber(p.potency)) return 'potency must be number or unset'
    return null
  },
  COMBAT_STATUS_END: (p) => {
    const baseErr = validateSubTickBase(p)
    if (baseErr) return baseErr
    if (!isRecord(p)) return 'payload must be object'
    if (!isNonEmptyString(p.targetActorId)) return 'targetActorId required'
    if (!isNonEmptyString(p.statusId)) return 'statusId required'
    if (!includesString(COMBAT_STATUS_END_REASONS, p.reason)) return 'invalid reason'
    return null
  },
  COMBAT_TARGET_LOCK: (p) => {
    const baseErr = validateSubTickBase(p)
    if (baseErr) return baseErr
    if (!isRecord(p)) return 'payload must be object'
    if (!isNonEmptyString(p.sourceActorId)) return 'sourceActorId required'
    if (!isNonEmptyString(p.targetActorId)) return 'targetActorId required'
    if (!isPositiveInteger(p.durationTicks)) return 'durationTicks must be positive integer'
    if (p.cardClass !== undefined && !isKnownCombatCardClass(p.cardClass)) return 'cardClass invalid'
    return null
  },
  COMBAT_PHASE_SHIFT: (p) => {
    const baseErr = validateSubTickBase(p)
    if (baseErr) return baseErr
    if (!isRecord(p)) return 'payload must be object'
    if (!isNonEmptyString(p.actorId)) return 'actorId required'
    if (!isNonEmptyString(p.phase)) return 'phase required'
    if (p.cardClass !== undefined && !isKnownCombatCardClass(p.cardClass)) return 'cardClass invalid'
    return null
  },
  COMBAT_FLEE_ATTEMPT: (p) => {
    const baseErr = validateSubTickBase(p)
    if (baseErr) return baseErr
    if (!isRecord(p)) return 'payload must be object'
    if (!isNonEmptyString(p.actorId)) return 'actorId required'
    if (p.cardClass !== undefined && !isKnownCombatCardClass(p.cardClass)) return 'cardClass invalid'
    return null
  },
  COMBAT_DEFEAT: (p) => {
    const baseErr = validateSubTickBase(p)
    if (baseErr) return baseErr
    if (!isRecord(p)) return 'payload must be object'
    if (!isNonEmptyString(p.actorId)) return 'actorId required'
    if (p.defeatedByActorId !== undefined && !isNonEmptyString(p.defeatedByActorId)) return 'defeatedByActorId must be non-empty string or unset'
    if (!isFiniteNumber(p.finalHp)) return 'finalHp required'
    return null
  },
}

function validateSubTickBase(value: unknown): string | null {
  if (!isRecord(value)) return 'payload must be object'
  if (!isNonEmptyString(value.combatId)) return 'combatId required'
  if (!isNonNegativeInteger(value.combatTick)) return 'combatTick must be non-negative integer'
  return null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isPositiveFiniteNumber(value: unknown): value is number {
  return isFiniteNumber(value) && value > 0
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
}

function isKnownCombatCardClass(value: unknown): value is CombatCardClass {
  return typeof value === 'string' && getCombatCard(value) !== null
}

function includesString(values: readonly string[], value: unknown): boolean {
  return typeof value === 'string' && values.includes(value)
}

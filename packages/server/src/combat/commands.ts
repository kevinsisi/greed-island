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

export const COMBAT_COMMAND_TYPES = [
  'COMBAT_INITIATE',
  'COMBAT_PLAYER_ACTION',
  'COMBAT_RESOLVE',
] as const
export type CombatCommandType = (typeof COMBAT_COMMAND_TYPES)[number]

export type CombatPayload =
  | CombatInitiatePayload
  | CombatPlayerActionPayload
  | CombatResolvePayload

const COMBAT_COMMAND_TYPE_SET = new Set<string>(COMBAT_COMMAND_TYPES)
export function isCombatCommandType(t: string): t is CombatCommandType {
  return COMBAT_COMMAND_TYPE_SET.has(t)
}

export const COMBAT_INITIAL_HP = 100
export const COMBAT_NPC_INCAP_TICKS = 1 // 5 秒（1 世界 tick）

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

// PlayerSurvivalProjection + reconcile — 玩家求生需求（player-survival-needs / SP1）。
//
// 玩家是世界裡的求生者：溫飽(nourishment)與體況(vigor)隨 tick 衰退，連離線都算。
// 採「惰性對帳」：狀態存 (asOfTick, 值)，讀取/行動時以純函數 reconcile() 依
// 經過的 tick 往前推算，不對全體玩家每 tick 跑迴圈（決定性、便宜、呼應「世界
// 不等玩家」）。
//
// 事件溯源：每個求生事件在 payload.data 帶「結果狀態快照」
// {accountId, asOfTick, nourishment, vigor, collapsed}；投影只取每帳號最新
// (by sequence)。boot 因此無需重跑衰退數學——快照在事件 tick 即權威，讀取時
// 再 reconcile 前推。所有狀態變更走 Command→Rule Engine→Event→投影。

import type { Event } from '../kernel/types.js'
import {
  PLAYER_NEEDS_MAX,
  PLAYER_NEEDS_MIN,
  PLAYER_NOURISHMENT_DECAY_PER_TICK,
  PLAYER_STARVATION_THRESHOLD,
  PLAYER_VIGOR_STARVATION_DECAY_PER_TICK,
  PLAYER_VIGOR_RECOVERY_NOURISHMENT_THRESHOLD,
  PLAYER_VIGOR_RECOVERY_PER_TICK,
  PLAYER_COLLAPSE_RECOVERY_VIGOR,
  PLAYER_INITIAL_NOURISHMENT,
  PLAYER_INITIAL_VIGOR,
  PLAYER_EAT_RATION_NOURISHMENT,
} from '../config/world.js'

export const PLAYER_SURVIVAL_BOOT_EVENT_TYPES = [
  'PLAYER_NEEDS_SEEDED',
  'PLAYER_NEEDS_RECONCILED',
  'PLAYER_COLLAPSED',
  'PLAYER_ATE',
] as const

export type PlayerSurvivalState = Readonly<{
  asOfTick: number
  nourishment: number
  vigor: number
  collapsed: boolean
}>

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value
}

/** 在 [0, elapsed] 內夾住一段時長。 */
function clampDuration(ticks: number, elapsed: number): number {
  return clamp(ticks, 0, elapsed)
}

export function seedState(tick: number): PlayerSurvivalState {
  return {
    asOfTick: tick,
    nourishment: PLAYER_INITIAL_NOURISHMENT,
    vigor: PLAYER_INITIAL_VIGOR,
    collapsed: false,
  }
}

/**
 * 把求生狀態從 state.asOfTick 對帳前推到 currentTick（純函數、決定性）。
 *
 * 對帳區間內溫飽單調衰退（進食是另一個會先對帳再施加的事件），因此可閉式
 * 切分三個區帶：溫飽 ≥ 回復閾值→vigor 回復；介於回復與飢餓閾值→中性；
 * 低於飢餓閾值→vigor 流失。據此分段積分 vigor，支援任意長的離線間隔。
 */
export function reconcile(state: PlayerSurvivalState, currentTick: number): PlayerSurvivalState {
  const elapsed = currentTick - state.asOfTick
  if (elapsed <= 0) return state

  const n0 = state.nourishment
  const decay = PLAYER_NOURISHMENT_DECAY_PER_TICK
  const nourishment = clamp(n0 - decay * elapsed, PLAYER_NEEDS_MIN, PLAYER_NEEDS_MAX)

  let recoverDur = 0
  let drainDur = 0
  if (decay > 0) {
    // 溫飽降到「回復閾值」前的時長 → vigor 回復；降到「飢餓閾值」後的時長 → vigor 流失。
    const tToRecoveryEdge = clampDuration((n0 - PLAYER_VIGOR_RECOVERY_NOURISHMENT_THRESHOLD) / decay, elapsed)
    const tToStarveEdge = clampDuration((n0 - PLAYER_STARVATION_THRESHOLD) / decay, elapsed)
    recoverDur = tToRecoveryEdge
    drainDur = elapsed - tToStarveEdge
  } else {
    if (n0 >= PLAYER_VIGOR_RECOVERY_NOURISHMENT_THRESHOLD) recoverDur = elapsed
    else if (n0 < PLAYER_STARVATION_THRESHOLD) drainDur = elapsed
  }

  const vigor = clamp(
    state.vigor + PLAYER_VIGOR_RECOVERY_PER_TICK * recoverDur - PLAYER_VIGOR_STARVATION_DECAY_PER_TICK * drainDur,
    PLAYER_NEEDS_MIN,
    PLAYER_NEEDS_MAX,
  )

  // 昏厥遲滯：vigor 觸底→昏厥；回升至恢復門檻以上→解除；之間維持原狀。
  let collapsed = state.collapsed
  if (vigor <= PLAYER_NEEDS_MIN) collapsed = true
  else if (vigor >= PLAYER_COLLAPSE_RECOVERY_VIGOR) collapsed = false

  return { asOfTick: currentTick, nourishment, vigor, collapsed }
}

/** 進食：先對帳到當前 tick，再提升溫飽（封頂）。金幣扣除在 command 層處理。 */
export function applyEat(state: PlayerSurvivalState, currentTick: number): PlayerSurvivalState {
  const base = reconcile(state, currentTick)
  return {
    ...base,
    nourishment: clamp(base.nourishment + PLAYER_EAT_RATION_NOURISHMENT, PLAYER_NEEDS_MIN, PLAYER_NEEDS_MAX),
    asOfTick: currentTick,
  }
}

type SurvivalRow = PlayerSurvivalState & { readonly lastSequence: number }

export class PlayerSurvivalProjection {
  private latestByAccount = new Map<number, SurvivalRow>()

  project(event: Event): void {
    if (!(PLAYER_SURVIVAL_BOOT_EVENT_TYPES as readonly string[]).includes(event.eventType)) return
    const data = (event.payload as { data?: unknown } | null)?.data as Record<string, unknown> | undefined
    if (!data || typeof data !== 'object') return

    const accountId = data.accountId
    if (typeof accountId !== 'number' || !Number.isFinite(accountId)) return
    const asOfTick = typeof data.asOfTick === 'number' && Number.isFinite(data.asOfTick) ? data.asOfTick : null
    const nourishment = typeof data.nourishment === 'number' && Number.isFinite(data.nourishment) ? data.nourishment : null
    const vigor = typeof data.vigor === 'number' && Number.isFinite(data.vigor) ? data.vigor : null
    if (asOfTick === null || nourishment === null || vigor === null) return
    const collapsed = data.collapsed === true

    const previous = this.latestByAccount.get(accountId)
    if (previous && previous.lastSequence >= event.sequence) return
    this.latestByAccount.set(accountId, { asOfTick, nourishment, vigor, collapsed, lastSequence: event.sequence })
  }

  /** 已儲存（未對帳）狀態；無紀錄回 null。 */
  getState(accountId: number): PlayerSurvivalState | null {
    const row = this.latestByAccount.get(accountId)
    if (!row) return null
    return { asOfTick: row.asOfTick, nourishment: row.nourishment, vigor: row.vigor, collapsed: row.collapsed }
  }

  /** 對帳前推到 currentTick 的狀態；無紀錄回 null（由呼叫端決定是否 seed）。 */
  getReconciled(accountId: number, currentTick: number): PlayerSurvivalState | null {
    const state = this.getState(accountId)
    return state ? reconcile(state, currentTick) : null
  }

  rebuildFromEvents(events: readonly Event[]): void {
    this.latestByAccount.clear()
    for (const ev of events) {
      this.project(ev)
    }
  }

  toJSON(): Record<number, PlayerSurvivalState> {
    const out: Record<number, PlayerSurvivalState> = {}
    for (const [accountId, row] of this.latestByAccount) {
      out[accountId] = { asOfTick: row.asOfTick, nourishment: row.nourishment, vigor: row.vigor, collapsed: row.collapsed }
    }
    return out
  }
}

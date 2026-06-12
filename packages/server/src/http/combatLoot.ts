// 戰鬥勝利紋卡掉落 — COMBAT_ARCHITECTURE.md §6 的實作（v0.90.0）。
//
// 機率（全部 deterministic，seed = combatId；絕不用 Math.random）：
//   base = 0.05
//   + min(0.10, durationCombatTicks × 0.0001)  （Phase B 回合制：1 回合 ≈ 10 combatTicks）
//   × 2    若 rare window 開啟
//   × 1.3  若該 tile area safety < 30
//
// 卡池：正典優先 — acquisitionMethod === 'combat_victory' 的定序卡；
// 池子為空才退回 §6 原文的 rank ≥ A。存世上限由 CardActionPipeline
// 的 CARD_DROP_SPAWN 驗證把關（既有管線），這裡只挑卡。

import type { CardCatalog, CardCatalogEntry } from '../cards/types.js'

export const COMBAT_LOOT_BASE_CHANCE = 0.05
export const COMBAT_LOOT_DURATION_BONUS_CAP = 0.10
export const COMBAT_LOOT_TICKS_PER_ROUND = 10
export const COMBAT_LOOT_RARE_WINDOW_MULTIPLIER = 2
export const COMBAT_LOOT_LOW_SAFETY_MULTIPLIER = 1.3
export const COMBAT_LOOT_LOW_SAFETY_THRESHOLD = 30

export type CombatLootInput = Readonly<{
  combatId: string
  durationRounds: number
  rareWindowOpen: boolean
  /** 該 tile 的 area safety（0-100）；未知給 null 不套乘數。 */
  areaSafety: number | null
  catalog: CardCatalog
}>

export function computeCombatLootChance(input: Omit<CombatLootInput, 'catalog' | 'combatId'>): number {
  const durationTicks = Math.max(0, input.durationRounds) * COMBAT_LOOT_TICKS_PER_ROUND
  let chance =
    COMBAT_LOOT_BASE_CHANCE +
    Math.min(COMBAT_LOOT_DURATION_BONUS_CAP, durationTicks * 0.0001)
  if (input.rareWindowOpen) chance *= COMBAT_LOOT_RARE_WINDOW_MULTIPLIER
  if (input.areaSafety !== null && input.areaSafety < COMBAT_LOOT_LOW_SAFETY_THRESHOLD) {
    chance *= COMBAT_LOOT_LOW_SAFETY_MULTIPLIER
  }
  return Math.min(1, chance)
}

export function combatLootPool(catalog: CardCatalog): readonly CardCatalogEntry[] {
  const canon = catalog.entries.filter((e) => e.acquisitionMethod === 'combat_victory')
  if (canon.length > 0) return canon
  return catalog.entries.filter((e) => e.rank === 'S' || e.rank === 'A')
}

/**
 * 回傳掉落的卡 id；未中獎回 null。
 * roll 與選卡都由 hash(combatId) 派生 — 同一場戰鬥 replay 永遠同結果。
 */
export function computeCombatLootCardId(input: CombatLootInput): number | null {
  const chance = computeCombatLootChance(input)
  const roll = hashFraction(`${input.combatId}:loot-roll`)
  if (roll >= chance) return null
  const pool = combatLootPool(input.catalog)
  if (pool.length === 0) return null
  const pick = hash32(`${input.combatId}:loot-pick`) % pool.length
  return pool[pick]?.id ?? null
}

/** 掉落點 sub-cell 也 deterministic（避免 Math.random）。 */
export function combatLootPosition(combatId: string): { x: number; y: number } {
  return {
    x: 2 + (hash32(`${combatId}:loot-x`) % 11),
    y: 2 + (hash32(`${combatId}:loot-y`) % 6),
  }
}

/** deterministic 抽 index（戰敗掉 held 卡等用）。 */
export function pickDeterministicIndex(seed: string, length: number): number {
  if (length <= 0) return 0
  return hash32(seed) % length
}

function hash32(value: string): number {
  let hash = 2166136261
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function hashFraction(value: string): number {
  return hash32(value) / 4294967296
}

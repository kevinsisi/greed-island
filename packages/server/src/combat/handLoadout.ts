// 戰鬥手牌 loadout — 術式卡 ↔ 戰鬥卡的正典接線（v0.90.0）。
//
// 獵人《貪婪之島》精髓：術式卡是花錢買來的財產，不是免費技能列。
// Phase C 之前手牌寫死 6 張；本檔把手牌改為：
//   * 基本牌（人人都有）：TIDE_STRIKE（基本攻擊）+ MEND（喘息回復）
//   * 其餘 6 張戰鬥卡類別由「天際百貨」販售的戰鬥型術式卡（1001..1007）解鎖，
//     持有才可在戰鬥中施放。display 名稱用術式卡名（潮燼一閃、退潮步法…）。
//
// 純函數 — 不碰 DB；router 端把 TechniqueShopStore.listOwned 餵進來。

import { findTechnique } from '../cards/techniques.js'
import type { CombatCardClass } from './cards/catalog.js'

/** 基本牌：未購任何術式卡也能進行「一般戰鬥」。 */
export const BASE_HAND_CLASSES: readonly CombatCardClass[] = ['TIDE_STRIKE', 'MEND']

/** 戰鬥型術式卡 id → 解鎖的戰鬥卡類別（效果機制取既有 catalog 類別）。 */
export const TECHNIQUE_COMBAT_UNLOCKS: Readonly<Record<number, CombatCardClass>> = {
  1001: 'FIRE_LASH',     // 潮燼一閃 — 燼火傷害
  1002: 'PHASE_SHIFT',   // 退潮步法 — 相位迴避
  1003: 'NO_ESCAPE',     // 織絲縛魂 — 束縛鎖定
  1004: 'STUN',          // 潮鼓震盪 — 震懾
  1005: 'SHIELD',        // 退潮岩盾 — 護盾
  1006: 'COUNTERSPELL',  // 潮源回響 — 反制吸收
  1007: 'HASTE',         // 黑潮獸引 — 獸勢加速
}

export type HandCardView = Readonly<{
  cardClass: CombatCardClass
  source: 'basic' | 'technique'
  techniqueId: number | null
  labelZh: string
  labelEn: string
}>

const BASIC_LABELS: Readonly<Record<string, { zh: string; en: string }>> = {
  TIDE_STRIKE: { zh: '潮浪衝', en: 'Tide Strike' },
  MEND: { zh: '治癒術', en: 'Mend' },
}

/**
 * 由玩家持有的術式卡 id（count > 0）組出戰鬥手牌。
 * 基本牌永遠在前；解鎖牌依術式卡 id 排序，確保 deterministic。
 */
export function computeHandLoadout(ownedTechniqueIds: readonly number[]): HandCardView[] {
  const hand: HandCardView[] = BASE_HAND_CLASSES.map((cardClass) => ({
    cardClass,
    source: 'basic' as const,
    techniqueId: null,
    labelZh: BASIC_LABELS[cardClass]?.zh ?? cardClass,
    labelEn: BASIC_LABELS[cardClass]?.en ?? cardClass,
  }))
  const seenClasses = new Set<CombatCardClass>(BASE_HAND_CLASSES)
  const sortedOwned = [...new Set(ownedTechniqueIds)].sort((a, b) => a - b)
  for (const techniqueId of sortedOwned) {
    const cardClass = TECHNIQUE_COMBAT_UNLOCKS[techniqueId]
    if (!cardClass || seenClasses.has(cardClass)) continue
    seenClasses.add(cardClass)
    const technique = findTechnique(techniqueId)
    hand.push({
      cardClass,
      source: 'technique',
      techniqueId,
      labelZh: technique?.nameZh ?? cardClass,
      labelEn: technique?.nameEn ?? cardClass,
    })
  }
  return hand
}

/** play 驗證用：此玩家目前可施放的戰鬥卡類別集合。 */
export function allowedClassesFor(ownedTechniqueIds: readonly number[]): Set<CombatCardClass> {
  return new Set(computeHandLoadout(ownedTechniqueIds).map((c) => c.cardClass))
}

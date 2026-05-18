// Pure card-hand constants and utilities for Phase C combat.
// No Phaser or browser dependencies — safe to import in tests and Phaser scenes.

import type { CombatReconcileResult } from '../../state/CombatProjection.js'

/** Cards the player can play in Phase C combat (playable subset of server catalog). */
export const PLAYER_HAND_CARDS = [
  'PHASE_SHIFT',
  'NO_ESCAPE',
  'FIRE_LASH',
  'TIDE_STRIKE',
  'MEND',
  'SHIELD',
] as const

export type PlayerHandCard = (typeof PLAYER_HAND_CARDS)[number]

export type CombatHandCardMeta = {
  cardClass: PlayerHandCard
  labelZh: string
  labelEn: string
  /** predictedHpDelta applied as `targetHp - delta` in CombatProjection.predict(). */
  predictedHpDelta: number
  /** True = target is the player themselves; false = target is the NPC. */
  targetSelf: boolean
}

const HAND_META: Record<PlayerHandCard, CombatHandCardMeta> = {
  PHASE_SHIFT: { cardClass: 'PHASE_SHIFT', labelZh: '相位跳躍', labelEn: 'Phase Shift', predictedHpDelta: 0,   targetSelf: true  },
  NO_ESCAPE:   { cardClass: 'NO_ESCAPE',   labelZh: '鎖鏈術',   labelEn: 'No Escape',   predictedHpDelta: 0,   targetSelf: false },
  FIRE_LASH:   { cardClass: 'FIRE_LASH',   labelZh: '火焰鞭',   labelEn: 'Fire Lash',   predictedHpDelta: 18,  targetSelf: false },
  TIDE_STRIKE: { cardClass: 'TIDE_STRIKE', labelZh: '潮浪衝',   labelEn: 'Tide Strike', predictedHpDelta: 22,  targetSelf: false },
  MEND:        { cardClass: 'MEND',        labelZh: '治癒術',   labelEn: 'Mend',        predictedHpDelta: -16, targetSelf: true  },
  SHIELD:      { cardClass: 'SHIELD',      labelZh: '護盾術',   labelEn: 'Shield',      predictedHpDelta: 0,   targetSelf: true  },
}

export function getCombatHandCardMeta(cardClass: string): CombatHandCardMeta | null {
  return (HAND_META as Record<string, CombatHandCardMeta>)[cardClass] ?? null
}

/** Returns true only when the player should receive a reject toast. */
export function shouldShowRejectToast(result: CombatReconcileResult): boolean {
  return result.kind === 'rejected'
}

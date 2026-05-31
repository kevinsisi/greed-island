// 跨場景共用的 NPC 視覺映射：activity emoji + 24-bit RGB 顏色的對比文字色。
//
// v0.12.0 後伺服器是 NPC sprite 顏色 / sub-tile 位置的權威來源。每位 NPC
// 的 `color` 由 backend 用 faction + id 決定，`activity` 也是 backend 推。
// 三個場景 (Area / Map / Building) 共用同一份 emoji 表 + 文字色亮度判斷，
// 才不會出現「Area 看到 🍴 但 Map 看到 🍜」這種視覺不一致。
//
// 不在這裡決定顏色 — 顏色完全由 backend 推給前端 (`NpcSummary.color`)。

import type { NpcActivity } from '../state/types'

/** 活動 → sprite 上方的 emoji。idle 不顯示（避免畫面雜訊）。 */
export const ACTIVITY_GLYPH: Readonly<Record<NpcActivity, string>> = {
  idle: '',
  move: '👣',
  work: '🛠️',
  eat: '🍴',
  sleep: '',
  trade: '💰',
  patrol: '👁️'
}

export function activityGlyphFor(activity: NpcActivity | undefined): string {
  if (!activity) return ''
  return ACTIVITY_GLYPH[activity] ?? ''
}

/**
 * 給定 24-bit 背景色，回傳適合在上面顯示文字的顏色（深 / 淺二選一）。
 * 用 ITU-R BT.601 luma；> 140 視為亮，回深字色。
 */
export function textColorForBg(color: number): string {
  const r = (color >> 16) & 0xff
  const g = (color >> 8) & 0xff
  const b = color & 0xff
  const luma = 0.299 * r + 0.587 * g + 0.114 * b
  return luma > 140 ? '#1a1407' : '#fff5b8'
}

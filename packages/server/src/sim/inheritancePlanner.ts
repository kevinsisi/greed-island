// InheritancePlanner — pure function：NPC 死亡時把名下的 goods 遺產
// 規劃成 HOUSEHOLD_INHERITANCE_ASSIGNED 轉移。
//
// v0.32.0 只發 NPC_HEIR_ASSIGNED（繼承「位置」），死者名下 goods 留在
// 死人身上永遠凍結 — §43.1「後代承接生活」因此斷鏈。這裡補上實際的
// 財產轉移：死者 (holderType='npc') 的每一筆庫存都移轉給繼承人。
//
// 無遺產（goods 為空）時不產生轉移 — HOUSEHOLD_INHERITANCE_ASSIGNED 的
// amount 必須為正數，且「沒有東西可繼承」本來就不該留下繼承事件。

import type { MortalityIntent } from './mortalityPlanner.js'
import type { GoodsInventoryProjection } from '../projections/goodsInventory.js'

export type InheritedGoodsLine = Readonly<{
  goodsId: string
  quantity: number
  tileId: string
}>

export type InheritanceTransfer = Readonly<{
  householdId: string
  deceasedNpcId: string
  heirNpcId: string
  /** 轉移的 goods 總量（所有品項數量加總，向下取整、至少 1）。 */
  amount: number
  goods: readonly InheritedGoodsLine[]
}>

export function planInheritanceTransfers(input: {
  intents: readonly MortalityIntent[]
  goodsInventory: GoodsInventoryProjection
}): readonly InheritanceTransfer[] {
  const transfers: InheritanceTransfer[] = []
  for (const intent of input.intents) {
    if (!intent.heirNpcId) continue
    const estate = input.goodsInventory
      .list()
      .filter((row) => row.holderType === 'npc' && row.holderId === intent.npcId && row.quantity > 0)
      .map((row) => ({ goodsId: row.goodsId, quantity: row.quantity, tileId: row.tileId }))
    if (estate.length === 0) continue
    const amount = Math.max(1, Math.floor(estate.reduce((sum, line) => sum + line.quantity, 0)))
    transfers.push({
      householdId: intent.householdId,
      deceasedNpcId: intent.npcId,
      heirNpcId: intent.heirNpcId,
      amount,
      goods: estate,
    })
  }
  return transfers
}

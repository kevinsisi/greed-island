// NPC-to-NPC local market trade planner (v0.78.0).
//
// At each settlement, pairs an NPC with a producer role (seller) with
// another NPC at the same tile (buyer) and records an NPC_GOODS_TRADED
// social event.  Goods flow already happens through the settlement pool;
// this planner records the individual-to-individual attribution.

import type { GoodsInventoryRow } from '../projections/goodsInventory.js'

export type LocalNpcTradeIntent = Readonly<{
  sellerNpcId: string
  buyerNpcId: string
  goodsId: string
  quantity: number
  tileId: string
}>

export function planLocalNpcTrades(input: {
  currentTick: number
  settlementGoods: readonly GoodsInventoryRow[]
  settlementTiles: ReadonlyMap<string, string>  // settlementId → tileId
  npcTileMap: ReadonlyMap<string, string>        // npcId → tileId
  producerNpcIds: ReadonlySet<string>            // NPCs with producer roles (hunter/fisher/craftsman)
}): readonly LocalNpcTradeIntent[] {
  const { currentTick, settlementGoods, settlementTiles, npcTileMap, producerNpcIds } = input

  // Build map of settlement goods: tileId → { goodsId, quantity }[]
  const tileGoods = new Map<string, { goodsId: string; quantity: number }[]>()
  for (const row of settlementGoods) {
    if (row.holderType !== 'settlement') continue
    if (row.quantity < 1) continue
    const tileId = settlementTiles.get(row.holderId) ?? row.tileId
    if (!tileId) continue
    const arr = tileGoods.get(tileId) ?? []
    arr.push({ goodsId: row.goodsId, quantity: row.quantity })
    tileGoods.set(tileId, arr)
  }

  // Build map of NPCs by tile
  const npcsByTile = new Map<string, string[]>()
  for (const [npcId, tileId] of npcTileMap) {
    const arr = npcsByTile.get(tileId) ?? []
    arr.push(npcId)
    npcsByTile.set(tileId, arr)
  }

  const intents: LocalNpcTradeIntent[] = []

  for (const [tileId, goods] of tileGoods) {
    const npcsOnTile = npcsByTile.get(tileId) ?? []
    if (npcsOnTile.length < 2) continue

    // Find a producer NPC (seller) on this tile
    const sellerId = npcsOnTile.find(id => producerNpcIds.has(id))
    if (!sellerId) continue

    // Find a non-producer buyer on the same tile
    const buyers = npcsOnTile.filter(id => id !== sellerId)
    if (buyers.length === 0) continue

    // Pick buyer deterministically
    const buyerId = buyers[currentTick % buyers.length]!

    // Trade the most plentiful goods on this tile
    const topGoods = [...goods].sort((a, b) => b.quantity - a.quantity)[0]
    if (!topGoods) continue

    intents.push({
      sellerNpcId: sellerId,
      buyerNpcId: buyerId,
      goodsId: topGoods.goodsId,
      quantity: 1,
      tileId,
    })
  }

  return intents
}

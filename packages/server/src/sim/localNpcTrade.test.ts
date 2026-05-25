import { describe, expect, it } from 'vitest'
import { planLocalNpcTrades } from './localNpcTradePlanner.js'
import type { GoodsInventoryRow } from '../projections/goodsInventory.js'

function makeGoodsRow(
  holderId: string,
  goodsId: string,
  quantity: number,
  tileId = 't_market',
  holderType: 'settlement' | 'npc' | 'building' = 'settlement'
): GoodsInventoryRow {
  return {
    goodsId,
    holderType,
    holderId,
    tileId,
    quantity,
    lastUpdatedTick: 100,
    lastSequence: 1,
  }
}

const BASE_INPUT = {
  currentTick: 100,
  settlementTiles: new Map([['s1', 't_market']]),
  npcTileMap: new Map([['npc.fisher', 't_market'], ['npc.merchant', 't_market']]),
  producerNpcIds: new Set(['npc.fisher']),
}

describe('planLocalNpcTrades', () => {
  it('returns empty when no settlement goods', () => {
    const result = planLocalNpcTrades({
      ...BASE_INPUT,
      settlementGoods: [],
    })
    expect(result).toHaveLength(0)
  })

  it('returns empty when fewer than 2 NPCs on tile', () => {
    const result = planLocalNpcTrades({
      ...BASE_INPUT,
      settlementGoods: [makeGoodsRow('s1', 'fish', 10)],
      npcTileMap: new Map([['npc.fisher', 't_market']]),
    })
    expect(result).toHaveLength(0)
  })

  it('returns empty when no producer NPC on tile', () => {
    const result = planLocalNpcTrades({
      ...BASE_INPUT,
      settlementGoods: [makeGoodsRow('s1', 'fish', 10)],
      npcTileMap: new Map([['npc.merchant', 't_market'], ['npc.clerk', 't_market']]),
      producerNpcIds: new Set(),
    })
    expect(result).toHaveLength(0)
  })

  it('emits one trade when seller + buyer present', () => {
    const result = planLocalNpcTrades({
      ...BASE_INPUT,
      settlementGoods: [makeGoodsRow('s1', 'fish', 10)],
    })
    expect(result).toHaveLength(1)
    expect(result[0]?.sellerNpcId).toBe('npc.fisher')
    expect(result[0]?.buyerNpcId).toBe('npc.merchant')
    expect(result[0]?.goodsId).toBe('fish')
    expect(result[0]?.quantity).toBe(1)
    expect(result[0]?.tileId).toBe('t_market')
  })

  it('trades the most plentiful goods', () => {
    const result = planLocalNpcTrades({
      ...BASE_INPUT,
      settlementGoods: [
        makeGoodsRow('s1', 'fish', 3),
        makeGoodsRow('s1', 'salt', 10),
      ],
    })
    expect(result[0]?.goodsId).toBe('salt')
  })

  it('buyer selection is deterministic based on currentTick', () => {
    const npcTileMap = new Map([
      ['npc.fisher', 't_market'],
      ['npc.a', 't_market'],
      ['npc.b', 't_market'],
    ])
    const tick100 = planLocalNpcTrades({
      ...BASE_INPUT,
      currentTick: 100,
      settlementGoods: [makeGoodsRow('s1', 'fish', 5)],
      npcTileMap,
    })
    const tick101 = planLocalNpcTrades({
      ...BASE_INPUT,
      currentTick: 101,
      settlementGoods: [makeGoodsRow('s1', 'fish', 5)],
      npcTileMap,
    })
    expect(tick100[0]?.buyerNpcId).not.toBe(tick101[0]?.buyerNpcId)
  })

  it('ignores non-settlement goods rows', () => {
    const result = planLocalNpcTrades({
      ...BASE_INPUT,
      settlementGoods: [
        makeGoodsRow('npc.fisher', 'fish', 10, 't_market', 'npc'),
      ],
    })
    expect(result).toHaveLength(0)
  })

  it('produces one intent per tile with eligible pairs', () => {
    const result = planLocalNpcTrades({
      currentTick: 100,
      settlementGoods: [
        makeGoodsRow('s1', 'fish', 5, 't_market'),
        makeGoodsRow('s2', 'grain', 5, 't_farmland'),
      ],
      settlementTiles: new Map([['s1', 't_market'], ['s2', 't_farmland']]),
      npcTileMap: new Map([
        ['npc.fisher', 't_market'],
        ['npc.merchant', 't_market'],
        ['npc.farmer', 't_farmland'],
        ['npc.buyer', 't_farmland'],
      ]),
      producerNpcIds: new Set(['npc.fisher', 'npc.farmer']),
    })
    expect(result).toHaveLength(2)
    const tiles = result.map(r => r.tileId)
    expect(tiles).toContain('t_market')
    expect(tiles).toContain('t_farmland')
  })
})

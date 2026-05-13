import { describe, expect, it } from 'vitest'
import { GoodsInventoryProjection } from './goodsInventory.js'
import type { GoodsHolderType } from '../kernel/livingWorldCommands.js'
import type { Event } from '../kernel/types.js'

describe('GoodsInventoryProjection', () => {
  it('stores goods on a holder inventory row', () => {
    const projection = new GoodsInventoryProjection()
    projection.rebuildFromEvents([
      storedEvent(1, { goodsId: 'fish', quantity: 12, holderId: 'dock.fisher', tileId: 't_dock', tick: 10 }),
      storedEvent(2, { goodsId: 'fish', quantity: 6, holderId: 'dock.fisher', tileId: 't_dock', tick: 11 }),
    ])

    const row = projection.get({ goodsId: 'fish', holderType: 'npc', holderId: 'dock.fisher' })
    expect(row?.quantity).toBe(18)
    expect(row?.lastUpdatedTick).toBe(11)
  })

  it('processes input goods into output goods', () => {
    const projection = new GoodsInventoryProjection()
    projection.rebuildFromEvents([
      storedEvent(1, { goodsId: 'fish', quantity: 10, holderId: 'dock.cook', tileId: 't_dock', tick: 10 }),
      processedEvent(2, {
        inputGoodsId: 'fish',
        inputQuantity: 4,
        outputGoodsId: 'fish_stew',
        outputQuantity: 2,
        holderId: 'dock.cook',
        tileId: 't_dock',
        tick: 12,
      }),
    ])

    expect(projection.get({ goodsId: 'fish', holderType: 'npc', holderId: 'dock.cook' })?.quantity).toBe(6)
    expect(projection.get({ goodsId: 'fish_stew', holderType: 'npc', holderId: 'dock.cook' })?.quantity).toBe(2)
  })

  it('clamps consumption at zero', () => {
    const projection = new GoodsInventoryProjection()
    projection.rebuildFromEvents([
      storedEvent(1, { goodsId: 'meat', quantity: 5, holderId: 'forest.hunter', tileId: 't_forest', tick: 10 }),
      consumedEvent(2, { goodsId: 'meat', quantity: 8, holderId: 'forest.hunter', tileId: 't_forest', tick: 11 }),
    ])

    expect(projection.get({ goodsId: 'meat', holderType: 'npc', holderId: 'forest.hunter' })?.quantity).toBe(0)
  })

  it('rebuilds to an identical canonical hash', () => {
    const events = [
      storedEvent(1, { goodsId: 'fish', quantity: 12, holderId: 'dock.fisher', tileId: 't_dock', tick: 10 }),
      storedEvent(2, { goodsId: 'meat', quantity: 2, holderId: 'forest.hunter', tileId: 't_forest', tick: 11 }),
    ]
    const a = new GoodsInventoryProjection()
    const b = new GoodsInventoryProjection()
    a.rebuildFromEvents(events)
    b.rebuildFromEvents(events)
    expect(a.canonicalHash()).toBe(b.canonicalHash())
  })
})

function storedEvent(
  sequence: number,
  input: { goodsId: string; quantity: number; holderId: string; tileId: string; tick: number; holderType?: GoodsHolderType }
): Event {
  return baseEvent(sequence, 'GOODS_STORED', input.tick, {
    goodsId: input.goodsId,
    quantity: input.quantity,
    holderType: input.holderType ?? 'npc',
    holderId: input.holderId,
    tileId: input.tileId,
    storedAtTick: input.tick,
    narration: 'goods stored',
  })
}

function processedEvent(
  sequence: number,
  input: {
    inputGoodsId: string
    inputQuantity: number
    outputGoodsId: string
    outputQuantity: number
    holderId: string
    tileId: string
    tick: number
  }
): Event {
  return baseEvent(sequence, 'GOODS_PROCESSED', input.tick, {
    inputGoodsId: input.inputGoodsId,
    inputQuantity: input.inputQuantity,
    outputGoodsId: input.outputGoodsId,
    outputQuantity: input.outputQuantity,
    holderType: 'npc',
    holderId: input.holderId,
    tileId: input.tileId,
    processedAtTick: input.tick,
    narration: 'goods processed',
  })
}

function consumedEvent(
  sequence: number,
  input: { goodsId: string; quantity: number; holderId: string; tileId: string; tick: number }
): Event {
  return baseEvent(sequence, 'GOODS_CONSUMED', input.tick, {
    goodsId: input.goodsId,
    quantity: input.quantity,
    holderType: 'npc',
    holderId: input.holderId,
    tileId: input.tileId,
    consumedAtTick: input.tick,
    narration: 'goods consumed',
  })
}

function baseEvent(sequence: number, eventType: string, tick: number, data: Record<string, unknown>): Event {
  return {
    sequence,
    eventId: `event-${sequence}`,
    eventType,
    occurredAt: 0,
    actorId: 'system',
    payload: { actorType: 'system', data, narration: data.narration },
    deterministicKey: `key-${sequence}`,
    version: 1,
    tick,
  }
}

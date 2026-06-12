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

  it('adds goods to player inventory on PLAYER_PICKED_UP_GOODS', () => {
    const projection = new GoodsInventoryProjection()
    projection.rebuildFromEvents([
      playerPickupEvent(1, { playerAccountId: 'acc-1', tileId: 't_market', goodsId: 'fish', quantity: 5, tick: 20 }),
      playerPickupEvent(2, { playerAccountId: 'acc-1', tileId: 't_market', goodsId: 'fish', quantity: 3, tick: 21 }),
    ])

    const row = projection.get({ goodsId: 'fish', holderType: 'player', holderId: 'acc-1' })
    expect(row?.quantity).toBe(8)
    expect(row?.holderType).toBe('player')
    expect(row?.holderId).toBe('acc-1')
  })

  it('moves goods from player to settlement on PLAYER_DEPOSIT_GOODS', () => {
    const projection = new GoodsInventoryProjection()
    projection.rebuildFromEvents([
      playerPickupEvent(1, { playerAccountId: 'acc-1', tileId: 't_market', goodsId: 'meat', quantity: 10, tick: 30 }),
      playerDepositEvent(2, { playerAccountId: 'acc-1', tileId: 't_village', settlementId: 'sett-1', goodsId: 'meat', quantity: 6, tick: 35 }),
    ])

    const playerRow = projection.get({ goodsId: 'meat', holderType: 'player', holderId: 'acc-1' })
    expect(playerRow?.quantity).toBe(4)
    const settlementRow = projection.get({ goodsId: 'meat', holderType: 'settlement', holderId: 'sett-1' })
    expect(settlementRow?.quantity).toBe(6)
  })

  it('clamps player deposit at zero if player carries less than deposited', () => {
    const projection = new GoodsInventoryProjection()
    projection.rebuildFromEvents([
      playerPickupEvent(1, { playerAccountId: 'acc-2', tileId: 't_dock', goodsId: 'fish', quantity: 3, tick: 10 }),
      playerDepositEvent(2, { playerAccountId: 'acc-2', tileId: 't_dock', settlementId: 'sett-2', goodsId: 'fish', quantity: 10, tick: 11 }),
    ])

    const playerRow = projection.get({ goodsId: 'fish', holderType: 'player', holderId: 'acc-2' })
    expect(playerRow?.quantity).toBe(0)
    const settlementRow = projection.get({ goodsId: 'fish', holderType: 'settlement', holderId: 'sett-2' })
    expect(settlementRow?.quantity).toBe(10)
  })

  it('moves deceased NPC goods to heir on HOUSEHOLD_INHERITANCE_ASSIGNED', () => {
    const projection = new GoodsInventoryProjection()
    projection.rebuildFromEvents([
      storedEvent(1, { goodsId: 'fish', quantity: 7, holderId: 'dock.elder', tileId: 't_dock', tick: 10 }),
      storedEvent(2, { goodsId: 'hide', quantity: 2, holderId: 'dock.elder', tileId: 't_dock', tick: 11 }),
      inheritanceEvent(3, {
        deceasedNpcId: 'dock.elder',
        heirId: 'dock.heir',
        tick: 20,
        goods: [
          { goodsId: 'fish', quantity: 7, tileId: 't_dock' },
          { goodsId: 'hide', quantity: 2, tileId: 't_dock' },
        ],
      }),
    ])

    expect(projection.get({ goodsId: 'fish', holderType: 'npc', holderId: 'dock.elder' })?.quantity).toBe(0)
    expect(projection.get({ goodsId: 'hide', holderType: 'npc', holderId: 'dock.elder' })?.quantity).toBe(0)
    expect(projection.get({ goodsId: 'fish', holderType: 'npc', holderId: 'dock.heir' })?.quantity).toBe(7)
    expect(projection.get({ goodsId: 'hide', holderType: 'npc', holderId: 'dock.heir' })?.quantity).toBe(2)
  })

  it('ignores HOUSEHOLD_INHERITANCE_ASSIGNED without a goods list (legacy shape)', () => {
    const projection = new GoodsInventoryProjection()
    projection.rebuildFromEvents([
      storedEvent(1, { goodsId: 'fish', quantity: 7, holderId: 'dock.elder', tileId: 't_dock', tick: 10 }),
      baseEvent(2, 'HOUSEHOLD_INHERITANCE_ASSIGNED', 20, {
        householdId: 'household-a',
        deceasedNpcId: 'dock.elder',
        heirId: 'dock.heir',
        amount: 7,
        assignedAtTick: 20,
        narration: 'legacy inheritance',
      }),
    ])

    expect(projection.get({ goodsId: 'fish', holderType: 'npc', holderId: 'dock.elder' })?.quantity).toBe(7)
    expect(projection.get({ goodsId: 'fish', holderType: 'npc', holderId: 'dock.heir' })).toBeNull()
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

function playerPickupEvent(
  sequence: number,
  input: { playerAccountId: string; tileId: string; goodsId: string; quantity: number; tick: number }
): Event {
  return baseEvent(sequence, 'PLAYER_PICKED_UP_GOODS', input.tick, {
    playerAccountId: input.playerAccountId,
    tileId: input.tileId,
    goodsId: input.goodsId,
    quantity: input.quantity,
    tick: input.tick,
  })
}

function playerDepositEvent(
  sequence: number,
  input: { playerAccountId: string; tileId: string; settlementId: string; goodsId: string; quantity: number; tick: number }
): Event {
  return baseEvent(sequence, 'PLAYER_DEPOSIT_GOODS', input.tick, {
    playerAccountId: input.playerAccountId,
    tileId: input.tileId,
    settlementId: input.settlementId,
    goodsId: input.goodsId,
    quantity: input.quantity,
    tick: input.tick,
  })
}

function inheritanceEvent(
  sequence: number,
  input: {
    deceasedNpcId: string
    heirId: string
    tick: number
    goods: readonly { goodsId: string; quantity: number; tileId: string }[]
  }
): Event {
  return baseEvent(sequence, 'HOUSEHOLD_INHERITANCE_ASSIGNED', input.tick, {
    householdId: 'household-a',
    deceasedNpcId: input.deceasedNpcId,
    heirId: input.heirId,
    amount: input.goods.reduce((sum, line) => sum + line.quantity, 0),
    assignedAtTick: input.tick,
    goods: input.goods,
    narration: 'inheritance transfer',
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

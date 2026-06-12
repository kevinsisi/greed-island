import { describe, expect, it } from 'vitest'
import { planInheritanceTransfers } from './inheritancePlanner.js'
import { GoodsInventoryProjection } from '../projections/goodsInventory.js'
import type { MortalityIntent } from './mortalityPlanner.js'
import type { Event } from '../kernel/types.js'

describe('planInheritanceTransfers', () => {
  it('plans a transfer of every deceased-held goods row to the heir', () => {
    const goodsInventory = inventoryWith([
      storedEvent(1, { goodsId: 'fish', quantity: 5, holderId: 'npc.elder', tileId: 't_dock' }),
      storedEvent(2, { goodsId: 'hide', quantity: 3, holderId: 'npc.elder', tileId: 't_dock' }),
      storedEvent(3, { goodsId: 'fish', quantity: 9, holderId: 'npc.other', tileId: 't_dock' }),
    ])
    const intents: MortalityIntent[] = [
      { npcId: 'npc.elder', tileId: 't_dock', householdId: 'household-a', heirNpcId: 'npc.heir' },
    ]

    const transfers = planInheritanceTransfers({ intents, goodsInventory })

    expect(transfers).toHaveLength(1)
    expect(transfers[0]).toMatchObject({
      householdId: 'household-a',
      deceasedNpcId: 'npc.elder',
      heirNpcId: 'npc.heir',
      amount: 8,
    })
    expect(transfers[0]!.goods).toEqual([
      { goodsId: 'fish', quantity: 5, tileId: 't_dock' },
      { goodsId: 'hide', quantity: 3, tileId: 't_dock' },
    ])
  })

  it('skips intents without an heir', () => {
    const goodsInventory = inventoryWith([
      storedEvent(1, { goodsId: 'fish', quantity: 5, holderId: 'npc.loner', tileId: 't_dock' }),
    ])
    const intents: MortalityIntent[] = [
      { npcId: 'npc.loner', tileId: 't_dock', householdId: 'household-b', heirNpcId: null },
    ]

    expect(planInheritanceTransfers({ intents, goodsInventory })).toHaveLength(0)
  })

  it('skips deceased NPCs with an empty estate', () => {
    const goodsInventory = inventoryWith([])
    const intents: MortalityIntent[] = [
      { npcId: 'npc.pauper', tileId: 't_dock', householdId: 'household-c', heirNpcId: 'npc.heir' },
    ]

    expect(planInheritanceTransfers({ intents, goodsInventory })).toHaveLength(0)
  })
})

function inventoryWith(events: readonly Event[]): GoodsInventoryProjection {
  const projection = new GoodsInventoryProjection()
  projection.rebuildFromEvents(events)
  return projection
}

function storedEvent(
  sequence: number,
  input: { goodsId: string; quantity: number; holderId: string; tileId: string }
): Event {
  return {
    sequence,
    eventId: `event-${sequence}`,
    eventType: 'GOODS_STORED',
    occurredAt: 0,
    actorId: 'system',
    payload: {
      actorType: 'system',
      data: {
        goodsId: input.goodsId,
        quantity: input.quantity,
        holderType: 'npc',
        holderId: input.holderId,
        tileId: input.tileId,
        storedAtTick: 10,
        narration: 'goods stored',
      },
    },
    deterministicKey: `key-${sequence}`,
    version: 1,
    tick: 10,
  }
}

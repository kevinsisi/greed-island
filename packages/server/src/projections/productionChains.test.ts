import { describe, expect, it } from 'vitest'
import { ProductionChainsProjection } from './productionChains.js'
import type { Event } from '../kernel/types.js'

describe('ProductionChainsProjection', () => {
  it('projects processed production totals', () => {
    const projection = new ProductionChainsProjection()
    projection.rebuildFromEvents([
      processedEvent(1, 10),
      processedEvent(2, 11),
    ])

    const row = projection.snapshot().processed[0]
    expect(row).toMatchObject({
      recipeId: 'recipe.salt_marsh_brine.refined_salt',
      inputQuantityTotal: 20,
      outputQuantityTotal: 8,
      lastProcessedTick: 11,
    })
  })

  it('rebuilds to an identical canonical hash', () => {
    const events = [processedEvent(1, 10)]
    const a = new ProductionChainsProjection()
    const b = new ProductionChainsProjection()
    a.rebuildFromEvents(events)
    b.rebuildFromEvents(events)
    expect(a.canonicalHash()).toBe(b.canonicalHash())
  })
})

function processedEvent(sequence: number, tick: number): Event {
  return {
    sequence,
    eventId: `event-${sequence}`,
    eventType: 'GOODS_PROCESSED',
    occurredAt: 0,
    actorId: 'system',
    payload: {
      actorType: 'system',
      data: {
        recipeId: 'recipe.salt_marsh_brine.refined_salt',
        inputGoodsId: 'salt_marsh_brine',
        inputQuantity: 10,
        outputGoodsId: 'refined_salt',
        outputQuantity: 4,
        holderType: 'settlement',
        holderId: 'settlement.t_central',
        tileId: 't_central',
        processedAtTick: tick,
        narration: 'goods processed',
      },
      narration: 'goods processed',
    },
    deterministicKey: `key-${sequence}`,
    version: 1,
    tick,
  }
}

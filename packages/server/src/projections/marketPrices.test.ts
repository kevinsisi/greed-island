import { describe, expect, it } from 'vitest'
import { MarketPricesProjection } from './marketPrices.js'
import type { Event } from '../kernel/types.js'

describe('MarketPricesProjection', () => {
  it('keeps the latest price per settlement and goods', () => {
    const projection = new MarketPricesProjection()
    projection.rebuildFromEvents([
      priceEvent(1, 10, 20),
      priceEvent(2, 11, 14),
    ])

    expect(projection.get({ settlementId: 'settlement.t_central', goodsId: 'refined_salt' })).toMatchObject({
      priceGold: 14,
      lastDiscoveredTick: 11,
      lastSequence: 2,
    })
  })

  it('rebuilds to an identical canonical hash', () => {
    const events = [priceEvent(1, 10, 20)]
    const a = new MarketPricesProjection()
    const b = new MarketPricesProjection()
    a.rebuildFromEvents(events)
    b.rebuildFromEvents(events)
    expect(a.canonicalHash()).toBe(b.canonicalHash())
  })
})

function priceEvent(sequence: number, tick: number, priceGold: number): Event {
  return {
    sequence,
    eventId: `event-${sequence}`,
    eventType: 'MARKET_PRICE_DISCOVERED',
    occurredAt: 0,
    actorId: 'market.t_central',
    payload: {
      actorType: 'system',
      data: {
        marketId: 'market.t_central',
        settlementId: 'settlement.t_central',
        goodsId: 'refined_salt',
        supplyQuantity: 12,
        demandQuantity: 12,
        priceGold,
        discoveredAtTick: tick,
        narration: 'market price discovered',
      },
      narration: 'market price discovered',
    },
    deterministicKey: `key-${sequence}`,
    version: 1,
    tick,
  }
}

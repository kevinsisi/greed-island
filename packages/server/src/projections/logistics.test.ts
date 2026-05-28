import { describe, expect, it } from 'vitest'
import { LogisticsProjection, compactLogisticsSnapshot, type GoodsTransportRow, type LogisticsSnapshot } from './logistics.js'
import type { Event } from '../kernel/types.js'

describe('LogisticsProjection', () => {
  it('projects open routes and arrived transports', () => {
    const projection = new LogisticsProjection()
    projection.rebuildFromEvents([
      routeOpenedEvent(1, 'route.t_dock.t_central.fish', 't_dock', 't_central', 'fish', 10),
      transportStartedEvent(2, 'transport-a', 'route.t_dock.t_central.fish', 12, 11),
      transportArrivedEvent(3, 'transport-a', 'route.t_dock.t_central.fish', 12, 11),
    ])

    expect(projection.isRouteOpen('route.t_dock.t_central.fish')).toBe(true)
    expect(projection.getTransport('transport-a')?.status).toBe('arrived')
    expect(projection.getTransport('transport-a')?.resolvedAtTick).toBe(11)
  })

  it('marks transports lost without applying duplicate resolutions', () => {
    const projection = new LogisticsProjection()
    projection.rebuildFromEvents([
      routeOpenedEvent(1, 'route.t_dock.t_central.fish', 't_dock', 't_central', 'fish', 10),
      transportStartedEvent(2, 'transport-a', 'route.t_dock.t_central.fish', 12, 11),
      transportLostEvent(3, 'transport-a', 'route.t_dock.t_central.fish', 12, 11, 'storm'),
      transportArrivedEvent(4, 'transport-a', 'route.t_dock.t_central.fish', 12, 12),
    ])

    const row = projection.getTransport('transport-a')
    expect(row?.status).toBe('lost')
    expect(row?.lossReason).toBe('storm')
    expect(row?.resolvedAtTick).toBe(11)
  })

  it('rebuilds to an identical canonical hash', () => {
    const events = [
      routeOpenedEvent(1, 'route.t_dock.t_central.fish', 't_dock', 't_central', 'fish', 10),
      transportStartedEvent(2, 'transport-a', 'route.t_dock.t_central.fish', 12, 11),
    ]
    const a = new LogisticsProjection()
    const b = new LogisticsProjection()
    a.rebuildFromEvents(events)
    b.rebuildFromEvents(events)
    expect(a.canonicalHash()).toBe(b.canonicalHash())
  })
})

describe('compactLogisticsSnapshot', () => {
  it('keeps started transports and caps resolved transport history', () => {
    const snapshot: LogisticsSnapshot = {
      routes: [
        {
          routeId: 'route.b',
          fromTileId: 't_dock',
          toTileId: 't_central',
          goodsId: 'fish',
          open: true,
          openedAtTick: 1,
          closedAtTick: null,
          lastSequence: 1,
        },
      ],
      transports: [
        makeTransport('resolved-old', 'arrived', 10, 11, 11),
        makeTransport('started-new', 'started', 15, null, 15),
        makeTransport('resolved-new', 'lost', 20, 21, 21),
        makeTransport('started-old', 'started', 5, null, 5),
      ],
    }

    const compacted = compactLogisticsSnapshot(snapshot, 3)

    expect(compacted.transports.map((row) => row.transportId).sort()).toEqual([
      'resolved-new',
      'started-new',
      'started-old',
    ])
    expect(compacted.transports).toHaveLength(3)
  })
})

function routeOpenedEvent(sequence: number, routeId: string, fromTileId: string, toTileId: string, goodsId: string, tick: number): Event {
  return baseEvent(sequence, 'TRADE_ROUTE_OPENED', tick, {
    routeId,
    fromTileId,
    toTileId,
    goodsId,
    openedAtTick: tick,
    narration: 'route opened',
  })
}

function transportStartedEvent(sequence: number, transportId: string, routeId: string, quantity: number, tick: number): Event {
  return baseEvent(sequence, 'GOODS_TRANSPORT_STARTED', tick, transportPayload(transportId, routeId, quantity, { startedAtTick: tick }))
}

function transportArrivedEvent(sequence: number, transportId: string, routeId: string, quantity: number, tick: number): Event {
  return baseEvent(sequence, 'GOODS_TRANSPORT_ARRIVED', tick, {
    transportId,
    routeId,
    goodsId: 'fish',
    quantity,
    carrierNpcId: 'dock.fishmonger.adi',
    toHolderType: 'settlement',
    toHolderId: 'settlement.t_central',
    toTileId: 't_central',
    arrivedAtTick: tick,
    narration: 'transport arrived',
  })
}

function transportLostEvent(sequence: number, transportId: string, routeId: string, quantity: number, tick: number, reason: string): Event {
  return baseEvent(sequence, 'GOODS_TRANSPORT_LOST', tick, {
    transportId,
    routeId,
    goodsId: 'fish',
    quantity,
    carrierNpcId: 'dock.fishmonger.adi',
    fromTileId: 't_dock',
    toTileId: 't_central',
    reason,
    lostAtTick: tick,
    narration: 'transport lost',
  })
}

function transportPayload(transportId: string, routeId: string, quantity: number, extra: Record<string, unknown>): Record<string, unknown> {
  return {
    transportId,
    routeId,
    goodsId: 'fish',
    quantity,
    carrierNpcId: 'dock.fishmonger.adi',
    fromHolderType: 'npc',
    fromHolderId: 'dock.fishmonger.adi',
    fromTileId: 't_dock',
    toHolderType: 'settlement',
    toHolderId: 'settlement.t_central',
    toTileId: 't_central',
    narration: 'transport started',
    ...extra,
  }
}

function makeTransport(
  transportId: string,
  status: GoodsTransportRow['status'],
  startedAtTick: number,
  resolvedAtTick: number | null,
  lastSequence: number
): GoodsTransportRow {
  return {
    transportId,
    routeId: 'route.b',
    goodsId: 'fish',
    quantity: 1,
    carrierNpcId: 'npc.carrier',
    fromHolderType: 'npc',
    fromHolderId: 'npc.carrier',
    fromTileId: 't_dock',
    toHolderType: 'settlement',
    toHolderId: 'settlement.t_central',
    toTileId: 't_central',
    status,
    startedAtTick,
    resolvedAtTick,
    lossReason: status === 'lost' ? 'storm' : null,
    lastSequence,
  }
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

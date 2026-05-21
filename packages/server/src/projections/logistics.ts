import { hashCanonicalJson } from '../kernel/canonicalJson.js'
import type { GoodsHolderType } from '../kernel/livingWorldCommands.js'
import type { Event } from '../kernel/types.js'

export type TradeRouteRow = Readonly<{
  routeId: string
  fromTileId: string
  toTileId: string
  goodsId: string
  open: boolean
  openedAtTick: number
  closedAtTick: number | null
  lastSequence: number
}>

export type GoodsTransportStatus = 'started' | 'arrived' | 'lost'

export type GoodsTransportRow = Readonly<{
  transportId: string
  routeId: string
  goodsId: string
  quantity: number
  carrierNpcId: string
  fromHolderType: GoodsHolderType
  fromHolderId: string
  fromTileId: string
  toHolderType: GoodsHolderType
  toHolderId: string
  toTileId: string
  status: GoodsTransportStatus
  startedAtTick: number
  resolvedAtTick: number | null
  lossReason: string | null
  lastSequence: number
}>

export type LogisticsSnapshot = Readonly<{
  routes: readonly TradeRouteRow[]
  transports: readonly GoodsTransportRow[]
}>

const TRADE_ROUTE_OPENED = 'TRADE_ROUTE_OPENED'
const TRADE_ROUTE_CLOSED = 'TRADE_ROUTE_CLOSED'
const GOODS_TRANSPORT_STARTED = 'GOODS_TRANSPORT_STARTED'
const GOODS_TRANSPORT_ARRIVED = 'GOODS_TRANSPORT_ARRIVED'
const GOODS_TRANSPORT_LOST = 'GOODS_TRANSPORT_LOST'

export class LogisticsProjection {
  private routes = new Map<string, TradeRouteRow>()
  private transports = new Map<string, GoodsTransportRow>()

  rebuildFromEvents(events: readonly Event[]): void {
    this.routes = new Map()
    this.transports = new Map()
    for (const event of [...events].sort((a, b) => a.sequence - b.sequence)) this.project(event)
  }

  project(event: Event): void {
    if (event.eventType === TRADE_ROUTE_OPENED) {
      const payload = readRouteOpenedPayload(event)
      if (!payload) return
      const existing = this.routes.get(payload.routeId)
      this.routes.set(payload.routeId, {
        routeId: payload.routeId,
        fromTileId: payload.fromTileId,
        toTileId: payload.toTileId,
        goodsId: payload.goodsId,
        open: true,
        openedAtTick: existing?.openedAtTick ?? payload.openedAtTick,
        closedAtTick: null,
        lastSequence: event.sequence,
      })
      return
    }
    if (event.eventType === TRADE_ROUTE_CLOSED) {
      const payload = readRouteClosedPayload(event)
      if (!payload) return
      const existing = this.routes.get(payload.routeId)
      if (!existing) return
      this.routes.set(payload.routeId, {
        ...existing,
        open: false,
        closedAtTick: payload.closedAtTick,
        lastSequence: event.sequence,
      })
      return
    }
    if (event.eventType === GOODS_TRANSPORT_STARTED) {
      const payload = readTransportStartedPayload(event)
      if (!payload || this.transports.has(payload.transportId)) return
      this.transports.set(payload.transportId, {
        ...payload,
        status: 'started',
        resolvedAtTick: null,
        lossReason: null,
        lastSequence: event.sequence,
      })
      return
    }
    if (event.eventType === GOODS_TRANSPORT_ARRIVED) {
      const payload = readTransportResolvedPayload(event, 'arrived')
      if (!payload) return
      this.resolveTransport(payload.transportId, 'arrived', payload.tick, null, event.sequence)
      return
    }
    if (event.eventType === GOODS_TRANSPORT_LOST) {
      const payload = readTransportResolvedPayload(event, 'lost')
      if (!payload) return
      this.resolveTransport(payload.transportId, 'lost', payload.tick, payload.reason, event.sequence)
    }
  }

  isRouteOpen(routeId: string): boolean {
    return this.routes.get(routeId)?.open ?? false
  }

  getTransport(transportId: string): GoodsTransportRow | null {
    return this.transports.get(transportId) ?? null
  }

  snapshot(): LogisticsSnapshot {
    return {
      routes: [...this.routes.values()].sort((a, b) => a.routeId.localeCompare(b.routeId)),
      transports: [...this.transports.values()].sort((a, b) => a.transportId.localeCompare(b.transportId)),
    }
  }

  canonicalHash(): string {
    return hashCanonicalJson(this.snapshot())
  }

  getStartedTransports(): readonly GoodsTransportRow[] {
    return [...this.transports.values()].filter((t) => t.status === 'started')
  }

  private resolveTransport(
    transportId: string,
    status: GoodsTransportStatus,
    tick: number,
    lossReason: string | null,
    sequence: number
  ): void {
    const existing = this.transports.get(transportId)
    if (!existing || existing.status !== 'started') return
    this.transports.set(transportId, {
      ...existing,
      status,
      resolvedAtTick: tick,
      lossReason,
      lastSequence: sequence,
    })
  }
}

function readRouteOpenedPayload(event: Event): Pick<TradeRouteRow, 'routeId' | 'fromTileId' | 'toTileId' | 'goodsId' | 'openedAtTick'> | null {
  const payload = readData(event)
  if (!payload) return null
  if (typeof payload.routeId !== 'string' || payload.routeId.length === 0) return null
  if (typeof payload.fromTileId !== 'string' || payload.fromTileId.length === 0) return null
  if (typeof payload.toTileId !== 'string' || payload.toTileId.length === 0) return null
  if (typeof payload.goodsId !== 'string' || payload.goodsId.length === 0) return null
  if (typeof payload.openedAtTick !== 'number' || !Number.isInteger(payload.openedAtTick)) return null
  return {
    routeId: payload.routeId,
    fromTileId: payload.fromTileId,
    toTileId: payload.toTileId,
    goodsId: payload.goodsId,
    openedAtTick: payload.openedAtTick,
  }
}

function readRouteClosedPayload(event: Event): { routeId: string; closedAtTick: number } | null {
  const payload = readData(event)
  if (!payload) return null
  if (typeof payload.routeId !== 'string' || payload.routeId.length === 0) return null
  if (typeof payload.closedAtTick !== 'number' || !Number.isInteger(payload.closedAtTick)) return null
  return { routeId: payload.routeId, closedAtTick: payload.closedAtTick }
}

function readTransportStartedPayload(event: Event): Omit<GoodsTransportRow, 'status' | 'resolvedAtTick' | 'lossReason' | 'lastSequence'> | null {
  const payload = readData(event)
  if (!payload) return null
  const common = readTransportCommon(payload)
  if (!common) return null
  if (!isGoodsHolderType(payload.fromHolderType)) return null
  if (typeof payload.fromHolderId !== 'string' || payload.fromHolderId.length === 0) return null
  if (typeof payload.fromTileId !== 'string' || payload.fromTileId.length === 0) return null
  if (typeof payload.startedAtTick !== 'number' || !Number.isInteger(payload.startedAtTick)) return null
  return {
    ...common,
    fromHolderType: payload.fromHolderType,
    fromHolderId: payload.fromHolderId,
    fromTileId: payload.fromTileId,
    startedAtTick: payload.startedAtTick,
  }
}

function readTransportResolvedPayload(event: Event, status: 'arrived' | 'lost'): { transportId: string; tick: number; reason: string | null } | null {
  const payload = readData(event)
  if (!payload) return null
  if (typeof payload.transportId !== 'string' || payload.transportId.length === 0) return null
  if (status === 'arrived') {
    if (typeof payload.arrivedAtTick !== 'number' || !Number.isInteger(payload.arrivedAtTick)) return null
    return { transportId: payload.transportId, tick: payload.arrivedAtTick, reason: null }
  }
  if (typeof payload.lostAtTick !== 'number' || !Number.isInteger(payload.lostAtTick)) return null
  if (typeof payload.reason !== 'string' || payload.reason.length === 0) return null
  return { transportId: payload.transportId, tick: payload.lostAtTick, reason: payload.reason }
}

function readTransportCommon(payload: Record<string, unknown>): Pick<GoodsTransportRow, 'transportId' | 'routeId' | 'goodsId' | 'quantity' | 'carrierNpcId' | 'toHolderType' | 'toHolderId' | 'toTileId'> | null {
  if (typeof payload.transportId !== 'string' || payload.transportId.length === 0) return null
  if (typeof payload.routeId !== 'string' || payload.routeId.length === 0) return null
  if (typeof payload.goodsId !== 'string' || payload.goodsId.length === 0) return null
  if (typeof payload.quantity !== 'number' || !Number.isFinite(payload.quantity) || payload.quantity <= 0) return null
  if (typeof payload.carrierNpcId !== 'string' || payload.carrierNpcId.length === 0) return null
  if (!isGoodsHolderType(payload.toHolderType)) return null
  if (typeof payload.toHolderId !== 'string' || payload.toHolderId.length === 0) return null
  if (typeof payload.toTileId !== 'string' || payload.toTileId.length === 0) return null
  return {
    transportId: payload.transportId,
    routeId: payload.routeId,
    goodsId: payload.goodsId,
    quantity: payload.quantity,
    carrierNpcId: payload.carrierNpcId,
    toHolderType: payload.toHolderType,
    toHolderId: payload.toHolderId,
    toTileId: payload.toTileId,
  }
}

function readData(event: Event): Record<string, unknown> | null {
  const payload = (event.payload as { data?: unknown } | null)?.data
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null
  return payload as Record<string, unknown>
}

function isGoodsHolderType(value: unknown): value is GoodsHolderType {
  return value === 'npc' || value === 'building' || value === 'settlement'
}

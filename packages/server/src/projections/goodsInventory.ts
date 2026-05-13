import { hashCanonicalJson } from '../kernel/canonicalJson.js'
import type { GoodsHolderType } from '../kernel/livingWorldCommands.js'
import type { Event } from '../kernel/types.js'

export type GoodsInventoryRow = Readonly<{
  goodsId: string
  holderType: GoodsHolderType
  holderId: string
  tileId: string
  quantity: number
  lastUpdatedTick: number
  lastSequence: number
}>

const GOODS_STORED = 'GOODS_STORED'
const GOODS_PROCESSED = 'GOODS_PROCESSED'
const GOODS_CONSUMED = 'GOODS_CONSUMED'
const GOODS_DESTROYED = 'GOODS_DESTROYED'

export class GoodsInventoryProjection {
  private rows = new Map<string, GoodsInventoryRow>()

  rebuildFromEvents(events: readonly Event[]): void {
    this.rows = new Map()
    for (const event of [...events].sort((a, b) => a.sequence - b.sequence)) this.project(event)
  }

  project(event: Event): void {
    if (event.eventType === GOODS_STORED) {
      const payload = readStoredPayload(event)
      if (!payload) return
      this.add(payload, payload.quantity, payload.storedAtTick, event.sequence)
      return
    }
    if (event.eventType === GOODS_PROCESSED) {
      const payload = readProcessedPayload(event)
      if (!payload) return
      this.subtract(
        {
          goodsId: payload.inputGoodsId,
          holderType: payload.holderType,
          holderId: payload.holderId,
          tileId: payload.tileId,
        },
        payload.inputQuantity,
        payload.processedAtTick,
        event.sequence
      )
      this.add(
        {
          goodsId: payload.outputGoodsId,
          holderType: payload.holderType,
          holderId: payload.holderId,
          tileId: payload.tileId,
        },
        payload.outputQuantity,
        payload.processedAtTick,
        event.sequence
      )
      return
    }
    if (event.eventType === GOODS_CONSUMED || event.eventType === GOODS_DESTROYED) {
      const payload = readQuantityPayload(event)
      if (!payload) return
      const tick = event.eventType === GOODS_CONSUMED ? payload.consumedAtTick : payload.destroyedAtTick
      this.subtract(payload, payload.quantity, tick, event.sequence)
    }
  }

  get(input: { goodsId: string; holderType: GoodsHolderType; holderId: string }): GoodsInventoryRow | null {
    return this.rows.get(inventoryKey(input.holderType, input.holderId, input.goodsId)) ?? null
  }

  list(): GoodsInventoryRow[] {
    return [...this.rows.values()].filter((row) => row.quantity > 0).sort(
      (a, b) =>
        a.holderType.localeCompare(b.holderType) ||
        a.holderId.localeCompare(b.holderId) ||
        a.goodsId.localeCompare(b.goodsId)
    )
  }

  canonicalHash(): string {
    return hashCanonicalJson(this.list())
  }

  private add(
    input: { goodsId: string; holderType: GoodsHolderType; holderId: string; tileId: string },
    quantity: number,
    tick: number,
    sequence: number
  ): void {
    const key = inventoryKey(input.holderType, input.holderId, input.goodsId)
    const before = this.rows.get(key)
    this.rows.set(key, {
      goodsId: input.goodsId,
      holderType: input.holderType,
      holderId: input.holderId,
      tileId: input.tileId,
      quantity: (before?.quantity ?? 0) + quantity,
      lastUpdatedTick: tick,
      lastSequence: sequence,
    })
  }

  private subtract(
    input: { goodsId: string; holderType: GoodsHolderType; holderId: string; tileId: string },
    quantity: number,
    tick: number,
    sequence: number
  ): void {
    const key = inventoryKey(input.holderType, input.holderId, input.goodsId)
    const before = this.rows.get(key)
    this.rows.set(key, {
      goodsId: input.goodsId,
      holderType: input.holderType,
      holderId: input.holderId,
      tileId: before?.tileId ?? input.tileId,
      quantity: Math.max(0, (before?.quantity ?? 0) - quantity),
      lastUpdatedTick: tick,
      lastSequence: sequence,
    })
  }
}

function inventoryKey(holderType: GoodsHolderType, holderId: string, goodsId: string): string {
  return `${holderType}:${holderId}:${goodsId}`
}

function readStoredPayload(event: Event): (GoodsInventoryRow & { storedAtTick: number }) | null {
  const payload = readData(event)
  if (!payload) return null
  const common = readCommonPayload(payload)
  if (!common) return null
  if (typeof payload.storedAtTick !== 'number' || !Number.isInteger(payload.storedAtTick)) return null
  return { ...common, quantity: common.quantity, lastUpdatedTick: payload.storedAtTick, lastSequence: event.sequence, storedAtTick: payload.storedAtTick }
}

function readProcessedPayload(event: Event): {
  inputGoodsId: string
  inputQuantity: number
  outputGoodsId: string
  outputQuantity: number
  holderType: GoodsHolderType
  holderId: string
  tileId: string
  processedAtTick: number
} | null {
  const payload = readData(event)
  if (!payload) return null
  if (typeof payload.inputGoodsId !== 'string' || payload.inputGoodsId.length === 0) return null
  if (typeof payload.inputQuantity !== 'number' || !Number.isFinite(payload.inputQuantity)) return null
  if (typeof payload.outputGoodsId !== 'string' || payload.outputGoodsId.length === 0) return null
  if (typeof payload.outputQuantity !== 'number' || !Number.isFinite(payload.outputQuantity)) return null
  if (!isGoodsHolderType(payload.holderType)) return null
  if (typeof payload.holderId !== 'string' || payload.holderId.length === 0) return null
  if (typeof payload.tileId !== 'string' || payload.tileId.length === 0) return null
  if (typeof payload.processedAtTick !== 'number' || !Number.isInteger(payload.processedAtTick)) return null
  return {
    inputGoodsId: payload.inputGoodsId,
    inputQuantity: payload.inputQuantity,
    outputGoodsId: payload.outputGoodsId,
    outputQuantity: payload.outputQuantity,
    holderType: payload.holderType,
    holderId: payload.holderId,
    tileId: payload.tileId,
    processedAtTick: payload.processedAtTick,
  }
}

function readQuantityPayload(event: Event): {
  goodsId: string
  quantity: number
  holderType: GoodsHolderType
  holderId: string
  tileId: string
  consumedAtTick: number
  destroyedAtTick: number
} | null {
  const payload = readData(event)
  if (!payload) return null
  const common = readCommonPayload(payload)
  if (!common) return null
  const consumedAtTick = typeof payload.consumedAtTick === 'number' && Number.isInteger(payload.consumedAtTick)
    ? payload.consumedAtTick
    : 0
  const destroyedAtTick = typeof payload.destroyedAtTick === 'number' && Number.isInteger(payload.destroyedAtTick)
    ? payload.destroyedAtTick
    : 0
  return { ...common, consumedAtTick, destroyedAtTick }
}

function readCommonPayload(payload: Record<string, unknown>): {
  goodsId: string
  quantity: number
  holderType: GoodsHolderType
  holderId: string
  tileId: string
} | null {
  if (typeof payload.goodsId !== 'string' || payload.goodsId.length === 0) return null
  if (typeof payload.quantity !== 'number' || !Number.isFinite(payload.quantity)) return null
  if (!isGoodsHolderType(payload.holderType)) return null
  if (typeof payload.holderId !== 'string' || payload.holderId.length === 0) return null
  if (typeof payload.tileId !== 'string' || payload.tileId.length === 0) return null
  return {
    goodsId: payload.goodsId,
    quantity: payload.quantity,
    holderType: payload.holderType,
    holderId: payload.holderId,
    tileId: payload.tileId,
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

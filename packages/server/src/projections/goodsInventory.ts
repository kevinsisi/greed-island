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
const PLAYER_PICKED_UP_GOODS = 'PLAYER_PICKED_UP_GOODS'
const PLAYER_DEPOSIT_GOODS = 'PLAYER_DEPOSIT_GOODS'
const HOUSEHOLD_INHERITANCE_ASSIGNED = 'HOUSEHOLD_INHERITANCE_ASSIGNED'
const NPC_FREEFORM_ACTION_PROPOSED = 'NPC_FREEFORM_ACTION_PROPOSED'

export class GoodsInventoryProjection {
  private rows = new Map<string, GoodsInventoryRow>()

  rebuildFromEvents(events: readonly Event[]): void {
    this.rows = new Map()
    for (const event of [...events].sort((a, b) => a.sequence - b.sequence)) this.project(event)
  }

  project(event: Event): void {
    if (event.eventType === NPC_FREEFORM_ACTION_PROPOSED) {
      const payload = readFreeformBuyGoodsPayload(event)
      if (!payload) return
      this.subtract(
        { goodsId: 'daily_supplies', holderType: 'settlement', holderId: payload.marketSettlementId, tileId: payload.targetTile },
        payload.quantity,
        payload.tick,
        event.sequence
      )
      this.add(
        { goodsId: 'daily_supplies', holderType: 'npc', holderId: payload.npcId, tileId: payload.targetTile },
        payload.quantity,
        payload.tick,
        event.sequence
      )
      return
    }
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
      return
    }
    if (event.eventType === PLAYER_PICKED_UP_GOODS) {
      const payload = readPlayerPickupPayload(event)
      if (!payload) return
      this.add(
        { goodsId: payload.goodsId, holderType: 'player', holderId: payload.playerAccountId, tileId: payload.tileId },
        payload.quantity,
        payload.tick,
        event.sequence
      )
      return
    }
    if (event.eventType === PLAYER_DEPOSIT_GOODS) {
      const payload = readPlayerDepositPayload(event)
      if (!payload) return
      this.subtract(
        { goodsId: payload.goodsId, holderType: 'player', holderId: payload.playerAccountId, tileId: payload.tileId },
        payload.quantity,
        payload.tick,
        event.sequence
      )
      this.add(
        { goodsId: payload.goodsId, holderType: 'settlement', holderId: payload.settlementId, tileId: payload.tileId },
        payload.quantity,
        payload.tick,
        event.sequence
      )
      return
    }
    if (event.eventType === HOUSEHOLD_INHERITANCE_ASSIGNED) {
      const payload = readInheritancePayload(event)
      if (!payload) return
      for (const line of payload.goods) {
        this.subtract(
          { goodsId: line.goodsId, holderType: 'npc', holderId: payload.deceasedNpcId, tileId: line.tileId },
          line.quantity,
          payload.assignedAtTick,
          event.sequence
        )
        this.add(
          { goodsId: line.goodsId, holderType: 'npc', holderId: payload.heirId, tileId: line.tileId },
          line.quantity,
          payload.assignedAtTick,
          event.sequence
        )
      }
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

function readFreeformBuyGoodsPayload(event: Event): { npcId: string; targetTile: string; marketSettlementId: string; quantity: number; tick: number } | null {
  const payload = readData(event)
  if (!payload || payload.accepted !== true) return null
  const resolved = payload.resolved
  if (!resolved || typeof resolved !== 'object' || Array.isArray(resolved)) return null
  const r = resolved as Record<string, unknown>
  if (r.kind !== 'buy_goods') return null
  const npcId = typeof payload.npcId === 'string' ? payload.npcId : null
  const targetTile = typeof r.targetTile === 'string' && r.targetTile.length > 0
    ? r.targetTile
    : typeof payload.tile === 'string' ? payload.tile : null
  const marketSettlementId = typeof r.marketSettlementId === 'string' && r.marketSettlementId.length > 0
    ? r.marketSettlementId
    : 'settlement.t_central'
  const quantity = typeof r.quantity === 'number' && Number.isFinite(r.quantity) && r.quantity > 0
    ? Math.max(1, Math.floor(r.quantity))
    : 2
  const tick = typeof payload.decidedAtTick === 'number' && Number.isInteger(payload.decidedAtTick)
    ? payload.decidedAtTick
    : event.tick ?? 0
  if (!npcId || !targetTile) return null
  return { npcId, targetTile, marketSettlementId, quantity, tick }
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

function readPlayerPickupPayload(event: Event): {
  playerAccountId: string
  tileId: string
  goodsId: string
  quantity: number
  tick: number
} | null {
  const payload = readData(event)
  if (!payload) return null
  if (typeof payload.playerAccountId !== 'string' || payload.playerAccountId.length === 0) return null
  if (typeof payload.tileId !== 'string' || payload.tileId.length === 0) return null
  if (typeof payload.goodsId !== 'string' || payload.goodsId.length === 0) return null
  if (typeof payload.quantity !== 'number' || !Number.isFinite(payload.quantity) || payload.quantity <= 0) return null
  if (typeof payload.tick !== 'number' || !Number.isInteger(payload.tick) || payload.tick < 0) return null
  return {
    playerAccountId: payload.playerAccountId,
    tileId: payload.tileId,
    goodsId: payload.goodsId,
    quantity: payload.quantity,
    tick: payload.tick,
  }
}

function readPlayerDepositPayload(event: Event): {
  playerAccountId: string
  tileId: string
  settlementId: string
  goodsId: string
  quantity: number
  tick: number
} | null {
  const payload = readData(event)
  if (!payload) return null
  if (typeof payload.playerAccountId !== 'string' || payload.playerAccountId.length === 0) return null
  if (typeof payload.tileId !== 'string' || payload.tileId.length === 0) return null
  if (typeof payload.settlementId !== 'string' || payload.settlementId.length === 0) return null
  if (typeof payload.goodsId !== 'string' || payload.goodsId.length === 0) return null
  if (typeof payload.quantity !== 'number' || !Number.isFinite(payload.quantity) || payload.quantity <= 0) return null
  if (typeof payload.tick !== 'number' || !Number.isInteger(payload.tick) || payload.tick < 0) return null
  return {
    playerAccountId: payload.playerAccountId,
    tileId: payload.tileId,
    settlementId: payload.settlementId,
    goodsId: payload.goodsId,
    quantity: payload.quantity,
    tick: payload.tick,
  }
}

function readInheritancePayload(event: Event): {
  deceasedNpcId: string
  heirId: string
  assignedAtTick: number
  goods: readonly { goodsId: string; quantity: number; tileId: string }[]
} | null {
  const payload = readData(event)
  if (!payload) return null
  if (typeof payload.deceasedNpcId !== 'string' || payload.deceasedNpcId.length === 0) return null
  if (typeof payload.heirId !== 'string' || payload.heirId.length === 0) return null
  if (typeof payload.assignedAtTick !== 'number' || !Number.isInteger(payload.assignedAtTick)) return null
  if (!Array.isArray(payload.goods)) return null
  const goods: { goodsId: string; quantity: number; tileId: string }[] = []
  for (const raw of payload.goods) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
    const line = raw as Record<string, unknown>
    if (typeof line.goodsId !== 'string' || line.goodsId.length === 0) return null
    if (typeof line.quantity !== 'number' || !Number.isFinite(line.quantity) || line.quantity <= 0) return null
    if (typeof line.tileId !== 'string' || line.tileId.length === 0) return null
    goods.push({ goodsId: line.goodsId, quantity: line.quantity, tileId: line.tileId })
  }
  return {
    deceasedNpcId: payload.deceasedNpcId,
    heirId: payload.heirId,
    assignedAtTick: payload.assignedAtTick,
    goods,
  }
}

function isGoodsHolderType(value: unknown): value is GoodsHolderType {
  return value === 'npc' || value === 'building' || value === 'settlement' || value === 'player'
}

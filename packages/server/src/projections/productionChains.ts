import { listProductionRecipes, type ProductionRecipe } from '../goods/productionChains.js'
import { hashCanonicalJson } from '../kernel/canonicalJson.js'
import type { GoodsHolderType } from '../kernel/livingWorldCommands.js'
import type { Event } from '../kernel/types.js'

export type ProductionProcessRow = Readonly<{
  recipeId: string
  inputGoodsId: string
  inputQuantityTotal: number
  outputGoodsId: string
  outputQuantityTotal: number
  holderType: GoodsHolderType
  holderId: string
  tileId: string
  lastProcessedTick: number
  lastSequence: number
}>

export type ProductionChainsSnapshot = Readonly<{
  recipes: readonly ProductionRecipe[]
  processed: readonly ProductionProcessRow[]
}>

const GOODS_PROCESSED = 'GOODS_PROCESSED'

export class ProductionChainsProjection {
  private rows = new Map<string, ProductionProcessRow>()

  rebuildFromEvents(events: readonly Event[]): void {
    this.rows = new Map()
    for (const event of [...events].sort((a, b) => a.sequence - b.sequence)) this.project(event)
  }

  project(event: Event): void {
    if (event.eventType !== GOODS_PROCESSED) return
    const payload = readProcessedPayload(event)
    if (!payload) return
    const key = processKey(payload.recipeId, payload.holderType, payload.holderId)
    const before = this.rows.get(key)
    this.rows.set(key, {
      recipeId: payload.recipeId,
      inputGoodsId: payload.inputGoodsId,
      inputQuantityTotal: (before?.inputQuantityTotal ?? 0) + payload.inputQuantity,
      outputGoodsId: payload.outputGoodsId,
      outputQuantityTotal: (before?.outputQuantityTotal ?? 0) + payload.outputQuantity,
      holderType: payload.holderType,
      holderId: payload.holderId,
      tileId: payload.tileId,
      lastProcessedTick: payload.processedAtTick,
      lastSequence: event.sequence,
    })
  }

  snapshot(): ProductionChainsSnapshot {
    return {
      recipes: [...listProductionRecipes()].sort((a, b) => a.recipeId.localeCompare(b.recipeId)),
      processed: [...this.rows.values()].sort((a, b) => a.recipeId.localeCompare(b.recipeId) || a.holderId.localeCompare(b.holderId)),
    }
  }

  canonicalHash(): string {
    return hashCanonicalJson(this.snapshot())
  }
}

function readProcessedPayload(event: Event): {
  recipeId: string
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
  if (typeof payload.recipeId !== 'string' || payload.recipeId.length === 0) return null
  if (typeof payload.inputGoodsId !== 'string' || payload.inputGoodsId.length === 0) return null
  if (typeof payload.inputQuantity !== 'number' || !Number.isFinite(payload.inputQuantity)) return null
  if (typeof payload.outputGoodsId !== 'string' || payload.outputGoodsId.length === 0) return null
  if (typeof payload.outputQuantity !== 'number' || !Number.isFinite(payload.outputQuantity)) return null
  if (!isGoodsHolderType(payload.holderType)) return null
  if (typeof payload.holderId !== 'string' || payload.holderId.length === 0) return null
  if (typeof payload.tileId !== 'string' || payload.tileId.length === 0) return null
  if (typeof payload.processedAtTick !== 'number' || !Number.isInteger(payload.processedAtTick)) return null
  return {
    recipeId: payload.recipeId,
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

function readData(event: Event): Record<string, unknown> | null {
  const payload = (event.payload as { data?: unknown } | null)?.data
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null
  return payload as Record<string, unknown>
}

function isGoodsHolderType(value: unknown): value is GoodsHolderType {
  return value === 'npc' || value === 'building' || value === 'settlement'
}

function processKey(recipeId: string, holderType: GoodsHolderType, holderId: string): string {
  return `${recipeId}:${holderType}:${holderId}`
}

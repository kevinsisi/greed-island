import { hashCanonicalJson } from '../kernel/canonicalJson.js'
import type { Event } from '../kernel/types.js'

export type MarketPriceRow = Readonly<{
  marketId: string
  settlementId: string
  goodsId: string
  supplyQuantity: number
  demandQuantity: number
  priceGold: number
  lastDiscoveredTick: number
  lastSequence: number
}>

const MARKET_PRICE_DISCOVERED = 'MARKET_PRICE_DISCOVERED'

export class MarketPricesProjection {
  private rows = new Map<string, MarketPriceRow>()

  rebuildFromEvents(events: readonly Event[]): void {
    this.rows = new Map()
    for (const event of [...events].sort((a, b) => a.sequence - b.sequence)) this.project(event)
  }

  project(event: Event): void {
    if (event.eventType !== MARKET_PRICE_DISCOVERED) return
    const payload = readMarketPricePayload(event)
    if (!payload) return
    this.rows.set(priceKey(payload.settlementId, payload.goodsId), {
      ...payload,
      lastDiscoveredTick: payload.discoveredAtTick,
      lastSequence: event.sequence,
    })
  }

  get(input: { settlementId: string; goodsId: string }): MarketPriceRow | null {
    return this.rows.get(priceKey(input.settlementId, input.goodsId)) ?? null
  }

  list(): MarketPriceRow[] {
    return [...this.rows.values()].sort((a, b) => a.settlementId.localeCompare(b.settlementId) || a.goodsId.localeCompare(b.goodsId))
  }

  canonicalHash(): string {
    return hashCanonicalJson(this.list())
  }
}

function readMarketPricePayload(event: Event): (Omit<MarketPriceRow, 'lastDiscoveredTick' | 'lastSequence'> & { discoveredAtTick: number }) | null {
  const payload = readData(event)
  if (!payload) return null
  if (typeof payload.marketId !== 'string' || payload.marketId.length === 0) return null
  if (typeof payload.settlementId !== 'string' || payload.settlementId.length === 0) return null
  if (typeof payload.goodsId !== 'string' || payload.goodsId.length === 0) return null
  if (typeof payload.supplyQuantity !== 'number' || !Number.isFinite(payload.supplyQuantity)) return null
  if (typeof payload.demandQuantity !== 'number' || !Number.isFinite(payload.demandQuantity)) return null
  if (typeof payload.priceGold !== 'number' || !Number.isFinite(payload.priceGold)) return null
  if (typeof payload.discoveredAtTick !== 'number' || !Number.isInteger(payload.discoveredAtTick)) return null
  return {
    marketId: payload.marketId,
    settlementId: payload.settlementId,
    goodsId: payload.goodsId,
    supplyQuantity: payload.supplyQuantity,
    demandQuantity: payload.demandQuantity,
    priceGold: payload.priceGold,
    discoveredAtTick: payload.discoveredAtTick,
  }
}

function readData(event: Event): Record<string, unknown> | null {
  const payload = (event.payload as { data?: unknown } | null)?.data
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null
  return payload as Record<string, unknown>
}

function priceKey(settlementId: string, goodsId: string): string {
  return `${settlementId}:${goodsId}`
}

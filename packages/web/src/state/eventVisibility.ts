import type { EventSummary } from './types'

const INTERNAL_EVENT_TYPES = new Set([
  'FACT_SET',
  'WORLD_TICK',
  // 投影/快照類內部事件：任何 narration 都不該上「世界正在發生」。
  'AREA_STATE_RECORDED',
  'NPC_STATE_RECORDED',
  'NPC_INTENT_RESOLVED',
])
const ROUTINE_CHRONICLE_EVENT_TYPES = new Set([
  'GOODS_EXTRACTED',
  'GOODS_STORED',
  'GOODS_PROCESSED',
  'GOODS_CONSUMED',
  'GOODS_DESTROYED',
  'GOODS_TRANSPORT_STARTED',
  'GOODS_TRANSPORT_ARRIVED',
  'GOODS_TRANSPORT_LOST',
  'TRADE_ROUTE_OPENED',
  'TRADE_ROUTE_CLOSED',
  'MARKET_PRICE_DISCOVERED',
  'HOUSEHOLD_GOLD_CONTRIBUTED',
  'HOUSEHOLD_GOLD_SPENT',
  'HOUSEHOLD_INHERITANCE_ASSIGNED',
  'ANIMAL_REPRODUCED',
  'SETTLEMENT_POPULATION_UPDATED',
  'SETTLEMENT_STORAGE_UPDATED',
  'SETTLEMENT_PRESSURE_UPDATED',
  'SETTLEMENT_STABILITY_CHANGED',
])

const INTERNAL_ID_PATTERNS = [
  /\b[a-z]+(?:\.[a-z0-9_]+){2,}\b/i,
  /\b[a-z]+_[a-z0-9_]+\b/i,
]

export function isPublicNarrativeEvent(event: EventSummary): boolean {
  if (INTERNAL_EVENT_TYPES.has(event.eventType)) return false
  return event.narration !== null && event.narration !== undefined && event.narration.trim().length > 0
}

export function isChronicleSurfaceEvent(event: EventSummary): boolean {
  if (!isPublicNarrativeEvent(event)) return false
  if (containsInternalIdentifier(event.narration ?? '')) return false
  return !ROUTINE_CHRONICLE_EVENT_TYPES.has(event.eventType)
}

function containsInternalIdentifier(narration: string): boolean {
  return INTERNAL_ID_PATTERNS.some((pattern) => pattern.test(narration))
}

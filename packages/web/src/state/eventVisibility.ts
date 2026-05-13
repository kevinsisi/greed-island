import type { EventSummary } from './types'

const INTERNAL_EVENT_TYPES = new Set(['FACT_SET', 'WORLD_TICK'])
const ROUTINE_CHRONICLE_EVENT_TYPES = new Set([
  'NPC_PRODUCTIVE_ACTION',
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
])

export function isPublicNarrativeEvent(event: EventSummary): boolean {
  if (INTERNAL_EVENT_TYPES.has(event.eventType)) return false
  return event.narration !== null && event.narration !== undefined && event.narration.trim().length > 0
}

export function isChronicleSurfaceEvent(event: EventSummary): boolean {
  if (!isPublicNarrativeEvent(event)) return false
  return !ROUTINE_CHRONICLE_EVENT_TYPES.has(event.eventType)
}

import type { EventSummary } from './types'

const INTERNAL_EVENT_TYPES = new Set(['FACT_SET', 'WORLD_TICK'])

export function isPublicNarrativeEvent(event: EventSummary): boolean {
  if (INTERNAL_EVENT_TYPES.has(event.eventType)) return false
  return event.narration !== null && event.narration !== undefined && event.narration.trim().length > 0
}

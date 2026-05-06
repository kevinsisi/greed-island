import { cloneCanonical, hashCanonicalJson } from './canonicalJson.js'
import { EVENT_FACT_SET } from './ruleEngine.js'
import {
  type Event,
  type FactSetPayload,
  type WorldState,
  KERNEL_WORLD_STATE_VERSION
} from './types.js'

export function createInitialWorldState(): WorldState {
  return {
    version: KERNEL_WORLD_STATE_VERSION,
    lastSequence: 0,
    eventCount: 0,
    facts: {}
  }
}

export function reduceEventLog(events: readonly Event[]): WorldState {
  const orderedEvents = [...events].sort(compareEventsBySequence)
  const facts: Record<string, unknown> = {}
  let lastSequence = 0

  for (const event of orderedEvents) {
    if (event.eventType === EVENT_FACT_SET && isFactSetPayload(event.payload)) {
      facts[event.payload.key] = cloneCanonical(event.payload.value)
    }
    lastSequence = event.sequence
  }

  return {
    version: KERNEL_WORLD_STATE_VERSION,
    lastSequence,
    eventCount: orderedEvents.length,
    facts: cloneCanonical(facts)
  }
}

export function hashWorldState(worldState: WorldState): string {
  return hashCanonicalJson(worldState)
}

export function compareEventsBySequence(left: Event, right: Event): number {
  const sequenceCompare = left.sequence - right.sequence
  if (sequenceCompare !== 0) {
    return sequenceCompare
  }

  const keyCompare = left.deterministicKey.localeCompare(right.deterministicKey)
  if (keyCompare !== 0) {
    return keyCompare
  }

  return left.eventId.localeCompare(right.eventId)
}

function isFactSetPayload(payload: unknown): payload is FactSetPayload {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    !Array.isArray(payload) &&
    typeof (payload as Record<string, unknown>).key === 'string' &&
    Object.prototype.hasOwnProperty.call(payload, 'value')
  )
}

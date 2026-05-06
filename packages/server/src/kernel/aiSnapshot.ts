import { cloneCanonical } from './canonicalJson.js'
import { compareEventsBySequence } from './reducer.js'
import type { AiNarrationOutput, AiSnapshotInput, Event, WorldState } from './types.js'

export function createAiSnapshotInput(events: readonly Event[], worldState: WorldState): AiSnapshotInput {
  const orderedEvents = [...events].sort(compareEventsBySequence)
  return cloneCanonical({
    lastSequence: worldState.lastSequence,
    events: orderedEvents.map((event) => ({
      sequence: event.sequence,
      eventType: event.eventType,
      actorId: event.actorId,
      ...(event.commandId === undefined ? {} : { commandId: event.commandId }),
      payload: event.payload,
      deterministicKey: event.deterministicKey,
      version: event.version,
      ...(event.tick === undefined ? {} : { tick: event.tick }),
      ...(event.rulesetVersion === undefined ? {} : { rulesetVersion: event.rulesetVersion })
    })),
    worldState
  })
}

export function createNarrationOutput(text: string): AiNarrationOutput {
  return { text }
}

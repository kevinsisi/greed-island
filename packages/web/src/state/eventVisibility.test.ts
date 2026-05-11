import { describe, expect, it } from 'vitest'
import { isPublicNarrativeEvent } from './eventVisibility'
import type { EventSummary } from './types'

function event(input: Partial<EventSummary>): EventSummary {
  return {
    sequence: 1,
    tick: 1,
    eventType: 'NPC_INTERACT',
    actorId: 'npc-a',
    occurredAt: new Date(0).toISOString(),
    payload: {},
    narration: '有人在街角交談。',
    ...input
  }
}

describe('isPublicNarrativeEvent', () => {
  it('hides internal world ticks from timeline and ticker surfaces', () => {
    expect(isPublicNarrativeEvent(event({ eventType: 'WORLD_TICK', narration: null }))).toBe(false)
  })

  it('keeps committed public events with narration', () => {
    expect(isPublicNarrativeEvent(event({ eventType: 'NPC_INTERACT' }))).toBe(true)
  })
})

import { describe, expect, it } from 'vitest'
import type { EventSummary } from '../state/types'
import { eventBelongsToArea } from './areaEvents'

describe('eventBelongsToArea', () => {
  it('includes animal attacks by payload tileId even when actor is ecosystem', () => {
    expect(eventBelongsToArea(event({ tileId: 't_desert', targetNpcId: 'desert.guide.sha_j' }), 't_desert', new Set())).toBe(true)
  })

  it('includes events by occupant actor id', () => {
    expect(eventBelongsToArea(event({}, 'npc.a'), 't_desert', new Set(['npc.a']))).toBe(true)
  })

  it('excludes unrelated tile events', () => {
    expect(eventBelongsToArea(event({ tileId: 't_forest' }), 't_desert', new Set())).toBe(false)
  })
})

function event(payload: Record<string, unknown>, actorId = 'ecosystem.predator.mirage_hawk'): EventSummary {
  return {
    sequence: 1,
    tick: 10,
    eventType: 'ANIMAL_ATTACKED_NPC',
    actorId,
    occurredAt: '2026-05-15T00:00:00.000Z',
    payload,
    narration: 'mirage_hawk attacked an NPC',
  }
}

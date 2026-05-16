import { describe, expect, it } from 'vitest'
import { isChronicleSurfaceEvent, isPublicNarrativeEvent } from './eventVisibility'
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

  it('keeps narrated NPC work visible on chronicle surfaces', () => {
    const productive = event({ eventType: 'NPC_PRODUCTIVE_ACTION', narration: '某人補了一箱貨。' })

    expect(isPublicNarrativeEvent(productive)).toBe(true)
    expect(isChronicleSurfaceEvent(productive)).toBe(true)
  })

  it('keeps routine logistics out of chronicle surfaces', () => {
    const logistics = event({ eventType: 'GOODS_TRANSPORT_ARRIVED', narration: '一批魚貨抵達。' })

    expect(isPublicNarrativeEvent(logistics)).toBe(true)
    expect(isChronicleSurfaceEvent(logistics)).toBe(false)
  })

  it('keeps raw internal ids out of world prompt surfaces', () => {
    const leakedId = event({
      eventType: 'ANIMAL_ATTACKED_NPC',
      narration: 'iron_hound在地脈層攻擊了temple.cleric.sela。',
    })

    expect(isPublicNarrativeEvent(leakedId)).toBe(true)
    expect(isChronicleSurfaceEvent(leakedId)).toBe(false)
  })
})

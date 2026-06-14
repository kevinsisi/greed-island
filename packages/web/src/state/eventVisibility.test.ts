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

  it('keeps routine NPC interactions public but off the main chronicle feed', () => {
    const interact = event({ eventType: 'NPC_INTERACT', narration: '兩人在街邊閒聊。' })

    expect(isPublicNarrativeEvent(interact)).toBe(true)
    expect(isChronicleSurfaceEvent(interact)).toBe(false)
  })

  it('keeps AI freeform NPC proposals on chronicle surfaces', () => {
    const proposal = event({ eventType: 'NPC_FREEFORM_ACTION_PROPOSED', narration: '阿駿照著自己的念頭決定找件事做。' })

    expect(isPublicNarrativeEvent(proposal)).toBe(true)
    expect(isChronicleSurfaceEvent(proposal)).toBe(true)
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

  it('keeps routine settlement telemetry out of chronicle surfaces', () => {
    const pressure = event({ eventType: 'SETTLEMENT_PRESSURE_UPDATED', narration: 'Settlement pressure recalculated.' })

    expect(isPublicNarrativeEvent(pressure)).toBe(true)
    expect(isChronicleSurfaceEvent(pressure)).toBe(false)
  })

  it('hides projection snapshot events even when a narration string leaked in (v0.89.0)', () => {
    expect(
      isPublicNarrativeEvent(
        event({ eventType: 'AREA_STATE_RECORDED', narration: 'internal area state projection' })
      )
    ).toBe(false)
    expect(
      isPublicNarrativeEvent(
        event({ eventType: 'NPC_STATE_RECORDED', narration: 'internal npc state projection' })
      )
    ).toBe(false)
    expect(
      isPublicNarrativeEvent(event({ eventType: 'NPC_INTENT_RESOLVED', narration: 'resolved' }))
    ).toBe(false)
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

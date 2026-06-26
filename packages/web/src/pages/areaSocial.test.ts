import { describe, expect, it } from 'vitest'
import type { EventSummary } from '../state/types'
import { formatNpcInteractionEvent, isNpcInteractionEvent } from './areaSocial'

function event(overrides: Partial<EventSummary>): EventSummary {
  return {
    sequence: 1,
    tick: 42,
    eventType: 'NPC_INTERACT',
    actorId: 'npc.a',
    occurredAt: '2026-06-26T00:00:00.000Z',
    payload: {
      tile: 't_central',
      participants: ['npc.a', 'npc.b'],
      mode: 'chat'
    },
    narration: null,
    ...overrides
  }
}

describe('areaSocial', () => {
  it('recognizes NPC interaction events with two participants', () => {
    expect(isNpcInteractionEvent(event({}))).toBe(true)
    expect(isNpcInteractionEvent(event({ eventType: 'NPC_MOVE' }))).toBe(false)
    expect(isNpcInteractionEvent(event({ payload: { participants: ['npc.a'], mode: 'chat' } }))).toBe(false)
  })

  it('formats NPC interaction using names and mode when narration is absent', () => {
    const text = formatNpcInteractionEvent(event({}), new Map([
      ['npc.a', '阿甲'],
      ['npc.b', '阿乙']
    ]))
    expect(text).toBe('阿甲和阿乙正在交談，交換情報或協調下一步。')
  })

  it('prefers authored narration when present', () => {
    expect(formatNpcInteractionEvent(event({ narration: '阿甲和阿乙在市場交換魚價消息。' }), new Map())).toBe('阿甲和阿乙在市場交換魚價消息。')
  })
})

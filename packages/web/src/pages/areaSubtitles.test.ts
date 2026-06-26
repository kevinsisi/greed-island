import { describe, expect, it } from 'vitest'
import type { EventSummary } from '../state/types'
import { areaSubtitleLines, nearestSpeakTarget } from './areaSubtitles'

function ev(input: Partial<EventSummary> & Pick<EventSummary, 'eventType' | 'payload'>): EventSummary {
  return {
    sequence: input.sequence ?? 1,
    tick: input.tick ?? 42,
    eventType: input.eventType,
    actorId: input.actorId ?? 'system',
    occurredAt: input.occurredAt ?? '2026-06-26T00:00:00.000Z',
    payload: input.payload,
    narration: input.narration ?? null,
  }
}

describe('areaSubtitles', () => {
  it('turns nearby NPC_INTERACT narration into subtitle lines', () => {
    const lines = areaSubtitleLines({
      events: [ev({
        eventType: 'NPC_INTERACT',
        payload: { tile: 't_central', mode: 'talk', participants: ['npc.a', 'npc.b'] },
        narration: '阿甲和阿乙在路邊交換情報。',
      })],
      npcNameById: new Map([['npc.a', '阿甲'], ['npc.b', '阿乙']]),
      nearbyNpcIds: new Set(['npc.a']),
      playerAccountId: 'acct.1',
    })

    expect(lines.map((line) => `${line.speaker}: ${line.text}`)).toEqual([
      '附近: 阿甲和阿乙在路邊交換情報。',
    ])
  })

  it('turns PLAYER_NPC_DIALOGUE into player and NPC subtitle turns', () => {
    const lines = areaSubtitleLines({
      events: [ev({
        eventType: 'PLAYER_NPC_DIALOGUE',
        actorId: 'acct.1',
        payload: { data: { npcId: 'npc.a', playerMessage: '你看到什麼？', npcReplyZh: '我看到碼頭有人爭執。' } },
      })],
      npcNameById: new Map([['npc.a', '阿甲']]),
      nearbyNpcIds: new Set(['npc.a']),
      playerAccountId: 'acct.1',
    })

    expect(lines.map((line) => `${line.speaker}: ${line.text}`)).toEqual([
      '你: 你看到什麼？',
      '阿甲: 我看到碼頭有人爭執。',
    ])
  })

  it('prefers a nearby NPC as inline speech target', () => {
    expect(nearestSpeakTarget(['npc.b'], ['npc.a', 'npc.b'])).toBe('npc.b')
    expect(nearestSpeakTarget([], ['npc.a', 'npc.b'])).toBe('npc.a')
  })
})

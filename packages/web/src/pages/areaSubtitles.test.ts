import { describe, expect, it } from 'vitest'
import type { EventSummary, NpcSummary } from '../state/types'
import { areaSubtitleLines, ambientNpcChatterLines, dedupeSubtitleLines, nearbySpeechRecipients, nearestSpeakTarget, optimisticLocalShoutLines, optimisticSpeechLines, relationshipActionSubtitleLines } from './areaSubtitles'

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

function npc(input: Partial<NpcSummary> & Pick<NpcSummary, 'id'>): NpcSummary {
  return {
    ...input,
    id: input.id,
    name: input.name ?? '阿甲',
    role: input.role ?? '旅人',
    location: input.location ?? 't_central',
    relationshipScore: input.relationshipScore ?? 50,
    lastActedTick: input.lastActedTick ?? 0,
    internalState: input.internalState ?? {},
    deceased: input.deceased ?? false,
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

  it('turns NPC freeform utterances into spoken subtitle lines', () => {
    const lines = areaSubtitleLines({
      events: [ev({
        eventType: 'NPC_FREEFORM_ACTION_PROPOSED',
        payload: { npcId: 'npc.a', tile: 't_central', proposal: { utterance: '得先量出空地。' } },
        narration: '阿甲查看空地。',
      })],
      npcNameById: new Map([['npc.a', '海石']]),
      nearbyNpcIds: new Set(['npc.a']),
      playerAccountId: 'acct.1',
    })

    expect(lines.map((line) => `${line.speaker}: ${line.text}`)).toEqual([
      '海石: 得先量出空地。',
    ])
  })

  it('turns server relationship actions into ambient nearby subtitle lines', () => {
    const lines = ambientNpcChatterLines({
      npcs: [
        npc({
          id: 'npc.a',
          name: '星沉',
          relationshipAction: {
            kind: 'caution',
            labelZh: '⚠️ 戒備玩家',
            detailZh: '玩家關係形成戒備壓力 76；讓附近同伴提高警覺。',
            utteranceZh: '先別太靠近那個人。',
            tick: 101,
            sequence: 9,
          },
        }),
      ],
      nearbyNpcIds: new Set(['npc.a']),
      tick: 102,
    })

    expect(lines.map((line) => `${line.speaker}: ${line.text}`)).toEqual([
      '星沉: 先別太靠近那個人。',
    ])
  })

  it('builds dedicated relationship action subtitle rows that can mix with live speech', () => {
    const lines = relationshipActionSubtitleLines({
      npcs: [
        npc({
          id: 'npc.a',
          name: '星沉',
          relationshipAction: {
            kind: 'caution',
            labelZh: '⚠️ 戒備玩家',
            detailZh: '玩家關係形成戒備壓力 76；讓附近同伴提高警覺。',
            utteranceZh: '先別太靠近那個人。',
            tick: 101,
            sequence: 9,
          },
        }),
        npc({
          id: 'npc.b',
          name: '阿鬼',
          recentUtterance: { text: '我先去碼頭。', tick: 102 },
        }),
      ],
      nearbyNpcIds: new Set(['npc.a', 'npc.b']),
      limit: 3,
    })

    expect(lines.map((line) => `${line.id} ${line.speaker}: ${line.text}`)).toEqual([
      'relationship-action:npc.a:9 星沉: 先別太靠近那個人。',
    ])
  })

  it('builds ambient nearby NPC chatter only from actual utterances, not cognition summaries', () => {
    const lines = ambientNpcChatterLines({
      npcs: [
        npc({ id: 'npc.a', name: '靈狗', greetLine: { zh: '「你聞到潮味了嗎？」', en: 'Do you smell the tide?' } }),
        npc({ id: 'npc.b', name: '雨黎', recentUtterance: { text: '雨太大，攤子先收半邊。', tick: 87 } }),
        npc({ id: 'npc.c', name: '岸隅', cognitiveLine: { zh: '岸隅觀察眼前局勢，正在盤算生計、資源與下一個機會。', en: 'Watching the situation.' } }),
        npc({ id: 'npc.d', name: '海映', recentUtterance: { text: '雨太大，攤子先收半邊。', tick: 88 } }),
        npc({ id: 'npc.e', name: '眠舟', activity: 'sleep', cognitiveLine: { zh: '夢裡仍聽見潮聲。', en: 'Dreaming.' } }),
      ],
      nearbyNpcIds: new Set(['npc.a', 'npc.b', 'npc.c', 'npc.d', 'npc.e']),
      tick: 88,
      limit: 3,
    })

    expect(lines.map((line) => `${line.speaker}: ${line.text}`)).toEqual([
      '雨黎: 雨太大，攤子先收半邊。',
    ])
  })

  it('targets nearby NPCs as a local shout instead of locking speech to one NPC', () => {
    expect(nearbySpeechRecipients(['npc.b', 'npc.c'], ['npc.a', 'npc.b', 'npc.c'])).toEqual(['npc.b', 'npc.c'])
    expect(nearbySpeechRecipients([], ['npc.a', 'npc.b'])).toEqual(['npc.a'])
    expect(nearbySpeechRecipients(['npc.a', 'npc.b', 'npc.c', 'npc.d'], ['npc.a', 'npc.b', 'npc.c', 'npc.d'])).toEqual(['npc.a', 'npc.b', 'npc.c'])
  })

  it('prefers a nearby NPC as inline speech target', () => {
    expect(nearestSpeakTarget(['npc.b'], ['npc.a', 'npc.b'])).toBe('npc.b')
    expect(nearestSpeakTarget([], ['npc.a', 'npc.b'])).toBe('npc.a')
  })

  it('builds one player line and at most one NPC pending reply for local shout', () => {
    expect(optimisticLocalShoutLines({
      baseId: 'tmp.2',
      tick: 90,
      playerMessage: '大家聽得到嗎？',
      recipients: [
        { id: 'npc.a', name: '阿甲', replyZh: null },
        { id: 'npc.b', name: '阿乙', replyZh: '聽得到。' },
      ],
    }).map((line) => `${line.speaker}: ${line.text}`)).toEqual([
      '你: 大家聽得到嗎？',
      '阿甲: ……',
    ])
  })

  it('dedupes repeated subtitle lines from optimistic echo and clone NPC speech', () => {
    const lines = dedupeSubtitleLines([
      { id: 'a', tick: 1, speaker: '你', text: '阿伽好', tone: 'player' },
      { id: 'b', tick: 2, speaker: '海石', text: '「夜市那條街，問阿鬼，他什麼都聽得見。」', tone: 'npc', npcId: 'npc.a' },
      { id: 'c', tick: 3, speaker: '你', text: '阿伽好', tone: 'player' },
      { id: 'd', tick: 4, speaker: '星沉', text: '「夜市那條街，問阿鬼，他什麼都聽得見。」', tone: 'npc', npcId: 'npc.b' },
    ])

    expect(lines.map((line) => `${line.speaker}: ${line.text}`)).toEqual([
      '你: 阿伽好',
      '海石: 「夜市那條街，問阿鬼，他什麼都聽得見。」',
    ])
  })

  it('builds an immediate optimistic player line before the server replies', () => {
    expect(optimisticSpeechLines({
      baseId: 'tmp.1',
      tick: 77,
      playerMessage: '大家好',
      npcId: 'npc.a',
      npcName: '靈狗',
      npcReplyZh: null,
    }).map((line) => `${line.speaker}: ${line.text}`)).toEqual([
      '你: 大家好',
      '靈狗: ……',
    ])
  })
})

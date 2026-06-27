import { describe, expect, it } from 'vitest'
import type { Event } from '../kernel/types.js'
import { PlayerRelationshipActionProjection } from './playerRelationshipActions.js'

function event(input: {
  sequence?: number
  tick?: number
  npcId: string
  reason: string
  action: string
  utterance?: string
  accepted?: boolean
}): Event {
  return {
    eventId: `event_${input.sequence ?? 1}`,
    eventType: 'NPC_FREEFORM_ACTION_PROPOSED',
    actorId: input.npcId,
    occurredAt: Date.parse('2026-06-27T00:00:00.000Z'),
    sequence: input.sequence ?? 1,
    tick: input.tick ?? 10,
    payload: {
      actorType: 'npc',
      data: {
        npcId: input.npcId,
        accepted: input.accepted ?? true,
        proposal: {
          action: input.action,
          reason: input.reason,
          utterance: input.utterance ?? null,
        },
        resolved: { kind: 'custom_social_scene', targetTile: 't_central', targetNpcId: null, cardId: null, summary: input.action },
      },
      narration: null,
    },
    version: 1,
    deterministicKey: `test.${input.sequence ?? 1}`,
  }
}

describe('PlayerRelationshipActionProjection', () => {
  it('projects accepted relationship freeform actions into typed NPC visibility rows', () => {
    const projection = new PlayerRelationshipActionProjection()

    projection.project(event({
      npcId: 'npc.a',
      reason: '玩家關係形成戒備壓力 76；讓附近同伴提高警覺。',
      action: '在中央提醒熟人別太靠近讓自己戒備的玩家',
      utterance: '先別太靠近那個人。',
    }))

    expect(projection.getForNpc('npc.a')).toEqual({
      kind: 'caution',
      labelZh: '⚠️ 戒備玩家',
      detailZh: '玩家關係形成戒備壓力 76；讓附近同伴提高警覺。',
      utteranceZh: '先別太靠近那個人。',
      tick: 10,
      sequence: 1,
    })
  })

  it('keeps the newest replayed relationship action and ignores rejected/non-relationship actions', () => {
    const projection = new PlayerRelationshipActionProjection()

    projection.rebuildFromEvents([
      event({ sequence: 1, tick: 10, npcId: 'npc.a', reason: '玩家關係形成戒備壓力 76', action: '提醒熟人別太靠近' }),
      event({ sequence: 2, tick: 11, npcId: 'npc.a', reason: '一般工作', action: '修理棚架' }),
      event({ sequence: 3, tick: 12, npcId: 'npc.a', accepted: false, reason: '玩家關係累積親近壓力 61', action: '主動找信任的玩家聊天' }),
      event({ sequence: 4, tick: 13, npcId: 'npc.a', reason: '玩家關係形成交易互惠壓力 66', action: '去碼頭留一手合適的貨或工作機會給熟客' }),
    ])

    expect(projection.getForNpc('npc.a')?.kind).toBe('reciprocity')
    expect(projection.getForNpc('npc.a')?.labelZh).toBe('💰 保留交易機會')
  })
})

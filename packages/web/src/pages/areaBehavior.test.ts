import { describe, expect, it } from 'vitest'
import type { AnimalGroupRow } from '../api/client'
import type { EventSummary, NpcSummary } from '../state/types'
import { animalBehaviorLabel, npcBehaviorBadge } from './areaBehavior'

function npc(input: Partial<NpcSummary> & Pick<NpcSummary, 'id'>): NpcSummary {
  return Object.assign({
    name: '阿甲',
    role: '旅人',
    location: 't_central',
    relationshipScore: 50,
    lastActedTick: 0,
    internalState: {},
    deceased: false,
  }, input)
}

function interact(mode: string, participants: string[]): EventSummary {
  return {
    sequence: 5,
    tick: 99,
    eventType: 'NPC_INTERACT',
    actorId: participants[0] ?? 'npc.a',
    occurredAt: '2026-06-26T00:00:00.000Z',
    payload: { tile: 't_central', mode, participants },
    narration: null,
  }
}

function relationshipAction(npcId: string, reason: string, action: string): EventSummary {
  return {
    sequence: 9,
    tick: 102,
    eventType: 'NPC_FREEFORM_ACTION_PROPOSED',
    actorId: npcId,
    occurredAt: '2026-06-26T00:00:00.000Z',
    payload: { npcId, proposal: { reason, action, utterance: '先別太靠近那個人。' } },
    narration: null,
  }
}

function animal(input: Partial<AnimalGroupRow>): AnimalGroupRow {
  return {
    speciesId: input.speciesId ?? 'forest_deer',
    tileId: input.tileId ?? 't_forest',
    biomeRegion: input.biomeRegion ?? 'forest',
    count: input.count ?? 3,
    animalIds: input.animalIds ?? ['a1', 'a2', 'a3'],
    intent: input.intent ?? 'foraging',
    thoughtZh: input.thoughtZh ?? 'forest_deer沿著氣味與地形覓食。',
  }
}

describe('areaBehavior', () => {
  it('renders eating NPCs as eating instead of generic intent text', () => {
    expect(npcBehaviorBadge(npc({ id: 'npc.a', activity: 'eat' }), []).primary).toBe('🍚 正在吃飯')
  })

  it('renders arguing NPCs from NPC_INTERACT evidence as arguing', () => {
    expect(npcBehaviorBadge(npc({ id: 'npc.a', activity: 'idle' }), [interact('argue', ['npc.a', 'npc.b'])]).primary).toBe('💢 正在爭執')
  })

  it('renders relationship caution freeform actions as visible NPC badges', () => {
    const badge = npcBehaviorBadge(npc({ id: 'npc.a', activity: 'idle' }), [
      relationshipAction('npc.a', '玩家關係形成戒備壓力 76；讓附近同伴提高警覺。', '在中央提醒熟人別太靠近讓自己戒備的玩家'),
    ])

    expect(badge.primary).toBe('⚠️ 戒備玩家')
    expect(badge.detail).toContain('提高警覺')
    expect(badge.tone).toBe('danger')
  })

  it('renders relationship affinity and reciprocity freeform actions as visible NPC badges', () => {
    expect(npcBehaviorBadge(npc({ id: 'npc.a', activity: 'idle' }), [
      relationshipAction('npc.a', '玩家關係累積親近壓力 61；維持親近感。', '主動在中央找信任的玩家聊一下近況'),
    ]).primary).toBe('🤝 想找玩家聊天')

    expect(npcBehaviorBadge(npc({ id: 'npc.a', activity: 'idle' }), [
      relationshipAction('npc.a', '玩家關係形成交易互惠壓力 66；把重複交易累積成可回報的交易互惠。', '去碼頭留一手合適的貨或工作機會給熟客'),
    ]).primary).toBe('💰 保留交易機會')
  })

  it('renders animal ecology intent as concrete animal behavior', () => {
    expect(animalBehaviorLabel(animal({ intent: 'foraging' })).primary).toBe('覓食中')
    expect(animalBehaviorLabel(animal({ intent: 'hunting', speciesId: 'fog_wolf' })).primary).toBe('狩獵中')
    expect(animalBehaviorLabel(animal({ intent: 'migrating' })).primary).toBe('遷徙中')
  })
})

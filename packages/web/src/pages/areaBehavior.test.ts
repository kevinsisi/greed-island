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

  it('renders animal ecology intent as concrete animal behavior', () => {
    expect(animalBehaviorLabel(animal({ intent: 'foraging' })).primary).toBe('覓食中')
    expect(animalBehaviorLabel(animal({ intent: 'hunting', speciesId: 'fog_wolf' })).primary).toBe('狩獵中')
    expect(animalBehaviorLabel(animal({ intent: 'migrating' })).primary).toBe('遷徙中')
  })
})

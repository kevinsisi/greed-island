import { describe, expect, it } from 'vitest'
import type { Event } from '../kernel/types.js'
import { PlayerNpcRelationshipProjection, formatPlayerRelationshipContext } from './playerNpcRelationshipProjection.js'

function ev(tick: number, data: unknown): Event {
  return {
    eventId: `ev-${tick}`,
    eventType: 'PLAYER_NPC_DIALOGUE',
    actorId: 'player-1',
    occurredAt: tick,
    deterministicKey: `player-dialogue-${tick}`,
    version: 1,
    sequence: tick,
    tick,
    payload: { data },
  } as Event
}

describe('PlayerNpcRelationshipProjection', () => {
  it('rebuilds long-term player relationship arcs from PLAYER_NPC_DIALOGUE events', () => {
    const projection = new PlayerNpcRelationshipProjection()

    projection.rebuildFromEvents([
      ev(10, {
        playerAccountId: '7',
        npcId: 'npc-a',
        intent: 'greet',
        playerMessage: '今天也辛苦了。',
        trustDelta: 1,
        trustAfter: 51,
        interactionCount: 1,
      }),
      ev(20, {
        playerAccountId: '7',
        npcId: 'npc-a',
        intent: 'ask',
        playerMessage: '你這個沒用的傢伙。',
        trustDelta: -5,
        trustAfter: 46,
        interactionCount: 2,
      }),
    ])

    expect(projection.read('7', 'npc-a')).toMatchObject({
      playerAccountId: '7',
      npcId: 'npc-a',
      trust: 46,
      resentment: 54,
      affinity: 0,
      familiarity: 2,
      interactionCount: 2,
      positiveInteractionCount: 1,
      negativeInteractionCount: 1,
      tradeInteractionCount: 0,
      lastIntent: 'ask',
      lastPlayerMessage: '你這個沒用的傢伙。',
      lastTick: 20,
    })
    expect(formatPlayerRelationshipContext(projection.read('7', 'npc-a'))).toContain('信任 46')
    expect(formatPlayerRelationshipContext(projection.read('7', 'npc-a'))).toContain('怨懟 54')
  })

  it('summarizes hostile player relationships as planner bias for an NPC', () => {
    const projection = new PlayerNpcRelationshipProjection()
    projection.rebuildFromEvents([
      ev(10, { playerAccountId: 'kind', npcId: 'npc-a', intent: 'greet', playerMessage: '謝謝', trustDelta: 2, trustAfter: 74, interactionCount: 3 }),
      ev(20, { playerAccountId: 'hostile', npcId: 'npc-a', intent: 'ask', playerMessage: '滾開', trustDelta: -12, trustAfter: 18, interactionCount: 5 }),
    ])

    expect(projection.plannerBiasForNpc('npc-a')).toEqual({
      maxResentment: 60,
      minTrust: 18,
      maxTrust: 74,
      maxAffinity: 5,
      maxFamiliarity: 1,
      interactionCount: 8,
      positiveInteractionCount: 1,
      negativeInteractionCount: 1,
      tradeInteractionCount: 0,
    })
  })

  it('ignores malformed or unrelated events', () => {
    const projection = new PlayerNpcRelationshipProjection()
    projection.apply({ ...ev(1, { npcId: 'npc-a' }), eventType: 'WORLD_TICK' } as Event)
    projection.apply(ev(2, { playerAccountId: '', npcId: 'npc-a', trustAfter: 50 }))
    expect(projection.read('7', 'npc-a')).toBeNull()
    expect(projection.plannerBiasForNpc('npc-a')).toBeUndefined()
  })
})

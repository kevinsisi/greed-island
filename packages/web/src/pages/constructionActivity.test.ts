import { describe, expect, it } from 'vitest'
import { constructionActivitiesFor } from './constructionActivity'
import type { EventSummary, NpcSummary } from '../state/types'

function event(payload: EventSummary['payload'], sequence = 10): EventSummary {
  return {
    sequence,
    tick: sequence,
    eventType: 'CONSTRUCTION_PROJECT_PROGRESS',
    actorId: 'system',
    occurredAt: new Date(0).toISOString(),
    payload,
    narration: null
  }
}

function npc(id: string, name = id): NpcSummary {
  return {
    id,
    name,
    role: 'Builder',
    location: 't_dock',
    relationshipScore: 50,
    lastActedTick: 0,
    internalState: {}
  }
}

describe('construction activity projection', () => {
  it('shows the latest unfinished construction crew on locked expansion districts', () => {
    const activities = constructionActivitiesFor(
      [
        event({ targetTileId: 't_salt_marsh', progressAfter: 4, targetProgress: 12, npcId: 'npc.b' }, 19),
        event({ targetTileId: 't_salt_marsh', progressAfter: 7, targetProgress: 12, npcId: 'npc.a' }, 20)
      ],
      [npc('npc.a', '阿潮'), npc('npc.b', '小沼')]
    )

    expect(activities).toEqual([
      { districtId: 't_salt_marsh', progressAfter: 7, targetProgress: 12, builderNames: ['阿潮', '小沼'] }
    ])
  })

  it('hides construction crew once the latest progress completed the project', () => {
    const activities = constructionActivitiesFor(
      [
        event({ targetTileId: 't_salt_marsh', progressAfter: 12, targetProgress: 12, npcId: 'npc.a' }, 20),
        event({ targetTileId: 't_salt_marsh', progressAfter: 7, targetProgress: 12, npcId: 'npc.b' }, 19)
      ],
      [npc('npc.a', '阿潮'), npc('npc.b', '小沼')]
    )

    expect(activities).toEqual([])
  })
})

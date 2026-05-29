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
    internalState: {},
    deceased: false
  }
}

describe('construction activity projection', () => {
  it('shows the latest unfinished construction crew on districts', () => {
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

  it('shows NPC-initiated in-progress construction projects', () => {
    const activities = constructionActivitiesFor(
      [],
      [npc('central.builder', '築仔')],
      [{
        projectId: 'project.civ-evo.test',
        targetTileId: 't_central',
        buildingId: 'b_civ_evo_t_central',
        progress: 3,
        targetProgress: 24,
        completedAtTick: null,
        initiatedByNpcId: 'central.builder'
      }]
    )

    expect(activities).toEqual([
      {
        districtId: 't_central',
        buildingId: 'b_civ_evo_t_central',
        initiatedByNpcId: 'central.builder',
        progressAfter: 3,
        targetProgress: 24,
        builderNames: ['築仔']
      }
    ])
  })

  it('lets authoritative project state suppress stale event progress', () => {
    const activities = constructionActivitiesFor(
      [event({ targetTileId: 't_salt_marsh', progressAfter: 7, targetProgress: 12, npcId: 'npc.a' }, 19)],
      [npc('npc.a', '阿潮')],
      [{
        projectId: 'project.civ-evo.done',
        targetTileId: 't_salt_marsh',
        buildingId: 'b_civ_evo_t_salt_marsh',
        progress: 12,
        targetProgress: 12,
        completedAtTick: 20,
        initiatedByNpcId: 'npc.a'
      }]
    )

    expect(activities).toEqual([])
  })

  it('reads construction progress from rule-engine payload.data events', () => {
    const activities = constructionActivitiesFor(
      [event({
        actorType: 'npc',
        data: {
          targetTileId: 't_dimai',
          progressAfter: 9,
          targetProgress: 24,
          npcId: 'mountain.miner.lei_zi'
        }
      }, 21)],
      [npc('mountain.miner.lei_zi', '雷子')]
    )

    expect(activities).toEqual([
      { districtId: 't_dimai', progressAfter: 9, targetProgress: 24, builderNames: ['雷子'] }
    ])
  })
})

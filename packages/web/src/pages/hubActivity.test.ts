import { describe, expect, it } from 'vitest'
import { buildHubActivitySummaries } from './hubActivity'
import type { EventSummary } from '../state/types'

function event(input: Partial<EventSummary>): EventSummary {
  return {
    sequence: 1,
    tick: 100,
    eventType: 'NPC_PRODUCTIVE_ACTION',
    actorId: 'npc-a',
    occurredAt: new Date(0).toISOString(),
    payload: { tile: 't_temple' },
    narration: '有人在霓港區補正帳冊。',
    ...input,
  }
}

describe('hubActivity.buildHubActivitySummaries', () => {
  it('derives work activity by district from narrated events', () => {
    const summaries = buildHubActivitySummaries([event({ payload: { tile: 't_temple' } })])

    expect(summaries).toEqual([
      {
        districtId: 't_temple',
        count: 1,
        latestTick: 100,
        latestNarration: '有人在霓港區補正帳冊。',
        kinds: ['work'],
      },
    ])
  })

  it('aggregates multiple activity kinds on the same district', () => {
    const summaries = buildHubActivitySummaries([
      event({ sequence: 2, tick: 101, eventType: 'ANIMAL_ATTACKED_NPC', payload: { tileId: 't_forest' }, narration: '獸群衝進潮見丘。' }),
      event({ sequence: 1, tick: 100, eventType: 'NPC_PRODUCTIVE_ACTION', payload: { tile: 't_forest' }, narration: '樵夫修補潮見丘的木棚。' }),
    ])

    expect(summaries).toHaveLength(1)
    expect(summaries[0]!.districtId).toBe('t_forest')
    expect(summaries[0]!.count).toBe(2)
    expect(summaries[0]!.latestTick).toBe(101)
    expect(summaries[0]!.latestNarration).toBe('獸群衝進潮見丘。')
    expect(summaries[0]!.kinds).toEqual(['danger', 'work'])
  })

  it('supports wrapped payload data and region scopes', () => {
    const summaries = buildHubActivitySummaries([
      event({
        eventType: 'WORLD_EVENT_SPAWN',
        payload: { scope: 'region:t_dock,t_ruin', data: { pressure: 1 } },
        narration: '一陣潮霧壓向碼頭與鏽灣。',
      }),
    ])

    expect(summaries.map((s) => s.districtId)).toEqual(['t_dock', 't_ruin'])
    expect(summaries.every((s) => s.kinds.includes('pressure'))).toBe(true)
  })

  it('keeps non-narrated movement as spatial life pings', () => {
    const summaries = buildHubActivitySummaries([
      event({ eventType: 'BUILDING_ENTER', payload: { tileId: 't_central', buildingId: 'b1' }, narration: null }),
    ])

    expect(summaries).toHaveLength(1)
    expect(summaries[0]!.districtId).toBe('t_central')
    expect(summaries[0]!.kinds).toEqual(['movement'])
  })

  it('filters routine, raw-id, stale, and non-district events', () => {
    const summaries = buildHubActivitySummaries([
      event({ tick: 100, eventType: 'GOODS_TRANSPORT_ARRIVED', payload: { tileId: 't_dock' }, narration: '魚貨到了。' }),
      event({ tick: 99, eventType: 'ANIMAL_ATTACKED_NPC', payload: { tileId: 't_dimai' }, narration: 'iron_hound攻擊了temple.cleric.sela。' }),
      event({ tick: 40, eventType: 'NPC_PRODUCTIVE_ACTION', payload: { tile: 't_temple' }, narration: '有人工作。' }),
      event({ tick: 100, eventType: 'NPC_PRODUCTIVE_ACTION', payload: { tile: 't_road' }, narration: '街道上有人工作。' }),
    ])

    expect(summaries).toEqual([])
  })
})

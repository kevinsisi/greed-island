import { describe, expect, it } from 'vitest'
import type { EventSummary } from '../state/types'
import { eventMotivationFor, eventNarrationFor } from './TimelinePage'

describe('Timeline event motivation', () => {
  it('uses authoritative motivation when present', () => {
    const motivation = eventMotivationFor(event('CONSTRUCTION_PROJECT_PROGRESS', {
      motivation: {
        explanation: '住房壓力升高，所以城市需要新的外環據點。',
        projectPurpose: '分散住房與安全壓力。'
      }
    }))

    expect(motivation?.explanation).toContain('住房壓力')
    expect(motivation?.projectPurpose).toContain('安全壓力')
  })

  it('falls back for existing salt-marsh events without motivation payloads', () => {
    const motivation = eventMotivationFor(event('CONSTRUCTION_PROJECT_PROGRESS', { projectId: 'project.salt_marsh_settlement' }))

    expect(motivation?.explanation).toContain('鹽沼外環')
    expect(motivation?.projectPurpose).toContain('補給')
  })

  it('explains common non-construction public events', () => {
    expect(eventMotivationFor(event('NPC_PRODUCTIVE_ACTION', { domain: 'trade', metric: 'supply' }))?.explanation).toContain('交易')
    expect(eventMotivationFor(event('NPC_FREEFORM_ACTION_PROPOSED', { accepted: true, resolved: { kind: 'work' } }))?.explanation).toContain('NPC AI agent')
    expect(eventMotivationFor(event('NPC_INTERACT', { mode: 'argue' }))?.explanation).toContain('爭執')
    expect(eventMotivationFor(event('NPC_DEFENSE_PARTY_FORMED', { memberNpcIds: ['npc.a', 'npc.b'] }))?.explanation).toContain('保護同伴')
    expect(eventMotivationFor(event('AREA_PRESSURE', { kind: 'resource.low' }))?.explanation).toContain('資源')
    expect(eventMotivationFor(event('CARD_DROP_SPAWN', {}))?.explanation).toContain('紋卡')
  })

  it('does not expose internal agenda payload motivation for productive actions', () => {
    const motivation = eventMotivationFor(event('NPC_PRODUCTIVE_ACTION', {
      domain: 'service',
      metric: 'safety',
      motivation: {
        explanation: '島嶼主宰的暗流對潮見丘的上位指令是「利用存世上限歸零的舊卡被釋出市場」；個人最高壓力是住房 66，因此這次公共服務不是隨機善行，而是對制度壓力的角色回應。',
        projectPurpose: '安全 / 秩序；上位指令 agenda.t_dock.event.we_card.release.cap_zero_92484.3089'
      }
    }))

    expect(motivation?.explanation).toBe('NPC 用巡查、照護或公共服務維持街區秩序，避免區域壓力失控。')
    expect(motivation?.projectPurpose).toBe('安全 / 秩序')
  })

  it('drops unsafe authoritative motivation text instead of showing debug ids', () => {
    const motivation = eventMotivationFor(event('UNKNOWN_PUBLIC_EVENT', {
      motivation: {
        explanation: '上位指令 agenda.t_dock.event.we_card.release.cap_zero_92484.3089'
      }
    }))

    expect(motivation).toBeNull()
  })

  it('renders defense party events without raw npc id lists', () => {
    const narration = eventNarrationFor(event('NPC_DEFENSE_PARTY_FORMED', {
      tileId: 't_desert',
      targetSpeciesId: 'mirage_hawk',
      victimNpcId: 'desert.camelkeeper.tuo_yin',
      memberNpcIds: [
        'desert.camelkeeper.tuo_yin',
        'desert.guide.sha_jiao',
        'household.desert.camelkeeper.tuo_yin.desert.cardreader.zhuang_ling.child.1',
      ],
    }))

    expect(narration).toBe('3位居民在t_desert臨時結隊，保護受襲者並追擊mirage_hawk。')
    expect(narration).not.toContain('desert.camelkeeper')
    expect(narration).not.toContain('household.')
  })

  it('renders defense hunt follow-up events without member ids', () => {
    const narration = eventNarrationFor(event('ANIMAL_HUNT_STARTED', {
      huntId: 'hunt.defense.party-1',
      targetSpeciesId: 'mirage_hawk',
    }))

    expect(narration).toBe('居民防禦隊開始追擊mirage_hawk。')
  })
})

function event(eventType: string, payload: Record<string, unknown>): EventSummary {
  return {
    sequence: 1,
    tick: 1,
    eventType,
    actorId: 'npc.a',
    occurredAt: new Date(0).toISOString(),
    payload,
    narration: 'progress'
  }
}

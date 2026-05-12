import { describe, expect, it } from 'vitest'
import type { EventSummary } from '../state/types'
import { eventMotivationFor } from './TimelinePage'

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
    expect(eventMotivationFor(event('NPC_INTERACT', { mode: 'argue' }))?.explanation).toContain('爭執')
    expect(eventMotivationFor(event('AREA_PRESSURE', { kind: 'resource.low' }))?.explanation).toContain('資源')
    expect(eventMotivationFor(event('CARD_DROP_SPAWN', {}))?.explanation).toContain('紋卡')
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

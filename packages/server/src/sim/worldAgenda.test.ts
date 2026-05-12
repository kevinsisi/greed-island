import { describe, expect, it } from 'vitest'
import { deriveWorldAgendaDirective, roleInterpretationZh } from './worldAgenda.js'
import type { AreaState } from './areaStateEngine.js'

describe('world agenda directives', () => {
  it('derives a top-down directive from the preferred tile pressure', () => {
    const directive = deriveWorldAgendaDirective({
      tick: 90,
      preferredTileId: 't_market',
      activeEvents: [],
      areas: [
        area('t_market', { food: 80, safety: 28, economy: 70 }),
        area('t_dock', { food: 20, safety: 90, economy: 90 })
      ]
    })

    expect(directive.scopeTileId).toBe('t_market')
    expect(directive.sponsorZh).toBe('潮鳴市治安局')
    expect(directive.directiveZh).toContain('衝突')
    expect(directive.rationaleZh).toContain('安全值')
  })

  it('lets active world events become hidden-overseer directives', () => {
    const directive = deriveWorldAgendaDirective({
      tick: 120,
      preferredTileId: 't_market',
      areas: [area('t_market', { food: 70, safety: 70, economy: 70 })],
      activeEvents: [{
        id: 'we.test',
        templateId: 'test',
        type: 'city',
        scope: { kind: 'world' },
        startedAtTick: 100,
        endsAtTick: 140,
        text: { zh: '交易所外排起長龍', en: 'A line forms outside the exchange.' },
        payload: {}
      }]
    })

    expect(directive.sponsorKind).toBe('hidden_overseer')
    expect(directive.sponsorZh).toContain('主宰')
    expect(directive.directiveZh).toContain('交易所外排起長龍')
  })

  it('has role-specific interpretations of the same directive', () => {
    const directive = deriveWorldAgendaDirective({
      tick: 90,
      preferredTileId: 't_market',
      activeEvents: [],
      areas: [area('t_market', { food: 80, safety: 80, economy: 20 })]
    })

    expect(roleInterpretationZh('巡衛 guard', directive)).toContain('巡邏')
    expect(roleInterpretationZh('商人 vendor', directive)).toContain('貨源')
    expect(roleInterpretationZh('工匠 smith', directive)).toContain('工程')
  })
})

function area(tileId: string, resources: AreaState['resources']): AreaState {
  return {
    tileId,
    factionControl: { tide_hunters: 15, free_runners: 5, guild: 15, civilian: 30 },
    dominantFaction: null,
    resources,
    lastUpdatedTick: 0,
    recentEvents: [],
    pressureCooldowns: {}
  }
}

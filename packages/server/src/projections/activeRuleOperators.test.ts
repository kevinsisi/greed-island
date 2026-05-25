import { describe, expect, it } from 'vitest'
import { ActiveRuleOperatorsProjection } from './activeRuleOperators.js'
import type { Event } from '../kernel/types.js'

function makeEvent(
  eventType: string,
  data: Record<string, unknown>,
  sequence = 1
): Event {
  return {
    id: `evt-${sequence}`,
    sequence,
    eventType,
    tick: 100,
    payload: { data },
    createdAt: new Date().toISOString(),
  } as unknown as Event
}

function makeActivation(overrides: Partial<{
  activationId: string
  cardId: string
  playerId: string
  scope: string
  scopeId: string
  effectKind: string
  effectValue: number
  activatedAtTick: number
  expiresAtTick: number
}> = {}, sequence = 1): Event {
  return makeEvent('CARD_RULE_OPERATOR_ACTIVATED', {
    activationId: overrides.activationId ?? 'rule.11.player1.100',
    cardId: overrides.cardId ?? '11',
    playerId: overrides.playerId ?? 'player1',
    scope: overrides.scope ?? 'goods',
    scopeId: overrides.scopeId ?? 'fish',
    effectKind: overrides.effectKind ?? 'multiply_price',
    effectValue: overrides.effectValue ?? 0.7,
    activatedAtTick: overrides.activatedAtTick ?? 100,
    expiresAtTick: overrides.expiresAtTick ?? 244,
    narration: 'test',
  }, sequence)
}

describe('ActiveRuleOperatorsProjection', () => {
  it('starts empty', () => {
    const proj = new ActiveRuleOperatorsProjection()
    expect(proj.list()).toHaveLength(0)
    expect(proj.getPriceMultiplier('fish')).toBe(1)
    expect(proj.getProductionMultiplier('brine')).toBe(1)
  })

  it('records an activated operator', () => {
    const proj = new ActiveRuleOperatorsProjection()
    proj.project(makeActivation())
    expect(proj.list()).toHaveLength(1)
    expect(proj.list()[0]?.scopeId).toBe('fish')
  })

  it('removes operator on CARD_RULE_OPERATOR_EXPIRED', () => {
    const proj = new ActiveRuleOperatorsProjection()
    proj.project(makeActivation({}, 1))
    proj.project(makeEvent('CARD_RULE_OPERATOR_EXPIRED', {
      activationId: 'rule.11.player1.100',
      cardId: '11',
      playerId: 'player1',
      expiredAtTick: 244,
      narration: 'expired',
    }, 2))
    expect(proj.list()).toHaveLength(0)
  })

  it('getPriceMultiplier returns product of matching operators', () => {
    const proj = new ActiveRuleOperatorsProjection()
    proj.project(makeActivation({ activationId: 'a', effectValue: 0.7, effectKind: 'multiply_price', scopeId: 'fish' }, 1))
    proj.project(makeActivation({ activationId: 'b', effectValue: 1.2, effectKind: 'multiply_price', scopeId: 'fish' }, 2))
    expect(proj.getPriceMultiplier('fish')).toBeCloseTo(0.84)
    expect(proj.getPriceMultiplier('meat')).toBe(1)
  })

  it('getProductionMultiplier returns product of matching operators', () => {
    const proj = new ActiveRuleOperatorsProjection()
    proj.project(makeActivation({
      activationId: 'c',
      effectKind: 'multiply_production',
      scopeId: 'brine',
      effectValue: 1.5,
    }, 1))
    expect(proj.getProductionMultiplier('brine')).toBe(1.5)
    expect(proj.getProductionMultiplier('fish')).toBe(1)
  })

  it('multiply_price does not affect getProductionMultiplier', () => {
    const proj = new ActiveRuleOperatorsProjection()
    proj.project(makeActivation({ effectKind: 'multiply_price', scopeId: 'fish', effectValue: 0.5 }))
    expect(proj.getProductionMultiplier('fish')).toBe(1)
  })

  it('getExpiredIds returns ids where expiresAtTick <= currentTick', () => {
    const proj = new ActiveRuleOperatorsProjection()
    proj.project(makeActivation({ activationId: 'exp1', expiresAtTick: 200 }, 1))
    proj.project(makeActivation({ activationId: 'exp2', expiresAtTick: 300 }, 2))
    expect(proj.getExpiredIds(200)).toContain('exp1')
    expect(proj.getExpiredIds(200)).not.toContain('exp2')
    expect(proj.getExpiredIds(300)).toContain('exp1')
    expect(proj.getExpiredIds(300)).toContain('exp2')
  })

  it('ignores events with missing activationId', () => {
    const proj = new ActiveRuleOperatorsProjection()
    proj.project(makeEvent('CARD_RULE_OPERATOR_ACTIVATED', {
      cardId: '11',
      playerId: 'player1',
      effectKind: 'multiply_price',
      effectValue: 0.7,
      activatedAtTick: 100,
      expiresAtTick: 200,
      narration: '',
    }))
    expect(proj.list()).toHaveLength(0)
  })

  it('ignores unrelated events', () => {
    const proj = new ActiveRuleOperatorsProjection()
    proj.project(makeEvent('GOODS_CONSUMED', { activationId: 'x' }))
    expect(proj.list()).toHaveLength(0)
  })

  it('rebuildFromEvents resets then replays', () => {
    const proj = new ActiveRuleOperatorsProjection()
    proj.project(makeActivation({ activationId: 'old' }, 1))
    proj.rebuildFromEvents([
      makeActivation({ activationId: 'new', scopeId: 'brine', effectKind: 'multiply_production', effectValue: 1.5 }, 2),
    ])
    expect(proj.list()).toHaveLength(1)
    expect(proj.list()[0]?.activationId).toBe('new')
    expect(proj.getProductionMultiplier('brine')).toBe(1.5)
  })
})

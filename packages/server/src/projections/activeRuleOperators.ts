import type { Event } from '../kernel/types.js'

export type RuleOperatorRecord = Readonly<{
  activationId: string
  cardId: string
  playerId: string
  scope: string
  scopeId: string
  effectKind: string
  effectValue: number
  activatedAtTick: number
  expiresAtTick: number
}>

export const ACTIVE_RULE_OPERATORS_BOOT_EVENT_TYPES = [
  'CARD_RULE_OPERATOR_ACTIVATED',
  'CARD_RULE_OPERATOR_EXPIRED',
] as const

function readData(event: Event): Record<string, unknown> | null {
  const payload = (event.payload as { data?: unknown } | null)?.data
  if (!payload || typeof payload !== 'object') return null
  return payload as Record<string, unknown>
}

function readString(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

export class ActiveRuleOperatorsProjection {
  private operators = new Map<string, RuleOperatorRecord>()

  project(event: Event): void {
    const data = readData(event)
    if (!data) return

    switch (event.eventType) {
      case 'CARD_RULE_OPERATOR_ACTIVATED': {
        const activationId = readString(data.activationId)
        const cardId = readString(data.cardId)
        const playerId = readString(data.playerId)
        const scope = readString(data.scope)
        const scopeId = readString(data.scopeId)
        const effectKind = readString(data.effectKind)
        const effectValue = typeof data.effectValue === 'number' ? data.effectValue : 1
        const activatedAtTick = typeof data.activatedAtTick === 'number' ? data.activatedAtTick : 0
        const expiresAtTick = typeof data.expiresAtTick === 'number' ? data.expiresAtTick : 0
        if (!activationId || !cardId || !effectKind) return
        this.operators.set(activationId, {
          activationId,
          cardId,
          playerId,
          scope,
          scopeId,
          effectKind,
          effectValue,
          activatedAtTick,
          expiresAtTick,
        })
        break
      }
      case 'CARD_RULE_OPERATOR_EXPIRED': {
        const activationId = readString(data.activationId)
        if (activationId) this.operators.delete(activationId)
        break
      }
    }
  }

  /** Returns all currently active operators (caller should filter by tick < expiresAtTick). */
  list(): readonly RuleOperatorRecord[] {
    return [...this.operators.values()]
  }

  /** Returns activation IDs of operators whose expiresAtTick <= currentTick. */
  getExpiredIds(currentTick: number): readonly string[] {
    const expired: string[] = []
    for (const op of this.operators.values()) {
      if (currentTick >= op.expiresAtTick) expired.push(op.activationId)
    }
    return expired
  }

  /** Multiplier product for 'multiply_price' operators matching the given goodsId. */
  getPriceMultiplier(goodsId: string): number {
    let result = 1
    for (const op of this.operators.values()) {
      if (op.effectKind === 'multiply_price' && op.scope === 'goods' && op.scopeId === goodsId) {
        result *= op.effectValue
      }
    }
    return result
  }

  /** Multiplier product for 'multiply_production' operators matching the given goodsId. */
  getProductionMultiplier(goodsId: string): number {
    let result = 1
    for (const op of this.operators.values()) {
      if (op.effectKind === 'multiply_production' && op.scope === 'goods' && op.scopeId === goodsId) {
        result *= op.effectValue
      }
    }
    return result
  }

  rebuildFromEvents(events: readonly Event[]): void {
    this.operators.clear()
    for (const ev of events) this.project(ev)
  }
}

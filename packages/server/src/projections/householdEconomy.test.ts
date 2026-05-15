import { describe, expect, it } from 'vitest'
import type { Event } from '../kernel/types.js'
import { HouseholdEconomyProjection } from './householdEconomy.js'

describe('HouseholdEconomyProjection', () => {
  it('accumulates contributions, spending, and inheritance without negative balances', () => {
    const projection = new HouseholdEconomyProjection()
    projection.rebuildFromEvents([
      contributionEvent(1, 'npc-a', 10, 'income-a'),
      contributionEvent(2, 'npc-b', 5, 'income-b'),
      spendEvent(3, 20, 'spend-a'),
      inheritanceEvent(4, 7),
    ])

    expect(projection.getByHouseholdId('household-a')).toMatchObject({
      householdId: 'household-a',
      contributedTotal: 15,
      spentTotal: 15,
      inheritedTotal: 7,
      balance: 7,
      contributorNpcIds: ['npc-a', 'npc-b'],
      lastSequence: 4,
    })
  })

  it('ignores duplicate source events during rebuild', () => {
    const projection = new HouseholdEconomyProjection()
    projection.rebuildFromEvents([
      contributionEvent(1, 'npc-a', 10, 'income-a'),
      contributionEvent(2, 'npc-a', 10, 'income-a'),
    ])

    expect(projection.getByHouseholdId('household-a')?.balance).toBe(10)
  })

  it('rebuilds to an identical canonical hash', () => {
    const events = [contributionEvent(1, 'npc-a', 10, 'income-a'), spendEvent(2, 4, 'spend-a')]
    const a = new HouseholdEconomyProjection()
    const b = new HouseholdEconomyProjection()
    a.rebuildFromEvents(events)
    b.rebuildFromEvents([...events].reverse())
    expect(a.canonicalHash()).toBe(b.canonicalHash())
  })
})

function contributionEvent(sequence: number, npcId: string, amount: number, sourceId: string): Event {
  return baseEvent(sequence, 'HOUSEHOLD_GOLD_CONTRIBUTED', {
    householdId: 'household-a',
    npcId,
    amount,
    sourceEventType: 'NPC_PRODUCTIVE_ACTION',
    sourceId,
    tileId: 't_market',
    contributedAtTick: sequence,
    narration: 'household gold contributed',
  })
}

function spendEvent(sequence: number, amount: number, sourceId: string): Event {
  return baseEvent(sequence, 'HOUSEHOLD_GOLD_SPENT', {
    householdId: 'household-a',
    npcId: 'npc-a',
    amount,
    purpose: 'construction',
    sourceId,
    tileId: 't_market',
    spentAtTick: sequence,
    narration: 'household gold spent',
  })
}

function inheritanceEvent(sequence: number, amount: number): Event {
  return baseEvent(sequence, 'HOUSEHOLD_INHERITANCE_ASSIGNED', {
    householdId: 'household-a',
    deceasedNpcId: 'npc-a',
    heirId: 'npc-b',
    amount,
    assignedAtTick: sequence,
    narration: 'household inheritance assigned',
  })
}

function baseEvent(sequence: number, eventType: string, data: Record<string, unknown>): Event {
  return {
    sequence,
    eventId: `event-${sequence}`,
    eventType,
    occurredAt: 0,
    actorId: String(data.npcId ?? data.householdId),
    payload: {
      actorType: 'npc',
      data,
      narration: data.narration,
    },
    deterministicKey: `key-${sequence}`,
    version: 1,
    tick: sequence,
  }
}

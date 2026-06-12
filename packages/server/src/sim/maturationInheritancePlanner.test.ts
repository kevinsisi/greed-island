import { describe, expect, it } from 'vitest'
import { planMaturationInheritance } from './maturationInheritancePlanner.js'
import type { MaturationIntent } from './maturationPlanner.js'
import type { NpcCivicRecord } from './cityLife.js'

const CONFIG = { goldFraction: 0.25, skillFraction: 0.1 }

function intent(overrides: Partial<MaturationIntent> = {}): MaturationIntent {
  return {
    npcId: 'npc.child.1',
    bornAtTick: 0,
    householdId: 'hh.1',
    parentNpcIds: ['p1', 'p2'],
    homeTileId: 't_central',
    nameZh: '潮安',
    nameEn: 'Tidecalm',
    ...overrides,
  }
}

function record(npcId: string, gold: number, skillXp: Partial<NpcCivicRecord['skillXp']> = {}): NpcCivicRecord {
  return {
    npcId,
    gold,
    skillXp: { construction: 0, knowledge: 0, commerce: 0, civic: 0, ...skillXp },
    lastProductiveTick: null,
  }
}

describe('planMaturationInheritance', () => {
  it('computes mean-based seed from two parents with civic records', () => {
    const grant = planMaturationInheritance({
      maturationIntent: intent(),
      civicRecords: {
        p1: record('p1', 80, { construction: 50, knowledge: 30, commerce: 20, civic: 10 }),
        p2: record('p2', 40, { construction: 10, knowledge: 70, commerce: 0, civic: 30 }),
      },
      tick: 17280,
      config: CONFIG,
    })

    expect(grant).toEqual({
      npcId: 'npc.child.1',
      parentNpcIds: ['p1', 'p2'],
      householdId: 'hh.1',
      gold: 15,
      skillXp: { construction: 3, knowledge: 5, commerce: 1, civic: 2 },
      grantedAtTick: 17280,
    })
  })

  it('returns null when both parents lack civic records', () => {
    const grant = planMaturationInheritance({
      maturationIntent: intent(),
      civicRecords: {},
      tick: 100,
      config: CONFIG,
    })
    expect(grant).toBeNull()
  })

  it('treats a deceased parent last-known record identically to an alive one', () => {
    const grant = planMaturationInheritance({
      maturationIntent: intent({ parentNpcIds: ['alive', 'dead'] }),
      civicRecords: {
        alive: record('alive', 100),
        dead: record('dead', 60),
      },
      tick: 100,
      config: CONFIG,
    })
    expect(grant?.gold).toBe(20) // mean 80 × 0.25
  })

  it('returns null when all means floor to zero', () => {
    const grant = planMaturationInheritance({
      maturationIntent: intent(),
      civicRecords: { p1: record('p1', 0), p2: record('p2', 0) },
      tick: 100,
      config: CONFIG,
    })
    expect(grant).toBeNull()
  })

  it('uses only parents with records in the mean (single-record parent)', () => {
    const grant = planMaturationInheritance({
      maturationIntent: intent(),
      civicRecords: { p1: record('p1', 40) },
      tick: 100,
      config: CONFIG,
    })
    expect(grant?.gold).toBe(10) // mean of just p1 = 40 × 0.25
  })

  it('is deterministic across repeated invocations with identical input', () => {
    const input = {
      maturationIntent: intent(),
      civicRecords: {
        p1: record('p1', 80, { construction: 50, knowledge: 30, commerce: 20, civic: 10 }),
        p2: record('p2', 40, { construction: 10, knowledge: 70, commerce: 0, civic: 30 }),
      },
      tick: 17280,
      config: CONFIG,
    }
    const first = JSON.stringify(planMaturationInheritance(input))
    for (let i = 0; i < 1000; i += 1) {
      expect(JSON.stringify(planMaturationInheritance(input))).toBe(first)
    }
  })
})

import { describe, expect, it } from 'vitest'
import { planHouseholdJointDecisions } from './householdJointDecisionPlanner.js'
import { NpcLineageProjection } from '../projections/npcLineage.js'
import { NpcMortalityProjection } from '../projections/npcMortality.js'
import { HouseholdEconomyProjection } from '../projections/householdEconomy.js'
import type { NpcProfile } from '../npcs/types.js'
import type { Event } from '../kernel/types.js'

function makeProfile(id: string, householdId?: string): NpcProfile {
  return {
    id,
    name: { zh: id, en: id },
    role: { zh: '測試', en: 'test' },
    personality: householdId ? { householdId } : {},
    triggers: [],
    memoryProfile: { consultsEventTypes: [], decayFn: 'linear', decayParam: 1 },
    dailyRoutine: [],
  } as unknown as NpcProfile
}

function makeDeceasedEvent(npcId: string): Event {
  return {
    eventType: 'NPC_DECEASED',
    sequence: 1,
    tick: 1,
    payload: { data: { npcId, reason: 'age', deceasedAtTick: 1 } },
    source: 'test',
    id: `deceased-${npcId}`,
  } as unknown as Event
}

function makeGoldEvent(householdId: string, gold: number): Event {
  return {
    eventType: 'HOUSEHOLD_GOLD_CONTRIBUTED',
    sequence: 2,
    tick: 2,
    payload: { data: { householdId, npcId: householdId, amount: gold, sourceEventType: 'PRODUCTIVE_ACTION', sourceId: 'x', contributedAtTick: 2 } },
    source: 'test',
    id: `gold-${householdId}`,
  } as unknown as Event
}

describe('planHouseholdJointDecisions', () => {
  it('returns empty when no household has ≥2 living co-located members', () => {
    const profiles = [makeProfile('npc.a', 'h1'), makeProfile('npc.b', 'h2')]
    const lineage = new NpcLineageProjection(profiles)
    const result = planHouseholdJointDecisions({
      npcLineage: lineage,
      npcMortality: new NpcMortalityProjection(),
      householdEconomy: new HouseholdEconomyProjection(),
      npcTileMap: new Map([['npc.a', 't_central'], ['npc.b', 't_forest']]),
    })
    expect(result).toHaveLength(0)
  })

  it('returns empty when household members are on different tiles', () => {
    const profiles = [makeProfile('npc.a', 'h1'), makeProfile('npc.b', 'h1')]
    const lineage = new NpcLineageProjection(profiles)
    const result = planHouseholdJointDecisions({
      npcLineage: lineage,
      npcMortality: new NpcMortalityProjection(),
      householdEconomy: new HouseholdEconomyProjection(),
      npcTileMap: new Map([['npc.a', 't_central'], ['npc.b', 't_forest']]),
    })
    expect(result).toHaveLength(0)
  })

  it('emits pool_resources decision when co-located with low balance', () => {
    const profiles = [makeProfile('npc.a', 'h1'), makeProfile('npc.b', 'h1')]
    const lineage = new NpcLineageProjection(profiles)
    const result = planHouseholdJointDecisions({
      npcLineage: lineage,
      npcMortality: new NpcMortalityProjection(),
      householdEconomy: new HouseholdEconomyProjection(),
      npcTileMap: new Map([['npc.a', 't_central'], ['npc.b', 't_central']]),
    })
    expect(result).toHaveLength(1)
    expect(result[0]?.decisionKind).toBe('pool_resources')
    expect(result[0]?.householdId).toBe('h1')
    expect(result[0]?.tileId).toBe('t_central')
    expect(result[0]?.memberNpcIds).toContain('npc.a')
    expect(result[0]?.memberNpcIds).toContain('npc.b')
  })

  it('emits invest_in_settlement when household balance ≥ threshold', () => {
    const profiles = [makeProfile('npc.a', 'h1'), makeProfile('npc.b', 'h1')]
    const lineage = new NpcLineageProjection(profiles)
    const economy = new HouseholdEconomyProjection()
    economy.project(makeGoldEvent('h1', 200))
    const result = planHouseholdJointDecisions({
      npcLineage: lineage,
      npcMortality: new NpcMortalityProjection(),
      householdEconomy: economy,
      npcTileMap: new Map([['npc.a', 't_central'], ['npc.b', 't_central']]),
    })
    expect(result[0]?.decisionKind).toBe('invest_in_settlement')
    expect((result[0]?.goldCommitted ?? 0)).toBeGreaterThan(0)
  })

  it('skips household with only one living member', () => {
    const profiles = [makeProfile('npc.a', 'h1'), makeProfile('npc.b', 'h1')]
    const lineage = new NpcLineageProjection(profiles)
    const mortality = new NpcMortalityProjection()
    mortality.project(makeDeceasedEvent('npc.b'))
    const result = planHouseholdJointDecisions({
      npcLineage: lineage,
      npcMortality: mortality,
      householdEconomy: new HouseholdEconomyProjection(),
      npcTileMap: new Map([['npc.a', 't_central'], ['npc.b', 't_central']]),
    })
    expect(result).toHaveLength(0)
  })

  it('does not emit duplicate decisions for the same household', () => {
    const profiles = [makeProfile('npc.a', 'h1'), makeProfile('npc.b', 'h1')]
    const lineage = new NpcLineageProjection(profiles)
    const result = planHouseholdJointDecisions({
      npcLineage: lineage,
      npcMortality: new NpcMortalityProjection(),
      householdEconomy: new HouseholdEconomyProjection(),
      npcTileMap: new Map([['npc.a', 't_central'], ['npc.b', 't_central']]),
    })
    expect(result).toHaveLength(1)
  })
})

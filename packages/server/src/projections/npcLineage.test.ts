import { describe, expect, it } from 'vitest'
import { NpcLineageProjection } from './npcLineage.js'
import { NpcMortalityProjection } from './npcMortality.js'
import type { NpcProfile } from '../npcs/types.js'
import type { Event } from '../kernel/types.js'

function makeProfile(id: string, householdId?: string): NpcProfile {
  return {
    id,
    name: { zh: id, en: id },
    role: { zh: 'role', en: 'role' },
    defaultLocation: 'hub',
    routine: [],
    triggers: [],
    memory: { consultsEventTypes: [] },
    personality: householdId ? { householdId } : {},
  } as unknown as NpcProfile
}

function makeHeirEvent(householdId: string, deceasedNpcId: string, heirNpcId: string, tick: number, seq = 1): Event {
  return {
    id: `evt-${seq}`,
    eventType: 'NPC_HEIR_ASSIGNED',
    sequence: seq,
    tick,
    createdAt: '2024-01-01T00:00:00Z',
    payload: { actorType: 'system', householdId, deceasedNpcId, heirNpcId, assignedAtTick: tick, narration: '' },
  } as unknown as Event
}

function makeDeceasedEvent(npcId: string, tick: number, seq = 1): Event {
  return {
    id: `evt-d${seq}`,
    eventType: 'NPC_DECEASED',
    sequence: seq,
    tick,
    createdAt: '2024-01-01T00:00:00Z',
    payload: { actorType: 'system', npcId, tileId: 'hub', householdId: npcId, deceasedAtTick: tick, narration: '' },
  } as unknown as Event
}

describe('NpcLineageProjection', () => {
  it('solo NPC has their own household id', () => {
    const lineage = new NpcLineageProjection([makeProfile('npc_solo')])
    expect(lineage.householdId('npc_solo')).toBe('npc_solo')
  })

  it('NPC with householdId in personality gets correct household', () => {
    const lineage = new NpcLineageProjection([
      makeProfile('npc_a', 'h_fisher'),
      makeProfile('npc_b', 'h_fisher'),
    ])
    expect(lineage.householdId('npc_a')).toBe('h_fisher')
    expect(lineage.householdId('npc_b')).toBe('h_fisher')
    expect(lineage.membersOf('h_fisher')).toHaveLength(2)
  })

  it('membersOf returns empty for unknown household', () => {
    const lineage = new NpcLineageProjection([makeProfile('npc_x')])
    expect(lineage.membersOf('h_unknown')).toHaveLength(0)
  })

  it('livingMembersOf excludes deceased NPCs', () => {
    const lineage = new NpcLineageProjection([
      makeProfile('npc_a', 'h_family'),
      makeProfile('npc_b', 'h_family'),
    ])
    const mortality = new NpcMortalityProjection()
    mortality.project(makeDeceasedEvent('npc_a', 100))

    const living = lineage.livingMembersOf('h_family', mortality)
    expect(living).not.toContain('npc_a')
    expect(living).toContain('npc_b')
  })

  it('heirHistory tracks succession chain', () => {
    const lineage = new NpcLineageProjection([
      makeProfile('npc_a', 'h_trader'),
      makeProfile('npc_b', 'h_trader'),
      makeProfile('npc_c', 'h_trader'),
    ])
    lineage.project(makeHeirEvent('h_trader', 'npc_a', 'npc_b', 100, 1))
    lineage.project(makeHeirEvent('h_trader', 'npc_b', 'npc_c', 200, 2))

    const history = lineage.heirHistory('h_trader')
    expect(history).toHaveLength(2)
    expect(history[0]?.deceasedNpcId).toBe('npc_a')
    expect(history[0]?.heirNpcId).toBe('npc_b')
    expect(history[1]?.deceasedNpcId).toBe('npc_b')
    expect(history[1]?.heirNpcId).toBe('npc_c')
  })

  it('rebuildFromEvents restores heir history', () => {
    const lineage = new NpcLineageProjection([makeProfile('npc_x', 'h_x'), makeProfile('npc_y', 'h_x')])
    const events = [makeHeirEvent('h_x', 'npc_x', 'npc_y', 50, 1)]
    lineage.rebuildFromEvents(events)
    expect(lineage.heirHistory('h_x')).toHaveLength(1)
  })
})

import { describe, expect, it } from 'vitest'
import {
  planDefenseParties,
  type DefensePartyAttackRow,
  type DefensePartyAlivePredator,
} from './defenseParty.js'

function attack(over: Partial<DefensePartyAttackRow> = {}): DefensePartyAttackRow {
  return {
    attackId: 'attack.a_wolf_001.t_forest.100',
    animalId: 'a_wolf_001',
    speciesId: 'fog_wolf',
    tileId: 't_forest',
    victimNpcId: 'npc_yuna',
    attackedAtTick: 100,
    ...over,
  }
}

function alive(over: Partial<DefensePartyAlivePredator> = {}): DefensePartyAlivePredator {
  return {
    animalId: 'a_wolf_001',
    speciesId: 'fog_wolf',
    tileId: 't_forest',
    ...over,
  }
}

describe('defenseParty.planDefenseParties', () => {
  it('returns no plans when no attacks happened', () => {
    expect(
      planDefenseParties({
        tick: 101,
        recentAttacks: [],
        alivePredators: [alive()],
        npcsByTile: new Map([['t_forest', ['npc_anton', 'npc_kai']]]),
        priorPartyAttackIds: new Set(),
        minMembers: 2,
      }),
    ).toEqual([])
  })

  it('forms a party with lex-sorted members excluding the victim', () => {
    const plans = planDefenseParties({
      tick: 101,
      recentAttacks: [attack()],
      alivePredators: [alive()],
      npcsByTile: new Map([['t_forest', ['npc_kai', 'npc_anton', 'npc_yuna']]]),
      priorPartyAttackIds: new Set(),
      minMembers: 2,
    })
    expect(plans).toHaveLength(1)
    expect(plans[0]!.memberNpcIds).toEqual(['npc_anton', 'npc_kai'])
    expect(plans[0]!.victimNpcId).toBe('npc_yuna')
    expect(plans[0]!.reactionToAttackId).toBe('attack.a_wolf_001.t_forest.100')
    expect(plans[0]!.partyId.startsWith('defense.')).toBe(true)
  })

  it('returns no plan when only the victim is on the tile', () => {
    const plans = planDefenseParties({
      tick: 101,
      recentAttacks: [attack()],
      alivePredators: [alive()],
      npcsByTile: new Map([['t_forest', ['npc_yuna']]]),
      priorPartyAttackIds: new Set(),
      minMembers: 2,
    })
    expect(plans).toEqual([])
  })

  it('returns no plan when only one bystander is on the tile', () => {
    const plans = planDefenseParties({
      tick: 101,
      recentAttacks: [attack()],
      alivePredators: [alive()],
      npcsByTile: new Map([['t_forest', ['npc_yuna', 'npc_anton']]]),
      priorPartyAttackIds: new Set(),
      minMembers: 2,
    })
    expect(plans).toEqual([])
  })

  it('returns no plan when the predator is already dead', () => {
    const plans = planDefenseParties({
      tick: 101,
      recentAttacks: [attack()],
      alivePredators: [], // not in animal_population anymore
      npcsByTile: new Map([['t_forest', ['npc_kai', 'npc_anton']]]),
      priorPartyAttackIds: new Set(),
      minMembers: 2,
    })
    expect(plans).toEqual([])
  })

  it('returns no plan when the predator moved to a different tile', () => {
    const plans = planDefenseParties({
      tick: 101,
      recentAttacks: [attack()],
      alivePredators: [alive({ tileId: 't_central' })],
      npcsByTile: new Map([['t_forest', ['npc_kai', 'npc_anton']]]),
      priorPartyAttackIds: new Set(),
      minMembers: 2,
    })
    expect(plans).toEqual([])
  })

  it('respects the idempotency guard (priorPartyAttackIds)', () => {
    const plans = planDefenseParties({
      tick: 101,
      recentAttacks: [attack()],
      alivePredators: [alive()],
      npcsByTile: new Map([['t_forest', ['npc_kai', 'npc_anton']]]),
      priorPartyAttackIds: new Set(['attack.a_wolf_001.t_forest.100']),
      minMembers: 2,
    })
    expect(plans).toEqual([])
  })

  it('emits independent plans for two separate attacks on the same tile', () => {
    const plans = planDefenseParties({
      tick: 102,
      recentAttacks: [
        attack({ attackId: 'attack.a_wolf_001.t_forest.100', attackedAtTick: 100 }),
        attack({
          attackId: 'attack.a_lynx_002.t_forest.101',
          animalId: 'a_lynx_002',
          speciesId: 'mountain_lynx',
          attackedAtTick: 101,
        }),
      ],
      alivePredators: [
        alive(),
        alive({ animalId: 'a_lynx_002', speciesId: 'mountain_lynx' }),
      ],
      npcsByTile: new Map([['t_forest', ['npc_kai', 'npc_anton']]]),
      priorPartyAttackIds: new Set(),
      minMembers: 2,
    })
    expect(plans).toHaveLength(2)
    expect(plans[0]!.targetAnimalId).toBe('a_wolf_001')
    expect(plans[1]!.targetAnimalId).toBe('a_lynx_002')
  })

  it('produces deterministic party ids across invocations', () => {
    const args = {
      tick: 101,
      recentAttacks: [attack()],
      alivePredators: [alive()],
      npcsByTile: new Map([['t_forest', ['npc_kai', 'npc_anton']]]),
      priorPartyAttackIds: new Set<string>(),
      minMembers: 2,
    }
    const p1 = planDefenseParties(args)
    const p2 = planDefenseParties(args)
    expect(p1).toEqual(p2)
  })
})

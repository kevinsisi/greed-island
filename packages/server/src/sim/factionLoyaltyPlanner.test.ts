import { describe, expect, it } from 'vitest'
import { planLoyaltyShifts } from './factionLoyaltyPlanner.js'
import type { FactionSeizureIntent } from './areaStateEngine.js'
import type { NpcRuntimeState } from './npcEngine.js'
import type { FactionId } from './areaStateEngine.js'

function makeNpcState(tile: string): NpcRuntimeState {
  return { tile, mood: 70, health: 100, activity: 'idle', schedule: 'work', gold: 0 } as unknown as NpcRuntimeState
}

const seizure = (tileId: string, factionId: FactionId, previousFactionId: FactionId | null = null): FactionSeizureIntent => ({
  tileId,
  factionId,
  previousFactionId,
  tick: 100,
})

describe('planLoyaltyShifts', () => {
  it('emits shift intent for NPC on seized tile whose lean differs from new faction', () => {
    const intents = planLoyaltyShifts({
      seizureIntents: [seizure('tile_forest', 'guild', 'tide_hunters')],
      npcStates: new Map([['npc_trader', makeNpcState('tile_forest')]]),
      npcFactionLean: new Map([['npc_trader', 'tide_hunters' as FactionId]]),
      tick: 100,
    })
    expect(intents).toHaveLength(1)
    expect(intents[0]?.npcId).toBe('npc_trader')
    expect(intents[0]?.fromFaction).toBe('tide_hunters')
    expect(intents[0]?.toFaction).toBe('guild')
  })

  it('skips NPC already aligned with new dominant faction', () => {
    const intents = planLoyaltyShifts({
      seizureIntents: [seizure('tile_forest', 'guild')],
      npcStates: new Map([['npc_smith', makeNpcState('tile_forest')]]),
      npcFactionLean: new Map([['npc_smith', 'guild' as FactionId]]),
      tick: 100,
    })
    expect(intents).toHaveLength(0)
  })

  it('skips civilian-aligned NPCs', () => {
    const intents = planLoyaltyShifts({
      seizureIntents: [seizure('tile_forest', 'guild')],
      npcStates: new Map([['npc_farmer', makeNpcState('tile_forest')]]),
      npcFactionLean: new Map([['npc_farmer', 'civilian' as FactionId]]),
      tick: 100,
    })
    expect(intents).toHaveLength(0)
  })

  it('skips civilian seizure — never emits shifts when new dominant is civilian', () => {
    const intents = planLoyaltyShifts({
      seizureIntents: [seizure('tile_forest', 'civilian')],
      npcStates: new Map([['npc_guard', makeNpcState('tile_forest')]]),
      npcFactionLean: new Map([['npc_guard', 'tide_hunters' as FactionId]]),
      tick: 100,
    })
    expect(intents).toHaveLength(0)
  })

  it('skips NPCs on a different tile from the seizure', () => {
    const intents = planLoyaltyShifts({
      seizureIntents: [seizure('tile_forest', 'guild')],
      npcStates: new Map([['npc_trader', makeNpcState('tile_desert')]]),
      npcFactionLean: new Map([['npc_trader', 'tide_hunters' as FactionId]]),
      tick: 100,
    })
    expect(intents).toHaveLength(0)
  })

  it('handles multiple seizures and multiple NPCs', () => {
    const intents = planLoyaltyShifts({
      seizureIntents: [
        seizure('tile_forest', 'guild'),
        seizure('tile_desert', 'free_runners'),
      ],
      npcStates: new Map([
        ['npc_a', makeNpcState('tile_forest')],
        ['npc_b', makeNpcState('tile_desert')],
      ]),
      npcFactionLean: new Map([
        ['npc_a', 'tide_hunters' as FactionId],
        ['npc_b', 'guild' as FactionId],
      ]),
      tick: 100,
    })
    expect(intents).toHaveLength(2)
    expect(intents.find((i) => i.npcId === 'npc_a')?.toFaction).toBe('guild')
    expect(intents.find((i) => i.npcId === 'npc_b')?.toFaction).toBe('free_runners')
  })
})

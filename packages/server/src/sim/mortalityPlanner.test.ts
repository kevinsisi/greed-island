import { describe, expect, it } from 'vitest'
import { planMortality } from './mortalityPlanner.js'
import { NpcMortalityProjection } from '../projections/npcMortality.js'
import { NpcLineageProjection } from '../projections/npcLineage.js'
import { npcLifespanTicks, MORTALITY_CADENCE_TICKS } from '../config/world.js'
import type { NpcProfile } from '../npcs/types.js'
import type { Event } from '../kernel/types.js'

function makeProfile(id: string, opts: { householdId?: string; bornAtTick?: number } = {}): NpcProfile {
  return {
    id,
    name: { zh: id, en: id },
    role: { zh: 'role', en: 'role' },
    defaultLocation: 'hub',
    routine: [],
    triggers: [],
    memory: { consultsEventTypes: [] },
    personality: {
      ...(opts.householdId ? { householdId: opts.householdId } : {}),
      ...(opts.bornAtTick !== undefined ? { bornAtTick: opts.bornAtTick } : {}),
    },
  } as unknown as NpcProfile
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

const cadenceTick = MORTALITY_CADENCE_TICKS
const lifespan = (id: string) => npcLifespanTicks(id)

describe('planMortality', () => {
  it('returns empty when tick is not on cadence', () => {
    const profile = makeProfile('npc_a')
    const mortality = new NpcMortalityProjection()
    const lineage = new NpcLineageProjection([profile])
    const result = planMortality({
      currentTick: cadenceTick + 1,
      profiles: [profile],
      mortalityProjection: mortality,
      lineageProjection: lineage,
    })
    expect(result).toHaveLength(0)
  })

  it('returns empty when NPC has not reached lifespan', () => {
    const profile = makeProfile('npc_young', { bornAtTick: 0 })
    const mortality = new NpcMortalityProjection()
    const lineage = new NpcLineageProjection([profile])
    const result = planMortality({
      currentTick: cadenceTick,
      profiles: [profile],
      mortalityProjection: mortality,
      lineageProjection: lineage,
    })
    expect(result).toHaveLength(0)
  })

  it('emits intent when NPC reaches lifespan', () => {
    const id = 'npc_elder'
    const span = lifespan(id)
    const profile = makeProfile(id, { bornAtTick: 0 })
    const mortality = new NpcMortalityProjection()
    const lineage = new NpcLineageProjection([profile])
    const tick = Math.ceil(span / cadenceTick) * cadenceTick
    const result = planMortality({
      currentTick: tick,
      profiles: [profile],
      mortalityProjection: mortality,
      lineageProjection: lineage,
    })
    expect(result).toHaveLength(1)
    expect(result[0]?.npcId).toBe(id)
    expect(result[0]?.heirNpcId).toBeNull()
  })

  it('skips already-deceased NPCs', () => {
    const id = 'npc_dead'
    const span = lifespan(id)
    const profile = makeProfile(id, { bornAtTick: 0 })
    const mortality = new NpcMortalityProjection()
    mortality.project(makeDeceasedEvent(id, 10))
    const lineage = new NpcLineageProjection([profile])
    const tick = Math.ceil(span / cadenceTick) * cadenceTick
    const result = planMortality({
      currentTick: tick,
      profiles: [profile],
      mortalityProjection: mortality,
      lineageProjection: lineage,
    })
    expect(result).toHaveLength(0)
  })

  it('heir is the oldest surviving household member', () => {
    const id = 'npc_elder'
    const span = lifespan(id)
    const tick = Math.ceil(span / cadenceTick) * cadenceTick

    const elder = makeProfile(id, { householdId: 'h_family', bornAtTick: 0 })
    // mid born well within min-lifespan so it won't die at this tick
    const mid = makeProfile('npc_mid', { householdId: 'h_family', bornAtTick: tick - 1000 })
    // young born most recently — should NOT be chosen as heir over mid
    const young = makeProfile('npc_young', { householdId: 'h_family', bornAtTick: tick - 100 })

    const mortality = new NpcMortalityProjection()
    const lineage = new NpcLineageProjection([elder, young, mid])

    const result = planMortality({
      currentTick: tick,
      profiles: [elder, young, mid],
      mortalityProjection: mortality,
      lineageProjection: lineage,
    })

    expect(result).toHaveLength(1)
    expect(result[0]?.npcId).toBe(id)
    // oldest = lowest bornAtTick among living non-dying members
    expect(result[0]?.heirNpcId).toBe('npc_mid')
  })

  it('no heir for solo household', () => {
    const id = 'npc_solo'
    const span = lifespan(id)
    const profile = makeProfile(id, { bornAtTick: 0 })
    const mortality = new NpcMortalityProjection()
    const lineage = new NpcLineageProjection([profile])
    const tick = Math.ceil(span / cadenceTick) * cadenceTick
    const result = planMortality({
      currentTick: tick,
      profiles: [profile],
      mortalityProjection: mortality,
      lineageProjection: lineage,
    })
    expect(result[0]?.heirNpcId).toBeNull()
  })
})

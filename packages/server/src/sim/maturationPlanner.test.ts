import { describe, expect, it } from 'vitest'
import { planMaturation } from './maturationPlanner.js'
import { BornNpcsProjection } from '../projections/bornNpcs.js'
import { NpcMortalityProjection } from '../projections/npcMortality.js'
import { NPC_MATURATION_TICKS, MATURATION_CADENCE_TICKS } from '../config/world.js'
import type { LifeExpansionState } from './cityLife.js'

function makeLifeExpansion(
  household: { id: string; partners: readonly [string, string]; homeTile: string; formedAt: number },
  child: { id: string; bornAt: number; nameZh?: string; nameEn?: string }
): LifeExpansionState {
  return {
    households: {
      [household.id]: {
        householdId: household.id,
        partnerNpcIds: household.partners,
        homeTileId: household.homeTile,
        formedAtTick: household.formedAt,
        childIds: [child.id],
      },
    },
    children: {
      [child.id]: {
        childId: child.id,
        householdId: household.id,
        nameZh: child.nameZh ?? 'X',
        nameEn: child.nameEn ?? 'Y',
        bornAtTick: child.bornAt,
      },
    },
    npcCivicRecords: {},
    constructionProjects: {},
    unlockedTileIds: [],
    unlockedBuildingIds: [],
  }
}

describe('planMaturation', () => {
  const aliveProjection = new NpcMortalityProjection()

  it('emits NPC_MATURED intent at maturation threshold on cadence tick', () => {
    const life = makeLifeExpansion(
      { id: 'h1', partners: ['alice', 'bob'], homeTile: 't_central', formedAt: 50 },
      { id: 'c1', bornAt: 0 }
    )
    const born = new BornNpcsProjection(new Set())
    const currentTick = NPC_MATURATION_TICKS // exactly threshold; bornAt=0 is cadence-aligned
    const intents = planMaturation({
      currentTick,
      lifeExpansion: life,
      bornNpcsProjection: born,
      mortalityProjection: aliveProjection,
    })
    expect(intents).toHaveLength(1)
    expect(intents[0]!.npcId).toBe('c1')
    expect(intents[0]!.parentNpcIds).toEqual(['alice', 'bob'])
    expect(intents[0]!.homeTileId).toBe('t_central')
  })

  it('does not emit before threshold', () => {
    const life = makeLifeExpansion(
      { id: 'h1', partners: ['alice', 'bob'], homeTile: 't_central', formedAt: 50 },
      { id: 'c1', bornAt: 0 }
    )
    const born = new BornNpcsProjection(new Set())
    const tooEarly = 5_040 // cadence-aligned (multiple of 720), well below NPC_MATURATION_TICKS
    expect(tooEarly % MATURATION_CADENCE_TICKS).toBe(0)
    const intents = planMaturation({
      currentTick: tooEarly,
      lifeExpansion: life,
      bornNpcsProjection: born,
      mortalityProjection: aliveProjection,
    })
    expect(intents).toHaveLength(0)
  })

  it('cadence gate: off-cadence ticks return []', () => {
    const life = makeLifeExpansion(
      { id: 'h1', partners: ['alice', 'bob'], homeTile: 't_central', formedAt: 50 },
      { id: 'c1', bornAt: 0 }
    )
    const born = new BornNpcsProjection(new Set())
    const tick = NPC_MATURATION_TICKS + 1 // not divisible by cadence
    expect(tick % MATURATION_CADENCE_TICKS).not.toBe(0)
    const intents = planMaturation({
      currentTick: tick,
      lifeExpansion: life,
      bornNpcsProjection: born,
      mortalityProjection: aliveProjection,
    })
    expect(intents).toHaveLength(0)
  })

  it('skips already-matured children', () => {
    const life = makeLifeExpansion(
      { id: 'h1', partners: ['alice', 'bob'], homeTile: 't_central', formedAt: 50 },
      { id: 'c1', bornAt: 0 }
    )
    const born = new BornNpcsProjection(new Set())
    // Inject a matured record so isMatured returns true
    born.project({
      eventType: 'NPC_MATURED',
      tick: 200,
      payload: {
        data: {
          npcId: 'c1',
          maturedAtTick: 200,
          bornAtTick: 100,
          householdId: 'h1',
          parentNpcIds: ['alice', 'bob'],
          homeTileId: 't_central',
          nameZh: 'X',
          nameEn: 'Y',
        },
      },
    } as unknown as Parameters<BornNpcsProjection['project']>[0])
    const intents = planMaturation({
      currentTick: NPC_MATURATION_TICKS,
      lifeExpansion: life,
      bornNpcsProjection: born,
      mortalityProjection: aliveProjection,
    })
    expect(intents).toHaveLength(0)
  })

  it('matures orphaned children when both parents are deceased', () => {
    const life = makeLifeExpansion(
      { id: 'h1', partners: ['alice', 'bob'], homeTile: 't_central', formedAt: 50 },
      { id: 'c1', bornAt: 0 }
    )
    const born = new BornNpcsProjection(new Set())
    const mort = new NpcMortalityProjection()
    // Inject deaths
    for (const id of ['alice', 'bob']) {
      mort.project({
        eventType: 'NPC_DECEASED',
        tick: 200,
        payload: { data: { npcId: id, tileId: 't_central', householdId: 'h1', deceasedAtTick: 200, narration: '' } },
      } as unknown as Parameters<NpcMortalityProjection['project']>[0])
    }
    const intents = planMaturation({
      currentTick: NPC_MATURATION_TICKS,
      lifeExpansion: life,
      bornNpcsProjection: born,
      mortalityProjection: mort,
    })
    expect(intents).toHaveLength(1)
    expect(intents[0]!.npcId).toBe('c1')
    expect(intents[0]!.parentNpcIds).toEqual(['alice', 'bob'])
  })

  it('matures with at least one parent alive', () => {
    const life = makeLifeExpansion(
      { id: 'h1', partners: ['alice', 'bob'], homeTile: 't_central', formedAt: 50 },
      { id: 'c1', bornAt: 0 }
    )
    const born = new BornNpcsProjection(new Set())
    const mort = new NpcMortalityProjection()
    mort.project({
      eventType: 'NPC_DECEASED',
      tick: 200,
      payload: { data: { npcId: 'alice', tileId: 't_central', householdId: 'h1', deceasedAtTick: 200, narration: '' } },
    } as unknown as Parameters<NpcMortalityProjection['project']>[0])
    // bob still alive
    const intents = planMaturation({
      currentTick: NPC_MATURATION_TICKS,
      lifeExpansion: life,
      bornNpcsProjection: born,
      mortalityProjection: mort,
    })
    expect(intents).toHaveLength(1)
    expect(intents[0]!.npcId).toBe('c1')
  })
})

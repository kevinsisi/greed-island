import { describe, expect, it } from 'vitest'
import { planHouseholdMigration } from './householdMigrationPlanner.js'
import type { NpcProfile } from '../npcs/types.js'
import { HOUSEHOLD_MIGRATION_CADENCE_TICKS, MIGRATION_PUSH_SAFETY_THRESHOLD, MIGRATION_PULL_SAFETY_MIN } from '../config/world.js'

function makeProfile(id: string, defaultLocation = 't_central'): NpcProfile {
  return {
    id,
    name: { zh: `NPC_${id}`, en: `NPC_${id}` },
    role: { zh: 'villager', en: 'villager' },
    defaultLocation,
    routine: [],
    triggers: [],
    memory: { consultsEventTypes: [], decayFn: 'linear', decayParam: 0.01 },
    personality: {},
  }
}

function makeMortality(deceased: string[] = []) {
  return {
    isDeceased: (id: string) => deceased.includes(id),
  } as unknown as import('../projections/npcMortality.js').NpcMortalityProjection
}

function makeSettlements(tilesWithSettlement: string[] = []) {
  return {
    getTilesWithSettlement: () => new Set(tilesWithSettlement),
  } as unknown as import('../projections/settlements.js').SettlementsProjection
}

const ON_CADENCE_TICK = HOUSEHOLD_MIGRATION_CADENCE_TICKS
const OFF_CADENCE_TICK = HOUSEHOLD_MIGRATION_CADENCE_TICKS + 1

describe('planHouseholdMigration', () => {
  it('returns empty if tick is not on cadence', () => {
    const result = planHouseholdMigration({
      currentTick: OFF_CADENCE_TICK,
      profiles: [makeProfile('npc.a')],
      npcHomeTiles: new Map([['npc.a', 't_central']]),
      areaSafety: new Map([['t_central', 5], ['t_grassland', 80]]),
      settlementsProjection: makeSettlements(['t_grassland']),
      mortalityProjection: makeMortality(),
    })
    expect(result).toHaveLength(0)
  })

  it('returns empty if home tile safety is above threshold', () => {
    const result = planHouseholdMigration({
      currentTick: ON_CADENCE_TICK,
      profiles: [makeProfile('npc.a')],
      npcHomeTiles: new Map([['npc.a', 't_central']]),
      areaSafety: new Map([['t_central', MIGRATION_PUSH_SAFETY_THRESHOLD], ['t_grassland', 80]]),
      settlementsProjection: makeSettlements(['t_grassland']),
      mortalityProjection: makeMortality(),
    })
    expect(result).toHaveLength(0)
  })

  it('returns migration when safety is low and better tile exists', () => {
    const result = planHouseholdMigration({
      currentTick: ON_CADENCE_TICK,
      profiles: [makeProfile('npc.a', 't_central')],
      npcHomeTiles: new Map([['npc.a', 't_central']]),
      areaSafety: new Map([['t_central', 10], ['t_grassland', 80]]),
      settlementsProjection: makeSettlements(['t_grassland']),
      mortalityProjection: makeMortality(),
    })
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ npcId: 'npc.a', fromTileId: 't_central', toTileId: 't_grassland' })
  })

  it('skips deceased NPCs', () => {
    const result = planHouseholdMigration({
      currentTick: ON_CADENCE_TICK,
      profiles: [makeProfile('npc.a')],
      npcHomeTiles: new Map([['npc.a', 't_central']]),
      areaSafety: new Map([['t_central', 5], ['t_grassland', 80]]),
      settlementsProjection: makeSettlements(['t_grassland']),
      mortalityProjection: makeMortality(['npc.a']),
    })
    expect(result).toHaveLength(0)
  })

  it('skips migration if target safety is too low', () => {
    const result = planHouseholdMigration({
      currentTick: ON_CADENCE_TICK,
      profiles: [makeProfile('npc.a')],
      npcHomeTiles: new Map([['npc.a', 't_central']]),
      areaSafety: new Map([['t_central', 5], ['t_grassland', MIGRATION_PULL_SAFETY_MIN - 1]]),
      settlementsProjection: makeSettlements(['t_grassland']),
      mortalityProjection: makeMortality(),
    })
    expect(result).toHaveLength(0)
  })

  it('respects MIGRATION_MAX_PER_CADENCE cap', () => {
    const profiles = [makeProfile('npc.a'), makeProfile('npc.b'), makeProfile('npc.c')]
    const result = planHouseholdMigration({
      currentTick: ON_CADENCE_TICK,
      profiles,
      npcHomeTiles: new Map(profiles.map((p) => [p.id, 't_central'])),
      areaSafety: new Map([['t_central', 5], ['t_grassland', 80]]),
      settlementsProjection: makeSettlements(['t_grassland']),
      mortalityProjection: makeMortality(),
    })
    expect(result.length).toBeLessThanOrEqual(1)
  })

  it('uses homeTileOverride over profile.defaultLocation', () => {
    const profile = makeProfile('npc.a', 't_central')
    const result = planHouseholdMigration({
      currentTick: ON_CADENCE_TICK,
      profiles: [profile],
      npcHomeTiles: new Map([['npc.a', 't_forest']]),
      areaSafety: new Map([['t_forest', 5], ['t_grassland', 80]]),
      settlementsProjection: makeSettlements(['t_grassland']),
      mortalityProjection: makeMortality(),
    })
    expect(result).toHaveLength(1)
    expect(result[0]!.fromTileId).toBe('t_forest')
  })

  it('picks highest-safety target when multiple options', () => {
    const result = planHouseholdMigration({
      currentTick: ON_CADENCE_TICK,
      profiles: [makeProfile('npc.a', 't_central')],
      npcHomeTiles: new Map([['npc.a', 't_central']]),
      areaSafety: new Map([['t_central', 5], ['t_mountain', 60], ['t_coast', 90]]),
      settlementsProjection: makeSettlements(['t_mountain', 't_coast']),
      mortalityProjection: makeMortality(),
    })
    expect(result).toHaveLength(1)
    expect(result[0]!.toTileId).toBe('t_coast')
  })
})

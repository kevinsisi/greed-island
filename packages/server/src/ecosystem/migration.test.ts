import { describe, expect, it } from 'vitest'
import { ECOSYSTEM_MIGRATION_PRESSURE_THRESHOLD, ECOSYSTEM_REPRODUCTION_CADENCE_TICKS } from '../config/world.js'
import type { AnimalPopulationRow } from '../projections/animalPopulation.js'
import { carryingCapacityForTile } from './animalSpawning.js'
import { planAnimalMigration } from './migration.js'
import { requireSpecies } from './species.js'
import type { EcosystemRegionId } from './species.js'

// t_forest (forest) is adjacent to t_desert (desert), t_mountain (mountain), t_central (grass)
// t_mountain (mountain) is adjacent to t_forest, t_dimai (ruin), t_temple (water)
// Ecosystem tiles reachable: t_forest->t_mountain; t_mountain->t_forest, t_dimai
// t_desert (desert) is adjacent to t_forest (forest), t_dock (water)

describe('planAnimalMigration - cadence gate', () => {
  it('returns null on non-cadence ticks', () => {
    const tick = ECOSYSTEM_REPRODUCTION_CADENCE_TICKS - 1
    const population = [pressureRow('forest_deer', 't_forest', 'forest')]
    expect(planAnimalMigration({ tick, animalPopulation: population })).toBeNull()
  })

  it('returns null for tick = 0', () => {
    expect(planAnimalMigration({ tick: 0, animalPopulation: [] })).toBeNull()
  })
})

describe('planAnimalMigration - none/event_driven species', () => {
  it('does not migrate ember_owl (none)', () => {
    const tick = firstMigrationCadenceTick()
    const species = requireSpecies('ember_owl')
    expect(species.migrationPattern).toBe('none')
    const capacity = carryingCapacityForTile(species)
    const animalIds = Array.from({ length: capacity }, (_, i) => `owl-${i}`)
    const population = [row('ember_owl', 't_forest', 'forest', animalIds)]
    const plan = planAnimalMigration({ tick, animalPopulation: population })
    expect(plan).toBeNull()
  })

  it('does not migrate white_marsh_leviathan (event_driven)', () => {
    const tick = firstMigrationCadenceTick()
    const species = requireSpecies('white_marsh_leviathan')
    expect(species.migrationPattern).toBe('event_driven')
    const animalIds = ['lev-a']
    const population = [row('white_marsh_leviathan', 't_salt_marsh', 'salt_marsh', animalIds)]
    const plan = planAnimalMigration({ tick, animalPopulation: population, unlockedTileIds: ['t_salt_marsh'] })
    expect(plan).toBeNull()
  })
})

describe('planAnimalMigration - pressure migration', () => {
  it('migrates when population exceeds pressure threshold and adjacent ecosystem tile exists', () => {
    const tick = firstMigrationCadenceTick()
    const species = requireSpecies('forest_deer')
    expect(species.migrationPattern).toBe('pressure')
    const capacity = carryingCapacityForTile(species)
    const pressureCount = Math.ceil(capacity * ECOSYSTEM_MIGRATION_PRESSURE_THRESHOLD)
    const animalIds = Array.from({ length: pressureCount }, (_, i) => `deer-${i}`)
    const population = [row('forest_deer', 't_forest', 'forest', animalIds)]

    const plan = planAnimalMigration({ tick, animalPopulation: population })

    expect(plan).not.toBeNull()
    expect(plan?.speciesId).toBe('forest_deer')
    expect(plan?.fromTileId).toBe('t_forest')
    expect(['t_mountain', 't_desert'].includes(plan?.toTileId ?? '')).toBe(true)
    expect(plan?.migrationType).toBe('pressure')
    expect(plan?.waveId).toBeTruthy()
    expect(plan?.animalId).toBeTruthy()
  })

  it('does not migrate when population is below pressure threshold', () => {
    const tick = firstMigrationCadenceTick()
    const species = requireSpecies('forest_deer')
    const capacity = carryingCapacityForTile(species)
    const safeCount = Math.floor(capacity * ECOSYSTEM_MIGRATION_PRESSURE_THRESHOLD * 0.5)
    const animalIds = Array.from({ length: safeCount }, (_, i) => `deer-${i}`)
    const population = [row('forest_deer', 't_forest', 'forest', animalIds)]

    const plan = planAnimalMigration({ tick, animalPopulation: population })

    expect(plan).toBeNull()
  })
})

describe('planAnimalMigration - seasonal migration', () => {
  it('migrates marsh_heron even below pressure threshold when destination has capacity', () => {
    const tick = firstMigrationCadenceTick()
    const species = requireSpecies('marsh_heron')
    expect(species.migrationPattern).toBe('seasonal')
    // One animal — well below any pressure threshold
    const population = [row('marsh_heron', 't_salt_marsh', 'salt_marsh', ['heron-a'])]

    const plan = planAnimalMigration({ tick, animalPopulation: population, unlockedTileIds: ['t_salt_marsh'] })

    expect(plan).not.toBeNull()
    expect(plan?.speciesId).toBe('marsh_heron')
    expect(plan?.fromTileId).toBe('t_salt_marsh')
    expect(plan?.migrationType).toBe('seasonal')
  })
})

describe('planAnimalMigration - destination selection', () => {
  it('excludes destination at carrying capacity', () => {
    const tick = firstMigrationCadenceTick()
    const species = requireSpecies('forest_deer')
    const capacity = carryingCapacityForTile(species)
    // Fill all ecosystem tiles that might be candidates:
    // t_forest → neighbors: t_mountain (ecosystem), t_desert (ecosystem)
    // t_mountain → neighbors: t_forest (ecosystem), t_dimai (ecosystem)
    // t_desert → neighbors: t_forest (ecosystem) [t_dock is water]
    // t_dimai → neighbors: t_mountain (ecosystem) [t_central grass, t_temple water]
    // All four tiles at capacity → no valid destination anywhere
    const full = (suffix: string) => Array.from({ length: capacity }, (_, i) => `deer-${suffix}-${i}`)
    const population = [
      row('forest_deer', 't_forest', 'forest', full('f')),
      row('forest_deer', 't_mountain', 'mountain', full('m')),
      row('forest_deer', 't_desert', 'desert', full('d')),
      row('forest_deer', 't_dimai', 'ruin', full('di')),
    ]

    const plan = planAnimalMigration({ tick, animalPopulation: population })
    expect(plan).toBeNull()
  })

  it('produces deterministic plans for identical inputs', () => {
    const tick = firstMigrationCadenceTick()
    const species = requireSpecies('forest_deer')
    const capacity = carryingCapacityForTile(species)
    const pressureCount = Math.ceil(capacity * ECOSYSTEM_MIGRATION_PRESSURE_THRESHOLD)
    const animalIds = Array.from({ length: pressureCount }, (_, i) => `deer-${i}`)
    const population = [row('forest_deer', 't_forest', 'forest', animalIds)]

    const planA = planAnimalMigration({ tick, animalPopulation: population })
    const planB = planAnimalMigration({ tick, animalPopulation: population })

    expect(planA).toEqual(planB)
  })
})

// ---- helpers ----

function firstMigrationCadenceTick(): number {
  return ECOSYSTEM_REPRODUCTION_CADENCE_TICKS
}

function pressureRow(speciesId: string, tileId: string, biomeRegion: EcosystemRegionId): AnimalPopulationRow {
  const species = requireSpecies(speciesId)
  const capacity = carryingCapacityForTile(species)
  const pressureCount = Math.ceil(capacity * ECOSYSTEM_MIGRATION_PRESSURE_THRESHOLD)
  const animalIds = Array.from({ length: pressureCount }, (_, i) => `${speciesId}-${i}`)
  return row(speciesId, tileId, biomeRegion, animalIds)
}

function row(speciesId: string, tileId: string, biomeRegion: EcosystemRegionId, animalIds: readonly string[]): AnimalPopulationRow {
  return {
    speciesId,
    tileId,
    biomeRegion,
    count: animalIds.length,
    animalIds,
    lastSpawnedAtTick: 1,
    lastKilledAtTick: null,
    lastSequence: 1,
  }
}

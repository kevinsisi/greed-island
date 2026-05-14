import { describe, expect, it } from 'vitest'
import { ECOSYSTEM_REPRODUCTION_CADENCE_TICKS } from '../config/world.js'
import type { AnimalPopulationRow } from '../projections/animalPopulation.js'
import { carryingCapacityForTile } from './animalSpawning.js'
import { planAnimalReproduction } from './reproduction.js'
import { requireSpecies } from './species.js'

describe('planAnimalReproduction', () => {
  it('plans deterministic reproduction for an eligible below-capacity population', () => {
    const tick = firstReproductionTick(row('forest_deer', 't_forest', ['deer-a', 'deer-b']))
    const input = {
      tick,
      animalPopulation: [row('forest_deer', 't_forest', ['deer-b', 'deer-a'])],
    }

    const a = planAnimalReproduction(input)
    const b = planAnimalReproduction(input)

    expect(a).toEqual(b)
    expect(a?.animal.speciesId).toBe('forest_deer')
    expect(a?.animal.tileId).toBe('t_forest')
    expect(a?.animal.lifecycleStage).toBe('juvenile')
    expect(a?.animal.id).toMatch(/^animal\.t_forest\.forest_deer\.repro\./)
    expect(a?.parentAnimalIds).toEqual(['deer-a', 'deer-b'])
  })

  it('does not reproduce outside the fixed cadence', () => {
    const plan = planAnimalReproduction({
      tick: ECOSYSTEM_REPRODUCTION_CADENCE_TICKS - 1,
      animalPopulation: [row('forest_deer', 't_forest', ['deer-a', 'deer-b'])],
    })

    expect(plan).toBeNull()
  })

  it('does not reproduce from a lone animal', () => {
    const plan = planAnimalReproduction({
      tick: firstReproductionTick(row('forest_deer', 't_forest', ['deer-a', 'deer-b'])),
      animalPopulation: [row('forest_deer', 't_forest', ['deer-a'])],
    })

    expect(plan).toBeNull()
  })

  it('does not reproduce at tile carrying capacity', () => {
    const species = requireSpecies('forest_deer')
    const capacity = carryingCapacityForTile(species)
    const animalIds = Array.from({ length: capacity }, (_, index) => `deer-${index}`)
    const tick = firstReproductionTick(row('forest_deer', 't_forest', ['deer-a', 'deer-b']))

    const plan = planAnimalReproduction({
      tick,
      animalPopulation: [row('forest_deer', 't_forest', animalIds)],
    })

    expect(plan).toBeNull()
  })
})

function firstReproductionTick(populationRow: AnimalPopulationRow): number {
  for (let tick = ECOSYSTEM_REPRODUCTION_CADENCE_TICKS; tick < ECOSYSTEM_REPRODUCTION_CADENCE_TICKS * 100; tick += ECOSYSTEM_REPRODUCTION_CADENCE_TICKS) {
    if (planAnimalReproduction({ tick, animalPopulation: [populationRow] })) return tick
  }
  throw new Error('expected to find deterministic reproduction tick')
}

function row(speciesId: string, tileId: string, animalIds: readonly string[]): AnimalPopulationRow {
  return {
    speciesId,
    tileId,
    biomeRegion: 'forest',
    count: animalIds.length,
    animalIds,
    lastSpawnedAtTick: 1,
    lastKilledAtTick: null,
    lastSequence: 1,
  }
}

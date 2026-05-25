import { describe, expect, it } from 'vitest'
import { planSpeciesPopulationShifts } from './speciesPopulationPlanner.js'
import type { AnimalPopulationRow } from '../projections/animalPopulation.js'

function row(speciesId: string, tileId: string, count: number): AnimalPopulationRow {
  return { speciesId, tileId, biomeRegion: 'forest', count, animalIds: [], lastSpawnedAtTick: 0, lastKilledAtTick: null, lastSequence: 0 }
}

describe('planSpeciesPopulationShifts', () => {
  it('returns empty when no change', () => {
    const pop = [row('fog_wolf', 't1', 20)]
    const prev = new Map([['fog_wolf', 20]])
    expect(planSpeciesPopulationShifts({ tick: 10, animalPopulation: pop, previousTotals: prev })).toEqual([])
  })

  it('returns empty when decline is below threshold', () => {
    const pop = [row('fog_wolf', 't1', 16)]
    const prev = new Map([['fog_wolf', 20]])
    // 20% decline < 25% threshold
    expect(planSpeciesPopulationShifts({ tick: 10, animalPopulation: pop, previousTotals: prev })).toEqual([])
  })

  it('fires when decline meets threshold exactly (25%)', () => {
    const pop = [row('fog_wolf', 't1', 15)]
    const prev = new Map([['fog_wolf', 20]])
    // 25% decline = threshold
    const result = planSpeciesPopulationShifts({ tick: 10, animalPopulation: pop, previousTotals: prev })
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ speciesId: 'fog_wolf', previousTotal: 20, currentTotal: 15, tick: 10 })
  })

  it('fires when decline exceeds threshold', () => {
    const pop = [row('fog_wolf', 't1', 10)]
    const prev = new Map([['fog_wolf', 20]])
    const result = planSpeciesPopulationShifts({ tick: 5, animalPopulation: pop, previousTotals: prev })
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ speciesId: 'fog_wolf', previousTotal: 20, currentTotal: 10 })
  })

  it('aggregates population across multiple tiles', () => {
    const pop = [row('forest_deer', 't1', 10), row('forest_deer', 't2', 5)]
    const prev = new Map([['forest_deer', 30]])
    // total = 15, previous = 30 → 50% drop
    const result = planSpeciesPopulationShifts({ tick: 1, animalPopulation: pop, previousTotals: prev })
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ speciesId: 'forest_deer', previousTotal: 30, currentTotal: 15 })
  })

  it('skips species not in previous totals (no baseline = no shift)', () => {
    const pop = [row('new_species', 't1', 10)]
    const prev = new Map<string, number>()
    expect(planSpeciesPopulationShifts({ tick: 1, animalPopulation: pop, previousTotals: prev })).toEqual([])
  })

  it('skips species with previous total of 0', () => {
    const pop = [row('fog_wolf', 't1', 5)]
    const prev = new Map([['fog_wolf', 0]])
    expect(planSpeciesPopulationShifts({ tick: 1, animalPopulation: pop, previousTotals: prev })).toEqual([])
  })

  it('returns multiple intents for multiple declining species', () => {
    const pop = [row('fog_wolf', 't1', 5), row('forest_deer', 't1', 20)]
    const prev = new Map([['fog_wolf', 20], ['forest_deer', 60]])
    const result = planSpeciesPopulationShifts({ tick: 2, animalPopulation: pop, previousTotals: prev })
    expect(result).toHaveLength(2)
    const speciesIds = result.map((r) => r.speciesId).sort()
    expect(speciesIds).toEqual(['fog_wolf', 'forest_deer'])
  })
})

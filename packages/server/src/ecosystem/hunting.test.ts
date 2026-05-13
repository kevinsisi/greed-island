import { describe, expect, it } from 'vitest'
import { planSimpleHunt } from './hunting.js'
import type { AnimalPopulationRow } from '../projections/animalPopulation.js'

describe('simple hunting policy', () => {
  it('plans a deterministic hunt for a hungry hunter with same-tile prey', () => {
    const input = {
      tick: 120,
      npcId: 'forest.hunter.lyra',
      tileId: 't_forest',
      roleZh: '尋寶獵人',
      roleEn: 'Treasure Hunter',
      foodNeed: 72,
      animalPopulation: [row('forest_deer', 't_forest', ['animal-a', 'animal-b'])],
    }
    expect(planSimpleHunt(input)).toEqual(planSimpleHunt(input))
    const plan = planSimpleHunt(input)
    expect(plan?.npcId).toBe('forest.hunter.lyra')
    expect(plan?.targetSpeciesId).toBe('forest_deer')
    expect(['animal-a', 'animal-b']).toContain(plan?.targetAnimalId)
    expect(plan?.quantity).toBe(4)
    expect(plan?.goldValue).toBe(8)
  })

  it('does not hunt without hunter role, food pressure, or prey', () => {
    const base = {
      tick: 120,
      npcId: 'npc-a',
      tileId: 't_forest',
      roleZh: '商人',
      roleEn: 'Merchant',
      foodNeed: 72,
      animalPopulation: [row('forest_deer', 't_forest', ['animal-a'])],
    }
    expect(planSimpleHunt(base)).toBeNull()
    expect(planSimpleHunt({ ...base, roleZh: '獵人', roleEn: 'Hunter', foodNeed: 40 })).toBeNull()
    expect(planSimpleHunt({ ...base, roleZh: '獵人', roleEn: 'Hunter', animalPopulation: [] })).toBeNull()
  })

  it('skips animals already reserved by another planned hunt', () => {
    const plan = planSimpleHunt({
      tick: 120,
      npcId: 'forest.hunter.lyra',
      tileId: 't_forest',
      roleZh: '尋寶獵人',
      roleEn: 'Treasure Hunter',
      foodNeed: 72,
      animalPopulation: [row('forest_deer', 't_forest', ['animal-a'])],
      reservedAnimalIds: new Set(['animal-a']),
    })
    expect(plan).toBeNull()
  })
})

function row(speciesId: string, tileId: string, animalIds: readonly string[]): AnimalPopulationRow {
  return {
    speciesId,
    tileId,
    biomeRegion: 'forest',
    count: animalIds.length,
    animalIds,
    lastSpawnedAtTick: 12,
    lastKilledAtTick: null,
    lastSequence: 1,
  }
}

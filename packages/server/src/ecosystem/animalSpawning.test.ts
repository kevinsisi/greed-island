import { describe, expect, it } from 'vitest'
import { ECOSYSTEM_ANIMAL_SUBGRID_COLUMNS, ECOSYSTEM_ANIMAL_SUBGRID_ROWS, ECOSYSTEM_SPAWN_CADENCE_TICKS } from '../config/world.js'
import type { MapTileDef } from '../sim/mapGraph.js'
import { carryingCapacityForTile, ecosystemRegionForTile, planAnimalSpawns, spawnRateModifier } from './animalSpawning.js'
import { requireSpecies } from './species.js'

describe('animal spawning policy', () => {
  it('maps only documented ecosystem regions', () => {
    expect(ecosystemRegionForTile(tile('t_forest', 'forest'))).toBe('forest')
    expect(ecosystemRegionForTile(tile('t_salt_marsh', 'water'))).toBe('salt_marsh')
    expect(ecosystemRegionForTile(tile('t_central', 'grass'))).toBeNull()
    expect(ecosystemRegionForTile(tile('t_dock', 'water'))).toBeNull()
  })

  it('does not spawn outside the fixed cadence', () => {
    const plans = planAnimalSpawns({
      tick: ECOSYSTEM_SPAWN_CADENCE_TICKS - 1,
      tiles: [tile('t_forest', 'forest')],
      getPopulation: () => 0,
    })
    expect(plans).toEqual([])
  })

  it('spawns deterministically on one active eligible tile', () => {
    const input = {
      tick: ECOSYSTEM_SPAWN_CADENCE_TICKS,
      tiles: [tile('t_central', 'grass'), tile('t_forest', 'forest'), tile('t_mountain', 'mountain')],
      getPopulation: () => 0,
    }

    const a = planAnimalSpawns(input)
    const b = planAnimalSpawns(input)

    expect(a).toEqual(b)
    expect(a).toHaveLength(2)
    expect(a[0]?.animal.tileId).toBe('t_mountain')
    expect(a[0]?.animal.biomeRegion).toBe('mountain')
    expect(a[1]?.animal.tileId).toBe('t_mountain')
    expect(a[1]?.animal.biomeRegion).toBe('mountain')
    expect(a[0]?.animal.position.subCol).toBeGreaterThanOrEqual(0)
    expect(a[0]?.animal.position.subCol).toBeLessThan(ECOSYSTEM_ANIMAL_SUBGRID_COLUMNS)
    expect(a[0]?.animal.position.subRow).toBeGreaterThanOrEqual(0)
    expect(a[0]?.animal.position.subRow).toBeLessThan(ECOSYSTEM_ANIMAL_SUBGRID_ROWS)
  })

  it('does not spawn when every candidate is at tile carrying capacity', () => {
    const plans = planAnimalSpawns({
      tick: ECOSYSTEM_SPAWN_CADENCE_TICKS,
      tiles: [tile('t_forest', 'forest')],
      getPopulation: (speciesId) => carryingCapacityForTile(requireSpecies(speciesId)),
    })
    expect(plans).toEqual([])
  })
})

describe('spawnRateModifier', () => {
  it('returns 1.0 for high-tolerance species at low pressure', () => {
    expect(spawnRateModifier({ civilizationTolerance: 60 }, 30)).toBe(1.0)
  })

  it('returns 0.3 for low-tolerance species (< 30) when pressure > 50', () => {
    expect(spawnRateModifier({ civilizationTolerance: 10 }, 60)).toBe(0.3)
  })

  it('returns 0.1 for any species when pressure > 75', () => {
    expect(spawnRateModifier({ civilizationTolerance: 80 }, 80)).toBe(0.1)
  })

  it('returns 1.0 when pressure is zero', () => {
    expect(spawnRateModifier({ civilizationTolerance: 10 }, 0)).toBe(1.0)
  })

  it('high-tolerance species also gets 0.1 at extreme pressure', () => {
    expect(spawnRateModifier({ civilizationTolerance: 80 }, 80)).toBe(0.1)
  })
})

function tile(id: string, biome: string): MapTileDef {
  return { id, biome, name: id, x: 0, y: 0 }
}

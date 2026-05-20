import { describe, expect, it } from 'vitest'
import { planPlantRegrowth } from './plantRegrowth.js'
import type { BioNodeRow } from '../projections/bioNode.js'
import { getPlantSpecies } from './plantSpecies.js'

function node(tileId: string, speciesId: string, density: number, capacity: number): BioNodeRow {
  return { tileId, speciesId, density, capacity, lastUpdatedTick: 1, lastSequence: 1 }
}

describe('planPlantRegrowth', () => {
  it('emits no regrowth for nodes at capacity', () => {
    const result = planPlantRegrowth({
      nodes: [node('t_forest', 'oak', 100, 100)],
      tick: 60,
    })
    expect(result).toEqual([])
  })

  it('grows below-capacity nodes by regrowthPerHour', () => {
    const oak = getPlantSpecies('oak')!
    const result = planPlantRegrowth({
      nodes: [node('t_forest', 'oak', 50, 100)],
      tick: 60,
    })
    expect(result).toHaveLength(1)
    expect(result[0]?.densityBefore).toBe(50)
    expect(result[0]?.densityAfter).toBe(50 + oak.regrowthPerHour)
    expect(result[0]?.tick).toBe(60)
  })

  it('caps regrowth at capacity', () => {
    const oak = getPlantSpecies('oak')!
    const justBelow = 100 - oak.regrowthPerHour / 2
    const result = planPlantRegrowth({
      nodes: [node('t_forest', 'oak', justBelow, 100)],
      tick: 60,
    })
    expect(result[0]?.densityAfter).toBe(100)
  })

  it('skips unknown species', () => {
    const result = planPlantRegrowth({
      nodes: [node('t_forest', 'mystery_plant', 50, 100)],
      tick: 60,
    })
    expect(result).toEqual([])
  })

  it('does not emit regrow when change is below epsilon (no-op suppression)', () => {
    // density already at capacity within epsilon, so increase would be tiny
    const result = planPlantRegrowth({
      nodes: [node('t_forest', 'oak', 99.999, 100)],
      tick: 60,
    })
    // since regrowthPerHour is 0.6, next = min(100, 99.999 + 0.6) = 100,
    // change = 0.001 < 0.01 epsilon → suppressed
    expect(result).toEqual([])
  })

  it('handles multiple nodes deterministically', () => {
    const result = planPlantRegrowth({
      nodes: [
        node('t_forest', 'oak', 50, 100),
        node('t_salt_marsh', 'reed', 60, 120),
        node('t_mountain', 'pine', 80, 80), // at capacity, no regrow
      ],
      tick: 120,
    })
    expect(result).toHaveLength(2)
    expect(result.map((r) => `${r.tileId}/${r.speciesId}`).sort()).toEqual([
      't_forest/oak',
      't_salt_marsh/reed',
    ])
  })
})

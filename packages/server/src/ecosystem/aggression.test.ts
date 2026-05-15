import { describe, expect, it } from 'vitest'
import {
  planAnimalAggression,
  planAnimalRetaliation,
  type AggressionInput,
  type RetaliationInput,
} from './aggression.js'
import type { AnimalPopulationRow } from '../projections/animalPopulation.js'
import type { Species } from './species.js'

function species(overrides: Partial<Species> = {}): Species {
  return {
    id: 'fog_wolf',
    category: 'predator',
    biomeAffinity: ['forest'],
    dietType: 'carnivore',
    aggression: 60,
    fear: 30,
    intelligence: 50,
    packBehavior: 'pack',
    activityWindow: 'dawn_dusk',
    migrationPattern: 'none',
    reproductionRate: 0.1,
    carryingCapacity: 10,
    predatorTargets: [],
    preyTargets: ['forest_deer'],
    edibleYield: 5,
    byproducts: [],
    rarity: 'uncommon',
    climateTolerance: 0.8,
    civilizationTolerance: 0.4,
    extinctionThreshold: 2,
    ...overrides,
  }
}

function predatorRow(overrides: Partial<AnimalPopulationRow> = {}): AnimalPopulationRow {
  return {
    speciesId: 'fog_wolf',
    tileId: 't_forest',
    biomeRegion: 'forest',
    count: 1,
    animalIds: ['a_wolf_001'],
    lastSpawnedAtTick: 100,
    lastKilledAtTick: null,
    lastSequence: 5,
    ...overrides,
  }
}

describe('aggression.planAnimalAggression', () => {
  it('returns null when there are no NPCs on the tile', () => {
    const input: AggressionInput = {
      tick: 200,
      predatorPopulation: [predatorRow()],
      npcsOnTile: [],
      species: species(),
      adjacentTileIds: ['t_central'],
    }
    expect(planAnimalAggression(input)).toBeNull()
  })

  it('returns null when species.aggression is zero', () => {
    const input: AggressionInput = {
      tick: 200,
      predatorPopulation: [predatorRow()],
      npcsOnTile: ['npc_yuna'],
      species: species({ aggression: 0 }),
      adjacentTileIds: ['t_central'],
    }
    expect(planAnimalAggression(input)).toBeNull()
  })

  it('returns null when predator population is empty', () => {
    const input: AggressionInput = {
      tick: 200,
      predatorPopulation: [],
      npcsOnTile: ['npc_yuna'],
      species: species(),
      adjacentTileIds: ['t_central'],
    }
    expect(planAnimalAggression(input)).toBeNull()
  })

  it('returns a plan with deterministic attackId for a single NPC', () => {
    const input: AggressionInput = {
      tick: 200,
      predatorPopulation: [predatorRow()],
      npcsOnTile: ['npc_yuna'],
      species: species(),
      adjacentTileIds: ['t_central'],
    }
    const plan = planAnimalAggression(input)
    expect(plan).not.toBeNull()
    expect(plan!.targetNpcId).toBe('npc_yuna')
    expect(plan!.predatorAnimalId).toBe('a_wolf_001')
    expect(plan!.predatorSpeciesId).toBe('fog_wolf')
    expect(plan!.tileId).toBe('t_forest')
    expect(plan!.attackId).toBe('attack.a_wolf_001.t_forest.200')
    expect(plan!.damage.mood).toBeLessThan(0)
    expect(plan!.damage.health).toBeLessThan(0)
  })

  it('picks NPC deterministically across multiple candidates', () => {
    const input: AggressionInput = {
      tick: 200,
      predatorPopulation: [predatorRow()],
      npcsOnTile: ['npc_yuna', 'npc_anton', 'npc_kai'],
      species: species(),
      adjacentTileIds: ['t_central'],
    }
    const plan1 = planAnimalAggression(input)
    const plan2 = planAnimalAggression(input)
    expect(plan1?.targetNpcId).toBe(plan2?.targetNpcId)
  })

  it('flees only when the deterministic roll is below species.fear', () => {
    const lowFearInput: AggressionInput = {
      tick: 200,
      predatorPopulation: [predatorRow()],
      npcsOnTile: ['npc_yuna'],
      species: species({ fear: 0 }),
      adjacentTileIds: ['t_central'],
    }
    const lowFearPlan = planAnimalAggression(lowFearInput)
    expect(lowFearPlan!.fleeRouteId).toBeNull()
    expect(lowFearPlan!.fleeToTileId).toBeNull()

    const highFearInput: AggressionInput = {
      ...lowFearInput,
      species: species({ fear: 100 }),
    }
    const highFearPlan = planAnimalAggression(highFearInput)
    expect(highFearPlan!.fleeRouteId).not.toBeNull()
    expect(highFearPlan!.fleeToTileId).toBe('t_central')
  })

  it('skips fleeing when no adjacent ecosystem tile is provided', () => {
    const input: AggressionInput = {
      tick: 200,
      predatorPopulation: [predatorRow()],
      npcsOnTile: ['npc_yuna'],
      species: species({ fear: 100 }),
      adjacentTileIds: [],
    }
    const plan = planAnimalAggression(input)
    expect(plan!.fleeRouteId).toBeNull()
    expect(plan!.fleeToTileId).toBeNull()
  })
})

describe('aggression.planAnimalRetaliation', () => {
  it('returns null when species.aggression is zero', () => {
    const input: RetaliationInput = {
      tick: 300,
      animalId: 'a_deer_001',
      speciesId: 'forest_deer',
      tileId: 't_forest',
      hunterNpcId: 'npc_kai',
      species: species({ aggression: 0 }),
    }
    expect(planAnimalRetaliation(input)).toBeNull()
  })

  it('produces a deterministic plan when the roll passes', () => {
    // Aggression of 100 always triggers retaliation (roll < 100 always true).
    const input: RetaliationInput = {
      tick: 300,
      animalId: 'a_wolf_001',
      speciesId: 'fog_wolf',
      tileId: 't_forest',
      hunterNpcId: 'npc_kai',
      species: species({ aggression: 100 }),
    }
    const plan = planAnimalRetaliation(input)
    expect(plan).not.toBeNull()
    expect(plan!.hunterNpcId).toBe('npc_kai')
    expect(plan!.animalId).toBe('a_wolf_001')
    expect(plan!.retaliationId).toBe('retaliation.a_wolf_001.npc_kai.300')
    expect(plan!.damage.health).toBeLessThan(0)
    expect(plan!.damage.mood).toBeLessThan(0)
  })

  it('is reproducible across multiple invocations', () => {
    const input: RetaliationInput = {
      tick: 300,
      animalId: 'a_wolf_001',
      speciesId: 'fog_wolf',
      tileId: 't_forest',
      hunterNpcId: 'npc_kai',
      species: species({ aggression: 80 }),
    }
    const plan1 = planAnimalRetaliation(input)
    const plan2 = planAnimalRetaliation(input)
    expect(plan1).toEqual(plan2)
  })
})

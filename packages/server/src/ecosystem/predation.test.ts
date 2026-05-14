import { describe, expect, it } from 'vitest'
import { planPredation } from './predation.js'
import type { AnimalPopulationRow } from '../projections/animalPopulation.js'

describe('planPredation', () => {
  it('plans a deterministic same-tile predator kill against target prey', () => {
    const plan = planPredation({
      tick: 42,
      animalPopulation: [
        row('fog_wolf', 't_forest', ['wolf-a']),
        row('forest_deer', 't_forest', ['deer-a', 'deer-b']),
      ],
    })

    expect(plan?.kind).toBe('kill')
    if (plan?.kind !== 'kill') return
    expect(plan.predatorSpeciesId).toBe('fog_wolf')
    expect(plan.predatorAnimalId).toBe('wolf-a')
    expect(plan.preySpeciesId).toBe('forest_deer')
    expect(['deer-a', 'deer-b']).toContain(plan.preyAnimalId)
    expect(plan.tileId).toBe('t_forest')
    expect(plan.predatorActorId).toBe('ecosystem.predator.fog_wolf')
    expect(plan.huntId).toMatch(/^predation\.t_forest\./)
  })

  it('does not plan a kill against non-target prey', () => {
    const plan = planPredation({
      tick: 42,
      animalPopulation: [
        row('fog_wolf', 't_forest', ['wolf-a']),
        row('bark_mantis', 't_forest', ['mantis-a']),
      ],
    })

    expect(plan?.kind).toBe('starvation')
  })

  it('plans starvation pressure when predator has no same-tile prey', () => {
    const plan = planPredation({
      tick: 42,
      animalPopulation: [row('fog_wolf', 't_forest', ['wolf-a'])],
    })

    expect(plan).toEqual(expect.objectContaining({
      kind: 'starvation',
      predatorSpeciesId: 'fog_wolf',
      predatorAnimalId: 'wolf-a',
      tileId: 't_forest',
      starvationStage: 'scarce_prey',
      tick: 42,
    }))
  })

  it('ignores animals already reserved by earlier hunt planning', () => {
    const plan = planPredation({
      tick: 42,
      animalPopulation: [
        row('fog_wolf', 't_forest', ['wolf-a']),
        row('forest_deer', 't_forest', ['deer-a']),
      ],
      reservedAnimalIds: new Set(['deer-a']),
    })

    expect(plan?.kind).toBe('starvation')
  })
})

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

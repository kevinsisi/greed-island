import { describe, expect, it } from 'vitest'
import { planSpeciesExtinctionCheck } from './extinctionPlanner.js'
import { SpeciesExtinctionProjection } from '../projections/speciesExtinction.js'
import type { AnimalPopulationRow } from '../projections/animalPopulation.js'
import type { Event } from '../kernel/types.js'

// fog_wolf: extinctionThreshold = 3, forest species
// forest_deer: extinctionThreshold = 10, forest species
// marsh_fish: extinctionThreshold = 18, salt_marsh species

function makePopRow(speciesId: string, tileId: string, count: number): AnimalPopulationRow {
  return {
    speciesId,
    tileId,
    biomeRegion: 'forest',
    count,
    animalIds: Array.from({ length: count }, (_, i) => `animal-${i}`),
    lastSpawnedAtTick: 1,
    lastKilledAtTick: null,
    lastSequence: 1,
  }
}

function warningEvent(speciesId: string, tileId: string, tick: number): Event {
  let seq = Math.floor(Math.random() * 1000)
  return {
    sequence: seq, eventId: `evt-${seq}`, eventType: 'SPECIES_EXTINCTION_WARNING',
    actorId: 'system', occurredAt: 0, tick,
    payload: { actorType: 'system', data: { speciesId, tileId, population: 1, threshold: 3, tick }, narration: null },
    deterministicKey: `key-${seq}`, version: 1,
  }
}

function extinctEvent(speciesId: string, tick: number): Event {
  let seq = Math.floor(Math.random() * 1000) + 1000
  return {
    sequence: seq, eventId: `evt-${seq}`, eventType: 'SPECIES_EXTINCT',
    actorId: 'system', occurredAt: 0, tick,
    payload: { actorType: 'system', data: { speciesId, lastSeenTick: tick, affectedTileIds: [] }, narration: null },
    deterministicKey: `key-${seq}`, version: 1,
  }
}

describe('planSpeciesExtinctionCheck', () => {
  it('emits SPECIES_EXTINCTION_WARNING when tile population below threshold', () => {
    const proj = new SpeciesExtinctionProjection()
    const population = [makePopRow('fog_wolf', 't_forest', 2)]
    const intents = planSpeciesExtinctionCheck({ tick: 100, animalPopulation: population, extinctionProjection: proj })
    const warnings = intents.filter((i) => i.type === 'SPECIES_EXTINCTION_WARNING')
    expect(warnings).toHaveLength(1)
    expect(warnings[0]!.speciesId).toBe('fog_wolf')
    expect(warnings[0]!.tileId).toBe('t_forest')
    expect(warnings[0]!.population).toBe(2)
    expect(warnings[0]!.threshold).toBe(3)
  })

  it('does not emit warning when population is at or above threshold', () => {
    const proj = new SpeciesExtinctionProjection()
    const population = [makePopRow('fog_wolf', 't_forest', 5)]
    const intents = planSpeciesExtinctionCheck({ tick: 100, animalPopulation: population, extinctionProjection: proj })
    expect(intents.filter((i) => i.type === 'SPECIES_EXTINCTION_WARNING' && i.speciesId === 'fog_wolf')).toHaveLength(0)
  })

  it('does not emit warning when count is zero (extinction path, not warning path)', () => {
    const proj = new SpeciesExtinctionProjection()
    const population = [makePopRow('fog_wolf', 't_forest', 0)]
    const intents = planSpeciesExtinctionCheck({ tick: 100, animalPopulation: population, extinctionProjection: proj })
    expect(intents.filter((i) => i.type === 'SPECIES_EXTINCTION_WARNING' && i.speciesId === 'fog_wolf')).toHaveLength(0)
  })

  it('emits warnings for all qualifying tiles when multiple tiles below threshold', () => {
    const proj = new SpeciesExtinctionProjection()
    const population = [
      makePopRow('fog_wolf', 't_forest', 1),
      makePopRow('fog_wolf', 't_mountain', 2),
    ]
    const intents = planSpeciesExtinctionCheck({ tick: 100, animalPopulation: population, extinctionProjection: proj })
    const warnings = intents.filter((i) => i.type === 'SPECIES_EXTINCTION_WARNING' && i.speciesId === 'fog_wolf')
    expect(warnings).toHaveLength(2)
  })

  it('emits SPECIES_EXTINCT when total population is zero and species is in warning status', () => {
    const proj = new SpeciesExtinctionProjection()
    proj.project(warningEvent('fog_wolf', 't_forest', 50))
    const population = [makePopRow('fog_wolf', 't_forest', 0)]
    const intents = planSpeciesExtinctionCheck({ tick: 100, animalPopulation: population, extinctionProjection: proj })
    const extinct = intents.filter((i) => i.type === 'SPECIES_EXTINCT')
    expect(extinct).toHaveLength(1)
    expect(extinct[0]!.speciesId).toBe('fog_wolf')
  })

  it('does not emit SPECIES_EXTINCT when species has no warning status', () => {
    const proj = new SpeciesExtinctionProjection()
    const population = [makePopRow('fog_wolf', 't_forest', 0)]
    const intents = planSpeciesExtinctionCheck({ tick: 100, animalPopulation: population, extinctionProjection: proj })
    expect(intents.filter((i) => i.type === 'SPECIES_EXTINCT')).toHaveLength(0)
  })

  it('emits SPECIES_RECOVERED when extinct species has any tile population > 0', () => {
    const proj = new SpeciesExtinctionProjection()
    proj.project(extinctEvent('fog_wolf', 50))
    const population = [makePopRow('fog_wolf', 't_forest', 3)]
    const intents = planSpeciesExtinctionCheck({ tick: 100, animalPopulation: population, extinctionProjection: proj })
    const recovered = intents.filter((i) => i.type === 'SPECIES_RECOVERED')
    expect(recovered).toHaveLength(1)
    expect(recovered[0]!.speciesId).toBe('fog_wolf')
    expect(recovered[0]!.population).toBe(3)
  })

  it('does not emit any warning for species already in warning status', () => {
    const proj = new SpeciesExtinctionProjection()
    proj.project(warningEvent('fog_wolf', 't_forest', 50))
    const population = [makePopRow('fog_wolf', 't_forest', 1)]
    const intents = planSpeciesExtinctionCheck({ tick: 100, animalPopulation: population, extinctionProjection: proj })
    expect(intents.filter((i) => i.type === 'SPECIES_EXTINCTION_WARNING' && i.speciesId === 'fog_wolf')).toHaveLength(0)
  })

  it('returns empty array when all populations are healthy', () => {
    const proj = new SpeciesExtinctionProjection()
    const population = [
      makePopRow('fog_wolf', 't_forest', 10),
      makePopRow('forest_deer', 't_forest', 20),
    ]
    const intents = planSpeciesExtinctionCheck({ tick: 100, animalPopulation: population, extinctionProjection: proj })
    expect(intents).toHaveLength(0)
  })
})

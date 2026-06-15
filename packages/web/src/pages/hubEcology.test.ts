import { describe, expect, it } from 'vitest'
import { buildHubEcologySummaries } from './hubEcology'
import type { AnimalGroupRow } from '../api/client'

function row(
  speciesId: string,
  tileId: string,
  count: number,
  biome: AnimalGroupRow['biomeRegion'] = 'forest',
): AnimalGroupRow {
  return {
    speciesId,
    tileId,
    biomeRegion: biome,
    count,
    animalIds: Array.from({ length: count }, (_, i) => `${speciesId}-${tileId}-${i}`),
    intent: 'foraging',
    thoughtZh: `${speciesId} is foraging.`,
  }
}

describe('hubEcology.buildHubEcologySummaries', () => {
  it('returns an empty array when no facts touch any tile', () => {
    expect(
      buildHubEcologySummaries({ animals: [], migrations: [], predatorHunger: [] })
    ).toEqual([])
  })

  it('picks top-2 badges by count desc with speciesId lex tiebreak', () => {
    const summaries = buildHubEcologySummaries({
      animals: [
        row('marsh_heron', 't_temple', 1),
        row('fog_wolf', 't_temple', 4),
        row('forest_deer', 't_temple', 4),
      ],
      migrations: [],
      predatorHunger: [],
    })
    expect(summaries).toHaveLength(1)
    const s = summaries[0]!
    expect(s.tileId).toBe('t_temple')
    expect(s.badges).toHaveLength(2)
    expect(s.badges[0]!.speciesId).toBe('fog_wolf')
    expect(s.badges[1]!.speciesId).toBe('forest_deer')
  })

  it('flags predator warning with species ids when projection has rows for that tile', () => {
    const summaries = buildHubEcologySummaries({
      animals: [row('forest_deer', 't_forest', 3)],
      migrations: [],
      predatorHunger: [
        { predatorSpeciesId: 'fog_wolf', tileId: 't_forest', lastKillAtTick: 10 },
        { predatorSpeciesId: 'shadow_lynx', tileId: 't_forest', lastKillAtTick: 12 },
        { predatorSpeciesId: 'fog_wolf', tileId: 't_forest', lastKillAtTick: 15 }, // duplicate dedupes
      ],
    })
    const t_forest = summaries.find((s) => s.tileId === 't_forest')!
    expect(t_forest.predatorWarningSpecies).toEqual(['fog_wolf', 'shadow_lynx'])
  })

  it('returns empty predatorWarningSpecies when no hunger rows match', () => {
    const summaries = buildHubEcologySummaries({
      animals: [row('forest_deer', 't_forest', 3)],
      migrations: [],
      predatorHunger: [],
    })
    const t_forest = summaries.find((s) => s.tileId === 't_forest')!
    expect(t_forest.predatorWarningSpecies).toEqual([])
  })

  it('records migrationsArriving and migrationsDeparting per tile', () => {
    const summaries = buildHubEcologySummaries({
      animals: [],
      migrations: [
        {
          waveId: 'w1',
          speciesId: 'marsh_heron',
          fromTileId: 't_temple',
          toTileId: 't_dock',
          migrationType: 'seasonal',
          startedAtTick: 100,
          count: 2,
        },
      ],
      predatorHunger: [],
    })
    const t_temple = summaries.find((s) => s.tileId === 't_temple')!
    const t_dock = summaries.find((s) => s.tileId === 't_dock')!
    expect(t_temple.migrationsDeparting).toHaveLength(1)
    expect(t_temple.migrationsArriving).toHaveLength(0)
    expect(t_dock.migrationsArriving).toHaveLength(1)
    expect(t_dock.migrationsDeparting).toHaveLength(0)
  })

  it('ignores zero-count animal rows', () => {
    const summaries = buildHubEcologySummaries({
      animals: [row('forest_deer', 't_forest', 0)],
      migrations: [],
      predatorHunger: [],
    })
    expect(summaries).toEqual([])
  })
})

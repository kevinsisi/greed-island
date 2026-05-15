import { describe, expect, it } from 'vitest'
import { buildAreaEcology } from './areaEcology.js'

describe('areaEcology.buildAreaEcology', () => {
  it('returns an empty rollup when nothing touches the tile', () => {
    const view = buildAreaEcology({
      tileId: 't_central',
      animals: [],
      fishery: null,
      migrationWaves: [],
      predatorHunger: [],
    })
    expect(view.tileId).toBe('t_central')
    expect(view.animals).toEqual([])
    expect(view.fishery).toBeNull()
    expect(view.migrationsArriving).toEqual([])
    expect(view.migrationsDeparting).toEqual([])
    expect(view.predatorWarnings).toEqual([])
  })

  it('filters animal rows to the requested tile and drops zero-count rows', () => {
    const view = buildAreaEcology({
      tileId: 't_forest',
      animals: [
        {
          speciesId: 'forest_deer',
          tileId: 't_forest',
          biomeRegion: 'forest',
          count: 3,
          animalIds: ['a1', 'a2', 'a3'],
        },
        {
          speciesId: 'forest_deer',
          tileId: 't_central',
          biomeRegion: 'forest',
          count: 2,
          animalIds: ['b1', 'b2'],
        },
        {
          speciesId: 'fog_wolf',
          tileId: 't_forest',
          biomeRegion: 'forest',
          count: 0,
          animalIds: [],
        },
      ],
      fishery: null,
      migrationWaves: [],
      predatorHunger: [],
    })
    expect(view.animals).toHaveLength(1)
    expect(view.animals[0]!.speciesId).toBe('forest_deer')
    expect(view.animals[0]!.tileId).toBe('t_forest')
    expect(view.animals[0]!.count).toBe(3)
  })

  it('sorts animal rows by count desc with species lex tiebreak', () => {
    const view = buildAreaEcology({
      tileId: 't_forest',
      animals: [
        {
          speciesId: 'fog_wolf',
          tileId: 't_forest',
          biomeRegion: 'forest',
          count: 4,
          animalIds: ['w1', 'w2', 'w3', 'w4'],
        },
        {
          speciesId: 'forest_deer',
          tileId: 't_forest',
          biomeRegion: 'forest',
          count: 4,
          animalIds: ['d1', 'd2', 'd3', 'd4'],
        },
        {
          speciesId: 'marsh_heron',
          tileId: 't_forest',
          biomeRegion: 'forest',
          count: 1,
          animalIds: ['h1'],
        },
      ],
      fishery: null,
      migrationWaves: [],
      predatorHunger: [],
    })
    // count desc, then speciesId ascending lex; 'fog_wolf' < 'forest_deer'
    expect(view.animals.map((r) => r.speciesId)).toEqual(['fog_wolf', 'forest_deer', 'marsh_heron'])
  })

  it('separates migration waves into arriving and departing', () => {
    const view = buildAreaEcology({
      tileId: 't_dock',
      animals: [],
      fishery: null,
      migrationWaves: [
        {
          waveId: 'w_in',
          speciesId: 'marsh_heron',
          fromTileId: 't_temple',
          toTileId: 't_dock',
          migrationType: 'seasonal',
          startedAtTick: 100,
          count: 2,
        },
        {
          waveId: 'w_out',
          speciesId: 'forest_deer',
          fromTileId: 't_dock',
          toTileId: 't_forest',
          migrationType: 'pressure',
          startedAtTick: 90,
          count: 1,
        },
        {
          waveId: 'w_off_tile',
          speciesId: 'fog_wolf',
          fromTileId: 't_forest',
          toTileId: 't_mountain',
          migrationType: 'seasonal',
          startedAtTick: 80,
          count: 3,
        },
      ],
      predatorHunger: [],
    })
    expect(view.migrationsArriving).toHaveLength(1)
    expect(view.migrationsArriving[0]!.waveId).toBe('w_in')
    expect(view.migrationsDeparting).toHaveLength(1)
    expect(view.migrationsDeparting[0]!.waveId).toBe('w_out')
  })

  it('keeps fishery only when it matches the tile', () => {
    const matching = buildAreaEcology({
      tileId: 't_dock',
      animals: [],
      fishery: {
        tileId: 't_dock',
        density: 64,
        harvestedTotal: 12,
        collapsed: false,
        lastUpdatedTick: 200,
      },
      migrationWaves: [],
      predatorHunger: [],
    })
    expect(matching.fishery).not.toBeNull()
    expect(matching.fishery!.density).toBe(64)

    const mismatch = buildAreaEcology({
      tileId: 't_central',
      animals: [],
      fishery: {
        tileId: 't_dock',
        density: 64,
        harvestedTotal: 12,
        collapsed: false,
        lastUpdatedTick: 200,
      },
      migrationWaves: [],
      predatorHunger: [],
    })
    expect(mismatch.fishery).toBeNull()
  })

  it('filters predator warnings to the requested tile', () => {
    const view = buildAreaEcology({
      tileId: 't_forest',
      animals: [],
      fishery: null,
      migrationWaves: [],
      predatorHunger: [
        { predatorSpeciesId: 'fog_wolf', tileId: 't_forest', lastKillAtTick: 50 },
        { predatorSpeciesId: 'mountain_lynx', tileId: 't_mountain', lastKillAtTick: 30 },
      ],
    })
    expect(view.predatorWarnings).toHaveLength(1)
    expect(view.predatorWarnings[0]!.predatorSpeciesId).toBe('fog_wolf')
  })
})

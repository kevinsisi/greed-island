import { describe, expect, it } from 'vitest'
import { planLegendarySpawns } from './legendarySpawnPlanner.js'
import type { MapTileDef } from '../sim/mapGraph.js'

const saltMarshTile: MapTileDef = {
  id: 't_salt_marsh',
  name: '鹽澤',
  x: 0,
  y: 0,
  biome: 'salt_marsh',
}

const amplePreyCount = 20
const lowPreyCount = 2

// The probability check uses `hash(tick + speciesId) % 1000 < 5`.
// We need a tick where at least one legendary species passes.
// We'll brute-force find a passing tick for white_marsh_leviathan.
import { hashCanonicalJson } from '../kernel/canonicalJson.js'

function findPassingTick(speciesId: string): number {
  for (let t = 1; t < 10000; t++) {
    const hash = hashCanonicalJson({ scheme: 'legendary-prob.v1', tick: t, speciesId })
    const val = parseInt(hash.slice(0, 8), 16) % 1000
    if (val < 5) return t
  }
  throw new Error('No passing tick found in 10000 iterations')
}

describe('legendarySpawnPlanner', () => {
  it('spawns legendary creature when all conditions met', () => {
    const passingTick = findPassingTick('white_marsh_leviathan')
    const result = planLegendarySpawns({
      tick: passingTick,
      tiles: [saltMarshTile],
      getPopulation: () => 0,
      getPreyCount: () => amplePreyCount,
      getPressureLevel: () => 10,
    })
    expect(result.length).toBeGreaterThanOrEqual(1)
    const leviathan = result.find((r) => r.animal.speciesId === 'white_marsh_leviathan')
    expect(leviathan).toBeDefined()
    expect(leviathan?.animal.tileId).toBe('t_salt_marsh')
  })

  it('singleton constraint blocks second spawn', () => {
    const passingTick = findPassingTick('white_marsh_leviathan')
    const result = planLegendarySpawns({
      tick: passingTick,
      tiles: [saltMarshTile],
      getPopulation: (speciesId) => speciesId === 'white_marsh_leviathan' ? 1 : 0,
      getPreyCount: () => amplePreyCount,
      getPressureLevel: () => 10,
    })
    expect(result.find((r) => r.animal.speciesId === 'white_marsh_leviathan')).toBeUndefined()
  })

  it('high ecosystem pressure suppresses legendary spawn', () => {
    const passingTick = findPassingTick('white_marsh_leviathan')
    const result = planLegendarySpawns({
      tick: passingTick,
      tiles: [saltMarshTile],
      getPopulation: () => 0,
      getPreyCount: () => amplePreyCount,
      getPressureLevel: () => 80, // above LEGENDARY_MAX_PRESSURE=50
    })
    expect(result.find((r) => r.animal.speciesId === 'white_marsh_leviathan')).toBeUndefined()
  })

  it('insufficient prey suppresses legendary spawn', () => {
    const passingTick = findPassingTick('white_marsh_leviathan')
    const result = planLegendarySpawns({
      tick: passingTick,
      tiles: [saltMarshTile],
      getPopulation: () => 0,
      getPreyCount: () => lowPreyCount,
      getPressureLevel: () => 10,
    })
    expect(result.find((r) => r.animal.speciesId === 'white_marsh_leviathan')).toBeUndefined()
  })

  it('probability check is deterministic — same tick+species always gives same result', () => {
    const passingTick = findPassingTick('white_marsh_leviathan')
    const baseInput = {
      tiles: [saltMarshTile],
      getPopulation: () => 0,
      getPreyCount: () => amplePreyCount,
      getPressureLevel: () => 10,
    }
    const r1 = planLegendarySpawns({ ...baseInput, tick: passingTick })
    const r2 = planLegendarySpawns({ ...baseInput, tick: passingTick })
    expect(r1.length).toBe(r2.length)
    if (r1.length > 0) {
      expect(r1[0]?.animal.id).toBe(r2[0]?.animal.id)
    }
  })
})

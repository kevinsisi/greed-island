import {
  ECOSYSTEM_ANIMAL_SUBGRID_COLUMNS,
  ECOSYSTEM_ANIMAL_SUBGRID_ROWS,
  LEGENDARY_MAX_PRESSURE,
  LEGENDARY_SPAWN_MIN_PREY,
  LEGENDARY_SPAWN_PROBABILITY,
} from '../config/world.js'
import { hashCanonicalJson } from '../kernel/canonicalJson.js'
import { listSpecies, type Animal, type EcosystemRegionId } from './species.js'
import { ecosystemRegionForTile } from './animalSpawning.js'
import type { MapTileDef } from '../sim/mapGraph.js'

export type LegendarySpawnIntent = Readonly<{
  type: 'ANIMAL_SPAWNED'
  animal: Animal
  spawnedAtTick: number
}>

export type LegendarySpawnInput = Readonly<{
  tick: number
  tiles: readonly MapTileDef[]
  /** Returns total population (wild + domestic) for (speciesId, tileId). */
  getPopulation: (speciesId: string, tileId: string) => number
  /** Returns total prey count summed over preyTargets for the tile. */
  getPreyCount: (preyTargetIds: readonly string[], tileId: string) => number
  /** Returns ecosystem pressure level (0–100) for the tile. */
  getPressureLevel: (tileId: string) => number
}>

function hashToGrid(hex: string, max: number): number {
  return parseInt(hex.slice(0, 8), 16) % max
}

function buildLegendaryAnimal(speciesId: string, tileId: string, biomeRegion: EcosystemRegionId, tick: number): Animal {
  const seed = { scheme: 'legendary-spawn.v1', speciesId, tileId, tick }
  const hash = hashCanonicalJson(seed)
  return Object.freeze({
    id: `animal.legendary.${tileId}.${speciesId}.${hash.slice(0, 16)}`,
    speciesId,
    tileId,
    biomeRegion,
    position: Object.freeze({
      subCol: hashToGrid(hash.slice(16, 24), ECOSYSTEM_ANIMAL_SUBGRID_COLUMNS),
      subRow: hashToGrid(hash.slice(24, 32), ECOSYSTEM_ANIMAL_SUBGRID_ROWS),
      subZ: 0,
    }),
    state: 'idle',
    hunger: 0,
    health: 100,
    fear: 3,
    aggression: 95,
    packId: null,
    migrationTarget: null,
    currentTarget: null,
    reproductionCooldown: 0,
    lifecycleStage: 'adult',
    ownerSettlementId: null,
    domesticatedBy: null,
  } as Animal)
}

function probabilityPasses(tick: number, speciesId: string): boolean {
  const seed = { scheme: 'legendary-prob.v1', tick, speciesId }
  const hash = hashCanonicalJson(seed)
  const val = parseInt(hash.slice(0, 8), 16) % 1000
  return val < LEGENDARY_SPAWN_PROBABILITY
}

export function planLegendarySpawns(input: LegendarySpawnInput): readonly LegendarySpawnIntent[] {
  const legendarySpecies = listSpecies().filter((s) => s.rarity === 'legendary')
  if (legendarySpecies.length === 0) return []

  const results: LegendarySpawnIntent[] = []

  for (const species of legendarySpecies) {
    // Singleton constraint: skip if any living individual of this species exists anywhere
    const totalExisting = input.tiles.reduce((sum, tile) => sum + input.getPopulation(species.id, tile.id), 0)
    if (totalExisting > 0) continue

    // Probability gate
    if (!probabilityPasses(input.tick, species.id)) continue

    // Find a valid eligible tile
    for (const tile of input.tiles) {
      const region = ecosystemRegionForTile(tile)
      if (!region || !species.biomeAffinity.includes(region)) continue

      // Prey threshold
      const preyCount = input.getPreyCount(species.preyTargets, tile.id)
      if (preyCount < LEGENDARY_SPAWN_MIN_PREY) continue

      // Pressure gate
      const pressure = input.getPressureLevel(tile.id)
      if (pressure > LEGENDARY_MAX_PRESSURE) continue

      results.push({
        type: 'ANIMAL_SPAWNED',
        animal: buildLegendaryAnimal(species.id, tile.id, region, input.tick),
        spawnedAtTick: input.tick,
      })
      break // one tile per species per cadence
    }
  }

  return results
}

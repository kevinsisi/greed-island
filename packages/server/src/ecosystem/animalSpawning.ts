import {
  ECOSYSTEM_ANIMAL_SUBGRID_COLUMNS,
  ECOSYSTEM_ANIMAL_SUBGRID_ROWS,
  ECOSYSTEM_MAX_SPAWNS_PER_ACTIVE_TILE,
  ECOSYSTEM_SPAWN_CADENCE_TICKS,
  ECOSYSTEM_TILE_CARRYING_CAPACITY_DIVISOR,
} from '../config/world.js'
import { hashCanonicalJson } from '../kernel/canonicalJson.js'
import type { MapTileDef } from '../sim/mapGraph.js'
import {
  listSpeciesByRegion,
  type Animal,
  type EcosystemRegionId,
  type Species,
} from './species.js'

export type AnimalSpawnPlan = Readonly<{
  animal: Animal
  spawnedAtTick: number
}>

export type AnimalPopulationLookup = (speciesId: string, tileId: string) => number

export type PlanAnimalSpawnsInput = Readonly<{
  tick: number
  tiles: readonly MapTileDef[]
  getPopulation: AnimalPopulationLookup
}>

type EligibleTile = Readonly<{
  tile: MapTileDef
  region: EcosystemRegionId
}>

export function planAnimalSpawns(input: PlanAnimalSpawnsInput): readonly AnimalSpawnPlan[] {
  if (!Number.isInteger(input.tick) || input.tick <= 0) return []
  if (input.tick % ECOSYSTEM_SPAWN_CADENCE_TICKS !== 0) return []

  const eligibleTiles = input.tiles
    .map((tile): EligibleTile | null => {
      const region = ecosystemRegionForTile(tile)
      return region ? { tile, region } : null
    })
    .filter((entry): entry is EligibleTile => entry !== null)
    .sort((a, b) => a.tile.id.localeCompare(b.tile.id))

  if (eligibleTiles.length === 0) return []

  const activeTile = eligibleTiles[Math.floor(input.tick / ECOSYSTEM_SPAWN_CADENCE_TICKS) % eligibleTiles.length]
  if (!activeTile) return []

  const candidates = listSpeciesByRegion(activeTile.region)
    .filter((species) => species.rarity !== 'legendary')
    .filter((species) => input.getPopulation(species.id, activeTile.tile.id) < carryingCapacityForTile(species))
    .sort((a, b) => spawnRank(a, activeTile.tile.id, input.tick).localeCompare(spawnRank(b, activeTile.tile.id, input.tick)))

  return candidates
    .slice(0, ECOSYSTEM_MAX_SPAWNS_PER_ACTIVE_TILE)
    .map((species) => ({
      animal: animalFromSeed(species, activeTile.tile.id, activeTile.region, input.tick),
      spawnedAtTick: input.tick,
    }))
}

export function ecosystemRegionForTile(tile: Pick<MapTileDef, 'id' | 'biome'>): EcosystemRegionId | null {
  if (tile.id === 't_salt_marsh') return 'salt_marsh'
  if (tile.biome === 'forest') return 'forest'
  if (tile.biome === 'mountain') return 'mountain'
  if (tile.biome === 'desert') return 'desert'
  if (tile.biome === 'ruin') return 'ruin'
  return null
}

export function carryingCapacityForTile(species: Pick<Species, 'carryingCapacity'>): number {
  return Math.max(1, Math.floor(species.carryingCapacity / ECOSYSTEM_TILE_CARRYING_CAPACITY_DIVISOR))
}

function animalFromSeed(
  species: Species,
  tileId: string,
  biomeRegion: EcosystemRegionId,
  tick: number
): Animal {
  const seed = { scheme: 'animal-spawn.v1', speciesId: species.id, tileId, tick }
  const hash = hashCanonicalJson(seed)
  return Object.freeze({
    id: `animal.${tileId}.${species.id}.${hash.slice(0, 16)}`,
    speciesId: species.id,
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
    fear: species.fear,
    aggression: species.aggression,
    packId: packIdForSpecies(species, tileId, tick),
    migrationTarget: null,
    currentTarget: null,
    reproductionCooldown: 0,
    lifecycleStage: 'adult',
    ownerSettlementId: null,
    domesticatedBy: null,
  })
}

function packIdForSpecies(species: Species, tileId: string, tick: number): string | null {
  if (species.packBehavior === 'solitary') return null
  const hash = hashCanonicalJson({ scheme: 'animal-pack.v1', speciesId: species.id, tileId, tick })
  return `pack.${tileId}.${species.id}.${hash.slice(0, 8)}`
}

function spawnRank(species: Species, tileId: string, tick: number): string {
  return hashCanonicalJson({ scheme: 'animal-spawn-rank.v1', speciesId: species.id, tileId, tick })
}

function hashToGrid(hex: string, max: number): number {
  const parsed = Number.parseInt(hex, 16)
  if (!Number.isFinite(parsed)) return 0
  return parsed % max
}

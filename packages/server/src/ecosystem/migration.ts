import {
  ECOSYSTEM_MIGRATION_PRESSURE_THRESHOLD,
  ECOSYSTEM_REPRODUCTION_CADENCE_TICKS,
} from '../config/world.js'
import { hashCanonicalJson } from '../kernel/canonicalJson.js'
import { TILE_BY_ID, getMapAdjacency } from '../sim/mapGraph.js'
import { carryingCapacityForTile, ecosystemRegionForTile } from './animalSpawning.js'
import { getSpecies, type EcosystemRegionId } from './species.js'
import type { AnimalPopulationRow } from '../projections/animalPopulation.js'

export type MigrationType = 'pressure' | 'seasonal'

export type AnimalMigrationPlan = Readonly<{
  animalId: string
  speciesId: string
  fromTileId: string
  toTileId: string
  migrationType: MigrationType
  waveId: string
  migratedAtTick: number
}>

export type PlanAnimalMigrationInput = Readonly<{
  tick: number
  animalPopulation: readonly AnimalPopulationRow[]
  unlockedTileIds?: readonly string[]
  reservedAnimalIds?: ReadonlySet<string>
}>

export function planAnimalMigration(input: PlanAnimalMigrationInput): AnimalMigrationPlan | null {
  if (!Number.isInteger(input.tick) || input.tick <= 0) return null
  if (input.tick % ECOSYSTEM_REPRODUCTION_CADENCE_TICKS !== 0) return null

  const adjacency = getMapAdjacency(input.unlockedTileIds ?? [])
  const reserved = input.reservedAnimalIds ?? new Set<string>()

  // Build per-tile population counts for capacity checks on destination tiles.
  const destCounts = new Map<string, Map<string, number>>()
  for (const row of input.animalPopulation) {
    let bySpecies = destCounts.get(row.tileId)
    if (!bySpecies) {
      bySpecies = new Map()
      destCounts.set(row.tileId, bySpecies)
    }
    bySpecies.set(row.speciesId, row.count)
  }

  const candidates = input.animalPopulation
    .flatMap((row): Array<{ row: AnimalPopulationRow; migrationType: MigrationType; rank: string }> => {
      const species = getSpecies(row.speciesId)
      if (!species) return []
      if (species.migrationPattern === 'none' || species.migrationPattern === 'event_driven') return []

      const availableIds = row.animalIds.filter((id) => !reserved.has(id)).sort()
      if (availableIds.length === 0) return []

      const migrationType: MigrationType =
        species.migrationPattern === 'pressure' ? 'pressure' : 'seasonal'

      if (migrationType === 'pressure') {
        const capacity = carryingCapacityForTile(species)
        const ratio = row.count / capacity
        if (ratio < ECOSYSTEM_MIGRATION_PRESSURE_THRESHOLD) return []
      }

      // Check if any adjacent ecosystem destination has capacity.
      const dest = selectDestinationTile(row.speciesId, row.tileId, species.biomeAffinity as readonly string[], adjacency, destCounts, input.tick)
      if (!dest) return []

      const rank = hashCanonicalJson({ scheme: 'migration-candidate.v1', speciesId: row.speciesId, tileId: row.tileId, tick: input.tick })
      return [{ row: { ...row, animalIds: availableIds }, migrationType, rank }]
    })
    .sort((a, b) => a.rank.localeCompare(b.rank) || a.row.tileId.localeCompare(b.row.tileId) || a.row.speciesId.localeCompare(b.row.speciesId))

  const candidate = candidates[0]
  if (!candidate) return null

  const species = getSpecies(candidate.row.speciesId)!
  const toTileId = selectDestinationTile(
    candidate.row.speciesId,
    candidate.row.tileId,
    species.biomeAffinity as readonly string[],
    adjacency,
    destCounts,
    input.tick,
  )
  if (!toTileId) return null

  const animalId = pickAnimalId(candidate.row.animalIds, candidate.row.speciesId, candidate.row.tileId, input.tick)
  if (!animalId) return null

  const waveId = hashCanonicalJson({
    scheme: 'migration-wave.v1',
    speciesId: candidate.row.speciesId,
    fromTileId: candidate.row.tileId,
    toTileId,
    startedAtTick: input.tick,
  })

  return {
    animalId,
    speciesId: candidate.row.speciesId,
    fromTileId: candidate.row.tileId,
    toTileId,
    migrationType: candidate.migrationType,
    waveId,
    migratedAtTick: input.tick,
  }
}

export function migrationDestinationRegion(toTileId: string): EcosystemRegionId | null {
  const tile = TILE_BY_ID[toTileId]
  if (!tile) return null
  return ecosystemRegionForTile(tile)
}

function selectDestinationTile(
  speciesId: string,
  fromTileId: string,
  biomeAffinity: readonly string[],
  adjacency: Readonly<Record<string, readonly string[]>>,
  destCounts: Map<string, Map<string, number>>,
  tick: number,
): string | null {
  const neighbors = adjacency[fromTileId] ?? []
  const ecosystemNeighbors = neighbors
    .map((id) => ({ id, tile: TILE_BY_ID[id] }))
    .filter((entry): entry is { id: string; tile: NonNullable<typeof entry.tile> } => !!entry.tile)
    .filter(({ tile }) => !!ecosystemRegionForTile(tile))

  if (ecosystemNeighbors.length === 0) return null

  const species = getSpecies(speciesId)
  if (!species) return null
  const capacity = carryingCapacityForTile(species)

  const eligible = ecosystemNeighbors.filter(({ id }) => {
    const count = destCounts.get(id)?.get(speciesId) ?? 0
    return count < capacity
  })
  if (eligible.length === 0) return null

  // Prefer biome-matching tiles.
  const biomeSets = new Set(biomeAffinity)
  const preferred = eligible.filter(({ tile }) => {
    const region = ecosystemRegionForTile(tile)
    return region && biomeSets.has(region)
  })
  const pool = preferred.length > 0 ? preferred : eligible

  // Deterministic selection from pool.
  const ranked = pool
    .map(({ id }) => ({
      id,
      rank: hashCanonicalJson({ scheme: 'migration-dest.v1', speciesId, fromTileId, toTileId: id, tick }),
    }))
    .sort((a, b) => a.rank.localeCompare(b.rank) || a.id.localeCompare(b.id))

  return ranked[0]?.id ?? null
}

function pickAnimalId(animalIds: readonly string[], speciesId: string, tileId: string, tick: number): string | null {
  const ids = [...animalIds].sort()
  if (ids.length === 0) return null
  const hash = hashCanonicalJson({ scheme: 'migration-animal.v1', speciesId, tileId, tick })
  const index = Number.parseInt(hash.slice(0, 8), 16) % ids.length
  return ids[index] ?? null
}

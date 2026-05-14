import {
  ECOSYSTEM_ANIMAL_SUBGRID_COLUMNS,
  ECOSYSTEM_ANIMAL_SUBGRID_ROWS,
  ECOSYSTEM_REPRODUCTION_CADENCE_TICKS,
} from '../config/world.js'
import { hashCanonicalJson } from '../kernel/canonicalJson.js'
import type { AnimalPopulationRow } from '../projections/animalPopulation.js'
import { carryingCapacityForTile } from './animalSpawning.js'
import { getSpecies, type Animal, type Species } from './species.js'

export type AnimalReproductionPlan = Readonly<{
  animal: Animal
  parentAnimalIds: readonly [string, string]
  reproducedAtTick: number
}>

export type PlanAnimalReproductionInput = Readonly<{
  tick: number
  animalPopulation: readonly AnimalPopulationRow[]
  reservedAnimalIds?: ReadonlySet<string>
}>

export function planAnimalReproduction(input: PlanAnimalReproductionInput): AnimalReproductionPlan | null {
  if (!Number.isInteger(input.tick) || input.tick <= 0) return null
  if (input.tick % ECOSYSTEM_REPRODUCTION_CADENCE_TICKS !== 0) return null

  const reserved = input.reservedAnimalIds ?? new Set<string>()
  const candidates = input.animalPopulation
    .map((row) => ({ ...row, animalIds: row.animalIds.filter((id) => !reserved.has(id)).sort() }))
    .filter((row) => row.animalIds.length >= 2)
    .flatMap((row) => {
      const species = getSpecies(row.speciesId)
      if (!species || species.reproductionRate <= 0) return []
      if (row.count >= carryingCapacityForTile(species)) return []
      if (!passesReproductionRate(species, row.tileId, input.tick)) return []
      return [{ row, species, rank: reproductionRank(row.speciesId, row.tileId, input.tick) }]
    })
    .sort((a, b) => a.rank.localeCompare(b.rank) || a.row.tileId.localeCompare(b.row.tileId) || a.row.speciesId.localeCompare(b.row.speciesId))

  const candidate = candidates[0]
  if (!candidate) return null
  const parentAnimalIds = parentPair(candidate.row.animalIds, candidate.species.id, candidate.row.tileId, input.tick)
  if (!parentAnimalIds) return null
  return {
    animal: newbornAnimal(candidate.species, candidate.row, parentAnimalIds, input.tick),
    parentAnimalIds,
    reproducedAtTick: input.tick,
  }
}

function passesReproductionRate(species: Species, tileId: string, tick: number): boolean {
  const hash = hashCanonicalJson({ scheme: 'animal-reproduction-rate.v1', speciesId: species.id, tileId, tick })
  const roll = Number.parseInt(hash.slice(0, 8), 16) % 100
  return roll < species.reproductionRate
}

function parentPair(animalIds: readonly string[], speciesId: string, tileId: string, tick: number): readonly [string, string] | null {
  const ids = [...animalIds].sort()
  if (ids.length < 2) return null
  const firstIndex = hashIndex({ scheme: 'animal-reproduction-parent-a.v1', speciesId, tileId, tick }, ids.length)
  const first = ids[firstIndex]
  if (!first) return null
  const remaining = ids.filter((id) => id !== first)
  const second = remaining[hashIndex({ scheme: 'animal-reproduction-parent-b.v1', speciesId, tileId, tick, first }, remaining.length)]
  if (!second) return null
  return [first, second].sort() as [string, string]
}

function newbornAnimal(
  species: Species,
  row: AnimalPopulationRow,
  parentAnimalIds: readonly [string, string],
  tick: number
): Animal {
  const hash = hashCanonicalJson({
    scheme: 'animal-reproduction-newborn.v1',
    speciesId: species.id,
    tileId: row.tileId,
    parentAnimalIds,
    tick,
  })
  return Object.freeze({
    id: `animal.${row.tileId}.${species.id}.repro.${hash.slice(0, 16)}`,
    speciesId: species.id,
    tileId: row.tileId,
    biomeRegion: row.biomeRegion,
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
    packId: packIdForSpecies(species, row.tileId, tick),
    migrationTarget: null,
    currentTarget: null,
    reproductionCooldown: 0,
    lifecycleStage: 'juvenile',
    ownerSettlementId: null,
    domesticatedBy: null,
  })
}

function packIdForSpecies(species: Species, tileId: string, tick: number): string | null {
  if (species.packBehavior === 'solitary') return null
  const hash = hashCanonicalJson({ scheme: 'animal-reproduction-pack.v1', speciesId: species.id, tileId, tick })
  return `pack.${tileId}.${species.id}.${hash.slice(0, 8)}`
}

function reproductionRank(speciesId: string, tileId: string, tick: number): string {
  return hashCanonicalJson({ scheme: 'animal-reproduction-rank.v1', speciesId, tileId, tick })
}

function hashIndex(seed: Record<string, unknown>, length: number): number {
  if (length <= 0) return 0
  return Number.parseInt(hashCanonicalJson(seed).slice(0, 8), 16) % length
}

function hashToGrid(hex: string, max: number): number {
  const parsed = Number.parseInt(hex, 16)
  if (!Number.isFinite(parsed)) return 0
  return parsed % max
}

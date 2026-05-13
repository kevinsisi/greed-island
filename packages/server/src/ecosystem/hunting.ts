import {
  ECOSYSTEM_HUNT_FOOD_NEED_THRESHOLD,
  ECOSYSTEM_MEAT_GOLD_VALUE,
} from '../config/world.js'
import { hashCanonicalJson } from '../kernel/canonicalJson.js'
import type { AnimalPopulationRow } from '../projections/animalPopulation.js'
import { getSpecies } from './species.js'

export type SimpleHuntPlan = Readonly<{
  huntId: string
  npcId: string
  tileId: string
  targetSpeciesId: string
  targetAnimalId: string
  carcassId: string
  quantity: number
  goldValue: number
  tick: number
}>

export type PlanSimpleHuntInput = Readonly<{
  tick: number
  npcId: string
  tileId: string
  roleZh: string
  roleEn: string
  foodNeed: number
  animalPopulation: readonly AnimalPopulationRow[]
  reservedAnimalIds?: ReadonlySet<string>
}>

export function planSimpleHunt(input: PlanSimpleHuntInput): SimpleHuntPlan | null {
  if (!Number.isInteger(input.tick) || input.tick <= 0) return null
  if (!isHunterRole(input.roleZh, input.roleEn)) return null
  if (input.foodNeed < ECOSYSTEM_HUNT_FOOD_NEED_THRESHOLD) return null

  const reserved = input.reservedAnimalIds ?? new Set<string>()
  const candidates = input.animalPopulation
    .filter((row) => row.tileId === input.tileId && row.count > 0)
    .flatMap((row) => {
      const species = getSpecies(row.speciesId)
      if (!species || species.edibleYield <= 0) return []
      if (species.category !== 'herbivore' && species.category !== 'fish') return []
      const animalIds = row.animalIds.filter((id) => !reserved.has(id)).sort()
      if (animalIds.length === 0) return []
      return [{ row, animalIds, rank: huntRank(input.npcId, row.speciesId, row.tileId, input.tick) }]
    })
    .sort((a, b) => a.rank.localeCompare(b.rank) || a.row.speciesId.localeCompare(b.row.speciesId))

  const target = candidates[0]
  if (!target) return null
  const species = getSpecies(target.row.speciesId)
  if (!species) return null
  const animalIndex = hashIndex(
    { scheme: 'simple-hunt.animal.v1', npcId: input.npcId, speciesId: target.row.speciesId, tileId: input.tileId, tick: input.tick },
    target.animalIds.length
  )
  const targetAnimalId = target.animalIds[animalIndex]
  if (!targetAnimalId) return null

  const huntSeed = {
    scheme: 'simple-hunt.v1',
    npcId: input.npcId,
    tileId: input.tileId,
    targetSpeciesId: target.row.speciesId,
    targetAnimalId,
    tick: input.tick,
  }
  const huntHash = hashCanonicalJson(huntSeed)
  const quantity = Math.max(1, Math.floor(species.edibleYield))
  return {
    huntId: `hunt.${input.tileId}.${huntHash.slice(0, 16)}`,
    npcId: input.npcId,
    tileId: input.tileId,
    targetSpeciesId: target.row.speciesId,
    targetAnimalId,
    carcassId: `carcass.${input.tileId}.${huntHash.slice(16, 32)}`,
    quantity,
    goldValue: quantity * ECOSYSTEM_MEAT_GOLD_VALUE,
    tick: input.tick,
  }
}

export function isHunterRole(roleZh: string, roleEn: string): boolean {
  return /獵|hunter|hunt/i.test(`${roleZh} ${roleEn}`)
}

function huntRank(npcId: string, speciesId: string, tileId: string, tick: number): string {
  return hashCanonicalJson({ scheme: 'simple-hunt.rank.v1', npcId, speciesId, tileId, tick })
}

function hashIndex(seed: Record<string, unknown>, length: number): number {
  if (length <= 0) return 0
  return Number.parseInt(hashCanonicalJson(seed).slice(0, 8), 16) % length
}

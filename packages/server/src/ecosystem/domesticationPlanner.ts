import { DOMESTICATION_MIN_WILD_POP } from '../config/world.js'

export type DomesticationIntent = Readonly<{
  type: 'ANIMAL_DOMESTICATED'
  animalId: string
  speciesId: string
  settlementId: string
  tick: number
}>

export type DomesticationInput = Readonly<{
  tick: number
  settlementId: string
  settlementTileId: string
  speciesId: string
  wildPopOnTile: number
  currentLivestockCount: number
  ranchCapacity: number
  wildAnimalIds: readonly string[]
}>

export function planDomestication(input: DomesticationInput): DomesticationIntent | null {
  const { tick, settlementId, speciesId, wildPopOnTile, currentLivestockCount, ranchCapacity, wildAnimalIds } = input

  if (ranchCapacity <= 0) return null
  if (wildPopOnTile < DOMESTICATION_MIN_WILD_POP) return null
  if (currentLivestockCount >= ranchCapacity) return null
  if (wildAnimalIds.length === 0) return null

  const animalId = wildAnimalIds[0]!
  return { type: 'ANIMAL_DOMESTICATED', animalId, speciesId, settlementId, tick }
}

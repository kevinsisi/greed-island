import { BREEDING_CADENCE_TICKS } from '../config/world.js'

export type BreedingIntent = Readonly<{
  type: 'LIVESTOCK_BRED'
  settlementId: string
  speciesId: string
  newAnimalId: string
  tick: number
}>

export type BreedingInput = Readonly<{
  tick: number
  settlementId: string
  speciesId: string
  livestockCount: number
  ranchCapacity: number
}>

export function planBreeding(input: BreedingInput, idSeed: string): BreedingIntent | null {
  const { tick, settlementId, speciesId, livestockCount, ranchCapacity } = input

  if (tick % BREEDING_CADENCE_TICKS !== 0) return null
  if (livestockCount < 2) return null
  if (livestockCount >= ranchCapacity) return null

  const newAnimalId = `bred.${settlementId}.${speciesId}.${tick}.${idSeed}`
  return { type: 'LIVESTOCK_BRED', settlementId, speciesId, newAnimalId, tick }
}

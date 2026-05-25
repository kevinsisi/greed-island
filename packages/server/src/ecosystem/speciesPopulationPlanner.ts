import { POPULATION_SHIFT_MIN_PERCENT } from '../config/world.js'
import type { AnimalPopulationRow } from '../projections/animalPopulation.js'

export type SpeciesPopulationShiftIntent = Readonly<{
  speciesId: string
  previousTotal: number
  currentTotal: number
  tick: number
}>

export function planSpeciesPopulationShifts(input: {
  tick: number
  animalPopulation: readonly AnimalPopulationRow[]
  previousTotals: ReadonlyMap<string, number>
}): SpeciesPopulationShiftIntent[] {
  const { tick, animalPopulation, previousTotals } = input

  const currentTotals = new Map<string, number>()
  for (const row of animalPopulation) {
    currentTotals.set(row.speciesId, (currentTotals.get(row.speciesId) ?? 0) + row.count)
  }

  const intents: SpeciesPopulationShiftIntent[] = []
  for (const [speciesId, currentTotal] of currentTotals) {
    const previousTotal = previousTotals.get(speciesId) ?? currentTotal
    if (previousTotal === 0) continue
    const dropFraction = (previousTotal - currentTotal) / previousTotal
    if (dropFraction >= POPULATION_SHIFT_MIN_PERCENT) {
      intents.push({ speciesId, previousTotal, currentTotal, tick })
    }
  }
  return intents
}

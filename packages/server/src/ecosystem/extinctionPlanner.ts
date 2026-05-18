import type { AnimalPopulationRow } from '../projections/animalPopulation.js'
import type { SpeciesExtinctionProjection } from '../projections/speciesExtinction.js'
import { listSpecies } from './species.js'

export type ExtinctionWarningIntent = Readonly<{
  type: 'SPECIES_EXTINCTION_WARNING'
  speciesId: string
  tileId: string
  population: number
  threshold: number
  tick: number
}>

export type SpeciesExtinctIntent = Readonly<{
  type: 'SPECIES_EXTINCT'
  speciesId: string
  lastSeenTick: number
  affectedTileIds: readonly string[]
  tick: number
}>

export type SpeciesRecoveredIntent = Readonly<{
  type: 'SPECIES_RECOVERED'
  speciesId: string
  tileId: string
  population: number
  tick: number
}>

export type ExtinctionIntent = ExtinctionWarningIntent | SpeciesExtinctIntent | SpeciesRecoveredIntent

export function planSpeciesExtinctionCheck(input: {
  tick: number
  animalPopulation: readonly AnimalPopulationRow[]
  extinctionProjection: SpeciesExtinctionProjection
}): ExtinctionIntent[] {
  const { tick, animalPopulation, extinctionProjection } = input
  const intents: ExtinctionIntent[] = []

  const bySpecies = new Map<string, AnimalPopulationRow[]>()
  for (const row of animalPopulation) {
    let rows = bySpecies.get(row.speciesId)
    if (!rows) {
      rows = []
      bySpecies.set(row.speciesId, rows)
    }
    rows.push(row)
  }

  for (const species of listSpecies()) {
    const rows = bySpecies.get(species.id) ?? []
    const status = extinctionProjection.getStatus(species.id)
    const totalPopulation = rows.reduce((sum, r) => sum + r.count, 0)

    if (status === 'extinct') {
      const recoveryRow = rows.find((r) => r.count > 0)
      if (recoveryRow) {
        intents.push({
          type: 'SPECIES_RECOVERED',
          speciesId: species.id,
          tileId: recoveryRow.tileId,
          population: recoveryRow.count,
          tick,
        })
      }
      continue
    }

    if (status === 'warning' && totalPopulation === 0) {
      const affectedTileIds = rows.map((r) => r.tileId).sort()
      intents.push({
        type: 'SPECIES_EXTINCT',
        speciesId: species.id,
        lastSeenTick: tick,
        affectedTileIds,
        tick,
      })
      continue
    }

    if (status !== 'warning') {
      for (const row of rows) {
        if (row.count > 0 && row.count < species.extinctionThreshold) {
          intents.push({
            type: 'SPECIES_EXTINCTION_WARNING',
            speciesId: species.id,
            tileId: row.tileId,
            population: row.count,
            threshold: species.extinctionThreshold,
            tick,
          })
        }
      }
    }
  }

  return intents
}

import { hashCanonicalJson } from '../kernel/canonicalJson.js'
import type { AnimalPopulationRow } from '../projections/animalPopulation.js'
import { getSpecies } from './species.js'

export type PredationKillPlan = Readonly<{
  kind: 'kill'
  huntId: string
  predatorActorId: string
  predatorSpeciesId: string
  predatorAnimalId: string
  preySpeciesId: string
  preyAnimalId: string
  tileId: string
  tick: number
}>

export type PredationStarvationPlan = Readonly<{
  kind: 'starvation'
  starvationId: string
  predatorActorId: string
  predatorSpeciesId: string
  predatorAnimalId: string
  tileId: string
  starvationStage: 'hungry' | 'scarce_prey'
  tick: number
}>

export type PredationPlan = PredationKillPlan | PredationStarvationPlan

export type PlanPredationInput = Readonly<{
  tick: number
  animalPopulation: readonly AnimalPopulationRow[]
  reservedAnimalIds?: ReadonlySet<string>
}>

export function planPredation(input: PlanPredationInput): PredationPlan | null {
  if (!Number.isInteger(input.tick) || input.tick <= 0) return null
  const reserved = input.reservedAnimalIds ?? new Set<string>()
  const rows = input.animalPopulation
    .filter((row) => row.count > 0)
    .map((row) => ({ ...row, animalIds: row.animalIds.filter((id) => !reserved.has(id)).sort() }))
    .filter((row) => row.animalIds.length > 0)

  const rowBySpeciesTile = new Map<string, (typeof rows)[number]>()
  for (const row of rows) rowBySpeciesTile.set(populationKey(row.speciesId, row.tileId), row)

  const predatorCandidates = rows
    .flatMap((row) => {
      const species = getSpecies(row.speciesId)
      if (!species || species.preyTargets.length === 0) return []
      const preyRows = species.preyTargets
        .map((preySpeciesId) => rowBySpeciesTile.get(populationKey(preySpeciesId, row.tileId)))
        .filter((preyRow): preyRow is (typeof rows)[number] => !!preyRow && preyRow.animalIds.length > 0)
      const rank = predationRank(row.speciesId, row.tileId, input.tick)
      return [{ predatorRow: row, preyRows, rank }]
    })
    .sort((a, b) => a.rank.localeCompare(b.rank) || a.predatorRow.tileId.localeCompare(b.predatorRow.tileId) || a.predatorRow.speciesId.localeCompare(b.predatorRow.speciesId))

  const killCandidate = predatorCandidates.find((candidate) => candidate.preyRows.length > 0)
  if (killCandidate) {
    const predatorRow = killCandidate.predatorRow
    const preyRows = [...killCandidate.preyRows].sort((a, b) => preyRank(predatorRow.speciesId, a.speciesId, a.tileId, input.tick).localeCompare(preyRank(predatorRow.speciesId, b.speciesId, b.tileId, input.tick)) || a.speciesId.localeCompare(b.speciesId))
    const preyRow = preyRows[0]
    if (!preyRow) return null
    const predatorAnimalId = selectAnimalId(predatorRow.animalIds, { scheme: 'predation.predator.v1', tick: input.tick, speciesId: predatorRow.speciesId, tileId: predatorRow.tileId })
    const preyAnimalId = selectAnimalId(preyRow.animalIds, { scheme: 'predation.prey.v1', tick: input.tick, predatorSpeciesId: predatorRow.speciesId, preySpeciesId: preyRow.speciesId, tileId: preyRow.tileId })
    if (!predatorAnimalId || !preyAnimalId) return null
    const huntHash = hashCanonicalJson({ scheme: 'predation.hunt.v1', tick: input.tick, predatorAnimalId, preyAnimalId, tileId: predatorRow.tileId })
    return {
      kind: 'kill',
      huntId: `predation.${predatorRow.tileId}.${huntHash.slice(0, 16)}`,
      predatorActorId: predatorActorId(predatorRow.speciesId),
      predatorSpeciesId: predatorRow.speciesId,
      predatorAnimalId,
      preySpeciesId: preyRow.speciesId,
      preyAnimalId,
      tileId: predatorRow.tileId,
      tick: input.tick,
    }
  }

  const starvationCandidate = predatorCandidates[0]
  if (!starvationCandidate) return null
  const predatorAnimalId = selectAnimalId(starvationCandidate.predatorRow.animalIds, {
    scheme: 'predation.starvation.predator.v1',
    tick: input.tick,
    speciesId: starvationCandidate.predatorRow.speciesId,
    tileId: starvationCandidate.predatorRow.tileId,
  })
  if (!predatorAnimalId) return null
  const starvationHash = hashCanonicalJson({ scheme: 'predation.starvation.v1', tick: input.tick, predatorAnimalId, tileId: starvationCandidate.predatorRow.tileId })
  return {
    kind: 'starvation',
    starvationId: `starvation.${starvationCandidate.predatorRow.tileId}.${starvationHash.slice(0, 16)}`,
    predatorActorId: predatorActorId(starvationCandidate.predatorRow.speciesId),
    predatorSpeciesId: starvationCandidate.predatorRow.speciesId,
    predatorAnimalId,
    tileId: starvationCandidate.predatorRow.tileId,
    starvationStage: 'scarce_prey',
    tick: input.tick,
  }
}

function predationRank(speciesId: string, tileId: string, tick: number): string {
  return hashCanonicalJson({ scheme: 'predation.rank.v1', speciesId, tileId, tick })
}

function preyRank(predatorSpeciesId: string, preySpeciesId: string, tileId: string, tick: number): string {
  return hashCanonicalJson({ scheme: 'predation.prey-rank.v1', predatorSpeciesId, preySpeciesId, tileId, tick })
}

function selectAnimalId(animalIds: readonly string[], seed: Record<string, unknown>): string | null {
  if (animalIds.length === 0) return null
  return animalIds[Number.parseInt(hashCanonicalJson(seed).slice(0, 8), 16) % animalIds.length] ?? null
}

function predatorActorId(speciesId: string): string {
  return `ecosystem.predator.${speciesId}`
}

function populationKey(speciesId: string, tileId: string): string {
  return `${speciesId}@${tileId}`
}

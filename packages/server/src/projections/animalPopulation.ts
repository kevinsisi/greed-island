import { hashCanonicalJson } from '../kernel/canonicalJson.js'
import type { Event } from '../kernel/types.js'
import type { Animal, EcosystemRegionId } from '../ecosystem/species.js'

export type AnimalPopulationRow = Readonly<{
  speciesId: string
  tileId: string
  biomeRegion: EcosystemRegionId
  count: number
  animalIds: readonly string[]
  lastSpawnedAtTick: number
  lastKilledAtTick: number | null
  lastSequence: number
}>

const ANIMAL_SPAWNED = 'ANIMAL_SPAWNED'
const ANIMAL_KILLED = 'ANIMAL_KILLED'
const ANIMAL_REPRODUCED = 'ANIMAL_REPRODUCED'

export class AnimalPopulationProjection {
  private rows = new Map<string, AnimalPopulationRow>()

  rebuildFromEvents(events: readonly Event[]): void {
    this.rows = new Map()
    for (const event of [...events].sort((a, b) => a.sequence - b.sequence)) {
      this.project(event)
    }
  }

  project(event: Event): void {
    if (event.eventType === ANIMAL_SPAWNED) {
      const payload = readSpawnPayload(event)
      if (!payload) return
      this.addAnimal(payload.animal, payload.spawnedAtTick, event.sequence, true)
      return
    }

    if (event.eventType === ANIMAL_REPRODUCED) {
      const payload = readReproducedPayload(event)
      if (!payload) return
      this.addAnimal(payload.animal, payload.reproducedAtTick, event.sequence, false)
      return
    }

    if (event.eventType === ANIMAL_KILLED) {
      const payload = readKilledPayload(event)
      if (!payload) return
      const key = populationKey(payload.speciesId, payload.tileId)
      const existing = this.rows.get(key)
      if (!existing || !existing.animalIds.includes(payload.animalId)) return
      const animalIds = existing.animalIds.filter((id) => id !== payload.animalId).sort()
      this.rows.set(key, {
        ...existing,
        count: animalIds.length,
        animalIds,
        lastKilledAtTick: payload.killedAtTick,
        lastSequence: event.sequence,
      })
    }
  }

  countSpeciesOnTile(speciesId: string, tileId: string): number {
    return this.rows.get(populationKey(speciesId, tileId))?.count ?? 0
  }

  getBySpeciesAndTile(speciesId: string, tileId: string): AnimalPopulationRow | null {
    return this.rows.get(populationKey(speciesId, tileId)) ?? null
  }

  list(): AnimalPopulationRow[] {
    return [...this.rows.values()].sort(
      (a, b) => a.tileId.localeCompare(b.tileId) || a.speciesId.localeCompare(b.speciesId)
    )
  }

  canonicalHash(): string {
    return hashCanonicalJson(this.list())
  }

  private addAnimal(animal: Animal, eventTick: number, sequence: number, updateLastSpawnedAtTick: boolean): void {
    const key = populationKey(animal.speciesId, animal.tileId)
    const existing = this.rows.get(key)
    if (existing?.animalIds.includes(animal.id)) return

    const animalIds = [...(existing?.animalIds ?? []), animal.id].sort()
    this.rows.set(key, {
      speciesId: animal.speciesId,
      tileId: animal.tileId,
      biomeRegion: animal.biomeRegion,
      count: animalIds.length,
      animalIds,
      lastSpawnedAtTick: updateLastSpawnedAtTick ? eventTick : existing?.lastSpawnedAtTick ?? eventTick,
      lastKilledAtTick: existing?.lastKilledAtTick ?? null,
      lastSequence: sequence,
    })
  }
}

function readSpawnPayload(event: Event): { animal: Animal; spawnedAtTick: number } | null {
  const payload = (event.payload as { data?: unknown } | null)?.data
  if (!payload || typeof payload !== 'object') return null
  const p = payload as Record<string, unknown>
  if (!p.animal || typeof p.animal !== 'object') return null
  const animal = p.animal as Partial<Animal>
  if (typeof animal.id !== 'string' || animal.id.length === 0) return null
  if (typeof animal.speciesId !== 'string' || animal.speciesId.length === 0) return null
  if (typeof animal.tileId !== 'string' || animal.tileId.length === 0) return null
  if (!isEcosystemRegionId(animal.biomeRegion)) return null
  if (typeof p.spawnedAtTick !== 'number' || !Number.isInteger(p.spawnedAtTick) || p.spawnedAtTick < 0) return null
  return { animal: animal as Animal, spawnedAtTick: p.spawnedAtTick }
}

function readReproducedPayload(event: Event): { animal: Animal; reproducedAtTick: number } | null {
  const payload = (event.payload as { data?: unknown } | null)?.data
  if (!payload || typeof payload !== 'object') return null
  const p = payload as Record<string, unknown>
  if (!p.animal || typeof p.animal !== 'object') return null
  const animal = p.animal as Partial<Animal>
  if (typeof animal.id !== 'string' || animal.id.length === 0) return null
  if (typeof animal.speciesId !== 'string' || animal.speciesId.length === 0) return null
  if (typeof animal.tileId !== 'string' || animal.tileId.length === 0) return null
  if (!isEcosystemRegionId(animal.biomeRegion)) return null
  if (typeof p.reproducedAtTick !== 'number' || !Number.isInteger(p.reproducedAtTick) || p.reproducedAtTick < 0) return null
  return { animal: animal as Animal, reproducedAtTick: p.reproducedAtTick }
}

function readKilledPayload(event: Event): { animalId: string; speciesId: string; tileId: string; killedAtTick: number } | null {
  const payload = (event.payload as { data?: unknown } | null)?.data
  if (!payload || typeof payload !== 'object') return null
  const p = payload as Record<string, unknown>
  if (typeof p.animalId !== 'string' || p.animalId.length === 0) return null
  if (typeof p.speciesId !== 'string' || p.speciesId.length === 0) return null
  if (typeof p.tileId !== 'string' || p.tileId.length === 0) return null
  if (typeof p.killedAtTick !== 'number' || !Number.isInteger(p.killedAtTick) || p.killedAtTick < 0) return null
  return { animalId: p.animalId, speciesId: p.speciesId, tileId: p.tileId, killedAtTick: p.killedAtTick }
}

function populationKey(speciesId: string, tileId: string): string {
  return `${speciesId}@${tileId}`
}

function isEcosystemRegionId(value: unknown): value is EcosystemRegionId {
  return value === 'salt_marsh' || value === 'forest' || value === 'mountain' || value === 'desert' || value === 'ruin'
}

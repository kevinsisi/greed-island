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
  lastSequence: number
}>

const ANIMAL_SPAWNED = 'ANIMAL_SPAWNED'

export class AnimalPopulationProjection {
  private rows = new Map<string, AnimalPopulationRow>()

  rebuildFromEvents(events: readonly Event[]): void {
    this.rows = new Map()
    for (const event of [...events].sort((a, b) => a.sequence - b.sequence)) {
      this.project(event)
    }
  }

  project(event: Event): void {
    if (event.eventType !== ANIMAL_SPAWNED) return
    const payload = readPayload(event)
    if (!payload) return
    const key = populationKey(payload.animal.speciesId, payload.animal.tileId)
    const existing = this.rows.get(key)
    if (existing?.animalIds.includes(payload.animal.id)) return

    const animalIds = [...(existing?.animalIds ?? []), payload.animal.id].sort()
    this.rows.set(key, {
      speciesId: payload.animal.speciesId,
      tileId: payload.animal.tileId,
      biomeRegion: payload.animal.biomeRegion,
      count: animalIds.length,
      animalIds,
      lastSpawnedAtTick: payload.spawnedAtTick,
      lastSequence: event.sequence,
    })
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
}

function readPayload(event: Event): { animal: Animal; spawnedAtTick: number } | null {
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

function populationKey(speciesId: string, tileId: string): string {
  return `${speciesId}@${tileId}`
}

function isEcosystemRegionId(value: unknown): value is EcosystemRegionId {
  return value === 'salt_marsh' || value === 'forest' || value === 'mountain' || value === 'desert' || value === 'ruin'
}

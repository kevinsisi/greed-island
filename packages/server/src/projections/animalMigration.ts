import { hashCanonicalJson } from '../kernel/canonicalJson.js'
import type { Event } from '../kernel/types.js'
import type { MigrationType } from '../ecosystem/migration.js'

export type AnimalMigrationWaveRow = Readonly<{
  waveId: string
  speciesId: string
  fromTileId: string
  toTileId: string
  migrationType: MigrationType
  startedAtTick: number
  count: number
}>

const MIGRATION_WAVE_STARTED = 'MIGRATION_WAVE_STARTED'
const ANIMAL_MIGRATED = 'ANIMAL_MIGRATED'

export class AnimalMigrationProjection {
  private waves = new Map<string, AnimalMigrationWaveRow>()

  rebuildFromEvents(events: readonly Event[]): void {
    this.waves = new Map()
    for (const event of [...events].sort((a, b) => a.sequence - b.sequence)) {
      this.project(event)
    }
  }

  project(event: Event): void {
    if (event.eventType === MIGRATION_WAVE_STARTED) {
      const payload = readWaveStartedPayload(event)
      if (!payload) return
      if (this.waves.has(payload.waveId)) return // first-write-wins
      this.waves.set(payload.waveId, {
        waveId: payload.waveId,
        speciesId: payload.speciesId,
        fromTileId: payload.fromTileId,
        toTileId: payload.toTileId,
        migrationType: payload.migrationType,
        startedAtTick: payload.startedAtTick,
        count: 0,
      })
      return
    }

    if (event.eventType === ANIMAL_MIGRATED) {
      const payload = readMigratedPayload(event)
      if (!payload) return
      const wave = this.waves.get(payload.waveId)
      if (!wave) return
      this.waves.set(payload.waveId, { ...wave, count: wave.count + 1 })
    }
  }

  list(): AnimalMigrationWaveRow[] {
    return [...this.waves.values()].sort(
      (a, b) => a.startedAtTick - b.startedAtTick || a.speciesId.localeCompare(b.speciesId) || a.waveId.localeCompare(b.waveId)
    )
  }

  canonicalHash(): string {
    return hashCanonicalJson(this.list())
  }
}

function readWaveStartedPayload(event: Event): { waveId: string; speciesId: string; fromTileId: string; toTileId: string; migrationType: MigrationType; startedAtTick: number } | null {
  const payload = (event.payload as { data?: unknown } | null)?.data
  if (!payload || typeof payload !== 'object') return null
  const p = payload as Record<string, unknown>
  if (typeof p.waveId !== 'string' || p.waveId.length === 0) return null
  if (typeof p.speciesId !== 'string' || p.speciesId.length === 0) return null
  if (typeof p.fromTileId !== 'string' || p.fromTileId.length === 0) return null
  if (typeof p.toTileId !== 'string' || p.toTileId.length === 0) return null
  if (p.migrationType !== 'pressure' && p.migrationType !== 'seasonal') return null
  if (typeof p.startedAtTick !== 'number' || !Number.isInteger(p.startedAtTick) || p.startedAtTick < 0) return null
  return { waveId: p.waveId, speciesId: p.speciesId, fromTileId: p.fromTileId, toTileId: p.toTileId, migrationType: p.migrationType, startedAtTick: p.startedAtTick }
}

function readMigratedPayload(event: Event): { waveId: string } | null {
  const payload = (event.payload as { data?: unknown } | null)?.data
  if (!payload || typeof payload !== 'object') return null
  const p = payload as Record<string, unknown>
  if (typeof p.waveId !== 'string' || p.waveId.length === 0) return null
  return { waveId: p.waveId }
}

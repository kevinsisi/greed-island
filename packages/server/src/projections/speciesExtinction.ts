import { hashCanonicalJson } from '../kernel/canonicalJson.js'
import type { Event } from '../kernel/types.js'

export type SpeciesStatus = 'stable' | 'warning' | 'extinct'

export type SpeciesExtinctionRow = Readonly<{
  speciesId: string
  status: SpeciesStatus
  warningTileIds: readonly string[]
  extinctSince: number | null
  lastWarningTick: number | null
}>

const SPECIES_EXTINCTION_WARNING = 'SPECIES_EXTINCTION_WARNING'
const SPECIES_EXTINCT = 'SPECIES_EXTINCT'
const SPECIES_RECOVERED = 'SPECIES_RECOVERED'

export class SpeciesExtinctionProjection {
  private rows = new Map<string, SpeciesExtinctionRow>()

  rebuildFromEvents(events: readonly Event[]): void {
    this.rows = new Map()
    for (const event of [...events].sort((a, b) => a.sequence - b.sequence)) {
      this.project(event)
    }
  }

  project(event: Event): void {
    if (event.eventType === SPECIES_EXTINCTION_WARNING) {
      const p = readWarningPayload(event)
      if (!p) return
      const existing = this.rows.get(p.speciesId)
      if (existing?.status === 'extinct') return
      const prevTileIds = existing?.warningTileIds ?? []
      const tileIds = prevTileIds.includes(p.tileId)
        ? prevTileIds
        : [...prevTileIds, p.tileId].sort()
      this.rows.set(p.speciesId, {
        speciesId: p.speciesId,
        status: 'warning',
        warningTileIds: tileIds,
        extinctSince: null,
        lastWarningTick: p.tick,
      })
      return
    }

    if (event.eventType === SPECIES_EXTINCT) {
      const p = readExtinctPayload(event)
      if (!p) return
      this.rows.set(p.speciesId, {
        speciesId: p.speciesId,
        status: 'extinct',
        warningTileIds: [],
        extinctSince: p.lastSeenTick,
        lastWarningTick: this.rows.get(p.speciesId)?.lastWarningTick ?? null,
      })
      return
    }

    if (event.eventType === SPECIES_RECOVERED) {
      const p = readRecoveredPayload(event)
      if (!p) return
      this.rows.set(p.speciesId, {
        speciesId: p.speciesId,
        status: 'stable',
        warningTileIds: [],
        extinctSince: null,
        lastWarningTick: null,
      })
    }
  }

  getStatus(speciesId: string): SpeciesStatus {
    return this.rows.get(speciesId)?.status ?? 'stable'
  }

  getRow(speciesId: string): SpeciesExtinctionRow | undefined {
    return this.rows.get(speciesId)
  }

  list(): SpeciesExtinctionRow[] {
    return [...this.rows.values()]
      .filter((r) => r.status !== 'stable')
      .sort((a, b) => a.speciesId.localeCompare(b.speciesId))
  }

  canonicalHash(): string {
    return hashCanonicalJson(this.list())
  }
}

function readWarningPayload(event: Event): { speciesId: string; tileId: string; tick: number } | null {
  const p = (event.payload as { data?: unknown } | null)?.data
  if (!p || typeof p !== 'object') return null
  const d = p as Record<string, unknown>
  if (typeof d.speciesId !== 'string' || !d.speciesId) return null
  if (typeof d.tileId !== 'string' || !d.tileId) return null
  if (typeof d.tick !== 'number' || !Number.isInteger(d.tick) || d.tick < 0) return null
  return { speciesId: d.speciesId, tileId: d.tileId, tick: d.tick }
}

function readExtinctPayload(event: Event): { speciesId: string; lastSeenTick: number } | null {
  const p = (event.payload as { data?: unknown } | null)?.data
  if (!p || typeof p !== 'object') return null
  const d = p as Record<string, unknown>
  if (typeof d.speciesId !== 'string' || !d.speciesId) return null
  if (typeof d.lastSeenTick !== 'number' || !Number.isInteger(d.lastSeenTick) || d.lastSeenTick < 0) return null
  return { speciesId: d.speciesId, lastSeenTick: d.lastSeenTick }
}

function readRecoveredPayload(event: Event): { speciesId: string } | null {
  const p = (event.payload as { data?: unknown } | null)?.data
  if (!p || typeof p !== 'object') return null
  const d = p as Record<string, unknown>
  if (typeof d.speciesId !== 'string' || !d.speciesId) return null
  return { speciesId: d.speciesId }
}

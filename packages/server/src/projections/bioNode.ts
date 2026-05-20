// Phase E5 — BioNode Projection (plant ecology substrate).
// Tracks per-tile, per-species vegetation density. Reduces three event types:
//   - BIO_NODE_SEEDED: initial spawn at a (tileId, speciesId) with starting density
//   - BIO_NODE_REGREW: cadence-driven regrowth raises density toward capacity
//   - BIO_NODE_HARVESTED: NPC/player harvest reduces density, produces goods
//
// The projection is the deterministic source of truth for "what plant matter
// is on a tile". Forest Regrowth Engine reads from it and emits REGREW events;
// harvest planners read from it before emitting HARVESTED events.

import { hashCanonicalJson } from '../kernel/canonicalJson.js'
import type { Event } from '../kernel/types.js'

export type BioNodeRow = Readonly<{
  tileId: string
  speciesId: string
  density: number
  capacity: number
  lastUpdatedTick: number
  lastSequence: number
}>

const BIO_NODE_SEEDED = 'BIO_NODE_SEEDED'
const BIO_NODE_REGREW = 'BIO_NODE_REGREW'
const BIO_NODE_HARVESTED = 'BIO_NODE_HARVESTED'

export const BIO_NODE_BOOT_EVENT_TYPES = [
  BIO_NODE_SEEDED,
  BIO_NODE_REGREW,
  BIO_NODE_HARVESTED,
] as const

function keyOf(tileId: string, speciesId: string): string {
  return `${tileId}::${speciesId}`
}

export class BioNodeProjection {
  private rows = new Map<string, BioNodeRow>()

  rebuildFromEvents(events: readonly Event[]): void {
    this.rows = new Map()
    for (const event of [...events].sort((a, b) => a.sequence - b.sequence)) {
      this.project(event)
    }
  }

  project(event: Event): void {
    const data = readData(event)
    if (!data) return
    const tileId = data.tileId
    const speciesId = data.speciesId
    if (typeof tileId !== 'string' || typeof speciesId !== 'string') return
    const k = keyOf(tileId, speciesId)
    const prev = this.rows.get(k)
    if (prev && prev.lastSequence >= event.sequence) return

    if (event.eventType === BIO_NODE_SEEDED) {
      const density = numOr(data.density, 0)
      const capacity = numOr(data.capacity, density)
      const tick = numOr(data.seededAtTick, event.tick ?? 0)
      this.rows.set(k, {
        tileId,
        speciesId,
        density,
        capacity,
        lastUpdatedTick: tick,
        lastSequence: event.sequence,
      })
    } else if (event.eventType === BIO_NODE_REGREW) {
      if (!prev) return // regrow with no seed is a no-op
      const density = numOr(data.densityAfter, prev.density)
      const capacity = numOr(data.capacity, prev.capacity)
      const tick = numOr(data.tick, event.tick ?? 0)
      this.rows.set(k, {
        ...prev,
        density,
        capacity,
        lastUpdatedTick: tick,
        lastSequence: event.sequence,
      })
    } else if (event.eventType === BIO_NODE_HARVESTED) {
      if (!prev) return // harvest with no seed is a no-op
      const density = numOr(data.densityAfter, prev.density)
      const tick = numOr(data.tick, event.tick ?? 0)
      this.rows.set(k, {
        ...prev,
        density: Math.max(0, density),
        lastUpdatedTick: tick,
        lastSequence: event.sequence,
      })
    }
  }

  list(): readonly BioNodeRow[] {
    return [...this.rows.values()].sort((a, b) => {
      const t = a.tileId.localeCompare(b.tileId)
      return t !== 0 ? t : a.speciesId.localeCompare(b.speciesId)
    })
  }

  listOnTile(tileId: string): readonly BioNodeRow[] {
    return this.list().filter((r) => r.tileId === tileId)
  }

  get(tileId: string, speciesId: string): BioNodeRow | null {
    return this.rows.get(keyOf(tileId, speciesId)) ?? null
  }

  /** Used by the regrowth engine to decide if a (tile, species) was already seeded. */
  hasSeed(tileId: string, speciesId: string): boolean {
    return this.rows.has(keyOf(tileId, speciesId))
  }

  canonicalHash(): string {
    return hashCanonicalJson(this.list())
  }
}

function readData(event: Event): Record<string, unknown> | null {
  const payload = (event.payload as { data?: unknown } | null)?.data
  if (!payload || typeof payload !== 'object') return null
  return payload as Record<string, unknown>
}

function numOr(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

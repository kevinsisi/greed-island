// v0.55.0 — Forest Depletion Projection (Phase E2.2).
// Tracks which tiles are currently forest-depleted.
// Event-sourced from FOREST_DEPLETED and FOREST_RECOVERED events; rebuildable.

import { hashCanonicalJson } from '../kernel/canonicalJson.js'
import type { Event } from '../kernel/types.js'

const FOREST_DEPLETED = 'FOREST_DEPLETED'
const FOREST_RECOVERED = 'FOREST_RECOVERED'

export class ForestDepletionProjection {
  private depletedTiles = new Set<string>()

  rebuildFromEvents(events: readonly Event[]): void {
    this.depletedTiles = new Set()
    for (const event of [...events].sort((a, b) => a.sequence - b.sequence)) {
      this.project(event)
    }
  }

  project(event: Event): void {
    const tileId = readTileId(event)
    if (!tileId) return

    if (event.eventType === FOREST_DEPLETED) {
      this.depletedTiles.add(tileId)
    } else if (event.eventType === FOREST_RECOVERED) {
      this.depletedTiles.delete(tileId)
    }
  }

  isForestDepleted(tileId: string): boolean {
    return this.depletedTiles.has(tileId)
  }

  list(): string[] {
    return [...this.depletedTiles].sort()
  }

  canonicalHash(): string {
    return hashCanonicalJson(this.list())
  }
}

function readTileId(event: Event): string | null {
  const p = (event.payload as { data?: unknown } | null)?.data
  if (!p || typeof p !== 'object') return null
  const d = p as Record<string, unknown>
  return typeof d.tileId === 'string' && d.tileId.length > 0 ? d.tileId : null
}

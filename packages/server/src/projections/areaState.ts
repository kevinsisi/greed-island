// Phase 1 §11.5 — Area State Projection (typed replacement for FACT_SET).
// Reduces `AREA_STATE_RECORDED` events into the latest snapshot per tile.
// Legacy `area.state.<tileId>` FACT_SET facts remain as boot fallback for
// older logs that predate this projection.

import { hashCanonicalJson } from '../kernel/canonicalJson.js'
import type { Event } from '../kernel/types.js'
import type { AreaState } from '../sim/areaStateEngine.js'

export type AreaStateRow = Readonly<{
  tileId: string
  recordedAtTick: number
  sequence: number
  state: AreaState
}>

const AREA_STATE_RECORDED = 'AREA_STATE_RECORDED'

export class AreaStateProjection {
  private rows = new Map<string, AreaStateRow>()

  rebuildFromEvents(events: readonly Event[]): void {
    this.rows = new Map()
    for (const event of [...events].sort((a, b) => a.sequence - b.sequence)) {
      this.project(event)
    }
  }

  project(event: Event): void {
    if (event.eventType !== AREA_STATE_RECORDED) return
    const row = rowFromEvent(event)
    if (!row) return
    const previous = this.rows.get(row.tileId)
    if (!previous || previous.sequence <= row.sequence) {
      this.rows.set(row.tileId, row)
    }
  }

  getByTileId(tileId: string): AreaStateRow | null {
    return this.rows.get(tileId) ?? null
  }

  getAll(): readonly AreaStateRow[] {
    return [...this.rows.values()].sort((a, b) => a.tileId.localeCompare(b.tileId))
  }

  canonicalHash(): string {
    return hashCanonicalJson(this.getAll())
  }
}

function rowFromEvent(event: Event): AreaStateRow | null {
  const payload = (event.payload as { data?: unknown } | null)?.data
  if (!payload || typeof payload !== 'object') return null
  const p = payload as Record<string, unknown>
  if (typeof p.tileId !== 'string') return null
  if (!p.state || typeof p.state !== 'object') return null
  return {
    tileId: p.tileId,
    recordedAtTick: typeof event.tick === 'number' ? event.tick : 0,
    sequence: event.sequence,
    state: p.state as AreaState,
  }
}

// Phase 1 §33.4 — Settlements projection (Layer 3 Civilization Runtime).
//
// Pure projection over SETTLEMENT_FORMED events. Read-only surface for
// HTTP and other runtime consumers. Follow-up slices add population /
// decline / takeover events; this slice only handles formation.

import type { Event } from '../kernel/types.js'

export type SettlementRow = Readonly<{
  id: string
  tileId: string
  formedAtTick: number
  founderNpcIds: readonly string[]
}>

const SETTLEMENT_FORMED = 'SETTLEMENT_FORMED'

export class SettlementsProjection {
  private rows = new Map<string, SettlementRow>()

  rebuildFromEvents(events: readonly Event[]): void {
    this.rows = new Map()
    for (const event of events) {
      this.project(event)
    }
  }

  project(event: Event): void {
    if (event.eventType !== SETTLEMENT_FORMED) return
    const row = settlementRowFromEvent(event)
    if (!row) return
    // First-write-wins (replay safety). If a duplicate event appears,
    // keep the existing row to preserve canonical ordering.
    if (!this.rows.has(row.id)) {
      this.rows.set(row.id, row)
    }
  }

  getAll(): SettlementRow[] {
    return [...this.rows.values()].sort(
      (a, b) => a.formedAtTick - b.formedAtTick || a.id.localeCompare(b.id)
    )
  }

  getById(id: string): SettlementRow | null {
    return this.rows.get(id) ?? null
  }

  getByTile(tileId: string): SettlementRow[] {
    return this.getAll().filter((row) => row.tileId === tileId)
  }

  /** Set of tileIds that currently host a settlement — used by detection. */
  getTilesWithSettlement(): ReadonlySet<string> {
    const set = new Set<string>()
    for (const row of this.rows.values()) set.add(row.tileId)
    return set
  }

  count(): number {
    return this.rows.size
  }
}

function settlementRowFromEvent(event: Event): SettlementRow | null {
  const payload = (event.payload as { data?: unknown } | null)?.data
  if (!payload || typeof payload !== 'object') return null
  const p = payload as Record<string, unknown>
  if (typeof p.settlementId !== 'string') return null
  if (typeof p.tileId !== 'string') return null
  if (typeof p.formedAtTick !== 'number') return null
  if (!Array.isArray(p.founderNpcIds)) return null
  for (const id of p.founderNpcIds) {
    if (typeof id !== 'string') return null
  }
  return {
    id: p.settlementId,
    tileId: p.tileId,
    formedAtTick: p.formedAtTick,
    founderNpcIds: Object.freeze([...(p.founderNpcIds as string[])]) as readonly string[],
  }
}

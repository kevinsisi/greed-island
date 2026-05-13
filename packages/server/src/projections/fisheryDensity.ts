import { FISHERY_DEFAULT_DENSITY } from '../config/world.js'
import { hashCanonicalJson } from '../kernel/canonicalJson.js'
import type { Event } from '../kernel/types.js'

export type FisheryDensityRow = Readonly<{
  tileId: string
  density: number
  harvestedTotal: number
  collapsed: boolean
  lastUpdatedTick: number
  lastSequence: number
}>

const FISHERY_HARVESTED = 'FISHERY_HARVESTED'
const FISHERY_COLLAPSED = 'FISHERY_COLLAPSED'

export class FisheryDensityProjection {
  private rows = new Map<string, FisheryDensityRow>()

  rebuildFromEvents(events: readonly Event[]): void {
    this.rows = new Map()
    for (const event of [...events].sort((a, b) => a.sequence - b.sequence)) this.project(event)
  }

  project(event: Event): void {
    if (event.eventType === FISHERY_HARVESTED) {
      const payload = readHarvestPayload(event)
      if (!payload) return
      const before = this.getByTile(payload.tileId) ?? defaultRow(payload.tileId)
      this.rows.set(payload.tileId, {
        ...before,
        density: payload.densityAfter,
        harvestedTotal: before.harvestedTotal + payload.delta,
        lastUpdatedTick: payload.harvestedAtTick,
        lastSequence: event.sequence,
      })
      return
    }
    if (event.eventType === FISHERY_COLLAPSED) {
      const payload = readCollapsePayload(event)
      if (!payload) return
      const before = this.getByTile(payload.tileId) ?? defaultRow(payload.tileId)
      this.rows.set(payload.tileId, {
        ...before,
        density: payload.density,
        collapsed: true,
        lastUpdatedTick: payload.collapsedAtTick,
        lastSequence: event.sequence,
      })
    }
  }

  getByTile(tileId: string): FisheryDensityRow | null {
    return this.rows.get(tileId) ?? null
  }

  list(): FisheryDensityRow[] {
    return [...this.rows.values()].sort((a, b) => a.tileId.localeCompare(b.tileId))
  }

  canonicalHash(): string {
    return hashCanonicalJson(this.list())
  }
}

function defaultRow(tileId: string): FisheryDensityRow {
  return { tileId, density: FISHERY_DEFAULT_DENSITY, harvestedTotal: 0, collapsed: false, lastUpdatedTick: 0, lastSequence: 0 }
}

function readHarvestPayload(event: Event): { tileId: string; delta: number; densityAfter: number; harvestedAtTick: number } | null {
  const payload = (event.payload as { data?: unknown } | null)?.data
  if (!payload || typeof payload !== 'object') return null
  const p = payload as Record<string, unknown>
  if (typeof p.tileId !== 'string') return null
  if (typeof p.delta !== 'number' || !Number.isFinite(p.delta)) return null
  if (typeof p.densityAfter !== 'number' || !Number.isFinite(p.densityAfter)) return null
  if (typeof p.harvestedAtTick !== 'number' || !Number.isInteger(p.harvestedAtTick)) return null
  return { tileId: p.tileId, delta: p.delta, densityAfter: p.densityAfter, harvestedAtTick: p.harvestedAtTick }
}

function readCollapsePayload(event: Event): { tileId: string; density: number; collapsedAtTick: number } | null {
  const payload = (event.payload as { data?: unknown } | null)?.data
  if (!payload || typeof payload !== 'object') return null
  const p = payload as Record<string, unknown>
  if (typeof p.tileId !== 'string') return null
  if (typeof p.density !== 'number' || !Number.isFinite(p.density)) return null
  if (typeof p.collapsedAtTick !== 'number' || !Number.isInteger(p.collapsedAtTick)) return null
  return { tileId: p.tileId, density: p.density, collapsedAtTick: p.collapsedAtTick }
}

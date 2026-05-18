import { hashCanonicalJson } from '../kernel/canonicalJson.js'
import type { Event } from '../kernel/types.js'

export type EcosystemRegionRow = Readonly<{
  tileId: string
  pressureLevel: number
  pollutionLevel: number
  lastPressureRaisedTick: number | null
  lastRecoveredTick: number | null
}>

const ECOSYSTEM_PRESSURE_RAISED = 'ECOSYSTEM_PRESSURE_RAISED'
const ECOSYSTEM_PRESSURE_RECOVERED = 'ECOSYSTEM_PRESSURE_RECOVERED'

export class EcosystemRegionProjection {
  private rows = new Map<string, EcosystemRegionRow>()

  rebuildFromEvents(events: readonly Event[]): void {
    this.rows = new Map()
    for (const event of [...events].sort((a, b) => a.sequence - b.sequence)) {
      this.project(event)
    }
  }

  project(event: Event): void {
    if (event.eventType === ECOSYSTEM_PRESSURE_RAISED) {
      const p = readRaisedPayload(event)
      if (!p) return
      const existing = this.rows.get(p.tileId)
      this.rows.set(p.tileId, {
        tileId: p.tileId,
        pressureLevel: p.pressureLevel,
        pollutionLevel: Math.round(p.pressureLevel / 2),
        lastPressureRaisedTick: p.tick,
        lastRecoveredTick: existing?.lastRecoveredTick ?? null,
      })
      return
    }

    if (event.eventType === ECOSYSTEM_PRESSURE_RECOVERED) {
      const p = readRecoveredPayload(event)
      if (!p) return
      const existing = this.rows.get(p.tileId)
      this.rows.set(p.tileId, {
        tileId: p.tileId,
        pressureLevel: 0,
        pollutionLevel: 0,
        lastPressureRaisedTick: existing?.lastPressureRaisedTick ?? null,
        lastRecoveredTick: p.tick,
      })
    }
  }

  getForTile(tileId: string): EcosystemRegionRow {
    return this.rows.get(tileId) ?? {
      tileId,
      pressureLevel: 0,
      pollutionLevel: 0,
      lastPressureRaisedTick: null,
      lastRecoveredTick: null,
    }
  }

  list(): EcosystemRegionRow[] {
    return [...this.rows.values()]
      .filter((r) => r.pressureLevel > 0)
      .sort((a, b) => a.tileId.localeCompare(b.tileId))
  }

  canonicalHash(): string {
    return hashCanonicalJson(this.list())
  }
}

function readRaisedPayload(event: Event): { tileId: string; pressureLevel: number; tick: number } | null {
  const p = (event.payload as { data?: unknown } | null)?.data
  if (!p || typeof p !== 'object') return null
  const d = p as Record<string, unknown>
  if (typeof d.tileId !== 'string' || !d.tileId) return null
  if (typeof d.pressureLevel !== 'number' || !Number.isInteger(d.pressureLevel) || d.pressureLevel < 0) return null
  if (typeof d.tick !== 'number' || !Number.isInteger(d.tick) || d.tick < 0) return null
  return { tileId: d.tileId, pressureLevel: d.pressureLevel, tick: d.tick }
}

function readRecoveredPayload(event: Event): { tileId: string; tick: number } | null {
  const p = (event.payload as { data?: unknown } | null)?.data
  if (!p || typeof p !== 'object') return null
  const d = p as Record<string, unknown>
  if (typeof d.tileId !== 'string' || !d.tileId) return null
  if (typeof d.tick !== 'number' || !Number.isInteger(d.tick) || d.tick < 0) return null
  return { tileId: d.tileId, tick: d.tick }
}

import type { FactionId } from '../sim/areaStateEngine.js'
import type { Event } from '../kernel/types.js'

export type FactionControlRow = Readonly<{
  tileId: string
  factionId: FactionId
  previousFactionId: string | null
  seizedAtTick: number
  lastSequence: number
}>

const FACTION_TILE_SEIZED = 'FACTION_TILE_SEIZED'

function readPayload(event: Event): { tileId: string; factionId: string; previousFactionId: string | null; seizedAtTick: number } | null {
  const raw = event.payload as Record<string, unknown> | null
  if (!raw) return null
  const d = (typeof raw['data'] === 'object' && raw['data'] !== null ? raw['data'] : raw) as Record<string, unknown>
  if (typeof d['tileId'] !== 'string' || d['tileId'].length === 0) return null
  if (typeof d['factionId'] !== 'string' || d['factionId'].length === 0) return null
  if (d['previousFactionId'] !== null && typeof d['previousFactionId'] !== 'string') return null
  if (typeof d['seizedAtTick'] !== 'number' || !Number.isInteger(d['seizedAtTick'])) return null
  return {
    tileId: d['tileId'],
    factionId: d['factionId'],
    previousFactionId: d['previousFactionId'] as string | null,
    seizedAtTick: d['seizedAtTick'],
  }
}

export class FactionControlProjection {
  private rows = new Map<string, FactionControlRow>()

  rebuildFromEvents(events: readonly Event[]): void {
    this.rows = new Map()
    for (const event of [...events].sort((a, b) => a.sequence - b.sequence)) {
      this.project(event)
    }
  }

  project(event: Event): void {
    if (event.eventType !== FACTION_TILE_SEIZED) return
    const p = readPayload(event)
    if (!p) return
    this.rows.set(p.tileId, {
      tileId: p.tileId,
      factionId: p.factionId as FactionId,
      previousFactionId: p.previousFactionId,
      seizedAtTick: p.seizedAtTick,
      lastSequence: event.sequence,
    })
  }

  dominantFactionOf(tileId: string): FactionId | null {
    return this.rows.get(tileId)?.factionId ?? null
  }

  dominantTilesOf(factionId: FactionId): readonly string[] {
    return [...this.rows.values()]
      .filter((r) => r.factionId === factionId)
      .map((r) => r.tileId)
      .sort()
  }

  list(): readonly FactionControlRow[] {
    return [...this.rows.values()].sort((a, b) => a.tileId.localeCompare(b.tileId))
  }
}

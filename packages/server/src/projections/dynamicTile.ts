import type { Event } from '../kernel/types.js'
import type { MapTileDef } from '../sim/mapGraph.js'

export type DynamicTileRow = MapTileDef & Readonly<{ adjacentTileIds: readonly string[]; generatedAtTick: number }>

export const DYNAMIC_TILE_BOOT_EVENT_TYPES = ['TILE_GENERATED'] as const

function readData(event: Event): Record<string, unknown> | null {
  const payload = (event.payload as { data?: unknown } | null)?.data
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null
  return payload as Record<string, unknown>
}

export class DynamicTileProjection {
  private tiles = new Map<string, DynamicTileRow>()

  project(event: Event): void {
    if (event.eventType !== 'TILE_GENERATED') return
    const d = readData(event)
    if (!d) return
    if (typeof d.tileId !== 'string' || d.tileId.length === 0) return
    if (typeof d.biome !== 'string') return
    if (typeof d.name !== 'string') return
    if (typeof d.x !== 'number' || typeof d.y !== 'number') return
    if (!Array.isArray(d.adjacentTileIds)) return
    if (typeof d.generatedAtTick !== 'number') return
    this.tiles.set(d.tileId, {
      id: d.tileId,
      biome: d.biome,
      name: d.name,
      x: d.x,
      y: d.y,
      adjacentTileIds: d.adjacentTileIds as string[],
      generatedAtTick: d.generatedAtTick,
    })
  }

  rebuildFromEvents(events: readonly Event[]): void {
    this.tiles = new Map()
    for (const ev of [...events].sort((a, b) => a.sequence - b.sequence)) this.project(ev)
  }

  list(): readonly DynamicTileRow[] {
    return [...this.tiles.values()].sort((a, b) => a.id.localeCompare(b.id))
  }

  listTileIds(): readonly string[] {
    return [...this.tiles.keys()].sort()
  }

  has(tileId: string): boolean {
    return this.tiles.has(tileId)
  }
}

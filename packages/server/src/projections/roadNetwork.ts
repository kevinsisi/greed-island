import { hashCanonicalJson } from '../kernel/canonicalJson.js'
import type { Event } from '../kernel/types.js'

export type RoadType = 'road' | 'bridge'

export type RoadRow = Readonly<{
  roadId: string
  fromTileId: string
  toTileId: string
  roadType: RoadType
  constructedAtTick: number
}>

export const ROAD_NETWORK_BOOT_EVENT_TYPES = [
  'ROAD_CONSTRUCTED',
  'ROAD_DESTROYED',
] as const

const ROAD_TYPES = new Set<string>(['road', 'bridge'])
function isRoadType(v: unknown): v is RoadType {
  return typeof v === 'string' && ROAD_TYPES.has(v)
}

function readData(event: Event): Record<string, unknown> | null {
  const payload = (event.payload as { data?: unknown } | null)?.data
  if (!payload || typeof payload !== 'object') return null
  return payload as Record<string, unknown>
}

function readString(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

export class RoadNetworkProjection {
  private roads = new Map<string, RoadRow>()

  project(event: Event): void {
    const data = readData(event)
    if (!data) return
    const roadId = readString(data.roadId)
    if (!roadId) return

    switch (event.eventType) {
      case 'ROAD_CONSTRUCTED': {
        const fromTileId = readString(data.fromTileId)
        const toTileId = readString(data.toTileId)
        const roadType = isRoadType(data.roadType) ? data.roadType : 'road'
        if (!fromTileId || !toTileId) return
        this.roads.set(roadId, {
          roadId,
          fromTileId,
          toTileId,
          roadType,
          constructedAtTick: typeof data.constructedAtTick === 'number' ? data.constructedAtTick : event.tick ?? 0,
        })
        break
      }
      case 'ROAD_DESTROYED':
        this.roads.delete(roadId)
        break
    }
  }

  hasRoad(fromTileId: string, toTileId: string): boolean {
    for (const road of this.roads.values()) {
      if (
        (road.fromTileId === fromTileId && road.toTileId === toTileId) ||
        (road.fromTileId === toTileId && road.toTileId === fromTileId)
      ) {
        return true
      }
    }
    return false
  }

  /** Returns a set of "fromTileId:toTileId" strings for bidirectional lookup. */
  getRoadSet(): ReadonlySet<string> {
    const set = new Set<string>()
    for (const road of this.roads.values()) {
      set.add(`${road.fromTileId}:${road.toTileId}`)
      set.add(`${road.toTileId}:${road.fromTileId}`)
    }
    return set
  }

  list(): readonly RoadRow[] {
    return [...this.roads.values()]
  }

  canonicalHash(): string {
    return hashCanonicalJson([...this.roads.values()].sort((a, b) => a.roadId.localeCompare(b.roadId)))
  }

  rebuildFromEvents(events: readonly Event[]): void {
    this.roads.clear()
    for (const ev of events) this.project(ev)
  }
}

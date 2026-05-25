import type { Event } from '../kernel/types.js'

export type WallRow = Readonly<{
  wallId: string
  tileIdA: string
  tileIdB: string
  factionIdA: string
  factionIdB: string
  builtAtTick: number
}>

export const WALL_NETWORK_BOOT_EVENT_TYPES = ['WALL_BUILT', 'WALL_DEMOLISHED'] as const

function readData(event: Event): Record<string, unknown> | null {
  const payload = (event.payload as { data?: unknown } | null)?.data
  if (!payload || typeof payload !== 'object') return null
  return payload as Record<string, unknown>
}

function readString(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

function borderKey(a: string, b: string): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`
}

export class WallNetworkProjection {
  private walls = new Map<string, WallRow>()

  project(event: Event): void {
    const data = readData(event)
    if (!data) return
    const wallId = readString(data.wallId)
    if (!wallId) return

    switch (event.eventType) {
      case 'WALL_BUILT': {
        const tileIdA = readString(data.tileIdA)
        const tileIdB = readString(data.tileIdB)
        const factionIdA = readString(data.factionIdA)
        const factionIdB = readString(data.factionIdB)
        if (!tileIdA || !tileIdB || !factionIdA || !factionIdB) return
        this.walls.set(wallId, {
          wallId,
          tileIdA,
          tileIdB,
          factionIdA,
          factionIdB,
          builtAtTick: typeof data.builtAtTick === 'number' ? data.builtAtTick : 0,
        })
        break
      }
      case 'WALL_DEMOLISHED':
        this.walls.delete(wallId)
        break
    }
  }

  hasWall(tileIdA: string, tileIdB: string): boolean {
    const key = borderKey(tileIdA, tileIdB)
    for (const wall of this.walls.values()) {
      if (borderKey(wall.tileIdA, wall.tileIdB) === key) return true
    }
    return false
  }

  wallIdForBorder(tileIdA: string, tileIdB: string): string | null {
    const key = borderKey(tileIdA, tileIdB)
    for (const wall of this.walls.values()) {
      if (borderKey(wall.tileIdA, wall.tileIdB) === key) return wall.wallId
    }
    return null
  }

  list(): readonly WallRow[] {
    return [...this.walls.values()]
  }

  rebuildFromEvents(events: readonly Event[]): void {
    this.walls.clear()
    for (const ev of events) this.project(ev)
  }
}

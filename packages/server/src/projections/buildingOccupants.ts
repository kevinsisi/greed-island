import type { Event } from '../kernel/types.js'

export const BUILDING_OCCUPANTS_BOOT_EVENT_TYPES = [
  'BUILDING_ENTER',
  'BUILDING_LEAVE',
] as const

function readData(event: Event): Record<string, unknown> | null {
  const payload = (event.payload as { data?: unknown } | null)?.data
  if (!payload || typeof payload !== 'object') return null
  return payload as Record<string, unknown>
}

function readString(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

export class BuildingOccupantsProjection {
  private npcInside = new Map<string, string | null>()
  private hydrated = false

  project(event: Event): void {
    const data = readData(event)
    if (!data) return
    const npcId = readString(data.npcId)
    if (!npcId) return

    switch (event.eventType) {
      case 'BUILDING_ENTER': {
        const buildingId = readString(data.buildingId)
        if (!buildingId) return
        this.npcInside.set(npcId, buildingId)
        this.hydrated = true
        break
      }
      case 'BUILDING_LEAVE':
        this.npcInside.set(npcId, null)
        this.hydrated = true
        break
    }
  }

  isHydrated(): boolean {
    return this.hydrated
  }

  toJSON(): Record<string, string | null> {
    const out: Record<string, string | null> = {}
    for (const [k, v] of this.npcInside) out[k] = v
    return out
  }

  rebuildFromEvents(events: readonly Event[]): void {
    this.npcInside.clear()
    this.hydrated = false
    for (const ev of [...events].sort((a, b) => a.sequence - b.sequence)) {
      this.project(ev)
    }
  }
}

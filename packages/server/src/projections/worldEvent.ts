import type { Event } from '../kernel/types.js'

export type WorldEventRow = Readonly<{
  worldEventId: string
  eventKind: string
  tileId: string
  linkedAnimalId: string
  speciesId: string
  severity: number
  spawnedAtTick: number
  huntStartedEmitted: boolean
}>

const LEGENDARY_WORLD_EVENT_SPAWNED = 'LEGENDARY_WORLD_EVENT_SPAWNED'
const LEGENDARY_WORLD_EVENT_RESOLVED = 'LEGENDARY_WORLD_EVENT_RESOLVED'
const LEGENDARY_HUNT_STARTED = 'LEGENDARY_HUNT_STARTED'

function readSpawnedPayload(event: Event): { eventKind: string; tileId: string; linkedAnimalId: string; speciesId: string; severity: number; tick: number } | null {
  const p = (event.payload as { data?: Record<string, unknown> })?.data ?? (event.payload as Record<string, unknown>)
  if (typeof p !== 'object' || p === null) return null
  const r = p as Record<string, unknown>
  if (typeof r.eventKind !== 'string' || typeof r.tileId !== 'string' || typeof r.linkedAnimalId !== 'string' || typeof r.speciesId !== 'string') return null
  if (typeof r.severity !== 'number' || typeof r.tick !== 'number') return null
  return { eventKind: r.eventKind, tileId: r.tileId, linkedAnimalId: r.linkedAnimalId, speciesId: r.speciesId, severity: r.severity, tick: r.tick }
}

function readResolvedPayload(event: Event): { linkedAnimalId: string } | null {
  const p = (event.payload as { data?: Record<string, unknown> })?.data ?? (event.payload as Record<string, unknown>)
  if (typeof p !== 'object' || p === null) return null
  const r = p as Record<string, unknown>
  if (typeof r.linkedAnimalId !== 'string') return null
  return { linkedAnimalId: r.linkedAnimalId }
}

function readHuntStartedPayload(event: Event): { linkedAnimalId: string } | null {
  const p = (event.payload as { data?: Record<string, unknown> })?.data ?? (event.payload as Record<string, unknown>)
  if (typeof p !== 'object' || p === null) return null
  const r = p as Record<string, unknown>
  if (typeof r.linkedAnimalId !== 'string') return null
  return { linkedAnimalId: r.linkedAnimalId }
}

export class WorldEventProjection {
  private activeEvents = new Map<string, WorldEventRow>()

  rebuildFromEvents(events: readonly Event[]): void {
    this.activeEvents = new Map()
    for (const event of [...events].sort((a, b) => a.sequence - b.sequence)) {
      this.project(event)
    }
  }

  project(event: Event): void {
    if (event.eventType === LEGENDARY_WORLD_EVENT_SPAWNED) {
      const p = readSpawnedPayload(event)
      if (!p) return
      this.activeEvents.set(p.linkedAnimalId, {
        worldEventId: event.eventId,
        eventKind: p.eventKind,
        tileId: p.tileId,
        linkedAnimalId: p.linkedAnimalId,
        speciesId: p.speciesId,
        severity: p.severity,
        spawnedAtTick: p.tick,
        huntStartedEmitted: false,
      })
      return
    }

    if (event.eventType === LEGENDARY_WORLD_EVENT_RESOLVED) {
      const p = readResolvedPayload(event)
      if (!p) return
      this.activeEvents.delete(p.linkedAnimalId)
      return
    }

    if (event.eventType === LEGENDARY_HUNT_STARTED) {
      const p = readHuntStartedPayload(event)
      if (!p) return
      const row = this.activeEvents.get(p.linkedAnimalId)
      if (!row) return
      this.activeEvents.set(p.linkedAnimalId, { ...row, huntStartedEmitted: true })
      return
    }
  }

  getActiveByTile(tileId: string): readonly WorldEventRow[] {
    const result: WorldEventRow[] = []
    for (const row of this.activeEvents.values()) {
      if (row.tileId === tileId) result.push(row)
    }
    return result
  }

  getActiveByAnimalId(linkedAnimalId: string): WorldEventRow | null {
    return this.activeEvents.get(linkedAnimalId) ?? null
  }

  list(): readonly WorldEventRow[] {
    return Array.from(this.activeEvents.values())
  }

  snapshot(): readonly WorldEventRow[] {
    return this.list()
  }
}

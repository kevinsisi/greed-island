import { hashCanonicalJson } from '../kernel/canonicalJson.js'
import type { Event } from '../kernel/types.js'

export type CulturalElementRow = Readonly<{
  tileId: string
  elementId: string
  elementType: 'festival' | 'ritual' | 'norm'
  formedAtTick: number
  detail: Readonly<Record<string, unknown>>
}>

const CULTURAL_FESTIVAL_FORMED = 'CULTURAL_FESTIVAL_FORMED'
const CULTURAL_RITUAL_PERFORMED = 'CULTURAL_RITUAL_PERFORMED'
const CULTURAL_NORM_ESTABLISHED = 'CULTURAL_NORM_ESTABLISHED'
const RARE_WINDOW_OPEN = 'RARE_WINDOW_OPEN'

export const CULTURAL_ELEMENT_BOOT_EVENT_TYPES = [
  RARE_WINDOW_OPEN,
  CULTURAL_FESTIVAL_FORMED,
  CULTURAL_RITUAL_PERFORMED,
  CULTURAL_NORM_ESTABLISHED,
] as const

export class CulturalElementProjection {
  private rows = new Map<string, CulturalElementRow>()
  private festivalCounters = new Map<string, number>()

  private key(tileId: string, elementId: string): string {
    return `${tileId}::${elementId}`
  }

  rebuildFromEvents(events: readonly Event[]): void {
    this.rows = new Map()
    this.festivalCounters = new Map()
    for (const event of [...events].sort((a, b) => a.sequence - b.sequence)) {
      this.project(event)
    }
  }

  project(event: Event): void {
    if (event.eventType === RARE_WINDOW_OPEN) {
      const p = readRareWindowPayload(event)
      if (!p) return
      const prev = this.festivalCounters.get(p.windowId) ?? 0
      this.festivalCounters.set(p.windowId, prev + 1)
      return
    }
    if (event.eventType === CULTURAL_FESTIVAL_FORMED) {
      const p = readFestivalPayload(event)
      if (!p) return
      const elementId = `festival:${p.windowId}`
      const k = this.key(p.tileId, elementId)
      if (this.rows.has(k)) return
      this.rows.set(k, {
        tileId: p.tileId,
        elementId,
        elementType: 'festival',
        formedAtTick: p.formedAtTick,
        detail: { windowId: p.windowId, occurrenceCount: p.occurrenceCount },
      })
      return
    }
    if (event.eventType === CULTURAL_RITUAL_PERFORMED) {
      const p = readRitualPayload(event)
      if (!p) return
      const elementId = `ritual:${p.buildingId}:${p.npcId}:${p.performedAtTick}`
      const k = this.key(p.tileId, elementId)
      if (this.rows.has(k)) return
      this.rows.set(k, {
        tileId: p.tileId,
        elementId,
        elementType: 'ritual',
        formedAtTick: p.performedAtTick,
        detail: { npcId: p.npcId, buildingId: p.buildingId, factionLean: p.factionLean },
      })
      return
    }
    if (event.eventType === CULTURAL_NORM_ESTABLISHED) {
      const p = readNormPayload(event)
      if (!p) return
      const elementId = `norm:${p.tileId}:${p.skillId}`
      const k = this.key(p.tileId, elementId)
      if (this.rows.has(k)) return
      this.rows.set(k, {
        tileId: p.tileId,
        elementId,
        elementType: 'norm',
        formedAtTick: p.formedAtTick,
        detail: { skillId: p.skillId, npcCount: p.npcCount },
      })
    }
  }

  getByTile(tileId: string): CulturalElementRow[] {
    const result: CulturalElementRow[] = []
    for (const row of this.rows.values()) {
      if (row.tileId === tileId) result.push(row)
    }
    return result
  }

  getFestivalCounter(windowId: string): number {
    return this.festivalCounters.get(windowId) ?? 0
  }

  hasFestival(windowId: string): boolean {
    for (const row of this.rows.values()) {
      if (row.elementType === 'festival' && row.elementId === `festival:${windowId}`) return true
    }
    return false
  }

  hasNorm(tileId: string, skillId: string): boolean {
    return this.rows.has(this.key(tileId, `norm:${tileId}:${skillId}`))
  }

  getAll(): CulturalElementRow[] {
    return [...this.rows.values()].sort(
      (a, b) => a.tileId.localeCompare(b.tileId) || a.elementId.localeCompare(b.elementId)
    )
  }

  canonicalHash(): string {
    return hashCanonicalJson(this.getAll())
  }
}

function readRareWindowPayload(event: Event): { windowId: string } | null {
  const data = (event.payload as Record<string, unknown>)?.data
  if (typeof data !== 'object' || data === null) return null
  const p = data as Record<string, unknown>
  if (typeof p.windowId !== 'string') return null
  return { windowId: p.windowId }
}

function readFestivalPayload(
  event: Event
): { windowId: string; tileId: string; occurrenceCount: number; formedAtTick: number } | null {
  const data = (event.payload as Record<string, unknown>)?.data
  if (typeof data !== 'object' || data === null) return null
  const p = data as Record<string, unknown>
  if (
    typeof p.windowId !== 'string' ||
    typeof p.tileId !== 'string' ||
    typeof p.occurrenceCount !== 'number' ||
    typeof p.formedAtTick !== 'number'
  )
    return null
  return { windowId: p.windowId, tileId: p.tileId, occurrenceCount: p.occurrenceCount, formedAtTick: p.formedAtTick }
}

function readRitualPayload(
  event: Event
): { npcId: string; buildingId: string; tileId: string; factionLean: string; performedAtTick: number } | null {
  const data = (event.payload as Record<string, unknown>)?.data
  if (typeof data !== 'object' || data === null) return null
  const p = data as Record<string, unknown>
  if (
    typeof p.npcId !== 'string' ||
    typeof p.buildingId !== 'string' ||
    typeof p.tileId !== 'string' ||
    typeof p.factionLean !== 'string' ||
    typeof p.performedAtTick !== 'number'
  )
    return null
  return {
    npcId: p.npcId,
    buildingId: p.buildingId,
    tileId: p.tileId,
    factionLean: p.factionLean,
    performedAtTick: p.performedAtTick,
  }
}

function readNormPayload(
  event: Event
): { tileId: string; skillId: string; npcCount: number; formedAtTick: number } | null {
  const data = (event.payload as Record<string, unknown>)?.data
  if (typeof data !== 'object' || data === null) return null
  const p = data as Record<string, unknown>
  if (
    typeof p.tileId !== 'string' ||
    typeof p.skillId !== 'string' ||
    typeof p.npcCount !== 'number' ||
    typeof p.formedAtTick !== 'number'
  )
    return null
  return { tileId: p.tileId, skillId: p.skillId, npcCount: p.npcCount, formedAtTick: p.formedAtTick }
}

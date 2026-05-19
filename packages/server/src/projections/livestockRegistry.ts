import { hashCanonicalJson } from '../kernel/canonicalJson.js'
import type { Event } from '../kernel/types.js'

export type LivestockRole = 'livestock' | 'mount'

export type LivestockRegistryRow = Readonly<{
  animalId: string
  speciesId: string
  role: LivestockRole
  mountedBy: string | null
  settlementId: string
  acquiredAtTick: number
}>

const ANIMAL_DOMESTICATED = 'ANIMAL_DOMESTICATED'
const LIVESTOCK_BRED = 'LIVESTOCK_BRED'
const LIVESTOCK_SLAUGHTERED = 'LIVESTOCK_SLAUGHTERED'
const MOUNT_ASSIGNED = 'MOUNT_ASSIGNED'

export class LivestockRegistryProjection {
  private rows = new Map<string, LivestockRegistryRow>()

  rebuildFromEvents(events: readonly Event[]): void {
    this.rows = new Map()
    for (const event of [...events].sort((a, b) => a.sequence - b.sequence)) {
      this.project(event)
    }
  }

  project(event: Event): void {
    if (event.eventType === ANIMAL_DOMESTICATED) {
      const p = readDomesticatedPayload(event)
      if (!p) return
      this.rows.set(p.animalId, {
        animalId: p.animalId,
        speciesId: p.speciesId,
        role: 'livestock',
        mountedBy: null,
        settlementId: p.settlementId,
        acquiredAtTick: p.tick,
      })
      return
    }

    if (event.eventType === LIVESTOCK_BRED) {
      const p = readBredPayload(event)
      if (!p) return
      this.rows.set(p.newAnimalId, {
        animalId: p.newAnimalId,
        speciesId: p.speciesId,
        role: 'livestock',
        mountedBy: null,
        settlementId: p.settlementId,
        acquiredAtTick: p.tick,
      })
      return
    }

    if (event.eventType === LIVESTOCK_SLAUGHTERED) {
      const p = readSlaughteredPayload(event)
      if (!p) return
      this.rows.delete(p.animalId)
      return
    }

    if (event.eventType === MOUNT_ASSIGNED) {
      const p = readMountAssignedPayload(event)
      if (!p) return
      const existing = this.rows.get(p.animalId)
      if (!existing) return
      this.rows.set(p.animalId, { ...existing, role: 'mount', mountedBy: p.npcId })
    }
  }

  getBySettlement(settlementId: string): readonly LivestockRegistryRow[] {
    return [...this.rows.values()]
      .filter((r) => r.settlementId === settlementId)
      .sort((a, b) => a.acquiredAtTick - b.acquiredAtTick || a.animalId.localeCompare(b.animalId))
  }

  getLivestockCount(settlementId: string, speciesId: string): number {
    return [...this.rows.values()].filter(
      (r) => r.settlementId === settlementId && r.speciesId === speciesId
    ).length
  }

  getTotalCount(settlementId: string): number {
    return [...this.rows.values()].filter((r) => r.settlementId === settlementId).length
  }

  list(): readonly LivestockRegistryRow[] {
    return [...this.rows.values()].sort(
      (a, b) => a.settlementId.localeCompare(b.settlementId) || a.acquiredAtTick - b.acquiredAtTick
    )
  }

  getMountedAnimalIdForNpc(npcId: string): string | null {
    for (const row of this.rows.values()) {
      if (row.role === 'mount' && row.mountedBy === npcId) return row.animalId
    }
    return null
  }

  getDomesticatedAnimalIdSet(): ReadonlySet<string> {
    return new Set(this.rows.keys())
  }

  getMountedNpcIdSet(): ReadonlySet<string> {
    const result = new Set<string>()
    for (const row of this.rows.values()) {
      if (row.role === 'mount' && row.mountedBy !== null) result.add(row.mountedBy)
    }
    return result
  }

  canonicalHash(): string {
    return hashCanonicalJson(this.list())
  }
}

function readDomesticatedPayload(
  event: Event
): { animalId: string; speciesId: string; settlementId: string; tick: number } | null {
  const p = (event.payload as { data?: unknown } | null)?.data
  if (!p || typeof p !== 'object') return null
  const d = p as Record<string, unknown>
  if (typeof d.animalId !== 'string' || !d.animalId) return null
  if (typeof d.speciesId !== 'string' || !d.speciesId) return null
  if (typeof d.settlementId !== 'string' || !d.settlementId) return null
  if (typeof d.tick !== 'number' || !Number.isInteger(d.tick) || d.tick < 0) return null
  return { animalId: d.animalId, speciesId: d.speciesId, settlementId: d.settlementId, tick: d.tick }
}

function readBredPayload(
  event: Event
): { newAnimalId: string; speciesId: string; settlementId: string; tick: number } | null {
  const p = (event.payload as { data?: unknown } | null)?.data
  if (!p || typeof p !== 'object') return null
  const d = p as Record<string, unknown>
  if (typeof d.newAnimalId !== 'string' || !d.newAnimalId) return null
  if (typeof d.speciesId !== 'string' || !d.speciesId) return null
  if (typeof d.settlementId !== 'string' || !d.settlementId) return null
  if (typeof d.tick !== 'number' || !Number.isInteger(d.tick) || d.tick < 0) return null
  return { newAnimalId: d.newAnimalId, speciesId: d.speciesId, settlementId: d.settlementId, tick: d.tick }
}

function readSlaughteredPayload(event: Event): { animalId: string } | null {
  const p = (event.payload as { data?: unknown } | null)?.data
  if (!p || typeof p !== 'object') return null
  const d = p as Record<string, unknown>
  if (typeof d.animalId !== 'string' || !d.animalId) return null
  return { animalId: d.animalId }
}

function readMountAssignedPayload(event: Event): { animalId: string; npcId: string } | null {
  const p = (event.payload as { data?: unknown } | null)?.data
  if (!p || typeof p !== 'object') return null
  const d = p as Record<string, unknown>
  if (typeof d.animalId !== 'string' || !d.animalId) return null
  if (typeof d.npcId !== 'string' || !d.npcId) return null
  return { animalId: d.animalId, npcId: d.npcId }
}

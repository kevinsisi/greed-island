// Phase 1 §33.4 + settlement-runtime-v2 Slice 1 — Settlements projection
// (Layer 3 Civilization Runtime). Pure read model over settlement events;
// runtime code plans Commands, the Rule Engine commits Events, then this
// projection derives state from the EventLog.

import { hashCanonicalJson } from '../kernel/canonicalJson.js'
import type {
  SettlementPressure,
  SettlementStatus,
  SettlementStorageItem,
} from '../kernel/livingWorldCommands.js'
import type { Event } from '../kernel/types.js'

export type SettlementRow = Readonly<{
  id: string
  tileId: string
  formedAtTick: number
  founderNpcIds: readonly string[]
  populationNpcIds: readonly string[]
  storage: readonly SettlementStorageItem[]
  pressure: SettlementPressure
  stability: number
  status: SettlementStatus
  updatedAtTick: number
}>

const SETTLEMENT_FORMED = 'SETTLEMENT_FORMED'
const SETTLEMENT_POPULATION_UPDATED = 'SETTLEMENT_POPULATION_UPDATED'
const SETTLEMENT_STORAGE_UPDATED = 'SETTLEMENT_STORAGE_UPDATED'
const SETTLEMENT_PRESSURE_UPDATED = 'SETTLEMENT_PRESSURE_UPDATED'
const SETTLEMENT_STABILITY_CHANGED = 'SETTLEMENT_STABILITY_CHANGED'
const SETTLEMENT_DECLINED = 'SETTLEMENT_DECLINED'
const SETTLEMENT_RECOVERED = 'SETTLEMENT_RECOVERED'

const ZERO_PRESSURE: SettlementPressure = Object.freeze({
  food: 0,
  safety: 0,
  economy: 0,
  logistics: 0,
})

export class SettlementsProjection {
  private rows = new Map<string, SettlementRow>()

  rebuildFromEvents(events: readonly Event[]): void {
    this.rows = new Map()
    for (const event of [...events].sort((a, b) => a.sequence - b.sequence)) {
      this.project(event)
    }
  }

  project(event: Event): void {
    if (event.eventType === SETTLEMENT_FORMED) {
      const row = settlementRowFromFormedEvent(event)
      if (!row) return
      // First-write-wins (replay safety). Duplicate formation events do not
      // rewrite existing state, but later state events may still update it.
      if (!this.rows.has(row.id)) this.rows.set(row.id, row)
      return
    }

    if (event.eventType === SETTLEMENT_POPULATION_UPDATED) {
      const payload = readPopulationPayload(event)
      if (!payload) return
      this.update(payload.settlementId, (row) => ({
        ...row,
        populationNpcIds: Object.freeze([...payload.populationNpcIds]),
        updatedAtTick: payload.updatedAtTick,
      }))
      return
    }

    if (event.eventType === SETTLEMENT_STORAGE_UPDATED) {
      const payload = readStoragePayload(event)
      if (!payload) return
      this.update(payload.settlementId, (row) => ({
        ...row,
        storage: Object.freeze(payload.storage.map((item) => Object.freeze({ ...item }))),
        updatedAtTick: payload.updatedAtTick,
      }))
      return
    }

    if (event.eventType === SETTLEMENT_PRESSURE_UPDATED) {
      const payload = readPressurePayload(event)
      if (!payload) return
      this.update(payload.settlementId, (row) => ({
        ...row,
        pressure: Object.freeze({ ...payload.pressure }),
        updatedAtTick: payload.updatedAtTick,
      }))
      return
    }

    if (event.eventType === SETTLEMENT_STABILITY_CHANGED) {
      const payload = readStabilityPayload(event)
      if (!payload) return
      this.update(payload.settlementId, (row) => ({
        ...row,
        stability: payload.stability,
        status: payload.status,
        updatedAtTick: payload.changedAtTick,
      }))
      return
    }

    if (event.eventType === SETTLEMENT_DECLINED) {
      const payload = readDeclinedPayload(event)
      if (!payload) return
      this.update(payload.settlementId, (row) => ({
        ...row,
        stability: payload.stability,
        status: 'declining',
        updatedAtTick: payload.declinedAtTick,
      }))
      return
    }

    if (event.eventType === SETTLEMENT_RECOVERED) {
      const payload = readRecoveredPayload(event)
      if (!payload) return
      this.update(payload.settlementId, (row) => ({
        ...row,
        stability: payload.stability,
        status: payload.status,
        updatedAtTick: payload.recoveredAtTick,
      }))
    }
  }

  getAll(): SettlementRow[] {
    return [...this.rows.values()].sort(
      (a, b) => a.formedAtTick - b.formedAtTick || a.id.localeCompare(b.id)
    )
  }

  getById(id: string): SettlementRow | null {
    return this.rows.get(id) ?? null
  }

  getByTile(tileId: string): SettlementRow[] {
    return this.getAll().filter((row) => row.tileId === tileId)
  }

  /** Set of tileIds that currently host a settlement — used by detection. */
  getTilesWithSettlement(): ReadonlySet<string> {
    const set = new Set<string>()
    for (const row of this.rows.values()) set.add(row.tileId)
    return set
  }

  count(): number {
    return this.rows.size
  }

  canonicalHash(): string {
    return hashCanonicalJson(this.getAll())
  }

  private update(id: string, fn: (row: SettlementRow) => SettlementRow): void {
    const before = this.rows.get(id)
    if (!before) return
    this.rows.set(id, fn(before))
  }
}

function settlementRowFromFormedEvent(event: Event): SettlementRow | null {
  const payload = readData(event)
  if (!payload) return null
  if (typeof payload.settlementId !== 'string') return null
  if (typeof payload.tileId !== 'string') return null
  if (typeof payload.formedAtTick !== 'number') return null
  if (!Array.isArray(payload.founderNpcIds)) return null
  for (const id of payload.founderNpcIds) {
    if (typeof id !== 'string') return null
  }
  return {
    id: payload.settlementId,
    tileId: payload.tileId,
    formedAtTick: payload.formedAtTick,
    founderNpcIds: Object.freeze([...(payload.founderNpcIds as string[])]),
    populationNpcIds: Object.freeze([]),
    storage: Object.freeze([]),
    pressure: ZERO_PRESSURE,
    stability: 100,
    status: 'stable',
    updatedAtTick: payload.formedAtTick,
  }
}

function readPopulationPayload(event: Event): {
  settlementId: string
  populationNpcIds: readonly string[]
  updatedAtTick: number
} | null {
  const payload = readData(event)
  if (!payload) return null
  const common = readSettlementId(payload)
  if (!common) return null
  if (!Array.isArray(payload.populationNpcIds)) return null
  for (const id of payload.populationNpcIds) if (typeof id !== 'string') return null
  if (!isNonNegativeInteger(payload.updatedAtTick)) return null
  return {
    settlementId: common.settlementId,
    populationNpcIds: Object.freeze([...(payload.populationNpcIds as string[])]),
    updatedAtTick: payload.updatedAtTick,
  }
}

function readStoragePayload(event: Event): {
  settlementId: string
  storage: readonly SettlementStorageItem[]
  updatedAtTick: number
} | null {
  const payload = readData(event)
  if (!payload) return null
  const common = readSettlementId(payload)
  if (!common) return null
  if (!Array.isArray(payload.storage)) return null
  const storage: SettlementStorageItem[] = []
  for (const item of payload.storage) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null
    const record = item as Record<string, unknown>
    if (typeof record.goodsId !== 'string') return null
    if (typeof record.quantity !== 'number' || !Number.isFinite(record.quantity)) return null
    storage.push({ goodsId: record.goodsId, quantity: record.quantity })
  }
  if (!isNonNegativeInteger(payload.updatedAtTick)) return null
  return {
    settlementId: common.settlementId,
    storage: Object.freeze(storage),
    updatedAtTick: payload.updatedAtTick,
  }
}

function readPressurePayload(event: Event): {
  settlementId: string
  pressure: SettlementPressure
  updatedAtTick: number
} | null {
  const payload = readData(event)
  if (!payload) return null
  const common = readSettlementId(payload)
  if (!common) return null
  const pressure = readPressure(payload.pressure)
  if (!pressure) return null
  if (!isNonNegativeInteger(payload.updatedAtTick)) return null
  return { settlementId: common.settlementId, pressure, updatedAtTick: payload.updatedAtTick }
}

function readStabilityPayload(event: Event): {
  settlementId: string
  stability: number
  status: SettlementStatus
  changedAtTick: number
} | null {
  const payload = readData(event)
  if (!payload) return null
  const common = readSettlementId(payload)
  if (!common) return null
  if (!isPressureScore(payload.stability)) return null
  if (!isSettlementStatus(payload.status)) return null
  if (!isNonNegativeInteger(payload.changedAtTick)) return null
  return {
    settlementId: common.settlementId,
    stability: payload.stability,
    status: payload.status,
    changedAtTick: payload.changedAtTick,
  }
}

function readDeclinedPayload(event: Event): {
  settlementId: string
  stability: number
  declinedAtTick: number
} | null {
  const payload = readData(event)
  if (!payload) return null
  const common = readSettlementId(payload)
  if (!common) return null
  if (!isPressureScore(payload.stability)) return null
  if (!isNonNegativeInteger(payload.declinedAtTick)) return null
  return { settlementId: common.settlementId, stability: payload.stability, declinedAtTick: payload.declinedAtTick }
}

function readRecoveredPayload(event: Event): {
  settlementId: string
  stability: number
  status: 'stable' | 'recovering'
  recoveredAtTick: number
} | null {
  const payload = readData(event)
  if (!payload) return null
  const common = readSettlementId(payload)
  if (!common) return null
  if (!isPressureScore(payload.stability)) return null
  if (payload.status !== 'stable' && payload.status !== 'recovering') return null
  if (!isNonNegativeInteger(payload.recoveredAtTick)) return null
  return {
    settlementId: common.settlementId,
    stability: payload.stability,
    status: payload.status,
    recoveredAtTick: payload.recoveredAtTick,
  }
}

function readSettlementId(payload: Record<string, unknown>): { settlementId: string } | null {
  if (typeof payload.settlementId !== 'string' || payload.settlementId.length === 0) return null
  return { settlementId: payload.settlementId }
}

function readPressure(value: unknown): SettlementPressure | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const p = value as Record<string, unknown>
  if (!isPressureScore(p.food)) return null
  if (!isPressureScore(p.safety)) return null
  if (!isPressureScore(p.economy)) return null
  if (!isPressureScore(p.logistics)) return null
  return Object.freeze({ food: p.food, safety: p.safety, economy: p.economy, logistics: p.logistics })
}

function readData(event: Event): Record<string, unknown> | null {
  const payload = (event.payload as { data?: unknown } | null)?.data
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null
  return payload as Record<string, unknown>
}

function isPressureScore(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 100
}

function isSettlementStatus(value: unknown): value is SettlementStatus {
  return value === 'stable' || value === 'strained' || value === 'declining' || value === 'recovering'
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

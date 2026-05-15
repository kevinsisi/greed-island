import { hashCanonicalJson } from '../kernel/canonicalJson.js'
import type { Event } from '../kernel/types.js'

export type HouseholdInheritanceRow = Readonly<{
  deceasedNpcId: string
  heirId: string
  amount: number
  assignedAtTick: number
}>

export type HouseholdEconomyRow = Readonly<{
  householdId: string
  contributedTotal: number
  spentTotal: number
  inheritedTotal: number
  balance: number
  contributorNpcIds: readonly string[]
  inheritances: readonly HouseholdInheritanceRow[]
  lastUpdatedAtTick: number
  lastSequence: number
}>

const HOUSEHOLD_GOLD_CONTRIBUTED = 'HOUSEHOLD_GOLD_CONTRIBUTED'
const HOUSEHOLD_GOLD_SPENT = 'HOUSEHOLD_GOLD_SPENT'
const HOUSEHOLD_INHERITANCE_ASSIGNED = 'HOUSEHOLD_INHERITANCE_ASSIGNED'

export class HouseholdEconomyProjection {
  private rows = new Map<string, HouseholdEconomyRow>()
  private seen = new Set<string>()

  rebuildFromEvents(events: readonly Event[]): void {
    this.rows = new Map()
    this.seen = new Set()
    for (const event of [...events].sort((a, b) => a.sequence - b.sequence)) this.project(event)
  }

  project(event: Event): void {
    if (event.eventType === HOUSEHOLD_GOLD_CONTRIBUTED) {
      const payload = readContribution(event)
      if (!payload) return
      const key = `contribution:${payload.householdId}:${payload.sourceEventType}:${payload.sourceId}`
      if (this.seen.has(key)) return
      this.seen.add(key)
      const existing = this.row(payload.householdId)
      const contributors = [...new Set([...existing.contributorNpcIds, payload.npcId])].sort()
      this.rows.set(payload.householdId, {
        ...existing,
        contributedTotal: existing.contributedTotal + payload.amount,
        balance: existing.balance + payload.amount,
        contributorNpcIds: contributors,
        lastUpdatedAtTick: payload.tick,
        lastSequence: event.sequence,
      })
      return
    }

    if (event.eventType === HOUSEHOLD_GOLD_SPENT) {
      const payload = readSpend(event)
      if (!payload) return
      const key = `spend:${payload.householdId}:${payload.sourceId}`
      if (this.seen.has(key)) return
      this.seen.add(key)
      const existing = this.row(payload.householdId)
      const spent = Math.min(existing.balance, payload.amount)
      this.rows.set(payload.householdId, {
        ...existing,
        spentTotal: existing.spentTotal + spent,
        balance: existing.balance - spent,
        lastUpdatedAtTick: payload.tick,
        lastSequence: event.sequence,
      })
      return
    }

    if (event.eventType === HOUSEHOLD_INHERITANCE_ASSIGNED) {
      const payload = readInheritance(event)
      if (!payload) return
      const key = `inheritance:${payload.householdId}:${payload.deceasedNpcId}:${payload.heirId}:${payload.tick}`
      if (this.seen.has(key)) return
      this.seen.add(key)
      const existing = this.row(payload.householdId)
      this.rows.set(payload.householdId, {
        ...existing,
        inheritedTotal: existing.inheritedTotal + payload.amount,
        balance: existing.balance + payload.amount,
        inheritances: [...existing.inheritances, {
          deceasedNpcId: payload.deceasedNpcId,
          heirId: payload.heirId,
          amount: payload.amount,
          assignedAtTick: payload.tick,
        }].sort((a, b) => a.assignedAtTick - b.assignedAtTick || a.heirId.localeCompare(b.heirId)),
        lastUpdatedAtTick: payload.tick,
        lastSequence: event.sequence,
      })
    }
  }

  getByHouseholdId(householdId: string): HouseholdEconomyRow | null {
    return this.rows.get(householdId) ?? null
  }

  list(): HouseholdEconomyRow[] {
    return [...this.rows.values()].sort((a, b) => a.householdId.localeCompare(b.householdId))
  }

  canonicalHash(): string {
    return hashCanonicalJson(this.list())
  }

  private row(householdId: string): HouseholdEconomyRow {
    return this.rows.get(householdId) ?? {
      householdId,
      contributedTotal: 0,
      spentTotal: 0,
      inheritedTotal: 0,
      balance: 0,
      contributorNpcIds: [],
      inheritances: [],
      lastUpdatedAtTick: 0,
      lastSequence: 0,
    }
  }
}

function readContribution(event: Event): { householdId: string; npcId: string; amount: number; sourceEventType: string; sourceId: string; tick: number } | null {
  const p = readData(event)
  if (!p) return null
  if (typeof p.householdId !== 'string' || typeof p.npcId !== 'string') return null
  if (typeof p.amount !== 'number' || !Number.isFinite(p.amount) || p.amount <= 0) return null
  if (typeof p.sourceEventType !== 'string' || typeof p.sourceId !== 'string') return null
  if (typeof p.contributedAtTick !== 'number' || !Number.isInteger(p.contributedAtTick)) return null
  return { householdId: p.householdId, npcId: p.npcId, amount: p.amount, sourceEventType: p.sourceEventType, sourceId: p.sourceId, tick: p.contributedAtTick }
}

function readSpend(event: Event): { householdId: string; amount: number; sourceId: string; tick: number } | null {
  const p = readData(event)
  if (!p) return null
  if (typeof p.householdId !== 'string') return null
  if (typeof p.amount !== 'number' || !Number.isFinite(p.amount) || p.amount <= 0) return null
  if (typeof p.sourceId !== 'string') return null
  if (typeof p.spentAtTick !== 'number' || !Number.isInteger(p.spentAtTick)) return null
  return { householdId: p.householdId, amount: p.amount, sourceId: p.sourceId, tick: p.spentAtTick }
}

function readInheritance(event: Event): { householdId: string; deceasedNpcId: string; heirId: string; amount: number; tick: number } | null {
  const p = readData(event)
  if (!p) return null
  if (typeof p.householdId !== 'string' || typeof p.deceasedNpcId !== 'string' || typeof p.heirId !== 'string') return null
  if (typeof p.amount !== 'number' || !Number.isFinite(p.amount) || p.amount <= 0) return null
  if (typeof p.assignedAtTick !== 'number' || !Number.isInteger(p.assignedAtTick)) return null
  return { householdId: p.householdId, deceasedNpcId: p.deceasedNpcId, heirId: p.heirId, amount: p.amount, tick: p.assignedAtTick }
}

function readData(event: Event): Record<string, unknown> | null {
  const data = (event.payload as { data?: unknown } | null)?.data
  return data && typeof data === 'object' ? data as Record<string, unknown> : null
}

import { hashCanonicalJson } from '../kernel/canonicalJson.js'
import type { Event } from '../kernel/types.js'

export type NpcStateSnapshot = Readonly<{
  tile: string
  mood: number
  health: number
  activity: string
  faction: string
  targetTile: string
  lastActedTick: number
  subCol: number
  subRow: number
  subZ: number
  personalityOverride?: {
    targetTile: string
    expiresAtTick: number
    reason: string
  } | null
  travelRoute?: {
    fromTile: string
    toTile: string
    targetTile: string
    startedAtTick: number
  } | null
  agent?: unknown
}>

export type NpcStateRow = Readonly<{
  npcId: string
  recordedAtTick: number
  sequence: number
  state: NpcStateSnapshot
}>

const NPC_STATE_RECORDED = 'NPC_STATE_RECORDED'

export class NpcStateProjection {
  private rows = new Map<string, NpcStateRow>()

  rebuildFromEvents(events: readonly Event[]): void {
    this.rows = new Map()
    for (const event of events) this.project(event)
  }

  project(event: Event): void {
    if (event.eventType !== NPC_STATE_RECORDED) return
    const row = rowFromEvent(event)
    if (!row) return
    const previous = this.rows.get(row.npcId)
    if (!previous || previous.sequence <= row.sequence) {
      this.rows.set(row.npcId, row)
    }
  }

  getByNpcId(npcId: string): NpcStateRow | null {
    return this.rows.get(npcId) ?? null
  }

  getAll(): readonly NpcStateRow[] {
    return [...this.rows.values()].sort((a, b) => a.npcId.localeCompare(b.npcId))
  }

  canonicalHash(): string {
    return hashCanonicalJson(this.getAll())
  }
}

function rowFromEvent(event: Event): NpcStateRow | null {
  const payload = (event.payload as { data?: unknown } | null)?.data
  if (!payload || typeof payload !== 'object') return null
  const p = payload as Record<string, unknown>
  if (typeof p.npcId !== 'string') return null
  if (!p.state || typeof p.state !== 'object') return null
  return {
    npcId: p.npcId,
    recordedAtTick: typeof event.tick === 'number' ? event.tick : 0,
    sequence: event.sequence,
    state: p.state as NpcStateSnapshot,
  }
}

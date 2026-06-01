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

export type NpcLastProductiveAction = Readonly<{
  domain: string
  narration: string
}>

const NPC_STATE_RECORDED = 'NPC_STATE_RECORDED'
const NPC_PRODUCTIVE_ACTION = 'NPC_PRODUCTIVE_ACTION'

export const NPC_STATE_BOOT_EVENT_TYPES = [
  NPC_STATE_RECORDED,
  NPC_PRODUCTIVE_ACTION,
] as const

export class NpcStateProjection {
  private rows = new Map<string, NpcStateRow>()
  private lastProductiveActions = new Map<string, NpcLastProductiveAction>()

  rebuildFromEvents(events: readonly Event[]): void {
    this.rows = new Map()
    this.lastProductiveActions = new Map()
    for (const event of events) this.project(event)
  }

  project(event: Event): void {
    if (event.eventType === NPC_STATE_RECORDED) {
      const row = rowFromEvent(event)
      if (!row) return
      const previous = this.rows.get(row.npcId)
      if (!previous || previous.sequence <= row.sequence) {
        this.rows.set(row.npcId, row)
      }
    } else if (event.eventType === NPC_PRODUCTIVE_ACTION) {
      const productive = productiveActionFromEvent(event)
      if (productive) {
        this.lastProductiveActions.set(productive.npcId, { domain: productive.domain, narration: productive.narration })
      }
    }
  }

  getByNpcId(npcId: string): NpcStateRow | null {
    return this.rows.get(npcId) ?? null
  }

  getLastProductiveAction(npcId: string): NpcLastProductiveAction | null {
    return this.lastProductiveActions.get(npcId) ?? null
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

function productiveActionFromEvent(event: Event): { npcId: string; domain: string; narration: string } | null {
  const payload = (event.payload as { data?: unknown } | null)?.data
  if (!payload || typeof payload !== 'object') return null
  const p = payload as Record<string, unknown>
  if (typeof p.npcId !== 'string' || p.npcId.length === 0) return null
  if (typeof p.domain !== 'string' || p.domain.length === 0) return null
  const narration = typeof p.narration === 'string' ? p.narration : ''
  return { npcId: p.npcId, domain: p.domain, narration }
}

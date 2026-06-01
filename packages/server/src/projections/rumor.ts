import { hashCanonicalJson } from '../kernel/canonicalJson.js'
import type { Event } from '../kernel/types.js'
import type { RumorTopic } from '../kernel/livingWorldCommands.js'
import {
  RUMOR_ACCURACY_DECAY,
  RUMOR_ACCURACY_THRESHOLD,
  RUMOR_MAX_PER_NPC,
} from '../config/world.js'

export type RumorRow = Readonly<{
  npcId: string
  rumorId: string
  topic: RumorTopic
  subjectId: string
  tileId: string
  originTick: number
  accuracy: number
  heardAtTick: number
}>

const NPC_RUMOR_HEARD = 'NPC_RUMOR_HEARD'
const NPC_RUMOR_SPREAD = 'NPC_RUMOR_SPREAD'

export const RUMOR_BOOT_EVENT_TYPES = [
  NPC_RUMOR_HEARD,
  NPC_RUMOR_SPREAD,
] as const

export class RumorProjection {
  private byNpc = new Map<string, Map<string, RumorRow>>()

  rebuildFromEvents(events: readonly Event[]): void {
    this.byNpc = new Map()
    for (const event of [...events].sort((a, b) => a.sequence - b.sequence)) {
      this.project(event)
    }
  }

  project(event: Event): void {
    if (event.eventType === NPC_RUMOR_HEARD) {
      const p = readHeardPayload(event)
      if (!p) return
      this.upsert({
        npcId: p.npcId,
        rumorId: p.rumorId,
        topic: p.topic,
        subjectId: p.subjectId,
        tileId: p.tileId,
        originTick: p.originTick,
        accuracy: p.accuracy,
        heardAtTick: event.tick ?? 0,
      })
      return
    }
    if (event.eventType === NPC_RUMOR_SPREAD) {
      const p = readSpreadPayload(event)
      if (!p) return
      const degraded = Math.round(p.accuracy * RUMOR_ACCURACY_DECAY / 100)
      this.upsert({
        npcId: p.toNpcId,
        rumorId: p.rumorId,
        topic: p.topic,
        subjectId: p.subjectId,
        tileId: p.tileId,
        originTick: p.originTick,
        accuracy: degraded,
        heardAtTick: event.tick ?? 0,
      })
    }
  }

  getActiveRumors(npcId: string): RumorRow[] {
    const npcMap = this.byNpc.get(npcId)
    if (!npcMap) return []
    return [...npcMap.values()]
      .filter((r) => r.accuracy >= RUMOR_ACCURACY_THRESHOLD)
      .sort((a, b) => b.accuracy - a.accuracy)
  }

  list(): RumorRow[] {
    const all: RumorRow[] = []
    for (const npcMap of this.byNpc.values()) {
      for (const row of npcMap.values()) {
        if (row.accuracy >= RUMOR_ACCURACY_THRESHOLD) all.push(row)
      }
    }
    return all.sort((a, b) => a.npcId.localeCompare(b.npcId) || a.rumorId.localeCompare(b.rumorId))
  }

  canonicalHash(): string {
    return hashCanonicalJson(this.list())
  }

  private upsert(row: RumorRow): void {
    let npcMap = this.byNpc.get(row.npcId)
    if (!npcMap) {
      npcMap = new Map()
      this.byNpc.set(row.npcId, npcMap)
    }
    npcMap.set(row.rumorId, row)
    if (npcMap.size > RUMOR_MAX_PER_NPC) {
      // Evict oldest by heardAtTick
      let oldest: { key: string; tick: number } | null = null
      for (const [key, r] of npcMap.entries()) {
        if (oldest === null || r.heardAtTick < oldest.tick) {
          oldest = { key, tick: r.heardAtTick }
        }
      }
      if (oldest) npcMap.delete(oldest.key)
    }
  }
}

function readHeardPayload(event: Event): {
  npcId: string; rumorId: string; topic: RumorTopic
  subjectId: string; tileId: string; originTick: number; accuracy: number
} | null {
  const data = (event.payload as { data?: unknown } | null)?.data
  if (!data || typeof data !== 'object') return null
  const p = data as Record<string, unknown>
  if (typeof p.npcId !== 'string' || p.npcId.length === 0) return null
  if (typeof p.rumorId !== 'string' || p.rumorId.length === 0) return null
  if (p.topic !== 'predator_death' && p.topic !== 'construction_complete') return null
  if (typeof p.subjectId !== 'string' || p.subjectId.length === 0) return null
  if (typeof p.tileId !== 'string' || p.tileId.length === 0) return null
  if (typeof p.originTick !== 'number' || !Number.isInteger(p.originTick)) return null
  if (typeof p.accuracy !== 'number' || !Number.isInteger(p.accuracy)) return null
  return {
    npcId: p.npcId as string,
    rumorId: p.rumorId as string,
    topic: p.topic as RumorTopic,
    subjectId: p.subjectId as string,
    tileId: p.tileId as string,
    originTick: p.originTick as number,
    accuracy: p.accuracy as number,
  }
}

function readSpreadPayload(event: Event): {
  fromNpcId: string; toNpcId: string; rumorId: string; topic: RumorTopic
  subjectId: string; tileId: string; originTick: number; accuracy: number
} | null {
  const data = (event.payload as { data?: unknown } | null)?.data
  if (!data || typeof data !== 'object') return null
  const p = data as Record<string, unknown>
  if (typeof p.fromNpcId !== 'string' || p.fromNpcId.length === 0) return null
  if (typeof p.toNpcId !== 'string' || p.toNpcId.length === 0) return null
  if (typeof p.rumorId !== 'string' || p.rumorId.length === 0) return null
  if (p.topic !== 'predator_death' && p.topic !== 'construction_complete') return null
  if (typeof p.subjectId !== 'string' || p.subjectId.length === 0) return null
  if (typeof p.tileId !== 'string' || p.tileId.length === 0) return null
  if (typeof p.originTick !== 'number' || !Number.isInteger(p.originTick)) return null
  if (typeof p.accuracy !== 'number' || !Number.isInteger(p.accuracy)) return null
  return {
    fromNpcId: p.fromNpcId as string,
    toNpcId: p.toNpcId as string,
    rumorId: p.rumorId as string,
    topic: p.topic as RumorTopic,
    subjectId: p.subjectId as string,
    tileId: p.tileId as string,
    originTick: p.originTick as number,
    accuracy: p.accuracy as number,
  }
}

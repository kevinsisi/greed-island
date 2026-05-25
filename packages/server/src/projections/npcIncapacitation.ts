import type { Event } from '../kernel/types.js'

export type NpcIncapacitationRecord = Readonly<{
  npcId: string
  tileId: string
  incapacitatedAtTick: number
  recoverAtTick: number
}>

export const NPC_INCAPACITATION_BOOT_EVENT_TYPES = ['NPC_INCAPACITATED_LONG'] as const

export class NpcIncapacitationProjection {
  private readonly records = new Map<string, NpcIncapacitationRecord>()

  project(event: Event): void {
    if (event.eventType !== 'NPC_INCAPACITATED_LONG') return
    const d = (event.payload as { data?: Record<string, unknown> })?.data
    const npcId = typeof d?.npcId === 'string' ? d.npcId : null
    const tileId = typeof d?.tileId === 'string' ? d.tileId : null
    const incapacitatedAtTick = typeof d?.incapacitatedAtTick === 'number' ? d.incapacitatedAtTick : null
    const recoverAtTick = typeof d?.recoverAtTick === 'number' ? d.recoverAtTick : null
    if (!npcId || !tileId || incapacitatedAtTick === null || recoverAtTick === null) return
    this.records.set(npcId, { npcId, tileId, incapacitatedAtTick, recoverAtTick })
  }

  isIncapacitated(npcId: string, currentTick: number): boolean {
    const r = this.records.get(npcId)
    return r !== undefined && currentTick < r.recoverAtTick
  }

  list(): readonly NpcIncapacitationRecord[] {
    return [...this.records.values()]
  }

  rebuildFromEvents(events: readonly Event[]): void {
    this.records.clear()
    for (const ev of events) this.project(ev)
  }
}

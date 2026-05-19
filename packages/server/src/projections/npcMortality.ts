import type { Event } from '../kernel/types.js'

export type NpcMortalityRow = Readonly<{
  npcId: string
  deceasedAtTick: number
}>

const NPC_DECEASED = 'NPC_DECEASED'

function readPayload(event: Event): { npcId: string; deceasedAtTick: number } | null {
  const raw = event.payload as Record<string, unknown> | null
  if (!raw) return null
  // LivingWorldEventPayload wraps command fields under `data`; fallback to
  // flat layout used in some tests.
  const d = (typeof raw['data'] === 'object' && raw['data'] !== null ? raw['data'] : raw) as Record<string, unknown>
  if (typeof d['npcId'] !== 'string' || typeof d['deceasedAtTick'] !== 'number') return null
  return { npcId: d['npcId'], deceasedAtTick: d['deceasedAtTick'] }
}

export class NpcMortalityProjection {
  private rows = new Map<string, NpcMortalityRow>()

  rebuildFromEvents(events: readonly Event[]): void {
    this.rows = new Map()
    for (const event of [...events].sort((a, b) => a.sequence - b.sequence)) {
      this.project(event)
    }
  }

  project(event: Event): void {
    if (event.eventType !== NPC_DECEASED) return
    const p = readPayload(event)
    if (!p) return
    this.rows.set(p.npcId, { npcId: p.npcId, deceasedAtTick: p.deceasedAtTick })
  }

  isDeceased(npcId: string): boolean {
    return this.rows.has(npcId)
  }

  deceasedAtTick(npcId: string): number | null {
    return this.rows.get(npcId)?.deceasedAtTick ?? null
  }

  get deceasedIds(): ReadonlySet<string> {
    return new Set(this.rows.keys())
  }

  list(): readonly NpcMortalityRow[] {
    return [...this.rows.values()].sort((a, b) => a.deceasedAtTick - b.deceasedAtTick)
  }
}

import { hashCanonicalJson } from '../kernel/canonicalJson.js'
import type { Event } from '../kernel/types.js'

export type PredatorHungerRow = Readonly<{
  predatorSpeciesId: string
  tileId: string
  lastKillAtTick: number
}>

const ANIMAL_KILLED = 'ANIMAL_KILLED'

export class PredatorHungerProjection {
  private rows = new Map<string, PredatorHungerRow>()

  rebuildFromEvents(events: readonly Event[]): void {
    this.rows = new Map()
    for (const event of [...events].sort((a, b) => a.sequence - b.sequence)) {
      this.project(event)
    }
  }

  project(event: Event): void {
    if (event.eventType !== ANIMAL_KILLED) return
    const payload = readKilledPayload(event)
    if (!payload) return
    const key = hungerKey(payload.killedByActorSpeciesId, payload.tileId)
    this.rows.set(key, {
      predatorSpeciesId: payload.killedByActorSpeciesId,
      tileId: payload.tileId,
      lastKillAtTick: payload.killedAtTick,
    })
  }

  getLastKillAtTick(predatorSpeciesId: string, tileId: string): number | null {
    return this.rows.get(hungerKey(predatorSpeciesId, tileId))?.lastKillAtTick ?? null
  }

  list(): PredatorHungerRow[] {
    return [...this.rows.values()].sort(
      (a, b) => a.tileId.localeCompare(b.tileId) || a.predatorSpeciesId.localeCompare(b.predatorSpeciesId)
    )
  }

  canonicalHash(): string {
    return hashCanonicalJson(this.list())
  }
}

function hungerKey(predatorSpeciesId: string, tileId: string): string {
  return `${predatorSpeciesId}@${tileId}`
}

function readKilledPayload(event: Event): { killedByActorSpeciesId: string; tileId: string; killedAtTick: number } | null {
  const payload = (event.payload as { data?: unknown } | null)?.data
  if (!payload || typeof payload !== 'object') return null
  const p = payload as Record<string, unknown>
  if (typeof p.tileId !== 'string' || p.tileId.length === 0) return null
  if (typeof p.killedAtTick !== 'number' || !Number.isInteger(p.killedAtTick) || p.killedAtTick < 0) return null
  // killedByNpcId encodes the predator actor: "ecosystem.predator.<speciesId>"
  if (typeof p.killedByNpcId !== 'string' || p.killedByNpcId.length === 0) return null
  const match = p.killedByNpcId.match(/^ecosystem\.predator\.(.+)$/)
  if (!match || !match[1]) return null
  return { killedByActorSpeciesId: match[1], tileId: p.tileId, killedAtTick: p.killedAtTick }
}

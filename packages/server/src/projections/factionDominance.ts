// v0.57.0 — Faction Dominance Projection.
// Tracks which factions have already had FACTION_DOMINANCE_SHIFTED emitted.
// Guards the planner against re-firing on restart.

import type { FactionId } from '../sim/areaStateEngine.js'
import type { Event } from '../kernel/types.js'

const FACTION_DOMINANCE_SHIFTED = 'FACTION_DOMINANCE_SHIFTED'

export class FactionDominanceProjection {
  private shiftFiredFor = new Set<FactionId>()

  rebuildFromEvents(events: readonly Event[]): void {
    this.shiftFiredFor = new Set()
    for (const ev of [...events].sort((a, b) => a.sequence - b.sequence)) {
      this.project(ev)
    }
  }

  project(event: Event): void {
    if (event.eventType !== FACTION_DOMINANCE_SHIFTED) return
    const raw = event.payload as Record<string, unknown> | null
    if (!raw) return
    const d = (typeof raw['data'] === 'object' && raw['data'] !== null ? raw['data'] : raw) as Record<string, unknown>
    const losingFactionId = d['losingFactionId']
    if (typeof losingFactionId === 'string' && losingFactionId.length > 0) {
      this.shiftFiredFor.add(losingFactionId as FactionId)
    }
  }

  hasShiftFiredFor(factionId: FactionId): boolean {
    return this.shiftFiredFor.has(factionId)
  }

  shiftedFactions(): readonly FactionId[] {
    return [...this.shiftFiredFor].sort()
  }
}

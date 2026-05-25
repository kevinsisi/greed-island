// v0.57.0 — Faction Dominance Planner (Phase 30.7).
// Pure function: detects when a faction goes from controlling tiles to 0 tiles.
// Guards against re-firing via shiftFiredFor set.

import type { FactionId } from './areaStateEngine.js'

export function planFactionDominance(input: {
  currentTileCounts: Partial<Record<FactionId, number>>
  previousTileCounts: Partial<Record<FactionId, number>>
  shiftFiredFor: ReadonlySet<FactionId>
}): FactionId | null {
  for (const [faction, current] of Object.entries(input.currentTileCounts) as [FactionId, number][]) {
    if (input.shiftFiredFor.has(faction)) continue
    const previous = input.previousTileCounts[faction] ?? 0
    if (previous > 0 && current === 0) return faction
  }
  return null
}

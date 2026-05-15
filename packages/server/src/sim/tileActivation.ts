// Slice 4 — Regional tile activation (simulation budget enforcement).
//
// A tile is "active" each tick when:
//  (a) any NPC has been recorded on it within the recency window, OR
//  (b) any active world event's scope includes it.
//
// Inactive tiles run ecology drift on every `TILE_INACTIVE_DRIFT_PERIOD`
// tick instead of every tick. This bounds per-tick predator /
// reproduction / fishery work on empty regions without disturbing
// determinism — the drift cadence is a function of `tick`, not wall
// clock.
//
// Pure function over inputs; replay-safe by construction.

import type { ActiveWorldEvent } from '../events/types.js'

export type TileActivationInput = Readonly<{
  tick: number
  npcStates: ReadonlyArray<{ npcId: string; tile: string; lastActedTick: number }>
  activeEvents: ReadonlyArray<ActiveWorldEvent>
  recencyTicks: number
}>

export function computeActiveTiles(input: TileActivationInput): Set<string> {
  const active = new Set<string>()
  for (const npc of input.npcStates) {
    if (input.tick - npc.lastActedTick <= input.recencyTicks) {
      active.add(npc.tile)
    }
  }
  for (const ev of input.activeEvents) {
    if (ev.scope.kind === 'region') {
      for (const tileId of ev.scope.tileIds) active.add(tileId)
    }
  }
  return active
}

/**
 * Convenience guard: returns true when the tile should run its full
 * ecology pass this tick (either it's active, or it's the periodic
 * drift tick for inactive tiles).
 */
export function tileShouldRunEcology(input: {
  tileId: string
  tick: number
  activeTiles: ReadonlySet<string>
  inactiveDriftPeriod: number
}): boolean {
  if (input.activeTiles.has(input.tileId)) return true
  // Inactive tiles get a drift pass every Nth tick; keep tick=0 case
  // out of the drift window so a freshly-booted runtime does not run
  // every inactive tile in tick 0.
  if (input.tick === 0) return false
  return input.tick % input.inactiveDriftPeriod === 0
}

// v0.55.0 — Forest Depletion Planner (Phase E2.2).
// Pure function: given tile biome + current ecosystem pressure + depletion state,
// returns whether a FOREST_DEPLETED or FOREST_RECOVERED event should be emitted.
// Only fires for tiles with biome === 'forest'.

import { FOREST_DEPLETION_PRESSURE_THRESHOLD } from '../config/world.js'

export type ForestDepletionDecision = 'deplete' | 'recover' | null

export function planForestDepletion(input: {
  biome: string
  pressureLevel: number
  isCurrentlyDepleted: boolean
}): ForestDepletionDecision {
  if (input.biome !== 'forest') return null

  if (input.pressureLevel >= FOREST_DEPLETION_PRESSURE_THRESHOLD && !input.isCurrentlyDepleted) {
    return 'deplete'
  }
  if (input.pressureLevel === 0 && input.isCurrentlyDepleted) {
    return 'recover'
  }
  return null
}

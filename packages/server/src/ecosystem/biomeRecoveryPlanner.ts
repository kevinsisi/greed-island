// v0.56.0 — Biome Recovery Planner (Phase E2.3).
// Pure function: given tile biome + current pressure decision,
// returns whether a BIOME_RECOVERED event should be emitted.
// Fires for any non-trivial biome (forest) when pressure drops to 0.

export function planBiomeRecovery(input: {
  biome: string
  decision: 'raise' | 'recover' | null
}): boolean {
  if (input.decision !== 'recover') return false
  return input.biome === 'forest'
}

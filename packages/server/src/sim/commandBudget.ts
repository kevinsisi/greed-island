// Phase 1 simulation-budget-enforcement slice 2 — pure deterministic
// command-cap partition.
//
// When the runtime builds more Commands in a tick than the hard cap, we
// MUST drop the surplus deterministically: identical inputs across two
// replays must yield identical { kept, rejected } partitions, otherwise
// rejecting commands would corrupt replay.
//
// The canonical commandId is already a hash of
// (commandType, actorId, actorType, tick, payload) — see
// `livingWorldCommands.makeLivingWorldCommand`. Sorting commands by
// commandId lexicographically therefore produces a deterministic order
// that's independent of the runtime's collection order during the tick.

export type CommandLike = Readonly<{ commandId: string }>

export type CommandBudgetPartition<T extends CommandLike> = Readonly<{
  kept: readonly T[]
  rejected: readonly T[]
}>

/**
 * Partition a list of commands into kept and rejected sets based on a
 * hard cap. Pure function: no side effects, deterministic.
 *
 * - If `commands.length <= hardCap`, returns `{ kept: commands, rejected: [] }`
 *   without sorting (preserves the natural runtime order for the common
 *   case).
 * - Otherwise, sorts by `commandId` ascending, keeps the first `hardCap`,
 *   and returns the rest as `rejected`.
 *
 * The returned arrays are frozen.
 */
export function applyCommandHardCap<T extends CommandLike>(
  commands: readonly T[],
  hardCap: number
): CommandBudgetPartition<T> {
  if (!Number.isInteger(hardCap) || hardCap <= 0) {
    throw new Error(`applyCommandHardCap: hardCap must be a positive integer, got ${hardCap}`)
  }
  if (commands.length <= hardCap) {
    return Object.freeze({ kept: commands, rejected: Object.freeze([]) as readonly T[] })
  }
  const sorted = [...commands].sort((a, b) => (a.commandId < b.commandId ? -1 : a.commandId > b.commandId ? 1 : 0))
  return Object.freeze({
    kept: Object.freeze(sorted.slice(0, hardCap)) as readonly T[],
    rejected: Object.freeze(sorted.slice(hardCap)) as readonly T[],
  })
}

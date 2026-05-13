// Phase 1 simulation-budget-enforcement slice 3a — pure NPC partitioning.
//
// Deterministic round-robin bucketing: every NPC id is assigned to a
// stable bucket via a content hash; on tick T the active bucket is
// `T % period`. This guarantees:
//
//  1. Determinism: identical (npcIds, tick, period) yield identical
//     active sets across replays — no wall-clock, no Math.random.
//  2. Fairness: every NPC is active on exactly `1 / period` of ticks
//     regardless of player presence or recent activity. Over `period`
//     ticks every NPC is active at least once.
//
// This is the classification primitive. Slice 3b wires the active set
// into NpcEngine's productive + interaction phases. This slice only
// computes the partition and exposes it for GM observability.

export type NpcPartition = Readonly<{
  /** NPC ids selected as "active" for this tick. */
  active: ReadonlySet<string>
  /** Bucketing period (every `period` ticks each NPC is active once). */
  period: number
  /** Total npc id count considered. */
  totalCount: number
  /** Active set size (== `active.size`, exposed for snapshot ergonomics). */
  activeCount: number
}>

/**
 * Deterministic round-robin partition.
 *
 * @param npcIds Stable list of NPC ids. Order does not matter for
 *   bucketing (the hash is content-based), only `npcIds[i]`'s id string.
 * @param tick Current simulation tick (integer).
 * @param period Bucketing period; must be a positive integer.
 */
export function partitionNpcsForTick(
  npcIds: readonly string[],
  tick: number,
  period: number
): NpcPartition {
  if (!Number.isInteger(period) || period <= 0) {
    throw new Error(`partitionNpcsForTick: period must be a positive integer, got ${period}`)
  }
  if (!Number.isInteger(tick) || tick < 0) {
    throw new Error(`partitionNpcsForTick: tick must be a non-negative integer, got ${tick}`)
  }
  const activeBucket = tick % period
  const active = new Set<string>()
  for (const id of npcIds) {
    if (npcBucketIndex(id, period) === activeBucket) {
      active.add(id)
    }
  }
  return Object.freeze({
    active,
    period,
    totalCount: npcIds.length,
    activeCount: active.size,
  })
}

/**
 * Stable content-based bucket index for an NPC id. Uses a simple
 * deterministic 32-bit string hash (no crypto needed — bucket selection
 * is comparison-for-equality across replays, not security).
 */
export function npcBucketIndex(npcId: string, period: number): number {
  let h = 0
  for (let i = 0; i < npcId.length; i += 1) {
    h = (h * 31 + npcId.charCodeAt(i)) >>> 0
  }
  return h % period
}

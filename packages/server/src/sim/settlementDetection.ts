// Phase 1 §33.4 — Settlement formation detection (pure helper).
//
// Detects tiles where sustained NPC co-presence has crossed the
// formation threshold. The runtime feeds in the current tick's
// outdoor-NPC-by-tile snapshot plus a sliding history of how many
// ticks each NPC has been continuously co-located with the same
// cohort on the same tile.
//
// Determinism: identical (current, history, existingSettlementTiles,
// tick) yield identical detections across replays. No wall-clock,
// no Math.random.

import {
  SETTLEMENT_FORMATION_MIN_NPCS,
  SETTLEMENT_FORMATION_MIN_TICKS,
} from '../config/world.js'

export type CopresenceHistoryRow = Readonly<{
  /** Tile where the cohort is co-located. */
  tileId: string
  /** Lex-sorted list of NPC ids currently considered the cohort on this tile. */
  cohort: readonly string[]
  /** Number of consecutive ticks (including the current one) the cohort has held. */
  consecutiveTicks: number
}>

export type SettlementDetectionInput = Readonly<{
  /** Map of tileId → outdoor non-moving NPC ids present this tick. */
  npcsByTile: ReadonlyMap<string, readonly string[]>
  /** Last tick's co-presence history per tile. */
  previousHistory: ReadonlyMap<string, CopresenceHistoryRow>
  /** Tiles that already host a settlement (skip detection). */
  existingSettlementTiles: ReadonlySet<string>
  /** Current simulation tick. */
  tick: number
}>

export type DetectedSettlementFormation = Readonly<{
  tileId: string
  founderNpcIds: readonly string[]
  formedAtTick: number
}>

export type SettlementDetectionResult = Readonly<{
  detections: readonly DetectedSettlementFormation[]
  /** Updated history map to feed back into next tick's detection. */
  nextHistory: ReadonlyMap<string, CopresenceHistoryRow>
}>

/**
 * Pure deterministic formation detector.
 *
 * For each tile:
 *   - If outdoor NPC count < MIN_NPCS: cohort resets (no row in nextHistory).
 *   - Else: cohort = sorted lex of NPC ids. If cohort matches previous
 *     row, increment `consecutiveTicks`. Otherwise start a new run at 1.
 *   - If `consecutiveTicks >= MIN_TICKS` AND tile not already a settlement
 *     AND not already detected this tick: emit detection.
 *
 * Detection threshold uses strict equality of cohort lex tuples — if NPCs
 * come and go each tick the consecutive run resets. This matches "the
 * same group hung around here long enough to form a settlement".
 */
export function detectSettlementFormation(
  input: SettlementDetectionInput
): SettlementDetectionResult {
  const detections: DetectedSettlementFormation[] = []
  const nextHistory = new Map<string, CopresenceHistoryRow>()

  for (const [tileId, rawIds] of input.npcsByTile) {
    if (rawIds.length < SETTLEMENT_FORMATION_MIN_NPCS) continue
    const cohort = [...rawIds].sort()
    const previous = input.previousHistory.get(tileId)
    const sameCohort = previous !== undefined && cohortsEqual(previous.cohort, cohort)
    const consecutiveTicks = sameCohort ? previous.consecutiveTicks + 1 : 1
    nextHistory.set(tileId, { tileId, cohort, consecutiveTicks })
    if (
      consecutiveTicks >= SETTLEMENT_FORMATION_MIN_TICKS &&
      !input.existingSettlementTiles.has(tileId)
    ) {
      detections.push({
        tileId,
        founderNpcIds: cohort,
        formedAtTick: input.tick,
      })
    }
  }

  return { detections, nextHistory }
}

function cohortsEqual(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false
  }
  return true
}

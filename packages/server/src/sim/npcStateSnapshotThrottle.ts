import { hashCanonicalJson } from '../kernel/canonicalJson.js'
import type { NpcRuntimeState, NpcStateChange } from './npcEngine.js'

/** Minor NPC snapshot changes are coalesced for this many world ticks. */
export const NPC_MINOR_SNAPSHOT_INTERVAL_TICKS = 5

/** In-memory write cadence for low-impact NPC position snapshots. Never persisted. */
export class NpcStateSnapshotThrottle {
  private readonly lastPersistedTickByNpc = new Map<string, number>()
  private minorOnlyCandidateCount = 0
  private suppressedMinorSnapshotCount = 0

  constructor(private readonly options: { enabled?: boolean } = {}) {}

  shouldPersist(change: NpcStateChange, tick: number): boolean {
    if (this.options.enabled === false || !change.previousState || !isMinorOnlyChange(change.previousState, change.state)) return true
    this.minorOnlyCandidateCount += 1
    const lastPersistedTick = this.lastPersistedTickByNpc.get(change.npcId)
    const shouldPersist = lastPersistedTick === undefined
      || tick - lastPersistedTick >= NPC_MINOR_SNAPSHOT_INTERVAL_TICKS
    if (!shouldPersist) this.suppressedMinorSnapshotCount += 1
    return shouldPersist
  }

  recordPersisted(npcId: string, tick: number): void {
    this.lastPersistedTickByNpc.set(npcId, tick)
  }

  lastPersistedTick(npcId: string): number | undefined {
    return this.lastPersistedTickByNpc.get(npcId)
  }

  getDiagnostics(): Readonly<{ minorOnlyCandidateCount: number; suppressedMinorSnapshotCount: number }> {
    return {
      minorOnlyCandidateCount: this.minorOnlyCandidateCount,
      suppressedMinorSnapshotCount: this.suppressedMinorSnapshotCount,
    }
  }
}

function isMinorOnlyChange(previous: NpcRuntimeState, next: NpcRuntimeState): boolean {
  const subcellChanged = previous.subCol !== next.subCol || previous.subRow !== next.subRow || previous.subZ !== next.subZ
  const lastActedTickChanged = previous.lastActedTick !== next.lastActedTick
  const moodFractionChanged = previous.mood !== next.mood && Math.round(previous.mood) === Math.round(next.mood)
  const healthFractionChanged = previous.health !== next.health && Math.round(previous.health) === Math.round(next.health)
  if (!subcellChanged && !lastActedTickChanged && !moodFractionChanged && !healthFractionChanged) return false

  // Sub-cell coordinates, lastActedTick, and sub-point mood/health drift are
  // the only fields ignored by NpcEngine's semantic dirty-state comparison.
  const comparable = (state: NpcRuntimeState) => {
    const { subCol: _subCol, subRow: _subRow, subZ: _subZ, lastActedTick: _lastActedTick, mood, health, ...rest } = state
    return { ...rest, mood: Math.round(mood), health: Math.round(health) }
  }
  return hashCanonicalJson(comparable(previous)) === hashCanonicalJson(comparable(next))
}

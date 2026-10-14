import { hashCanonicalJson } from '../kernel/canonicalJson.js'
import type { NpcRuntimeState, NpcStateChange } from './npcEngine.js'

/** Sub-cell-only NPC snapshots may be coalesced for this many world ticks. */
export const NPC_SUBCELL_SNAPSHOT_INTERVAL_TICKS = 5

/** In-memory write cadence for low-impact NPC position snapshots. Never persisted. */
export class NpcStateSnapshotThrottle {
  private readonly lastPersistedTickByNpc = new Map<string, number>()
  private subcellOnlyCandidateCount = 0
  private suppressedSubcellSnapshotCount = 0

  constructor(private readonly options: { enabled?: boolean } = {}) {}

  shouldPersist(change: NpcStateChange, tick: number): boolean {
    if (this.options.enabled === false || !change.previousState || !isSubcellOnlyChange(change.previousState, change.state)) return true
    this.subcellOnlyCandidateCount += 1
    const lastPersistedTick = this.lastPersistedTickByNpc.get(change.npcId)
    const shouldPersist = lastPersistedTick === undefined
      || tick - lastPersistedTick >= NPC_SUBCELL_SNAPSHOT_INTERVAL_TICKS
    if (!shouldPersist) this.suppressedSubcellSnapshotCount += 1
    return shouldPersist
  }

  recordPersisted(npcId: string, tick: number): void {
    this.lastPersistedTickByNpc.set(npcId, tick)
  }

  lastPersistedTick(npcId: string): number | undefined {
    return this.lastPersistedTickByNpc.get(npcId)
  }

  getDiagnostics(): Readonly<{ subcellOnlyCandidateCount: number; suppressedSubcellSnapshotCount: number }> {
    return {
      subcellOnlyCandidateCount: this.subcellOnlyCandidateCount,
      suppressedSubcellSnapshotCount: this.suppressedSubcellSnapshotCount,
    }
  }
}

function isSubcellOnlyChange(previous: NpcRuntimeState, next: NpcRuntimeState): boolean {
  if (previous.subCol === next.subCol && previous.subRow === next.subRow && previous.subZ === next.subZ) return false

  // lastActedTick follows a sub-cell step; mood/health keep NpcEngine's whole-point comparison.
  const comparable = (state: NpcRuntimeState) => {
    const { subCol: _subCol, subRow: _subRow, subZ: _subZ, lastActedTick: _lastActedTick, mood, health, ...rest } = state
    return { ...rest, mood: Math.round(mood), health: Math.round(health) }
  }
  return hashCanonicalJson(comparable(previous)) === hashCanonicalJson(comparable(next))
}

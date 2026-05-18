// Pure client-side projection of combat state derived from server SSE events.
// State fields hp / statuses / targetLocks / resolved are encapsulated;
// the only mutation paths are applySnapshot() and applyEvent().
// No direct local writes to those fields from outside this class.

export type CombatActor = { actorId: string; hp: number; maxHp: number }
export type CombatStatus = {
  targetActorId: string
  statusId: string
  remainingTicks: number
  potency?: number
  sourceActorId?: string
}
export type CombatTargetLock = {
  targetActorId: string
  remainingTicks: number
  sourceActorId?: string
}

export type CombatProjectionState = {
  readonly combatId: string
  readonly lastCombatTick: number
  readonly actors: readonly CombatActor[]
  readonly statuses: readonly CombatStatus[]
  readonly targetLocks: readonly CombatTargetLock[]
  readonly resolved: boolean
  readonly tickDigest: string
}

export type CombatSseSnapshot = {
  combatId: string
  lastCombatTick: number
  actors: Array<{ actorId: string; hp: number; maxHp: number }>
  statuses: Array<{ targetActorId: string; statusId: string; remainingTicks: number; potency?: number; sourceActorId?: string }>
  targetLocks: Array<{ targetActorId: string; remainingTicks: number; sourceActorId?: string }>
  resolved: boolean
  tickDigest: string
}

export type CombatSseEventMessage = {
  eventType: string
  payload: unknown
  tickDigest: string
}

export type CombatPrediction = {
  commandId: string
  targetActorId: string
  predictedHpDelta: number
}

export type CombatReconcileResult =
  | { kind: 'accepted' }
  | { kind: 'accepted_with_delta'; actualDelta: number; predictedDelta: number }
  | { kind: 'rejected'; reason: string }

export class CombatProjection {
  private _state: CombatProjectionState | null = null
  private _prePredict: CombatProjectionState | null = null
  private _pendingPredictions = new Map<string, CombatPrediction>()

  get state(): CombatProjectionState | null {
    return this._state
  }

  isStale(serverTickDigest: string): boolean {
    return this._state !== null && this._state.tickDigest !== serverTickDigest
  }

  reset(): void {
    this._state = null
    this._prePredict = null
    this._pendingPredictions.clear()
  }

  /**
   * Optimistically apply a predicted damage/heal before server confirms.
   * Returns false if no actor matched or the prediction couldn't be applied.
   */
  predict(prediction: CombatPrediction): boolean {
    if (!this._state) return false
    const actor = this._state.actors.find((a) => a.actorId === prediction.targetActorId)
    if (!actor) return false
    this._prePredict ??= this._state
    this._pendingPredictions.set(prediction.commandId, prediction)
    const actors = this._state.actors.map((a) =>
      a.actorId === prediction.targetActorId
        ? { ...a, hp: Math.max(0, Math.min(a.maxHp, a.hp - prediction.predictedHpDelta)) }
        : { ...a }
    )
    this._state = { ...this._state, actors }
    return true
  }

  /**
   * Called when the server confirms or rejects a card play.
   * - reject → rollback to pre-prediction snapshot, clear the prediction
   * - accept (same amount) → clear the prediction, return 'accepted'
   * - accept (different amount) → silently reconcile to actual, no toast
   */
  reconcile(commandId: string, accepted: boolean, actualHpDelta?: number): CombatReconcileResult {
    const prediction = this._pendingPredictions.get(commandId)
    this._pendingPredictions.delete(commandId)

    if (!accepted) {
      if (this._prePredict && this._pendingPredictions.size === 0) {
        this._state = this._prePredict
        this._prePredict = null
      }
      return { kind: 'rejected', reason: prediction ? 'card_rejected' : 'unknown_command' }
    }

    if (prediction && actualHpDelta !== undefined && actualHpDelta !== prediction.predictedHpDelta) {
      // Silently reconcile: replace the predicted delta with the authoritative one
      if (this._state) {
        const diff = actualHpDelta - prediction.predictedHpDelta
        const actors = this._state.actors.map((a) =>
          a.actorId === prediction.targetActorId
            ? { ...a, hp: Math.max(0, Math.min(a.maxHp, a.hp - diff)) }
            : { ...a }
        )
        this._state = { ...this._state, actors }
      }
      if (this._pendingPredictions.size === 0) this._prePredict = null
      return { kind: 'accepted_with_delta', actualDelta: actualHpDelta, predictedDelta: prediction.predictedHpDelta }
    }

    if (this._pendingPredictions.size === 0) this._prePredict = null
    return { kind: 'accepted' }
  }

  applySnapshot(snapshot: CombatSseSnapshot): void {
    this._state = {
      combatId: snapshot.combatId,
      lastCombatTick: snapshot.lastCombatTick,
      actors: snapshot.actors.map((a) => ({ ...a })),
      statuses: snapshot.statuses.map((s) => ({ ...s })),
      targetLocks: snapshot.targetLocks.map((l) => ({ ...l })),
      resolved: snapshot.resolved,
      tickDigest: snapshot.tickDigest,
    }
  }

  applyEvent(sseEvent: CombatSseEventMessage): void {
    if (!this._state) return
    const data = readPayloadData(sseEvent.payload)
    const combatId = readStr(data, 'combatId')
    if (combatId && combatId !== this._state.combatId) return

    const combatTick = readNum(data, 'combatTick')
    const actors = this._state.actors.map((a) => ({ ...a }))
    let statuses = this._state.statuses.map((s) => ({ ...s }))
    let targetLocks = this._state.targetLocks.map((l) => ({ ...l }))
    let resolved = this._state.resolved

    switch (sseEvent.eventType) {
      case 'COMBAT_DAMAGE': {
        const targetActorId = readStr(data, 'targetActorId')
        const amount = readNum(data, 'amount')
        if (targetActorId && amount !== null) {
          const actor = actors.find((a) => a.actorId === targetActorId)
          if (actor) actor.hp = Math.max(0, actor.hp - amount)
        }
        break
      }
      case 'COMBAT_HEAL': {
        const targetActorId = readStr(data, 'targetActorId')
        const amount = readNum(data, 'amount')
        if (targetActorId && amount !== null) {
          const actor = actors.find((a) => a.actorId === targetActorId)
          if (actor) actor.hp = Math.min(actor.maxHp, actor.hp + amount)
        }
        break
      }
      case 'COMBAT_STATUS_APPLY': {
        const statusId = readStr(data, 'statusId')
        const targetActorId = readStr(data, 'targetActorId')
        const remainingTicks = readNum(data, 'remainingTicks')
        if (statusId && targetActorId && remainingTicks !== null) {
          statuses = statuses.filter(
            (s) => !(s.targetActorId === targetActorId && s.statusId === statusId)
          )
          const potency = readNum(data, 'potency')
          const sourceActorId = readStr(data, 'sourceActorId')
          statuses.push({
            targetActorId,
            statusId,
            remainingTicks,
            ...(potency !== null ? { potency } : {}),
            ...(sourceActorId ? { sourceActorId } : {}),
          })
        }
        break
      }
      case 'COMBAT_STATUS_TICK': {
        const statusId = readStr(data, 'statusId')
        const targetActorId = readStr(data, 'targetActorId')
        const remainingTicksAfter = readNum(data, 'remainingTicksAfter')
        if (statusId && targetActorId && remainingTicksAfter !== null) {
          if (remainingTicksAfter <= 0) {
            statuses = statuses.filter(
              (s) => !(s.targetActorId === targetActorId && s.statusId === statusId)
            )
          } else {
            statuses = statuses.map((s) =>
              s.targetActorId === targetActorId && s.statusId === statusId
                ? { ...s, remainingTicks: remainingTicksAfter }
                : s
            )
          }
        }
        break
      }
      case 'COMBAT_STATUS_END': {
        const statusId = readStr(data, 'statusId')
        const targetActorId = readStr(data, 'targetActorId')
        if (statusId && targetActorId) {
          statuses = statuses.filter(
            (s) => !(s.targetActorId === targetActorId && s.statusId === statusId)
          )
        }
        break
      }
      case 'COMBAT_TARGET_LOCK': {
        const targetActorId = readStr(data, 'targetActorId')
        const durationTicks = readNum(data, 'durationTicks') ?? readNum(data, 'remainingTicks')
        if (targetActorId && durationTicks !== null) {
          targetLocks = targetLocks.filter((l) => l.targetActorId !== targetActorId)
          const sourceActorId = readStr(data, 'sourceActorId')
          targetLocks.push({
            targetActorId,
            remainingTicks: durationTicks,
            ...(sourceActorId ? { sourceActorId } : {}),
          })
        }
        break
      }
      case 'COMBAT_DEFEAT': {
        const actorId = readStr(data, 'actorId') ?? readStr(data, 'targetActorId')
        if (actorId) {
          const actor = actors.find((a) => a.actorId === actorId)
          if (actor) actor.hp = 0
        }
        resolved = true
        break
      }
      case 'COMBAT_RESOLVE': {
        resolved = true
        break
      }
    }

    this._state = {
      combatId: this._state.combatId,
      lastCombatTick: combatTick ?? this._state.lastCombatTick,
      actors,
      statuses,
      targetLocks,
      resolved,
      tickDigest: sseEvent.tickDigest,
    }
  }
}

function readPayloadData(payload: unknown): Record<string, unknown> {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return {}
  const p = payload as Record<string, unknown>
  if (typeof p.data === 'object' && p.data !== null && !Array.isArray(p.data)) {
    return p.data as Record<string, unknown>
  }
  return p
}

function readStr(data: Record<string, unknown>, key: string): string | null {
  const v = data[key]
  return typeof v === 'string' && v.length > 0 ? v : null
}

function readNum(data: Record<string, unknown>, key: string): number | null {
  const v = data[key]
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

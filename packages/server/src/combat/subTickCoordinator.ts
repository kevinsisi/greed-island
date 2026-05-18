import { hashCanonicalJson } from '../kernel/canonicalJson.js'
import {
  DEFAULT_RULESET_VERSION,
  KERNEL_EVENT_VERSION,
  type Event,
  type EventDraft,
} from '../kernel/types.js'
import type { CombatCardClass } from './cards/catalog.js'
import type { CombatCardPlayPayload } from './commands.js'

export type CombatSnapshotView = Readonly<{
  combatId: string
  lastCombatTick: number
  actors: ReadonlyArray<Readonly<{ actorId: string; hp: number; maxHp: number }>>
  statuses: readonly CombatActiveStatus[]
  targetLocks: readonly CombatActiveTargetLock[]
  resolved: boolean
  tickDigest: string
}>
import {
  evaluateCombatSubTick,
  type CombatActiveStatus,
  type CombatActiveTargetLock,
  type CombatPendingCardPlayCommand,
  type CombatSubTickEvent,
  type CombatSubTickActor,
  type CombatSubTickResult,
} from './ruleEngine.js'

export type QueuedCombatCardPlayCommand = CombatPendingCardPlayCommand &
  Readonly<{
    tick: number
    submittedAt: number
  }>

export type CombatSubTickCommit = (drafts: readonly EventDraft[]) => readonly Event[]
export type CombatSubTickAfterCommit = (events: readonly Event[]) => void

export type CombatSubTickProcessInput = Readonly<{
  combatId: string
  combatTick: number
  tick: number
  occurredAt: number
  rulesetVersion?: string
  commit: CombatSubTickCommit
  afterCommit?: CombatSubTickAfterCommit
}>

type CombatProjectionEvent = Pick<Event, 'eventType' | 'payload'> &
  Partial<Pick<Event, 'actorId' | 'commandId' | 'tick' | 'occurredAt'>>

type CombatProjection = {
  combatId: string
  playerActorId: string
  npcActorId: string
  hp: Map<string, number>
  maxHp: Map<string, number>
  statuses: CombatActiveStatus[]
  targetLocks: CombatActiveTargetLock[]
  resolved: boolean
  lastCombatTick: number
}

const COMBAT_PROGRESS_EVENT_TYPES = new Set([
  'COMBAT_STATUS_TICK',
  'COMBAT_STATUS_END',
  'COMBAT_CARD_PLAY_ACCEPTED',
  'COMBAT_CARD_PLAY_REJECTED',
  'COMBAT_DAMAGE',
  'COMBAT_HEAL',
  'COMBAT_STATUS_APPLY',
  'COMBAT_TARGET_LOCK',
  'COMBAT_TARGET_LOCK_FAIL',
  'COMBAT_PHASE_SHIFT',
  'COMBAT_FLEE_ATTEMPT',
  'COMBAT_DEFEAT',
  'COMBAT_RESOLVE',
])

export class CombatSubTickCoordinator {
  private readonly combats = new Map<string, CombatProjection>()
  private readonly pendingCardPlays: QueuedCombatCardPlayCommand[] = []
  private readonly pendingCommandIds = new Set<string>()

  enqueueCardPlay(command: QueuedCombatCardPlayCommand): boolean {
    if (this.pendingCommandIds.has(command.commandId)) return false
    this.pendingCommandIds.add(command.commandId)
    this.pendingCardPlays.push(command)
    this.pendingCardPlays.sort(compareQueuedCardPlays)
    return true
  }

  pendingCount(combatId?: string): number {
    if (!combatId) return this.pendingCardPlays.length
    return this.pendingCardPlays.filter((command) => command.payload.combatId === combatId).length
  }

  rebuildFromEvents(events: readonly CombatProjectionEvent[]): void {
    this.combats.clear()
    this.pendingCardPlays.length = 0
    this.pendingCommandIds.clear()
    for (const event of events) this.projectEvent(event)
  }

  projectEvent(event: CombatProjectionEvent): void {
    const payload = readCombatPayload(event.payload)
    const combatId = readString(payload, 'combatId')
    if (!combatId) return

    // Track lastCombatTick for any event that carries it (enables boot hydration accuracy)
    const ct = readNumber(payload, 'combatTick')
    const combatForTick = this.combats.get(combatId)
    if (combatForTick && ct !== null && ct > combatForTick.lastCombatTick) {
      combatForTick.lastCombatTick = ct
    }

    switch (event.eventType) {
      case 'COMBAT_INITIATE':
        this.projectInitiate(combatId, payload)
        return
      case 'COMBAT_CARD_PLAY':
        this.projectCardPlay(event, payload)
        return
      case 'COMBAT_CARD_PLAY_ACCEPTED':
      case 'COMBAT_CARD_PLAY_REJECTED':
        this.removePendingByCommandId(event.commandId)
        return
      case 'COMBAT_CARD_CANCEL':
        this.removePendingByCommandId(readString(payload, 'cancelCommandId') ?? undefined)
        return
      case 'COMBAT_DAMAGE':
        this.projectDamage(combatId, payload)
        return
      case 'COMBAT_HEAL':
        this.projectHeal(combatId, payload)
        return
      case 'COMBAT_STATUS_APPLY':
        this.projectStatusApply(combatId, payload)
        return
      case 'COMBAT_STATUS_TICK':
        this.projectStatusTick(combatId, payload)
        return
      case 'COMBAT_STATUS_END':
        this.projectStatusEnd(combatId, payload)
        return
      case 'COMBAT_TARGET_LOCK':
        this.projectTargetLock(combatId, payload)
        return
      case 'COMBAT_DEFEAT':
        this.projectDefeat(combatId, payload)
        return
      case 'COMBAT_RESOLVE':
        this.projectResolve(combatId)
        return
    }
  }

  resumeTickForCombat(combatId: string, events: readonly Pick<Event, 'eventType' | 'payload'>[]): number {
    let lastCombatTick = 0
    for (const event of events) {
      if (!COMBAT_PROGRESS_EVENT_TYPES.has(event.eventType)) continue
      const payload = readCombatPayload(event.payload)
      if (readString(payload, 'combatId') !== combatId) continue
      const combatTick = readNumber(payload, 'combatTick')
      if (combatTick !== null && combatTick > lastCombatTick) lastCombatTick = combatTick
    }
    return lastCombatTick
  }

  processTick(input: CombatSubTickProcessInput): readonly Event[] {
    const combat = this.combats.get(input.combatId)
    if (!combat || combat.resolved) return []

    const staleCommands = this.pendingCardPlays
      .filter((command) => command.payload.combatId === input.combatId)
      .filter((command) => command.payload.combatTick < input.combatTick)

    const pendingCommands = this.pendingCardPlays
      .filter((command) => command.payload.combatId === input.combatId)
      .filter((command) => command.payload.combatTick === input.combatTick)

    const result = evaluateCombatSubTick({
      combatId: input.combatId,
      combatTick: input.combatTick,
      tick: input.tick,
      playerActorId: combat.playerActorId,
      npcActorId: combat.npcActorId,
      actors: actorSnapshot(combat),
      statuses: combat.statuses,
      targetLocks: combat.targetLocks,
      pendingCommands,
    })

    const events = [
      ...staleCommands.map((command) => staleCardPlayRejected(input, command)),
      ...result.events,
    ]

    if (events.length === 0) {
      return []
    }

    const rulesetVersion = input.rulesetVersion ?? DEFAULT_RULESET_VERSION
    const drafts = events.map((event) => {
      const seed = {
        eventType: event.eventType,
        actorId: event.actorId,
        commandId: event.commandId ?? null,
        tick: input.tick,
        combatTick: input.combatTick,
        payload: event.payload,
        rulesetVersion,
        version: KERNEL_EVENT_VERSION,
      }
      const deterministicKey = hashCanonicalJson(seed)
      return {
        eventType: event.eventType,
        occurredAt: input.occurredAt,
        actorId: event.actorId,
        ...(event.commandId !== undefined ? { commandId: event.commandId } : {}),
        tick: input.tick,
        payload: event.payload,
        rulesetVersion,
        version: KERNEL_EVENT_VERSION,
        eventId: `event_${deterministicKey.slice(0, 32)}`,
        deterministicKey,
      } satisfies EventDraft
    })

    const committed = input.commit(drafts)
    applyResult(combat, result)
    combat.lastCombatTick = input.combatTick
    if (result.resolved) this.clearPendingForCombat(input.combatId)
    else this.removePending([...staleCommands, ...pendingCommands])
    input.afterCommit?.(committed)
    return committed
  }

  getCombatSnapshot(combatId: string): CombatSnapshotView | null {
    const combat = this.combats.get(combatId)
    if (!combat) return null
    const actors = [...combat.hp.entries()]
      .sort(([a], [b]) => compareLex(a, b))
      .map(([actorId, hp]) => ({ actorId, hp, maxHp: combat.maxHp.get(actorId) ?? hp }))
    const tickDigest = hashCanonicalJson({
      combatId,
      combatTick: combat.lastCombatTick,
      hp: Object.fromEntries([...combat.hp.entries()].sort(([a], [b]) => compareLex(a, b))),
      statuses: combat.statuses,
      targetLocks: combat.targetLocks,
    })
    return {
      combatId,
      lastCombatTick: combat.lastCombatTick,
      actors,
      statuses: combat.statuses,
      targetLocks: combat.targetLocks,
      resolved: combat.resolved,
      tickDigest,
    }
  }

  private projectInitiate(combatId: string, payload: Readonly<Record<string, unknown>>): void {
    const playerActorId = readString(payload, 'playerAccountId') ?? readString(payload, 'playerActorId')
    const npcActorId = readString(payload, 'npcId') ?? readString(payload, 'npcActorId')
    const playerHp = readNumber(payload, 'playerCombatHp') ?? readNumber(payload, 'playerHp')
    const npcHp = readNumber(payload, 'npcCombatHp') ?? readNumber(payload, 'npcHp')
    if (!playerActorId || !npcActorId || playerHp === null || npcHp === null) return

    this.combats.set(combatId, {
      combatId,
      playerActorId,
      npcActorId,
      hp: new Map([
        [playerActorId, playerHp],
        [npcActorId, npcHp],
      ]),
      maxHp: new Map([
        [playerActorId, playerHp],
        [npcActorId, npcHp],
      ]),
      statuses: [],
      targetLocks: [],
      resolved: false,
      lastCombatTick: 0,
    })
  }

  private projectCardPlay(
    event: CombatProjectionEvent,
    payload: Readonly<Record<string, unknown>>,
  ): void {
    const commandId = event.commandId
    const actorId = event.actorId
    const tick = event.tick
    if (!commandId || !actorId || tick === undefined) return
    const cardClass = readCardClass(payload, 'cardClass')
    const combatId = readString(payload, 'combatId')
    const combatTick = readNumber(payload, 'combatTick')
    const targetActorId = readString(payload, 'targetActorId')
    if (!cardClass || !combatId || combatTick === null || !targetActorId) return
    const combat = this.combats.get(combatId)
    if (!combat || combat.resolved) return
    this.enqueueCardPlay({
      commandType: 'COMBAT_CARD_PLAY',
      commandId,
      actorId,
      tick,
      submittedAt: event.occurredAt ?? 0,
      payload: {
        combatId,
        combatTick,
        cardClass,
        targetActorId,
      },
    })
  }

  private projectDamage(combatId: string, payload: Readonly<Record<string, unknown>>): void {
    const combat = this.combats.get(combatId)
    const targetActorId = readString(payload, 'targetActorId')
    const amount = readNumber(payload, 'amount')
    if (!combat || !targetActorId || amount === null) return
    const before = combat.hp.get(targetActorId)
    if (before !== undefined) combat.hp.set(targetActorId, Math.max(0, before - amount))
  }

  private projectHeal(combatId: string, payload: Readonly<Record<string, unknown>>): void {
    const combat = this.combats.get(combatId)
    const targetActorId = readString(payload, 'targetActorId')
    const amount = readNumber(payload, 'amount')
    if (!combat || !targetActorId || amount === null) return
    const before = combat.hp.get(targetActorId)
    if (before === undefined) return
    const maxHp = combat.maxHp.get(targetActorId) ?? before
    combat.hp.set(targetActorId, Math.min(maxHp, before + amount))
  }

  private projectStatusApply(combatId: string, payload: Readonly<Record<string, unknown>>): void {
    const combat = this.combats.get(combatId)
    const status = statusFromPayload(payload)
    if (!combat || !status) return
    combat.statuses = replaceStatus(combat.statuses, status)
  }

  private projectStatusTick(combatId: string, payload: Readonly<Record<string, unknown>>): void {
    const combat = this.combats.get(combatId)
    const targetActorId = readString(payload, 'targetActorId')
    const statusId = readString(payload, 'statusId')
    const remainingTicksAfter = readNumber(payload, 'remainingTicksAfter')
    if (!combat || !targetActorId || !statusId || remainingTicksAfter === null) return

    if (remainingTicksAfter <= 0) {
      combat.statuses = combat.statuses.filter(
        (status) => status.targetActorId !== targetActorId || status.statusId !== statusId,
      )
      return
    }

    combat.statuses = combat.statuses.map((status) => {
      if (status.targetActorId !== targetActorId || status.statusId !== statusId) return status
      return { ...status, remainingTicks: remainingTicksAfter }
    })
  }

  private projectStatusEnd(combatId: string, payload: Readonly<Record<string, unknown>>): void {
    const combat = this.combats.get(combatId)
    const targetActorId = readString(payload, 'targetActorId')
    const statusId = readString(payload, 'statusId')
    if (!combat || !targetActorId || !statusId) return
    combat.statuses = combat.statuses.filter(
      (status) => status.targetActorId !== targetActorId || status.statusId !== statusId,
    )
  }

  private projectTargetLock(combatId: string, payload: Readonly<Record<string, unknown>>): void {
    const combat = this.combats.get(combatId)
    const lock = targetLockFromPayload(payload)
    if (!combat || !lock) return
    combat.targetLocks = replaceTargetLock(combat.targetLocks, lock)
  }

  private projectDefeat(combatId: string, payload: Readonly<Record<string, unknown>>): void {
    const combat = this.combats.get(combatId)
    const actorId = readString(payload, 'actorId')
    const finalHp = readNumber(payload, 'finalHp')
    if (!combat || !actorId || finalHp === null) return
    combat.hp.set(actorId, finalHp)
    combat.resolved = true
    this.clearPendingForCombat(combatId)
  }

  private projectResolve(combatId: string): void {
    const combat = this.combats.get(combatId)
    if (combat) combat.resolved = true
    this.clearPendingForCombat(combatId)
  }

  private clearPendingForCombat(combatId: string): void {
    this.pendingCardPlays
      .filter((command) => command.payload.combatId === combatId)
      .forEach((command) => this.pendingCommandIds.delete(command.commandId))
    for (let i = this.pendingCardPlays.length - 1; i >= 0; i -= 1) {
      if (this.pendingCardPlays[i]?.payload.combatId === combatId) this.pendingCardPlays.splice(i, 1)
    }
  }

  private removePending(commands: readonly CombatPendingCardPlayCommand[]): void {
    if (commands.length === 0) return
    const commandIds = new Set(commands.map((command) => command.commandId))
    for (const commandId of commandIds) this.pendingCommandIds.delete(commandId)
    for (let i = this.pendingCardPlays.length - 1; i >= 0; i -= 1) {
      const command = this.pendingCardPlays[i]
      if (command && commandIds.has(command.commandId)) this.pendingCardPlays.splice(i, 1)
    }
  }

  private removePendingByCommandId(commandId: string | undefined): void {
    if (!commandId) return
    this.pendingCommandIds.delete(commandId)
    for (let i = this.pendingCardPlays.length - 1; i >= 0; i -= 1) {
      if (this.pendingCardPlays[i]?.commandId === commandId) this.pendingCardPlays.splice(i, 1)
    }
  }
}

function actorSnapshot(combat: CombatProjection): readonly CombatSubTickActor[] {
  return [...combat.hp.entries()]
    .sort(([left], [right]) => compareLex(left, right))
    .map(([actorId, hp]) => ({
      actorId,
      hp,
      ...(combat.maxHp.has(actorId) ? { maxHp: combat.maxHp.get(actorId)! } : {}),
    }))
}

function applyResult(combat: CombatProjection, result: CombatSubTickResult): void {
  combat.hp = new Map(Object.entries(result.actorHpAfter).sort(([left], [right]) => compareLex(left, right)))
  combat.statuses = [...result.statusesAfter]
  combat.targetLocks = [...result.targetLocksAfter]
  if (result.resolved) combat.resolved = true
}

function staleCardPlayRejected(
  input: CombatSubTickProcessInput,
  command: QueuedCombatCardPlayCommand,
): CombatSubTickEvent {
  return {
    eventType: 'COMBAT_CARD_PLAY_REJECTED',
    phase: 'CARD_PLAY',
    actorId: command.actorId,
    commandId: command.commandId,
    payload: {
      combatId: input.combatId,
      combatTick: input.combatTick,
      requestedCombatTick: command.payload.combatTick,
      actorId: command.actorId,
      targetActorId: command.payload.targetActorId,
      cardClass: command.payload.cardClass,
      reason: 'stale_combat_tick',
    },
  }
}

function statusFromPayload(payload: Readonly<Record<string, unknown>>): CombatActiveStatus | null {
  const targetActorId = readString(payload, 'targetActorId')
  const statusId = readString(payload, 'statusId')
  const remainingTicks = readNumber(payload, 'remainingTicks')
  const sourceActorId = readString(payload, 'sourceActorId')
  const potency = readNumber(payload, 'potency')
  const cardClass = readCardClass(payload, 'cardClass')
  if (!targetActorId || !statusId || remainingTicks === null) return null
  return {
    targetActorId,
    statusId,
    remainingTicks,
    ...(sourceActorId ? { sourceActorId } : {}),
    ...(potency !== null ? { potency } : {}),
    ...(cardClass ? { cardClass } : {}),
  }
}

function targetLockFromPayload(payload: Readonly<Record<string, unknown>>): CombatActiveTargetLock | null {
  const targetActorId = readString(payload, 'targetActorId')
  const remainingTicks = readNumber(payload, 'durationTicks') ?? readNumber(payload, 'remainingTicks')
  const sourceActorId = readString(payload, 'sourceActorId')
  const cardClass = readCardClass(payload, 'cardClass')
  if (!targetActorId || remainingTicks === null) return null
  return {
    targetActorId,
    remainingTicks,
    ...(sourceActorId ? { sourceActorId } : {}),
    ...(cardClass ? { cardClass } : {}),
  }
}

function replaceStatus(
  statuses: readonly CombatActiveStatus[],
  next: CombatActiveStatus,
): CombatActiveStatus[] {
  return [
    ...statuses.filter(
      (status) => status.targetActorId !== next.targetActorId || status.statusId !== next.statusId,
    ),
    next,
  ].sort(compareStatuses)
}

function replaceTargetLock(
  locks: readonly CombatActiveTargetLock[],
  next: CombatActiveTargetLock,
): CombatActiveTargetLock[] {
  return [
    ...locks.filter((lock) => lock.targetActorId !== next.targetActorId),
    next,
  ].sort(compareTargetLocks)
}

function readCombatPayload(payload: unknown): Readonly<Record<string, unknown>> {
  if (!isRecord(payload)) return {}
  const data = payload.data
  if (isRecord(data)) return data
  return payload
}

function readString(payload: Readonly<Record<string, unknown>>, key: string): string | null {
  const value = payload[key]
  return typeof value === 'string' && value.length > 0 ? value : null
}

function readNumber(payload: Readonly<Record<string, unknown>>, key: string): number | null {
  const value = payload[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function readCardClass(
  payload: Readonly<Record<string, unknown>>,
  key: string,
): CombatCardClass | null {
  const value = payload[key]
  return typeof value === 'string' ? (value as CombatCardClass) : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function compareQueuedCardPlays(
  left: QueuedCombatCardPlayCommand,
  right: QueuedCombatCardPlayCommand,
): number {
  return (
    compareNumber(left.payload.combatTick, right.payload.combatTick) ||
    compareNumber(left.tick, right.tick) ||
    compareLex(left.actorId, right.actorId) ||
    compareLex(left.commandId, right.commandId)
  )
}

function compareStatuses(left: CombatActiveStatus, right: CombatActiveStatus): number {
  return (
    compareLex(left.targetActorId, right.targetActorId) ||
    compareLex(left.statusId, right.statusId) ||
    compareLex(left.sourceActorId ?? '', right.sourceActorId ?? '') ||
    compareNumber(left.remainingTicks, right.remainingTicks) ||
    compareNumber(left.potency ?? -1, right.potency ?? -1) ||
    compareLex(left.cardClass ?? '', right.cardClass ?? '')
  )
}

function compareTargetLocks(left: CombatActiveTargetLock, right: CombatActiveTargetLock): number {
  return (
    compareLex(left.targetActorId, right.targetActorId) ||
    compareLex(left.sourceActorId ?? '', right.sourceActorId ?? '') ||
    compareNumber(left.remainingTicks, right.remainingTicks) ||
    compareLex(left.cardClass ?? '', right.cardClass ?? '')
  )
}

function compareLex(left: string, right: string): number {
  if (left < right) return -1
  if (left > right) return 1
  return 0
}

function compareNumber(left: number, right: number): number {
  return left - right
}

export function toQueuedCombatCardPlayCommand(input: {
  commandId: string
  actorId: string
  tick: number
  submittedAt: number
  payload: CombatCardPlayPayload
}): QueuedCombatCardPlayCommand {
  return {
    commandType: 'COMBAT_CARD_PLAY',
    commandId: input.commandId,
    actorId: input.actorId,
    tick: input.tick,
    submittedAt: input.submittedAt,
    payload: input.payload,
  }
}

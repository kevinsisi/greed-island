// Combat rule engine (Phase B — single-shot).
//
// 跟 LivingWorldRuleEngine 同一介面：吃一個 typed Command，吐 RuleResult
// （accepted: events[] 或 rejected）。但本檔的 input 是 *已驗證、解析過*
// 的 Combat command + 當前 in-memory combat snapshot；輸出是
// CombatEventDraft[]（一場 action 可能產 1..N 個 events：DAMAGE / RESOLVE）。
//
// Phase B 公式（COMBAT_ARCHITECTURE.md §9 + open-question 答案）：
//   * combatHp 另算（COMBAT_INITIAL_HP = 100），不影響 NPC 全域 mood/health。
//   * 同 tile 才能戰鬥（router 層驗）。
//   * 逃跑永遠成功（user 答覆）。
//   * 玩家輸：energy=0；NPC 輸：incapacitated 1 個世界 tick（5 秒）。
//
// 攻擊公式：
//   base       = 8 + ceil(actorHealth * 0.05)
//   greedBoost = floor((actor.greed ?? 0.5) * 6)
//   patienceMitigation = floor((target.patience ?? 0.5) * 5)
//   raw = base + greedBoost - patienceMitigation
//   crit = (hash(combatId, actorId, combatRound) % 100) < 12
//   damage = max(1, crit ? raw * 2 : raw)
//
// 防禦公式：
//   defenderTakesNextHit × 0.5
//   defenderRecovers floor((patience ?? 0.5) * 4) hp
//
// NPC AI 出招：hash(combatId, npcId, combatRound) % 3 → 0 attack / 1 defend / 2 idle-glare
//   （NPC 不會主動逃）
//
// All randomness uses `hashSeed(...)`. Replay-safe.

import {
  COMBAT_INITIAL_HP,
  COMBAT_NPC_INCAP_TICKS,
  hashSeed,
  type CombatCardPlayPayload,
  type CombatPlayerActionKind,
} from './commands.js'
import { compileCombatCardPlay, type CombatCompiledSubCommand } from './cards/compiler.js'
import type { CombatCardClass } from './cards/catalog.js'

export type CombatActorTraits = Readonly<{
  greed?: number
  patience?: number
  health: number
}>

export type CombatRoundInput = Readonly<{
  combatId: string
  combatRound: number
  playerHp: number
  npcHp: number
  playerAction: CombatPlayerActionKind
  /** Phase B 預留；當前 release rule engine 收下後產 warning event 並忽略 */
  playerCardId?: number
  player: CombatActorTraits & { actorId: string }
  npc: CombatActorTraits & { actorId: string }
}>

export type CombatRoundEventKind =
  | 'COMBAT_DAMAGE'
  | 'COMBAT_DEFEND'
  | 'COMBAT_FLEE'
  | 'COMBAT_RESOLVE'
  | 'COMBAT_CARD_IGNORED'

export type CombatRoundEvent = Readonly<{
  eventType: CombatRoundEventKind
  payload: Record<string, unknown>
}>

export type CombatRoundResult = Readonly<{
  events: readonly CombatRoundEvent[]
  /** 對外的最終 hp（投影用） */
  playerHpAfter: number
  npcHpAfter: number
  /** 戰鬥是否在這一回合終結 */
  resolved:
    | null
    | Readonly<{
        outcome: 'player_victory' | 'npc_victory' | 'fled'
        playerEnergyToZero: boolean
        npcIncapacitatedTicks: number
      }>
}>

export type CombatSubTickPhase =
  | 'STATUS_TICK'
  | 'CARD_PLAY'
  | 'DAMAGE_HEAL'
  | 'DEFEAT'
  | 'RESOLVE'

export type CombatSubTickEventKind =
  | 'COMBAT_STATUS_TICK'
  | 'COMBAT_STATUS_END'
  | 'COMBAT_CARD_PLAY_ACCEPTED'
  | 'COMBAT_CARD_PLAY_REJECTED'
  | 'COMBAT_DAMAGE'
  | 'COMBAT_HEAL'
  | 'COMBAT_STATUS_APPLY'
  | 'COMBAT_TARGET_LOCK'
  | 'COMBAT_TARGET_LOCK_FAIL'
  | 'COMBAT_PHASE_SHIFT'
  | 'COMBAT_FLEE_ATTEMPT'
  | 'COMBAT_DEFEAT'
  | 'COMBAT_RESOLVE'

export type CombatSubTickEvent = Readonly<{
  eventType: CombatSubTickEventKind
  phase: CombatSubTickPhase
  actorId: string
  commandId?: string
  payload: Record<string, unknown>
}>

export type CombatSubTickActor = Readonly<{
  actorId: string
  hp: number
  maxHp?: number
}>

export type CombatActiveStatus = Readonly<{
  targetActorId: string
  statusId: string
  remainingTicks: number
  sourceActorId?: string
  potency?: number
  cardClass?: CombatCardClass
}>

export type CombatActiveTargetLock = Readonly<{
  targetActorId: string
  remainingTicks: number
  sourceActorId?: string
  cardClass?: CombatCardClass
}>

export type CombatPendingCardPlayCommand = Readonly<{
  commandType: 'COMBAT_CARD_PLAY'
  commandId: string
  actorId: string
  payload: CombatCardPlayPayload
}>

export type CombatPendingSubTickCommand = CombatPendingCardPlayCommand

export type CombatSubTickInput = Readonly<{
  combatId: string
  combatTick: number
  /** World tick is carried for future EventLog ordering; this pure slice does not use wall-clock time. */
  tick?: number
  playerActorId?: string
  npcActorId?: string
  actors: readonly CombatSubTickActor[]
  statuses?: readonly CombatActiveStatus[]
  targetLocks?: readonly CombatActiveTargetLock[]
  pendingCommands?: readonly CombatPendingSubTickCommand[]
}>

export type CombatSubTickResult = Readonly<{
  events: readonly CombatSubTickEvent[]
  actorHpAfter: Readonly<Record<string, number>>
  statusesAfter: readonly CombatActiveStatus[]
  targetLocksAfter: readonly CombatActiveTargetLock[]
  resolved:
    | null
    | Readonly<{
        outcome: 'player_victory' | 'npc_victory' | 'fled'
        playerEnergyToZero: boolean
        npcIncapacitatedTicks: number
      }>
}>

type DeferredCompiledSubCommand = Extract<
  CombatCompiledSubCommand,
  { commandType: 'COMBAT_DAMAGE' | 'COMBAT_HEAL' | 'COMBAT_STATUS_APPLY' }
>

type QueuedCompiledCommand = Readonly<{
  sourceCommand: CombatPendingCardPlayCommand
  subCommand: DeferredCompiledSubCommand
}>

export function evaluateCombatSubTick(input: CombatSubTickInput): CombatSubTickResult {
  const events: CombatSubTickEvent[] = []
  const actorHp = new Map<string, number>()
  const actorMaxHp = new Map<string, number>()
  for (const actor of [...input.actors].sort(compareActorsById)) {
    actorHp.set(actor.actorId, actor.hp)
    actorMaxHp.set(actor.actorId, actor.maxHp ?? COMBAT_INITIAL_HP)
  }

  const statusesAfter: CombatActiveStatus[] = []
  for (const status of [...(input.statuses ?? [])].sort(compareStatuses)) {
    if (status.remainingTicks <= 0) continue
    const remainingTicksAfter = Math.max(0, status.remainingTicks - 1)
    pushEvent(events, {
      eventType: 'COMBAT_STATUS_TICK',
      phase: 'STATUS_TICK',
      actorId: status.targetActorId,
      payload: statusTickPayload(input, status, remainingTicksAfter),
    })
    if (remainingTicksAfter === 0) {
      pushEvent(events, {
        eventType: 'COMBAT_STATUS_END',
        phase: 'STATUS_TICK',
        actorId: status.targetActorId,
        payload: {
          combatId: input.combatId,
          combatTick: input.combatTick,
          targetActorId: status.targetActorId,
          statusId: status.statusId,
          reason: 'expired',
        },
      })
    } else {
      statusesAfter.push(copyStatus(status, remainingTicksAfter))
    }
  }

  const activeLocks = [...(input.targetLocks ?? [])]
    .filter((lock) => lock.remainingTicks > 0)
    .sort(compareTargetLocks)
  const lockedActorIds = new Set(activeLocks.map((lock) => lock.targetActorId))
  const targetLocksAfter: CombatActiveTargetLock[] = []
  for (const lock of activeLocks) {
    const remainingTicks = lock.remainingTicks - 1
    if (remainingTicks > 0) targetLocksAfter.push(copyTargetLock(lock, remainingTicks))
  }

  const queuedCompiledCommands: QueuedCompiledCommand[] = []
  let fledActorId: string | null = null
  const shiftedActorIds = new Set<string>()
  const cardCommands = [...(input.pendingCommands ?? [])]
    .filter((command) => command.commandType === 'COMBAT_CARD_PLAY')
    .filter((command) => command.payload.combatId === input.combatId)
    .filter((command) => command.payload.combatTick === input.combatTick)
    .sort(compareCardPlayCommands)

  for (const command of cardCommands) {
    const compiled = compileCombatCardPlay({
      combatId: input.combatId,
      actorId: command.actorId,
      targetActorId: command.payload.targetActorId,
      cardClass: command.payload.cardClass,
    })
    if (!compiled) {
      pushCardRejected(events, input, command, 'unknown_card')
      continue
    }

    const rejectReason = rejectCardPlayReason(input, command, compiled.card.bypassesTargetLock, actorHp, lockedActorIds)
    if (rejectReason !== null) {
      pushCardRejected(events, input, command, rejectReason)
      continue
    }

    pushEvent(events, {
      eventType: 'COMBAT_CARD_PLAY_ACCEPTED',
      phase: 'CARD_PLAY',
      actorId: command.actorId,
      commandId: command.commandId,
      payload: {
        combatId: input.combatId,
        combatTick: input.combatTick,
        actorId: command.actorId,
        targetActorId: command.payload.targetActorId,
        cardClass: compiled.card.cardClass,
        priority: compiled.card.priority,
      },
    })
    for (const subCommand of compiled.subCommands) {
      switch (subCommand.commandType) {
        case 'COMBAT_TARGET_LOCK': {
          const payload = {
            ...subCommand.payload,
            combatTick: input.combatTick,
          }
          if (shiftedActorIds.has(payload.targetActorId)) {
            pushEvent(events, {
              eventType: 'COMBAT_TARGET_LOCK_FAIL',
              phase: 'CARD_PLAY',
              actorId: payload.sourceActorId,
              commandId: command.commandId,
              payload: {
                ...payload,
                reason: 'target_phase_shifted',
              },
            })
            break
          }
          targetLocksAfter.push(lockFromApplyPayload(payload))
          lockedActorIds.add(payload.targetActorId)
          pushEvent(events, {
            eventType: 'COMBAT_TARGET_LOCK',
            phase: 'CARD_PLAY',
            actorId: payload.sourceActorId,
            commandId: command.commandId,
            payload,
          })
          break
        }
        case 'COMBAT_PHASE_SHIFT': {
          const payload = {
            ...subCommand.payload,
            combatTick: input.combatTick,
          }
          shiftedActorIds.add(payload.actorId)
          pushEvent(events, {
            eventType: 'COMBAT_PHASE_SHIFT',
            phase: 'CARD_PLAY',
            actorId: payload.actorId,
            commandId: command.commandId,
            payload,
          })
          break
        }
        case 'COMBAT_FLEE_ATTEMPT': {
          const payload = {
            ...subCommand.payload,
            combatTick: input.combatTick,
          }
          fledActorId = payload.actorId
          pushEvent(events, {
            eventType: 'COMBAT_FLEE_ATTEMPT',
            phase: 'CARD_PLAY',
            actorId: payload.actorId,
            commandId: command.commandId,
            payload,
          })
          break
        }
        case 'COMBAT_DAMAGE':
        case 'COMBAT_HEAL':
        case 'COMBAT_STATUS_APPLY':
          queuedCompiledCommands.push({ sourceCommand: command, subCommand })
          break
      }
    }
  }

  const lastDamageByTarget = new Map<string, string>()
  for (const queued of queuedCompiledCommands) {
    const command = queued.sourceCommand
    const subCommand = queued.subCommand
    switch (subCommand.commandType) {
      case 'COMBAT_DAMAGE': {
        const payload = {
          ...subCommand.payload,
          combatTick: input.combatTick,
        }
        const before = actorHp.get(payload.targetActorId)
        if (before !== undefined) {
          actorHp.set(payload.targetActorId, Math.max(0, before - payload.amount))
          lastDamageByTarget.set(payload.targetActorId, payload.sourceActorId)
        }
        pushEvent(events, {
          eventType: 'COMBAT_DAMAGE',
          phase: 'DAMAGE_HEAL',
          actorId: payload.sourceActorId,
          commandId: command.commandId,
          payload,
        })
        break
      }
      case 'COMBAT_HEAL': {
        const payload = {
          ...subCommand.payload,
          combatTick: input.combatTick,
        }
        const before = actorHp.get(payload.targetActorId)
        if (before !== undefined) {
          const maxHp = actorMaxHp.get(payload.targetActorId) ?? COMBAT_INITIAL_HP
          actorHp.set(payload.targetActorId, Math.min(maxHp, before + payload.amount))
        }
        pushEvent(events, {
          eventType: 'COMBAT_HEAL',
          phase: 'DAMAGE_HEAL',
          actorId: payload.sourceActorId,
          commandId: command.commandId,
          payload,
        })
        break
      }
      case 'COMBAT_STATUS_APPLY': {
        const payload = {
          ...subCommand.payload,
          combatTick: input.combatTick,
        }
        statusesAfter.push(statusFromApplyPayload(payload))
        pushEvent(events, {
          eventType: 'COMBAT_STATUS_APPLY',
          phase: 'DAMAGE_HEAL',
          actorId: payload.sourceActorId,
          commandId: command.commandId,
          payload,
        })
        break
      }
    }
  }

  for (const [actorId, hp] of [...actorHp.entries()].sort(compareActorHpEntries)) {
    if (hp > 0) continue
    const payload: Record<string, unknown> = {
      combatId: input.combatId,
      combatTick: input.combatTick,
      actorId,
      finalHp: hp,
    }
    const defeatedByActorId = lastDamageByTarget.get(actorId)
    if (defeatedByActorId) payload.defeatedByActorId = defeatedByActorId
    pushEvent(events, {
      eventType: 'COMBAT_DEFEAT',
      phase: 'DEFEAT',
      actorId,
      payload,
    })
  }

  const resolved = resolveSubTick(input, actorHp, fledActorId)
  if (resolved) {
    pushEvent(events, {
      eventType: 'COMBAT_RESOLVE',
      phase: 'RESOLVE',
      actorId: input.playerActorId ?? input.npcActorId ?? 'system',
      payload: {
        combatId: input.combatId,
        combatTick: input.combatTick,
        outcome: resolved.outcome,
        durationRounds: input.combatTick,
        finalPlayerHp: input.playerActorId ? (actorHp.get(input.playerActorId) ?? 0) : 0,
        finalNpcHp: input.npcActorId ? (actorHp.get(input.npcActorId) ?? 0) : 0,
        playerEnergyToZero: resolved.playerEnergyToZero,
        npcIncapacitatedTicks: resolved.npcIncapacitatedTicks,
      },
    })
  }

  return {
    events,
    actorHpAfter: actorHpRecord(actorHp),
    statusesAfter: statusesAfter.sort(compareStatuses),
    targetLocksAfter: targetLocksAfter.sort(compareTargetLocks),
    resolved,
  }
}

export function evaluateCombatRound(input: CombatRoundInput): CombatRoundResult {
  const events: CombatRoundEvent[] = []
  let playerHp = input.playerHp
  let npcHp = input.npcHp

  // Phase B：紋卡 hook 預留 — 收下警告，不做事
  if (typeof input.playerCardId === 'number') {
    events.push({
      eventType: 'COMBAT_CARD_IGNORED',
      payload: {
        combatId: input.combatId,
        combatRound: input.combatRound,
        cardId: input.playerCardId,
        reason:
          'Phase B does not compile cards yet; cardId is recorded for Phase C reconciliation.',
      },
    })
  }

  // 1) Player action first
  if (input.playerAction === 'flee') {
    // 逃跑永遠成功（user 規格）
    events.push({
      eventType: 'COMBAT_FLEE',
      payload: {
        combatId: input.combatId,
        combatRound: input.combatRound,
        actorId: input.player.actorId,
      },
    })
    events.push({
      eventType: 'COMBAT_RESOLVE',
      payload: {
        combatId: input.combatId,
        outcome: 'fled',
        durationRounds: input.combatRound,
        finalPlayerHp: playerHp,
        finalNpcHp: npcHp,
        playerEnergyToZero: false,
        npcIncapacitatedTicks: 0,
      },
    })
    return {
      events,
      playerHpAfter: playerHp,
      npcHpAfter: npcHp,
      resolved: { outcome: 'fled', playerEnergyToZero: false, npcIncapacitatedTicks: 0 },
    }
  }

  let playerDefendingThisRound = false
  if (input.playerAction === 'attack') {
    const dmg = computeDamage({
      combatId: input.combatId,
      combatRound: input.combatRound,
      attackerId: input.player.actorId,
      attacker: input.player,
      defender: input.npc,
    })
    npcHp = Math.max(0, npcHp - dmg.damage)
    events.push({
      eventType: 'COMBAT_DAMAGE',
      payload: {
        combatId: input.combatId,
        combatRound: input.combatRound,
        sourceActorId: input.player.actorId,
        targetActorId: input.npc.actorId,
        amount: dmg.damage,
        crit: dmg.crit,
        kind: 'physical',
      },
    })
  } else {
    // defend
    playerDefendingThisRound = true
    const recover = Math.floor((input.player.patience ?? 0.5) * 4)
    playerHp = Math.min(COMBAT_INITIAL_HP, playerHp + recover)
    events.push({
      eventType: 'COMBAT_DEFEND',
      payload: {
        combatId: input.combatId,
        combatRound: input.combatRound,
        actorId: input.player.actorId,
        recoveredHp: recover,
      },
    })
  }

  // 2) Resolve player victory before NPC acts
  if (npcHp <= 0) {
    events.push({
      eventType: 'COMBAT_RESOLVE',
      payload: {
        combatId: input.combatId,
        outcome: 'player_victory',
        durationRounds: input.combatRound,
        finalPlayerHp: playerHp,
        finalNpcHp: npcHp,
        playerEnergyToZero: false,
        npcIncapacitatedTicks: COMBAT_NPC_INCAP_TICKS,
      },
    })
    return {
      events,
      playerHpAfter: playerHp,
      npcHpAfter: npcHp,
      resolved: {
        outcome: 'player_victory',
        playerEnergyToZero: false,
        npcIncapacitatedTicks: COMBAT_NPC_INCAP_TICKS,
      },
    }
  }

  // 3) NPC action — deterministic by hash(combatId, npcId, round)
  // 0 attack / 1 defend / 2 attack-soft (idle glare → small damage)
  const npcActionRoll = hashSeed(input.combatId, input.npc.actorId, input.combatRound) % 3
  if (npcActionRoll === 1) {
    // NPC defends — no damage to player
    events.push({
      eventType: 'COMBAT_DEFEND',
      payload: {
        combatId: input.combatId,
        combatRound: input.combatRound,
        actorId: input.npc.actorId,
        recoveredHp: 0,
      },
    })
  } else {
    const dmg = computeDamage({
      combatId: input.combatId,
      combatRound: input.combatRound,
      attackerId: input.npc.actorId,
      attacker: input.npc,
      defender: input.player,
    })
    let actualDmg = dmg.damage
    if (playerDefendingThisRound) actualDmg = Math.max(1, Math.floor(actualDmg * 0.5))
    if (npcActionRoll === 2) actualDmg = Math.max(1, Math.floor(actualDmg * 0.6)) // soft glare
    playerHp = Math.max(0, playerHp - actualDmg)
    events.push({
      eventType: 'COMBAT_DAMAGE',
      payload: {
        combatId: input.combatId,
        combatRound: input.combatRound,
        sourceActorId: input.npc.actorId,
        targetActorId: input.player.actorId,
        amount: actualDmg,
        crit: dmg.crit,
        kind: 'physical',
      },
    })
  }

  // 4) Resolve NPC victory
  if (playerHp <= 0) {
    events.push({
      eventType: 'COMBAT_RESOLVE',
      payload: {
        combatId: input.combatId,
        outcome: 'npc_victory',
        durationRounds: input.combatRound,
        finalPlayerHp: playerHp,
        finalNpcHp: npcHp,
        playerEnergyToZero: true,
        npcIncapacitatedTicks: 0,
      },
    })
    return {
      events,
      playerHpAfter: playerHp,
      npcHpAfter: npcHp,
      resolved: {
        outcome: 'npc_victory',
        playerEnergyToZero: true,
        npcIncapacitatedTicks: 0,
      },
    }
  }

  return {
    events,
    playerHpAfter: playerHp,
    npcHpAfter: npcHp,
    resolved: null,
  }
}

function computeDamage(input: {
  combatId: string
  combatRound: number
  attackerId: string
  attacker: CombatActorTraits
  defender: CombatActorTraits
}): { damage: number; crit: boolean } {
  const base = 8 + Math.ceil(input.attacker.health * 0.05)
  const greedBoost = Math.floor((input.attacker.greed ?? 0.5) * 6)
  const patienceMitigation = Math.floor((input.defender.patience ?? 0.5) * 5)
  const raw = Math.max(1, base + greedBoost - patienceMitigation)
  const critRoll = hashSeed(input.combatId, input.attackerId, input.combatRound) % 100
  const crit = critRoll < 12
  const damage = crit ? raw * 2 : raw
  return { damage: Math.max(1, damage), crit }
}

function pushEvent(
  events: CombatSubTickEvent[],
  event: Omit<CombatSubTickEvent, 'commandId'> & { commandId?: string }
): void {
  events.push(event)
}

function pushCardRejected(
  events: CombatSubTickEvent[],
  input: CombatSubTickInput,
  command: CombatPendingCardPlayCommand,
  reason: 'unknown_card' | 'actor_defeated' | 'target_defeated' | 'target_locked'
): void {
  pushEvent(events, {
    eventType: 'COMBAT_CARD_PLAY_REJECTED',
    phase: 'CARD_PLAY',
    actorId: command.actorId,
    commandId: command.commandId,
    payload: {
      combatId: input.combatId,
      combatTick: input.combatTick,
      actorId: command.actorId,
      targetActorId: command.payload.targetActorId,
      cardClass: command.payload.cardClass,
      reason,
    },
  })
}

function rejectCardPlayReason(
  _input: CombatSubTickInput,
  command: CombatPendingCardPlayCommand,
  bypassesTargetLock: boolean,
  actorHp: ReadonlyMap<string, number>,
  lockedActorIds: ReadonlySet<string>
): 'actor_defeated' | 'target_defeated' | 'target_locked' | null {
  const actorHpValue = actorHp.get(command.actorId)
  if (actorHpValue === undefined || actorHpValue <= 0) return 'actor_defeated'

  const targetHpValue = actorHp.get(command.payload.targetActorId)
  if (targetHpValue === undefined || targetHpValue <= 0) return 'target_defeated'

  if (
    !bypassesTargetLock &&
    (lockedActorIds.has(command.actorId) || lockedActorIds.has(command.payload.targetActorId))
  ) {
    return 'target_locked'
  }
  return null
}

function resolveSubTick(
  input: CombatSubTickInput,
  actorHp: ReadonlyMap<string, number>,
  fledActorId: string | null
): CombatSubTickResult['resolved'] {
  if (fledActorId !== null) {
    return { outcome: 'fled', playerEnergyToZero: false, npcIncapacitatedTicks: 0 }
  }
  if (!input.playerActorId || !input.npcActorId) return null

  const playerHp = actorHp.get(input.playerActorId)
  const npcHp = actorHp.get(input.npcActorId)
  if (npcHp !== undefined && npcHp <= 0) {
    return {
      outcome: 'player_victory',
      playerEnergyToZero: false,
      npcIncapacitatedTicks: COMBAT_NPC_INCAP_TICKS,
    }
  }
  if (playerHp !== undefined && playerHp <= 0) {
    return {
      outcome: 'npc_victory',
      playerEnergyToZero: true,
      npcIncapacitatedTicks: 0,
    }
  }
  return null
}

function actorHpRecord(actorHp: ReadonlyMap<string, number>): Readonly<Record<string, number>> {
  const record: Record<string, number> = {}
  for (const [actorId, hp] of [...actorHp.entries()].sort(compareActorHpEntries)) {
    record[actorId] = hp
  }
  return record
}

function statusTickPayload(
  input: CombatSubTickInput,
  status: CombatActiveStatus,
  remainingTicksAfter: number
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    combatId: input.combatId,
    combatTick: input.combatTick,
    targetActorId: status.targetActorId,
    statusId: status.statusId,
    remainingTicksAfter,
  }
  if (status.potency !== undefined) payload.potency = status.potency
  return payload
}

function copyStatus(status: CombatActiveStatus, remainingTicks: number): CombatActiveStatus {
  return {
    targetActorId: status.targetActorId,
    statusId: status.statusId,
    remainingTicks,
    ...(status.sourceActorId !== undefined ? { sourceActorId: status.sourceActorId } : {}),
    ...(status.potency !== undefined ? { potency: status.potency } : {}),
    ...(status.cardClass !== undefined ? { cardClass: status.cardClass } : {}),
  }
}

function statusFromApplyPayload(payload: {
  sourceActorId: string
  targetActorId: string
  statusId: string
  remainingTicks: number
  potency?: number
  cardClass?: CombatCardClass
}): CombatActiveStatus {
  return {
    targetActorId: payload.targetActorId,
    statusId: payload.statusId,
    remainingTicks: payload.remainingTicks,
    sourceActorId: payload.sourceActorId,
    ...(payload.potency !== undefined ? { potency: payload.potency } : {}),
    ...(payload.cardClass !== undefined ? { cardClass: payload.cardClass } : {}),
  }
}

function copyTargetLock(lock: CombatActiveTargetLock, remainingTicks: number): CombatActiveTargetLock {
  return {
    targetActorId: lock.targetActorId,
    remainingTicks,
    ...(lock.sourceActorId !== undefined ? { sourceActorId: lock.sourceActorId } : {}),
    ...(lock.cardClass !== undefined ? { cardClass: lock.cardClass } : {}),
  }
}

function lockFromApplyPayload(payload: {
  sourceActorId: string
  targetActorId: string
  durationTicks: number
  cardClass?: CombatCardClass
}): CombatActiveTargetLock {
  return {
    targetActorId: payload.targetActorId,
    remainingTicks: payload.durationTicks,
    sourceActorId: payload.sourceActorId,
    ...(payload.cardClass !== undefined ? { cardClass: payload.cardClass } : {}),
  }
}

function compareActorsById(left: CombatSubTickActor, right: CombatSubTickActor): number {
  return compareLex(left.actorId, right.actorId)
}

function compareActorHpEntries(left: [string, number], right: [string, number]): number {
  return compareLex(left[0], right[0])
}

function compareStatuses(left: CombatActiveStatus, right: CombatActiveStatus): number {
  return (
    compareLex(left.targetActorId, right.targetActorId) ||
    compareLex(left.statusId, right.statusId) ||
    compareLex(left.sourceActorId ?? '', right.sourceActorId ?? '') ||
    compareNumber(left.remainingTicks, right.remainingTicks) ||
    compareOptionalNumber(left.potency, right.potency) ||
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

function compareCardPlayCommands(
  left: CombatPendingCardPlayCommand,
  right: CombatPendingCardPlayCommand
): number {
  const leftPriority = compileCombatCardPlay({
    combatId: left.payload.combatId,
    actorId: left.actorId,
    targetActorId: left.payload.targetActorId,
    cardClass: left.payload.cardClass,
  })?.card.priority ?? Number.MAX_SAFE_INTEGER
  const rightPriority = compileCombatCardPlay({
    combatId: right.payload.combatId,
    actorId: right.actorId,
    targetActorId: right.payload.targetActorId,
    cardClass: right.payload.cardClass,
  })?.card.priority ?? Number.MAX_SAFE_INTEGER

  return (
    leftPriority - rightPriority ||
    compareLex(left.actorId, right.actorId) ||
    compareLex(left.commandId, right.commandId) ||
    compareLex(left.payload.cardClass, right.payload.cardClass) ||
    compareLex(left.payload.targetActorId, right.payload.targetActorId) ||
    compareLex(left.payload.combatId, right.payload.combatId) ||
    compareNumber(left.payload.combatTick, right.payload.combatTick)
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

function compareOptionalNumber(left: number | undefined, right: number | undefined): number {
  if (left === undefined && right === undefined) return 0
  if (left === undefined) return -1
  if (right === undefined) return 1
  return compareNumber(left, right)
}

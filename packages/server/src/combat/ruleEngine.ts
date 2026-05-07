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
  type CombatPlayerActionKind,
} from './commands.js'

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

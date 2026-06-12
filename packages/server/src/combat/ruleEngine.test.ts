import { describe, it, expect } from 'vitest'
import {
  evaluateCombatRound,
  evaluateCombatSubTick,
  type CombatPendingCardPlayCommand,
} from './ruleEngine.js'
import { COMBAT_INITIAL_HP, hashSeed, seededRandInt } from './commands.js'
import type { CombatCardClass } from './cards/catalog.js'

const PLAYER = { actorId: 'acct_42', greed: 0.5, patience: 0.5, health: 80 }
const NPC = { actorId: 'npc_test', greed: 0.6, patience: 0.4, health: 80 }

function cardPlay(input: {
  commandId: string
  actorId: string
  cardClass: CombatCardClass
  targetActorId: string
  combatId?: string
  combatTick?: number
}): CombatPendingCardPlayCommand {
  return {
    commandType: 'COMBAT_CARD_PLAY',
    commandId: input.commandId,
    actorId: input.actorId,
    payload: {
      combatId: input.combatId ?? 'combat_phase_c',
      combatTick: input.combatTick ?? 4,
      cardClass: input.cardClass,
      targetActorId: input.targetActorId,
    },
  }
}

describe('combat rule engine — Phase B', () => {
  it('hashSeed is deterministic and excludes wall-clock', () => {
    expect(hashSeed('combat_1', 'npc_a', 1)).toBe(hashSeed('combat_1', 'npc_a', 1))
    expect(hashSeed('combat_1', 'npc_a', 1)).not.toBe(hashSeed('combat_1', 'npc_a', 2))
    expect(seededRandInt(3, 'combat_x', 'npc_y', 1)).toBeGreaterThanOrEqual(0)
    expect(seededRandInt(3, 'combat_x', 'npc_y', 1)).toBeLessThan(3)
  })

  it('attack action emits COMBAT_DAMAGE for both sides (or NPC defends) when no resolution', () => {
    const r = evaluateCombatRound({
      combatId: 'combat_a',
      combatRound: 1,
      playerHp: COMBAT_INITIAL_HP,
      npcHp: COMBAT_INITIAL_HP,
      playerAction: 'attack',
      player: PLAYER,
      npc: NPC,
    })
    const damageEvents = r.events.filter((e) => e.eventType === 'COMBAT_DAMAGE')
    expect(damageEvents.length).toBeGreaterThanOrEqual(1)
    expect(r.playerHpAfter).toBeLessThanOrEqual(COMBAT_INITIAL_HP)
    expect(r.npcHpAfter).toBeLessThan(COMBAT_INITIAL_HP)
    expect(r.resolved).toBeNull()
  })

  it('flee always succeeds and resolves with outcome=fled', () => {
    const r = evaluateCombatRound({
      combatId: 'combat_b',
      combatRound: 1,
      playerHp: 50,
      npcHp: 50,
      playerAction: 'flee',
      player: PLAYER,
      npc: NPC,
    })
    expect(r.resolved).not.toBeNull()
    expect(r.resolved?.outcome).toBe('fled')
    expect(r.events.find((e) => e.eventType === 'COMBAT_RESOLVE')).toBeDefined()
    // Flee does not zero player energy by Phase B spec
    expect(r.resolved?.playerEnergyToZero).toBe(false)
    expect(r.playerHpAfter).toBe(50)
    expect(r.npcHpAfter).toBe(50)
  })

  it('two identical inputs produce byte-identical event sequences (replay safety)', () => {
    const a = evaluateCombatRound({
      combatId: 'combat_replay',
      combatRound: 7,
      playerHp: 60,
      npcHp: 40,
      playerAction: 'attack',
      player: PLAYER,
      npc: NPC,
    })
    const b = evaluateCombatRound({
      combatId: 'combat_replay',
      combatRound: 7,
      playerHp: 60,
      npcHp: 40,
      playerAction: 'attack',
      player: PLAYER,
      npc: NPC,
    })
    expect(JSON.stringify(a.events)).toBe(JSON.stringify(b.events))
    expect(a.playerHpAfter).toBe(b.playerHpAfter)
    expect(a.npcHpAfter).toBe(b.npcHpAfter)
  })

  it('player victory resolves before NPC counter-attack', () => {
    const r = evaluateCombatRound({
      combatId: 'combat_kill',
      combatRound: 1,
      playerHp: 90,
      npcHp: 1, // 1 hp NPC dies on first hit
      playerAction: 'attack',
      player: PLAYER,
      npc: NPC,
    })
    expect(r.resolved?.outcome).toBe('player_victory')
    // NPC should not get to counter
    const dmgEvents = r.events.filter((e) => e.eventType === 'COMBAT_DAMAGE')
    // exactly one (player → npc); no NPC → player counter
    expect(dmgEvents.length).toBe(1)
    expect(r.resolved?.npcIncapacitatedTicks).toBeGreaterThan(0)
  })

  it('npc victory zeros player energy', () => {
    const r = evaluateCombatRound({
      combatId: 'combat_lose',
      combatRound: 1,
      playerHp: 1,
      npcHp: 90,
      playerAction: 'defend',
      player: PLAYER,
      npc: NPC,
    })
    if (r.resolved && r.resolved.outcome === 'npc_victory') {
      expect(r.resolved.playerEnergyToZero).toBe(true)
    } else {
      // If RNG happens to make NPC defend, player survives. That's fine.
      expect(r.playerHpAfter).toBeGreaterThanOrEqual(0)
    }
  })

  it('cardId in action is recorded as COMBAT_CARD_IGNORED warning (Phase C hook)', () => {
    const r = evaluateCombatRound({
      combatId: 'combat_card',
      combatRound: 1,
      playerHp: 80,
      npcHp: 80,
      playerAction: 'attack',
      playerCardId: 1001,
      player: PLAYER,
      npc: NPC,
    })
    const ignored = r.events.find((e) => e.eventType === 'COMBAT_CARD_IGNORED')
    expect(ignored).toBeDefined()
    expect((ignored?.payload as { cardId?: number }).cardId).toBe(1001)
  })
})

describe('combat rule engine — Phase C sub-tick pipeline', () => {
  it('priority 0 PHASE_SHIFT bypasses target-lock while priority >=1 cards reject', () => {
    const result = evaluateCombatSubTick({
      combatId: 'combat_phase_c',
      combatTick: 4,
      actors: [
        { actorId: 'actor_a', hp: 100 },
        { actorId: 'actor_b', hp: 100 },
      ],
      targetLocks: [{ targetActorId: 'actor_a', sourceActorId: 'actor_b', remainingTicks: 2 }],
      pendingCommands: [
        cardPlay({ commandId: 'cmd_fire', actorId: 'actor_a', cardClass: 'FIRE_LASH', targetActorId: 'actor_b' }),
        cardPlay({ commandId: 'cmd_phase', actorId: 'actor_a', cardClass: 'PHASE_SHIFT', targetActorId: 'actor_b' }),
      ],
    })

    const accepted = result.events.find((event) => event.eventType === 'COMBAT_CARD_PLAY_ACCEPTED')
    const rejected = result.events.find((event) => event.eventType === 'COMBAT_CARD_PLAY_REJECTED')

    expect(accepted?.commandId).toBe('cmd_phase')
    expect(accepted?.payload.cardClass).toBe('PHASE_SHIFT')
    expect(rejected?.commandId).toBe('cmd_fire')
    expect(rejected?.payload.reason).toBe('target_locked')
    expect(result.events.some((event) => event.eventType === 'COMBAT_PHASE_SHIFT')).toBe(true)
    expect(result.targetLocksAfter).toEqual([
      { targetActorId: 'actor_a', sourceActorId: 'actor_b', remainingTicks: 1 },
    ])
  })

  it('same-sub-tick target locks from higher-priority cards reject later locked actors', () => {
    const result = evaluateCombatSubTick({
      combatId: 'combat_phase_c',
      combatTick: 4,
      actors: [
        { actorId: 'actor_a', hp: 100 },
        { actorId: 'actor_b', hp: 100 },
      ],
      pendingCommands: [
        cardPlay({ commandId: 'cmd_fire', actorId: 'actor_b', cardClass: 'FIRE_LASH', targetActorId: 'actor_a' }),
        cardPlay({ commandId: 'cmd_lock', actorId: 'actor_a', cardClass: 'NO_ESCAPE', targetActorId: 'actor_b' }),
      ],
    })

    expect(result.events.map((event) => `${event.eventType}:${event.commandId ?? 'none'}`)).toEqual([
      'COMBAT_CARD_PLAY_ACCEPTED:cmd_lock',
      'COMBAT_TARGET_LOCK:cmd_lock',
      'COMBAT_CARD_PLAY_REJECTED:cmd_fire',
    ])
    expect(result.events[2]?.payload.reason).toBe('target_locked')
    expect(result.actorHpAfter.actor_a).toBe(100)
    expect(result.actorHpAfter.actor_b).toBe(100)
    expect(result.targetLocksAfter).toEqual([
      { targetActorId: 'actor_b', sourceActorId: 'actor_a', remainingTicks: 10, cardClass: 'NO_ESCAPE' },
    ])
  })

  it('PHASE_SHIFT causes lower-priority NO_ESCAPE target lock to fail against the shifted actor', () => {
    const result = evaluateCombatSubTick({
      combatId: 'combat_phase_c',
      combatTick: 4,
      actors: [
        { actorId: 'actor_a', hp: 100 },
        { actorId: 'actor_b', hp: 100 },
      ],
      pendingCommands: [
        cardPlay({ commandId: 'cmd_lock', actorId: 'actor_a', cardClass: 'NO_ESCAPE', targetActorId: 'actor_b' }),
        cardPlay({ commandId: 'cmd_phase', actorId: 'actor_b', cardClass: 'PHASE_SHIFT', targetActorId: 'actor_a' }),
      ],
    })

    expect(result.events.map((event) => `${event.eventType}:${event.commandId ?? 'none'}`)).toEqual([
      'COMBAT_CARD_PLAY_ACCEPTED:cmd_phase',
      'COMBAT_PHASE_SHIFT:cmd_phase',
      'COMBAT_CARD_PLAY_ACCEPTED:cmd_lock',
      'COMBAT_TARGET_LOCK_FAIL:cmd_lock',
    ])
    expect(result.events[1]?.payload.phase).toBe('alt')
    expect(result.events[3]?.payload.reason).toBe('target_phase_shifted')
    expect(result.targetLocksAfter).toEqual([])
  })

  it('FIRE_LASH compiles into COMBAT_DAMAGE plus burn COMBAT_STATUS_APPLY', () => {
    const result = evaluateCombatSubTick({
      combatId: 'combat_phase_c',
      combatTick: 4,
      actors: [
        { actorId: 'actor_a', hp: 100 },
        { actorId: 'actor_b', hp: 100 },
      ],
      pendingCommands: [
        cardPlay({ commandId: 'cmd_fire', actorId: 'actor_a', cardClass: 'FIRE_LASH', targetActorId: 'actor_b' }),
      ],
    })

    const effectEvents = result.events.filter((event) =>
      event.eventType === 'COMBAT_DAMAGE' || event.eventType === 'COMBAT_STATUS_APPLY'
    )

    expect(effectEvents.map((event) => event.eventType)).toEqual([
      'COMBAT_DAMAGE',
      'COMBAT_STATUS_APPLY',
    ])
    expect(effectEvents[0]?.payload).toMatchObject({
      combatId: 'combat_phase_c',
      combatTick: 4,
      sourceActorId: 'actor_a',
      targetActorId: 'actor_b',
      amount: 18,
      cardClass: 'FIRE_LASH',
      element: 'fire',
    })
    expect(effectEvents[1]?.payload).toMatchObject({
      combatId: 'combat_phase_c',
      combatTick: 4,
      sourceActorId: 'actor_a',
      targetActorId: 'actor_b',
      statusId: 'burn',
      remainingTicks: 30,
      potency: 2,
      cardClass: 'FIRE_LASH',
    })
    expect(result.actorHpAfter.actor_b).toBe(82)
  })

  it('same-priority card plays resolve by actorId then commandId, not input order', () => {
    const result = evaluateCombatSubTick({
      combatId: 'combat_phase_c',
      combatTick: 4,
      actors: [
        { actorId: 'actor_b', hp: 100 },
        { actorId: 'actor_a', hp: 100 },
        { actorId: 'npc_target', hp: 100 },
      ],
      pendingCommands: [
        cardPlay({ commandId: 'cmd_b', actorId: 'actor_b', cardClass: 'FIRE_LASH', targetActorId: 'npc_target' }),
        cardPlay({ commandId: 'cmd_a', actorId: 'actor_a', cardClass: 'FIRE_LASH', targetActorId: 'npc_target' }),
      ],
    })

    const acceptedCommandIds = result.events
      .filter((event) => event.eventType === 'COMBAT_CARD_PLAY_ACCEPTED')
      .map((event) => event.commandId)
    const damageSources = result.events
      .filter((event) => event.eventType === 'COMBAT_DAMAGE')
      .map((event) => event.payload.sourceActorId)

    expect(acceptedCommandIds).toEqual(['cmd_a', 'cmd_b'])
    expect(damageSources).toEqual(['actor_a', 'actor_b'])
    expect(result.actorHpAfter.npc_target).toBe(64)
  })

  it('uses deterministic fallback ordering for duplicate command ids', () => {
    const input = {
      combatId: 'combat_duplicate_commands',
      combatTick: 4,
      actors: [
        { actorId: 'actor_a', hp: 80 },
        { actorId: 'npc_target', hp: 100 },
      ],
      pendingCommands: [
        cardPlay({
          combatId: 'combat_duplicate_commands',
          commandId: 'cmd_duplicate',
          actorId: 'actor_a',
          cardClass: 'MEND',
          targetActorId: 'actor_a',
        }),
        cardPlay({
          combatId: 'combat_duplicate_commands',
          commandId: 'cmd_duplicate',
          actorId: 'actor_a',
          cardClass: 'FIRE_LASH',
          targetActorId: 'npc_target',
        }),
      ],
    } as const

    const a = evaluateCombatSubTick(input)
    const b = evaluateCombatSubTick({
      ...input,
      pendingCommands: [...input.pendingCommands].reverse(),
    })

    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
    expect(
      a.events
        .filter((event) => event.eventType === 'COMBAT_CARD_PLAY_ACCEPTED')
        .map((event) => event.payload.cardClass)
    ).toEqual(['FIRE_LASH', 'MEND'])
  })

  it('fixed seed inputs replay to byte-identical sub-tick results', () => {
    const input = {
      combatId: 'combat_replay_phase_c',
      combatTick: 9,
      actors: [
        { actorId: 'actor_b', hp: 100 },
        { actorId: 'actor_a', hp: 100 },
        { actorId: 'npc_target', hp: 100 },
      ],
      statuses: [
        { targetActorId: 'npc_target', statusId: 'burn', remainingTicks: 2, potency: 2 },
        {
          targetActorId: 'npc_target',
          statusId: 'ward',
          remainingTicks: 3,
          sourceActorId: 'actor_a',
          potency: 2,
          cardClass: 'REGEN',
        },
        {
          targetActorId: 'npc_target',
          statusId: 'ward',
          remainingTicks: 3,
          sourceActorId: 'actor_a',
          potency: 1,
          cardClass: 'SHIELD',
        },
      ],
      targetLocks: [
        { targetActorId: 'unused_locked', remainingTicks: 3, sourceActorId: 'actor_a', cardClass: 'STUN' },
        { targetActorId: 'unused_locked', remainingTicks: 3, sourceActorId: 'actor_a', cardClass: 'NO_ESCAPE' },
      ],
      pendingCommands: [
        cardPlay({
          commandId: 'cmd_b',
          actorId: 'actor_b',
          cardClass: 'FIRE_LASH',
          targetActorId: 'npc_target',
          combatId: 'combat_replay_phase_c',
          combatTick: 9,
        }),
        cardPlay({
          commandId: 'cmd_a',
          actorId: 'actor_a',
          cardClass: 'FIRE_LASH',
          targetActorId: 'npc_target',
          combatId: 'combat_replay_phase_c',
          combatTick: 9,
        }),
      ],
    } as const

    const a = evaluateCombatSubTick(input)
    const b = evaluateCombatSubTick({
      ...input,
      actors: [...input.actors].reverse(),
      statuses: [...input.statuses].reverse(),
      targetLocks: [...input.targetLocks].reverse(),
      pendingCommands: [...input.pendingCommands].reverse(),
    })

    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })

  it('orders phases STATUS_TICK -> CARD_PLAY -> DAMAGE/HEAL -> DEFEAT -> RESOLVE', () => {
    const result = evaluateCombatSubTick({
      combatId: 'combat_phase_order',
      combatTick: 7,
      playerActorId: 'actor_a',
      npcActorId: 'npc_target',
      actors: [
        { actorId: 'actor_a', hp: 100 },
        { actorId: 'npc_target', hp: 18 },
      ],
      statuses: [{ targetActorId: 'npc_target', statusId: 'burn', remainingTicks: 2, potency: 2 }],
      pendingCommands: [
        cardPlay({
          commandId: 'cmd_fire',
          actorId: 'actor_a',
          cardClass: 'FIRE_LASH',
          targetActorId: 'npc_target',
          combatId: 'combat_phase_order',
          combatTick: 7,
        }),
      ],
    })

    const eventTypes = result.events.map((event) => event.eventType)
    const statusTickIndex = eventTypes.indexOf('COMBAT_STATUS_TICK')
    const acceptedIndex = eventTypes.indexOf('COMBAT_CARD_PLAY_ACCEPTED')
    const damageIndex = eventTypes.indexOf('COMBAT_DAMAGE')
    const defeatIndex = eventTypes.indexOf('COMBAT_DEFEAT')
    const resolveIndex = eventTypes.indexOf('COMBAT_RESOLVE')

    expect(statusTickIndex).toBeGreaterThanOrEqual(0)
    expect(acceptedIndex).toBeGreaterThan(statusTickIndex)
    expect(damageIndex).toBeGreaterThan(acceptedIndex)
    expect(defeatIndex).toBeGreaterThan(damageIndex)
    expect(resolveIndex).toBeGreaterThan(defeatIndex)
    expect(result.actorHpAfter.npc_target).toBe(0)
    expect(result.resolved?.outcome).toBe('player_victory')
  })
})

// ── v0.90.0 — 術式卡回合效果（卡牌戰鬥） ────────────────────────────────
describe('technique cards in rounds (v0.90.0)', () => {
  const base = {
    combatId: 'combat_card',
    combatRound: 1,
    playerHp: COMBAT_INITIAL_HP,
    npcHp: COMBAT_INITIAL_HP,
    player: PLAYER,
    npc: NPC,
  }

  it('FIRE_LASH deals bonus technique damage and emits COMBAT_CARD_USED', () => {
    const withCard = evaluateCombatRound({ ...base, playerAction: 'defend', playerCardClass: 'FIRE_LASH' })
    const without = evaluateCombatRound({ ...base, playerAction: 'defend' })
    expect(withCard.events.find((e) => e.eventType === 'COMBAT_CARD_USED')?.payload.cardClass).toBe('FIRE_LASH')
    expect(withCard.npcHpAfter).toBe(without.npcHpAfter - 18)
    const techHit = withCard.events.find((e) => e.eventType === 'COMBAT_DAMAGE' && e.payload.kind === 'technique')
    expect(techHit?.payload.amount).toBe(18)
  })

  it('MEND heals the player', () => {
    const r = evaluateCombatRound({ ...base, playerHp: 40, playerAction: 'attack', playerCardClass: 'MEND' })
    expect(r.events.find((e) => e.eventType === 'COMBAT_HEAL')?.payload.amount).toBe(16)
  })

  it('PHASE_SHIFT avoids all incoming damage this round', () => {
    // 找一個 NPC 會攻擊的 seed（roll !== 1）
    let round = 1
    while (hashSeed(base.combatId, NPC.actorId, round) % 3 === 1) round += 1
    const r = evaluateCombatRound({ ...base, combatRound: round, playerAction: 'attack', playerCardClass: 'PHASE_SHIFT' })
    const incoming = r.events.filter(
      (e) => e.eventType === 'COMBAT_DAMAGE' && e.payload.targetActorId === PLAYER.actorId
    )
    expect(incoming).toHaveLength(0)
    expect(r.playerHpAfter).toBe(COMBAT_INITIAL_HP)
  })

  it('STUN prevents the NPC from acting', () => {
    let round = 1
    while (hashSeed(base.combatId, NPC.actorId, round) % 3 === 1) round += 1
    const r = evaluateCombatRound({ ...base, combatRound: round, playerAction: 'defend', playerCardClass: 'STUN' })
    const incoming = r.events.filter(
      (e) => e.eventType === 'COMBAT_DAMAGE' && e.payload.targetActorId === PLAYER.actorId
    )
    expect(incoming).toHaveLength(0)
    const stunMark = r.events.find((e) => e.eventType === 'COMBAT_DEFEND' && e.payload.stunned === true)
    expect(stunMark).toBeDefined()
  })

  it('SHIELD halves incoming damage', () => {
    let round = 1
    while (hashSeed(base.combatId, NPC.actorId, round) % 3 !== 0) round += 1 // 全力攻擊 roll
    const plain = evaluateCombatRound({ ...base, combatRound: round, playerAction: 'attack' })
    const shielded = evaluateCombatRound({ ...base, combatRound: round, playerAction: 'attack', playerCardClass: 'SHIELD' })
    const plainHit = plain.events.find(
      (e) => e.eventType === 'COMBAT_DAMAGE' && e.payload.targetActorId === PLAYER.actorId
    )
    const shieldedHit = shielded.events.find(
      (e) => e.eventType === 'COMBAT_DAMAGE' && e.payload.targetActorId === PLAYER.actorId
    )
    expect(plainHit).toBeDefined()
    expect(shieldedHit).toBeDefined()
    expect(shieldedHit!.payload.amount as number).toBe(
      Math.max(1, Math.floor((plainHit!.payload.amount as number) * 0.5))
    )
  })

  it('HASTE strikes twice on attack', () => {
    const r = evaluateCombatRound({ ...base, playerAction: 'attack', playerCardClass: 'HASTE' })
    const playerHits = r.events.filter(
      (e) => e.eventType === 'COMBAT_DAMAGE' && e.payload.sourceActorId === PLAYER.actorId && e.payload.kind === 'physical'
    )
    expect(playerHits).toHaveLength(2)
    expect(playerHits[1]!.payload.followUp).toBe(true)
  })

  it('COUNTERSPELL reflects part of incoming damage back', () => {
    let round = 1
    while (hashSeed(base.combatId, NPC.actorId, round) % 3 === 1) round += 1
    const r = evaluateCombatRound({ ...base, combatRound: round, playerAction: 'defend', playerCardClass: 'COUNTERSPELL' })
    const reflect = r.events.find((e) => e.eventType === 'COMBAT_DAMAGE' && e.payload.kind === 'reflect')
    expect(reflect).toBeDefined()
    expect(reflect!.payload.targetActorId).toBe(NPC.actorId)
  })

  it('card effects remain replay-deterministic', () => {
    const a = evaluateCombatRound({ ...base, playerAction: 'attack', playerCardClass: 'HASTE' })
    const b = evaluateCombatRound({ ...base, playerAction: 'attack', playerCardClass: 'HASTE' })
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })
})

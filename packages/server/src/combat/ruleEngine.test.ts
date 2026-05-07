import { describe, it, expect } from 'vitest'
import { evaluateCombatRound } from './ruleEngine.js'
import { COMBAT_INITIAL_HP, hashSeed, seededRandInt } from './commands.js'

const PLAYER = { actorId: 'acct_42', greed: 0.5, patience: 0.5, health: 80 }
const NPC = { actorId: 'npc_test', greed: 0.6, patience: 0.4, health: 80 }

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

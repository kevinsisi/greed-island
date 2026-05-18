import { describe, expect, it } from 'vitest'
import {
  CombatProjection,
  type CombatSseSnapshot,
  type CombatSseEventMessage,
} from './CombatProjection.js'

const BASE_SNAPSHOT: CombatSseSnapshot = {
  combatId: 'combat_test',
  lastCombatTick: 3,
  actors: [
    { actorId: 'player_1', hp: 100, maxHp: 100 },
    { actorId: 'npc_goblin', hp: 100, maxHp: 100 },
  ],
  statuses: [],
  targetLocks: [],
  resolved: false,
  tickDigest: 'digest_3',
}

function event(eventType: string, data: Record<string, unknown>, tickDigest = 'digest_4'): CombatSseEventMessage {
  return { eventType, payload: { actorType: 'system', data: { combatId: 'combat_test', ...data }, narration: null }, tickDigest }
}

function directEvent(eventType: string, data: Record<string, unknown>, tickDigest = 'digest_4'): CombatSseEventMessage {
  return { eventType, payload: { combatId: 'combat_test', ...data }, tickDigest }
}

describe('CombatProjection', () => {
  it('applySnapshot sets initial state', () => {
    const proj = new CombatProjection()
    proj.applySnapshot(BASE_SNAPSHOT)
    expect(proj.state?.combatId).toBe('combat_test')
    expect(proj.state?.actors[0]?.hp).toBe(100)
    expect(proj.state?.resolved).toBe(false)
  })

  it('isStale returns true when tickDigest mismatches', () => {
    const proj = new CombatProjection()
    proj.applySnapshot(BASE_SNAPSHOT)
    expect(proj.isStale('digest_3')).toBe(false)
    expect(proj.isStale('digest_5')).toBe(true)
  })

  it('applyEvent COMBAT_DAMAGE reduces hp — LivingWorld wrapped payload', () => {
    const proj = new CombatProjection()
    proj.applySnapshot(BASE_SNAPSHOT)
    proj.applyEvent(event('COMBAT_DAMAGE', { combatTick: 4, sourceActorId: 'player_1', targetActorId: 'npc_goblin', amount: 25 }))
    expect(proj.state?.actors.find((a) => a.actorId === 'npc_goblin')?.hp).toBe(75)
    expect(proj.state?.tickDigest).toBe('digest_4')
  })

  it('applyEvent COMBAT_DAMAGE — direct payload shape', () => {
    const proj = new CombatProjection()
    proj.applySnapshot(BASE_SNAPSHOT)
    proj.applyEvent(directEvent('COMBAT_DAMAGE', { combatTick: 4, sourceActorId: 'player_1', targetActorId: 'npc_goblin', amount: 30 }))
    expect(proj.state?.actors.find((a) => a.actorId === 'npc_goblin')?.hp).toBe(70)
  })

  it('applyEvent COMBAT_HEAL capped at maxHp', () => {
    const proj = new CombatProjection()
    proj.applySnapshot({ ...BASE_SNAPSHOT, actors: [{ actorId: 'player_1', hp: 90, maxHp: 100 }, { actorId: 'npc_goblin', hp: 100, maxHp: 100 }] })
    proj.applyEvent(event('COMBAT_HEAL', { combatTick: 4, sourceActorId: 'player_1', targetActorId: 'player_1', amount: 50 }))
    expect(proj.state?.actors.find((a) => a.actorId === 'player_1')?.hp).toBe(100)
  })

  it('applyEvent COMBAT_STATUS_APPLY / TICK / END lifecycle', () => {
    const proj = new CombatProjection()
    proj.applySnapshot(BASE_SNAPSHOT)
    proj.applyEvent(event('COMBAT_STATUS_APPLY', { combatTick: 4, statusId: 'burn', targetActorId: 'npc_goblin', sourceActorId: 'player_1', remainingTicks: 3, potency: 5 }))
    expect(proj.state?.statuses).toHaveLength(1)
    expect(proj.state?.statuses[0]?.remainingTicks).toBe(3)

    proj.applyEvent(event('COMBAT_STATUS_TICK', { combatTick: 5, statusId: 'burn', targetActorId: 'npc_goblin', remainingTicksAfter: 2 }, 'digest_5'))
    expect(proj.state?.statuses[0]?.remainingTicks).toBe(2)

    proj.applyEvent(event('COMBAT_STATUS_END', { combatTick: 6, statusId: 'burn', targetActorId: 'npc_goblin', reason: 'expired' }, 'digest_6'))
    expect(proj.state?.statuses).toHaveLength(0)
  })

  it('applyEvent COMBAT_TARGET_LOCK sets lock', () => {
    const proj = new CombatProjection()
    proj.applySnapshot(BASE_SNAPSHOT)
    proj.applyEvent(event('COMBAT_TARGET_LOCK', { combatTick: 4, sourceActorId: 'npc_goblin', targetActorId: 'player_1', durationTicks: 2 }))
    expect(proj.state?.targetLocks).toHaveLength(1)
    expect(proj.state?.targetLocks[0]?.targetActorId).toBe('player_1')
    expect(proj.state?.targetLocks[0]?.remainingTicks).toBe(2)
  })

  it('applyEvent COMBAT_DEFEAT marks resolved', () => {
    const proj = new CombatProjection()
    proj.applySnapshot(BASE_SNAPSHOT)
    proj.applyEvent(event('COMBAT_DEFEAT', { combatTick: 10, actorId: 'npc_goblin', finalHp: 0 }))
    expect(proj.state?.resolved).toBe(true)
    expect(proj.state?.actors.find((a) => a.actorId === 'npc_goblin')?.hp).toBe(0)
  })

  it('applyEvent COMBAT_RESOLVE marks resolved', () => {
    const proj = new CombatProjection()
    proj.applySnapshot(BASE_SNAPSHOT)
    proj.applyEvent(event('COMBAT_RESOLVE', { combatTick: 10, outcome: 'player_victory', finalPlayerHp: 80, finalNpcHp: 0 }))
    expect(proj.state?.resolved).toBe(true)
  })

  it('ignores events for a different combatId', () => {
    const proj = new CombatProjection()
    proj.applySnapshot(BASE_SNAPSHOT)
    const before = proj.state?.actors.find((a) => a.actorId === 'npc_goblin')?.hp
    proj.applyEvent({ eventType: 'COMBAT_DAMAGE', payload: { combatId: 'other_combat', combatTick: 4, targetActorId: 'npc_goblin', amount: 99 }, tickDigest: 'digest_4' })
    expect(proj.state?.actors.find((a) => a.actorId === 'npc_goblin')?.hp).toBe(before)
  })

  // ── Client prediction ──────────────────────────────────────────────────

  it('predict applies optimistic hp delta', () => {
    const proj = new CombatProjection()
    proj.applySnapshot(BASE_SNAPSHOT)
    const applied = proj.predict({ commandId: 'cmd_1', targetActorId: 'npc_goblin', predictedHpDelta: 20 })
    expect(applied).toBe(true)
    expect(proj.state?.actors.find((a) => a.actorId === 'npc_goblin')?.hp).toBe(80)
  })

  it('reconcile rejected → rollback to pre-prediction state, result is rejected', () => {
    const proj = new CombatProjection()
    proj.applySnapshot(BASE_SNAPSHOT)
    proj.predict({ commandId: 'cmd_1', targetActorId: 'npc_goblin', predictedHpDelta: 20 })
    const result = proj.reconcile('cmd_1', false)
    expect(result.kind).toBe('rejected')
    expect(proj.state?.actors.find((a) => a.actorId === 'npc_goblin')?.hp).toBe(100)
  })

  it('reconcile accepted with same amount → state unchanged, result is accepted', () => {
    const proj = new CombatProjection()
    proj.applySnapshot(BASE_SNAPSHOT)
    proj.predict({ commandId: 'cmd_1', targetActorId: 'npc_goblin', predictedHpDelta: 20 })
    const result = proj.reconcile('cmd_1', true, 20)
    expect(result.kind).toBe('accepted')
    expect(proj.state?.actors.find((a) => a.actorId === 'npc_goblin')?.hp).toBe(80)
  })

  it('reconcile accepted with different amount → silent reconcile, no toast signal', () => {
    const proj = new CombatProjection()
    proj.applySnapshot(BASE_SNAPSHOT)
    proj.predict({ commandId: 'cmd_1', targetActorId: 'npc_goblin', predictedHpDelta: 20 })
    const result = proj.reconcile('cmd_1', true, 35)
    expect(result.kind).toBe('accepted_with_delta')
    if (result.kind === 'accepted_with_delta') {
      expect(result.actualDelta).toBe(35)
      expect(result.predictedDelta).toBe(20)
    }
    expect(proj.state?.actors.find((a) => a.actorId === 'npc_goblin')?.hp).toBe(65)
  })
})

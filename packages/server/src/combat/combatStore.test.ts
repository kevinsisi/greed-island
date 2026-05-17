import Database from 'better-sqlite3'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { initializeAccountSchema } from '../http/accounts.js'
import type { Event } from '../kernel/types.js'
import { CombatStore } from './combatStore.js'

describe('CombatStore EventLog projection', () => {
  it('rebuilds byte-identical session and log state from committed EventLog events', () => {
    const { db, store } = createHarness()
    const events = combatEvents()

    store.rebuildFromEvents(events)
    const first = snapshot(store)

    store.rebuildFromEvents(events)
    const second = snapshot(store)

    expect(second).toEqual(first)
    expect(first.session).toMatchObject({
      combat_id: 'combat_projection',
      player_account_id: 1,
      npc_id: 'npc_projection',
      player_hp: 90,
      npc_hp: 0,
      combat_round: 2,
      state: 'resolved',
      outcome: 'player_victory',
      resolved_tick: 12,
    })
    expect(first.log.map((row) => row.event_type)).toEqual([
      'COMBAT_INITIATE',
      'COMBAT_DAMAGE',
      'COMBAT_RESOLVE',
    ])
    expect(first.counts).toEqual({ total: 1, won: 1, lost: 0, fled: 0 })
    expect(first.npcIncapacitatedAt13).toBe(true)

    db.close()
  })

  it('projects committed events incrementally for HTTP read paths', () => {
    const { db, store } = createHarness()
    const [initiate, action, resolve] = combatEvents()

    store.projectEvent(initiate!)
    expect(store.getActiveSessionForPlayer(1)?.combat_id).toBe('combat_projection')

    store.projectEvent(action!)
    expect(store.getSession('combat_projection')).toMatchObject({
      combat_round: 2,
      player_hp: 90,
      npc_hp: 0,
      state: 'active',
    })

    store.projectEvent(resolve!)
    expect(store.getActiveSessionForPlayer(1)).toBeNull()
    expect(store.getSession('combat_projection')).toMatchObject({
      state: 'resolved',
      outcome: 'player_victory',
    })

    db.close()
  })

  it('keeps combat HTTP handlers off direct CombatStore write methods', () => {
    const source = readFileSync(new URL('../http/combatRouter.ts', import.meta.url), 'utf8')

    expect(source).not.toMatch(/\.createSession\(/)
    expect(source).not.toMatch(/\.updateAfterRound\(/)
    expect(source).not.toMatch(/\.appendLog\(/)
    expect(source).not.toMatch(/\.incapacitateNpc\(/)
    expect(source).not.toMatch(/evaluateCombatRound/)
    expect(source).not.toMatch(/playerHpAfter/)
    expect(source).not.toMatch(/npcHpAfter/)
  })

  it('does not apply duplicate direct damage events twice', () => {
    const { db, store } = createHarness()
    const [initiate] = combatEvents()
    const damage = event(4, 'COMBAT_DAMAGE', {
      combatId: 'combat_projection',
      combatTick: 4,
      sourceActorId: '1',
      targetActorId: 'npc_projection',
      amount: 25,
    }, 12)

    store.projectEvent(initiate!)
    store.projectEvent(damage)
    store.projectEvent(damage)

    expect(store.getSession('combat_projection')?.npc_hp).toBe(75)
    expect(store.listLog('combat_projection').filter((row) => row.event_type === 'COMBAT_DAMAGE')).toHaveLength(1)

    db.close()
  })

  it('does not apply duplicate direct heal events twice', () => {
    const { db, store } = createHarness()
    const [initiate] = combatEvents()
    const damage = event(4, 'COMBAT_DAMAGE', {
      combatId: 'combat_projection',
      combatTick: 4,
      sourceActorId: '1',
      targetActorId: 'npc_projection',
      amount: 25,
    }, 12)
    const heal = event(5, 'COMBAT_HEAL', {
      combatId: 'combat_projection',
      combatTick: 5,
      sourceActorId: 'npc_projection',
      targetActorId: 'npc_projection',
      amount: 10,
    }, 12)

    store.projectEvent(initiate!)
    store.projectEvent(damage)
    store.projectEvent(heal)
    store.projectEvent(heal)

    expect(store.getSession('combat_projection')?.npc_hp).toBe(85)
    expect(store.listLog('combat_projection').filter((row) => row.event_type === 'COMBAT_HEAL')).toHaveLength(1)

    db.close()
  })

  it('projects duplicate standalone defeat events once with outcome and world resolved tick', () => {
    const { db, store } = createHarness()
    const [initiate] = combatEvents()
    const defeat = event(6, 'COMBAT_DEFEAT', {
      combatId: 'combat_projection',
      combatTick: 4,
      actorId: 'npc_projection',
      defeatedByActorId: '1',
      finalHp: 0,
    }, 12)

    store.projectEvent(initiate!)
    store.projectEvent(defeat)
    store.projectEvent(defeat)

    expect(store.getSession('combat_projection')).toMatchObject({
      npc_hp: 0,
      combat_round: 4,
      state: 'resolved',
      outcome: 'player_victory',
      resolved_tick: 12,
    })
    expect(store.countCombatsSinceTick(1, 0)).toEqual({ total: 1, won: 1, lost: 0, fled: 0 })
    expect(store.listLog('combat_projection').filter((row) => row.event_type === 'COMBAT_DEFEAT')).toHaveLength(1)

    db.close()
  })

  it('detects historical Phase B actions that cannot safely rebuild legacy projection rows', () => {
    const { db, store } = createHarness()
    const historicalAction = event(5, 'COMBAT_PLAYER_ACTION', {
      combatId: 'combat_projection',
      playerAccountId: '1',
      npcId: 'npc_projection',
      combatRound: 1,
      action: 'attack',
      narration: 'old action without result snapshot',
    })

    expect(store.canSafelyRebuildFromEvents([historicalAction])).toBe(false)

    db.close()
  })
})

function createHarness(): { db: Database.Database; store: CombatStore } {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  initializeAccountSchema(db)
  db.prepare(
    `INSERT INTO accounts (id, email, password_hash, created_at, role)
     VALUES (1, 'combat@example.test', 'hash', 1, 'player')`
  ).run()
  return { db, store: new CombatStore(db) }
}

function combatEvents(): readonly Event[] {
  return [
    event(1, 'COMBAT_INITIATE', {
      combatId: 'combat_projection',
      playerAccountId: '1',
      npcId: 'npc_projection',
      tile: 't_central',
      playerCombatHp: 100,
      npcCombatHp: 100,
      reason: 'player_challenge',
      narration: 'start',
    }),
    event(2, 'COMBAT_PLAYER_ACTION', {
      combatId: 'combat_projection',
      playerAccountId: '1',
      npcId: 'npc_projection',
      combatRound: 2,
      action: 'attack',
      playerHpAfter: 90,
      npcHpAfter: 0,
      events: [
        {
          eventType: 'COMBAT_DAMAGE',
          payload: {
            combatId: 'combat_projection',
            combatRound: 2,
            sourceActorId: '1',
            targetActorId: 'npc_projection',
            amount: 100,
            crit: false,
            kind: 'physical',
          },
        },
        {
          eventType: 'COMBAT_RESOLVE',
          payload: {
            combatId: 'combat_projection',
            combatRound: 2,
            outcome: 'player_victory',
            durationRounds: 2,
            finalPlayerHp: 90,
            finalNpcHp: 0,
            playerEnergyToZero: false,
            npcIncapacitatedTicks: 2,
          },
        },
      ],
      narration: 'attack',
    }, 11),
    event(3, 'COMBAT_RESOLVE', {
      combatId: 'combat_projection',
      playerAccountId: '1',
      npcId: 'npc_projection',
      outcome: 'player_victory',
      durationRounds: 2,
      finalPlayerHp: 90,
      finalNpcHp: 0,
      playerEnergyToZero: false,
      npcIncapacitatedTicks: 2,
      narration: 'resolve',
    }, 12),
  ]
}

function event(
  sequence: number,
  eventType: string,
  data: Record<string, unknown>,
  tick = sequence,
): Event {
  return {
    sequence,
    eventId: `event_${sequence}`,
    eventType,
    occurredAt: 1000 + sequence,
    actorId: '1',
    commandId: `cmd_${sequence}`,
    tick,
    payload: { actorType: 'player', data, narration: data.narration ?? null },
    rulesetVersion: 'test',
    version: 1,
    deterministicKey: `key_${sequence}`,
  }
}

function snapshot(store: CombatStore) {
  return {
    session: store.getSession('combat_projection'),
    log: store.listLog('combat_projection').map(({ id: _id, ...row }) => row),
    counts: store.countCombatsSinceTick(1, 0),
    npcIncapacitatedAt13: store.isNpcIncapacitated('npc_projection', 13),
  }
}

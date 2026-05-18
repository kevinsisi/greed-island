// Slice 6.1 — 1000-event combat replay determinism test.
// Same EventLog replayed twice must produce byte-identical CombatStore state.
// Client-side digest determinism is covered by CombatProjection.test.ts (Slice 4.7).

import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { initializeAccountSchema } from '../http/accounts.js'
import type { Event } from '../kernel/types.js'
import { CombatStore } from './combatStore.js'

const COMBAT_ID = 'combat_replay_1k'
const PLAYER_ACCOUNT_ID = 42
const NPC_ID = 'npc_replay'
const TILE_ID = 't_test'
const INITIAL_HP = 5000

// ── helpers ──────────────────────────────────────────────────────────────────

function createHarness() {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  initializeAccountSchema(db)
  db.prepare(
    `INSERT INTO accounts (id, email, password_hash, created_at, role)
     VALUES (${PLAYER_ACCOUNT_ID}, 'replay@example.test', 'hash', 1, 'player')`
  ).run()
  const store = new CombatStore(db)
  return { db, store }
}

function mkEvent(
  sequence: number,
  eventType: string,
  data: Record<string, unknown>,
  tick = sequence,
): Event {
  return {
    sequence,
    eventId: `event_${sequence}`,
    eventType,
    occurredAt: 1_000_000 + sequence,
    actorId: String(PLAYER_ACCOUNT_ID),
    commandId: `cmd_${sequence}`,
    tick,
    payload: { actorType: 'player', data, narration: null },
    rulesetVersion: 'test',
    version: 1,
    deterministicKey: `key_${sequence}`,
  }
}

function generate1000Events(): readonly Event[] {
  const events: Event[] = []
  let seq = 1

  // COMBAT_INITIATE
  events.push(mkEvent(seq++, 'COMBAT_INITIATE', {
    combatId: COMBAT_ID,
    playerAccountId: String(PLAYER_ACCOUNT_ID),
    npcId: NPC_ID,
    tile: TILE_ID,
    playerCombatHp: INITIAL_HP,
    npcCombatHp: INITIAL_HP,
    reason: 'player_challenge',
  }))

  // 998 alternating COMBAT_DAMAGE events (1 hp each, both sides stay well above 0)
  let combatTick = 1
  for (let i = 0; i < 998; i++) {
    const isPlayerTarget = i % 2 === 0
    combatTick = Math.floor(i / 2) + 1
    events.push(mkEvent(seq++, 'COMBAT_DAMAGE', {
      combatId: COMBAT_ID,
      combatTick,
      sourceActorId: isPlayerTarget ? NPC_ID : String(PLAYER_ACCOUNT_ID),
      targetActorId: isPlayerTarget ? String(PLAYER_ACCOUNT_ID) : NPC_ID,
      amount: 1,
      crit: false,
    }, combatTick))
  }

  // COMBAT_RESOLVE
  events.push(mkEvent(seq++, 'COMBAT_RESOLVE', {
    combatId: COMBAT_ID,
    playerAccountId: String(PLAYER_ACCOUNT_ID),
    npcId: NPC_ID,
    outcome: 'fled',
    durationRounds: combatTick,
    finalPlayerHp: INITIAL_HP - 499,
    finalNpcHp: INITIAL_HP - 499,
    playerEnergyToZero: false,
    npcIncapacitatedTicks: 0,
  }, combatTick + 1))

  expect(events).toHaveLength(1000)
  return events
}

function snapshotStore(store: CombatStore) {
  return {
    session: store.getSession(COMBAT_ID),
    log: store.listLog(COMBAT_ID).map(({ id: _id, ...row }) => row),
  }
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('CombatStore 1000-event replay determinism', () => {
  it('same EventLog reduced twice produces byte-identical CombatStore state', () => {
    const { db, store } = createHarness()
    const events = generate1000Events()

    store.rebuildFromEvents(events)
    const first = snapshotStore(store)

    store.rebuildFromEvents(events)
    const second = snapshotStore(store)

    expect(second).toEqual(first)
    expect(first.session).toMatchObject({
      combat_id: COMBAT_ID,
      player_account_id: PLAYER_ACCOUNT_ID,
      npc_id: NPC_ID,
      state: 'resolved',
      outcome: 'fled',
    })
    // 499 damage events on player + 499 on npc
    expect(first.session?.player_hp).toBe(INITIAL_HP - 499)
    expect(first.session?.npc_hp).toBe(INITIAL_HP - 499)
    // 998 COMBAT_DAMAGE + 1 COMBAT_RESOLVE rows in log
    expect(first.log.filter((r) => r.event_type === 'COMBAT_DAMAGE')).toHaveLength(998)

    db.close()
  })
})


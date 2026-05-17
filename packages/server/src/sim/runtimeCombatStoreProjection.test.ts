import Database from 'better-sqlite3'
import { describe, expect, it, vi } from 'vitest'
import { loadCardCatalog } from '../cards/loader.js'
import { CombatStore } from '../combat/combatStore.js'
import { initializeAccountSchema } from '../http/accounts.js'
import { SqliteEventStore } from '../kernel/eventStore.js'
import type { EventDraft } from '../kernel/types.js'
import { loadNpcProfiles } from '../npcs/loader.js'
import { SimulationRuntime } from './runtime.js'

describe('SimulationRuntime CombatStore boot projection', () => {
  it('preserves legacy projection rows when historical Phase B actions lack snapshots', () => {
    const db = new Database(':memory:')
    db.pragma('foreign_keys = ON')
    initializeAccountSchema(db)
    db.prepare(
      `INSERT INTO accounts (id, email, password_hash, created_at, role)
       VALUES (1, 'legacy-combat@example.test', 'hash', 1, 'player')`
    ).run()
    const eventStore = new SqliteEventStore(db)
    eventStore.appendEvents([oldPhaseBAction()])
    const combatStore = new CombatStore(db)
    db.prepare(
      `INSERT INTO combat_sessions
         (combat_id, player_account_id, npc_id, tile_id, started_tick,
          player_hp, npc_hp, combat_round, state, outcome, resolved_tick)
       VALUES ('legacy_combat', 1, 'npc_legacy', 't_central', 1, 42, 0, 3,
               'resolved', 'player_victory', 9)`
    ).run()
    db.prepare(
      `INSERT INTO combat_log
         (combat_id, tick, combat_round, event_type, payload_json, occurred_at, deterministic_key)
       VALUES ('legacy_combat', 9, 3, 'LEGACY_PROJECTED', '{}', 1000, 'legacy_key')`
    ).run()
    const runtime = new SimulationRuntime(eventStore, loadNpcProfiles(), loadCardCatalog())
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    try {
      runtime.attachCombatStore(combatStore)

      expect(combatStore.getSession('legacy_combat')).toMatchObject({
        player_hp: 42,
        npc_hp: 0,
        combat_round: 3,
        state: 'resolved',
        outcome: 'player_victory',
        resolved_tick: 9,
      })
      expect(combatStore.listLog('legacy_combat').map((row) => row.event_type)).toEqual([
        'LEGACY_PROJECTED',
      ])
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('kept existing CombatStore projection')
      )
    } finally {
      warn.mockRestore()
      runtime.stop()
      db.close()
    }
  })
})

function oldPhaseBAction(): EventDraft {
  return {
    eventId: 'event_old_phase_b_action',
    eventType: 'COMBAT_PLAYER_ACTION',
    occurredAt: 100,
    actorId: '1',
    commandId: 'cmd_old_phase_b_action',
    tick: 2,
    payload: {
      actorType: 'player',
      data: {
        combatId: 'legacy_combat',
        playerAccountId: '1',
        npcId: 'npc_legacy',
        combatRound: 1,
        action: 'attack',
        narration: 'old action without result snapshot',
      },
      narration: 'old action without result snapshot',
    },
    rulesetVersion: 'test',
    version: 1,
    deterministicKey: 'old_phase_b_action',
  }
}

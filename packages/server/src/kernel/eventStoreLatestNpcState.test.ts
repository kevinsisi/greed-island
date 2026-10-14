import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import type { EventDraft } from './types.js'
import { SqliteEventStore } from './eventStore.js'

function draft(input: { id: string; type: string; actorId: string; sequence: number; payload: unknown }): EventDraft {
  return {
    eventId: input.id,
    eventType: input.type,
    actorId: input.actorId,
    occurredAt: input.sequence,
    tick: input.sequence,
    payload: input.payload,
    deterministicKey: input.id,
    version: 1,
  }
}

describe('SqliteEventStore latest NPC state reads', () => {
  it('returns one newest typed snapshot per actor and the newest indexed legacy fact with sequence', () => {
    const db = new Database(':memory:')
    const store = new SqliteEventStore(db)
    try {
      store.appendEvents([
        draft({ id: 'typed-a1', type: 'NPC_STATE_RECORDED', actorId: 'npc-a', sequence: 1, payload: { data: { npcId: 'npc-a', state: { tile: 'old' } } } }),
        draft({ id: 'fact-a1', type: 'FACT_SET', actorId: 'npc-a', sequence: 2, payload: { key: 'npc.state.npc-a', value: { tile: 'legacy-old' } } }),
        draft({ id: 'typed-a3', type: 'NPC_STATE_RECORDED', actorId: 'npc-a', sequence: 3, payload: { data: { npcId: 'npc-a', state: { tile: 'typed-new' } } } }),
        draft({ id: 'fact-b4', type: 'FACT_SET', actorId: 'npc-b', sequence: 4, payload: { key: 'npc.state.npc-b', value: { tile: 'legacy-new' } } }),
      ])

      const typed = store.readLatestEventsPerActor(['NPC_STATE_RECORDED'])
      const legacy = store.readLatestFactEvents(['npc.state.npc-a', 'npc.state.npc-b'])

      expect(typed.map(event => [event.actorId, event.sequence])).toEqual([['npc-a', 3]])
      expect(legacy.map(event => [event.actorId, event.sequence])).toEqual([['npc-a', 2], ['npc-b', 4]])
    } finally {
      db.close()
    }
  })

  it('uses the existing typed actor and legacy fact-key indexes', () => {
    const db = new Database(':memory:')
    const store = new SqliteEventStore(db)
    try {
      const typedPlan = db.prepare(`EXPLAIN QUERY PLAN SELECT e.* FROM event_log e JOIN (
        SELECT actor_id, MAX(sequence) AS sequence FROM event_log
        WHERE event_type IN (?) GROUP BY actor_id
      ) latest ON e.sequence = latest.sequence ORDER BY e.sequence`).all('NPC_STATE_RECORDED') as Array<{ detail: string }>
      const legacyPlan = db.prepare(`EXPLAIN QUERY PLAN SELECT e.* FROM event_log e JOIN (
        SELECT MAX(sequence) AS sequence FROM event_log
        WHERE event_type = 'FACT_SET' AND json_extract(payload_json, '$.key') IN (?, ?)
        GROUP BY json_extract(payload_json, '$.key')
      ) latest ON e.sequence = latest.sequence ORDER BY e.sequence ASC`).all('npc.state.npc-a', 'npc.state.npc-b') as Array<{ detail: string }>

      expect(typedPlan.map(row => row.detail).join('\n')).toContain('idx_event_type_actor_sequence')
      expect(legacyPlan.map(row => row.detail).join('\n')).toContain('idx_event_log_fact_key_sequence')
      expect(db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name IN (?, ?)")
        .all('idx_event_type_actor_sequence', 'idx_event_log_fact_key_sequence')).toHaveLength(2)
    } finally {
      db.close()
    }
  })
})

// Actual SQLite atomicity and reopen gate. Must run with the supported native binding.
import Database from 'better-sqlite3'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { SqliteEventStore } from '../kernel/eventStore.js'
import { makeLivingWorldCommand } from '../kernel/livingWorldCommands.js'
import { commitAuthorizedPlayerCommand } from './playerCommandCommit.js'
import { PlayerStateStore } from './playerState.js'
const command = () => makeLivingWorldCommand('PLAYER_ATE', '1', 'player', 20, 0, { accountId: 1, asOfTick: 20, nourishment: 100, vigor: 100, collapsed: false, goldCost: 5 })
function effects(db: Database.Database) {
  db.exec('CREATE TABLE synthetic_wallet(account_id INTEGER PRIMARY KEY,gold INTEGER); INSERT INTO synthetic_wallet VALUES(1,30); CREATE TABLE synthetic_personal(id INTEGER PRIMARY KEY,account_id INTEGER)')
  return () => { db.prepare('UPDATE synthetic_wallet SET gold=gold-5 WHERE account_id=1').run(); db.prepare('INSERT INTO synthetic_personal(account_id) VALUES(1)').run() }
}
describe('authorized player command actual SQLite gate', () => {
  it('reopens an original intervention result and retries after a changed relation without a second private-state write', () => {
    const directory = mkdtempSync(join(tmpdir(), 'greed-intervention-receipt-')), path = join(directory, 'synthetic.sqlite')
    let db = new Database(path)
    try {
      db.exec('CREATE TABLE accounts(id INTEGER PRIMARY KEY); INSERT INTO accounts VALUES(1)')
      const state = new PlayerStateStore(db), events = new SqliteEventStore(db)
      const intent = { playerAccountId: '1', npcA: 'a', npcB: 'b', tile: 't_central', intentClass: 'mediate' as const, message: '', narration: 'mediate' }
      const base = makeLivingWorldCommand('PLAYER_INTERVENE', '1', 'player', 20, 0, intent)
      const receipt = (trust: number) => ({ npcA: { npcId: 'a', trust, trustDelta: 2, moodDelta: 2 }, npcB: { npcId: 'b', trust, trustDelta: 2, moodDelta: 2 } })
      const first = commitAuthorizedPlayerCommand(events, { ...base, payload: { ...intent, effects: receipt(52) } }, {
        authorize: () => { expect(db.inTransaction).toBe(true) }, beforeCommit: () => {
          for (const npcId of ['a', 'b']) {
            state.upsertRelation({ accountId: 1, npcId, trust: 52, interactionCount: 1, lastInteractionTick: 20 })
            state.appendPersonalEvent({ accountId: 1, npcId, intent: 'ask', playerMessage: '', lineZh: 'mediate', lineEn: 'mediate', tick: 20, trustAfter: 52 })
          }
        },
      })!
      const subsequent = makeLivingWorldCommand('PLAYER_INTERVENE', '1', 'player', 20, 0,
        { ...intent, intentClass: 'threaten', narration: 'threaten' })
      commitAuthorizedPlayerCommand(events, { ...subsequent, payload: { ...subsequent.payload, effects: {
        npcA: { npcId: 'a', trust: 48, trustDelta: -4, moodDelta: -5 }, npcB: { npcId: 'b', trust: 48, trustDelta: -4, moodDelta: -5 },
      } } }, { authorize: () => {}, beforeCommit: () => {
        for (const npcId of ['a', 'b']) {
          state.upsertRelation({ accountId: 1, npcId, trust: 48, interactionCount: 2, lastInteractionTick: 20 })
          state.appendPersonalEvent({ accountId: 1, npcId, intent: 'ask', playerMessage: '', lineZh: 'threaten', lineEn: 'threaten', tick: 20, trustAfter: 48 })
        }
      } })
      db.close(); db = new Database(path)
      const current = new PlayerStateStore(db), sideEffect = vi.fn()
      const retry = commitAuthorizedPlayerCommand(new SqliteEventStore(db), { ...base, payload: { ...intent, effects: receipt(50) } }, {
        authorize: () => { expect(db.inTransaction).toBe(true) }, beforeCommit: sideEffect,
      })!
      expect(retry.duplicate).toBe(true); expect(retry.event.eventId).toBe(first.event.eventId); expect(retry.event.payload).toEqual(first.event.payload); expect(sideEffect).not.toHaveBeenCalled()
      expect((retry.event.payload as { data: { effects: { npcA: { trust: number } } } }).data.effects.npcA.trust).toBe(52)
      expect(current.getRelation(1, 'a')?.trust).toBe(48); expect(current.listPersonalEvents({ accountId: 1, limit: 100 })).toHaveLength(4)
      expect(new SqliteEventStore(db).readEventsByTypes(['PLAYER_INTERVENE'])).toHaveLength(2)
    } finally { if (db.open) db.close(); rmSync(directory, { recursive: true, force: true }) }
  })
  it('commits wallet/personal state with one fact and skips cost on a deterministic duplicate through reopen', () => {
    const directory = mkdtempSync(join(tmpdir(), 'greed-player-commit-')), path = join(directory, 'synthetic.sqlite')
    let db = new Database(path)
    try {
      const store = new SqliteEventStore(db), beforeCommit = effects(db)
      const first = commitAuthorizedPlayerCommand(store, command(), { authorize: () => { expect(db.inTransaction).toBe(true) }, beforeCommit })!
      expect(db.prepare('SELECT gold FROM synthetic_wallet').get()).toEqual({ gold: 25 }); expect(store.readEventsByTypes(['PLAYER_ATE'])).toHaveLength(1)
      db.close(); db = new Database(path)
      const effect = vi.fn(), retry = commitAuthorizedPlayerCommand(new SqliteEventStore(db), command(), { authorize: () => {}, beforeCommit: effect })!
      expect(retry.duplicate).toBe(true); expect(retry.event.eventId).toBe(first.event.eventId); expect(effect).not.toHaveBeenCalled()
      expect(db.prepare('SELECT gold FROM synthetic_wallet').get()).toEqual({ gold: 25 }); expect(db.prepare('SELECT * FROM synthetic_personal').all()).toHaveLength(1)
    } finally { if (db.open) db.close(); rmSync(directory, { recursive: true, force: true }) }
  })
  it('rolls back inserted fact, cost and personal state when the actual outer SQLite transaction fails', () => {
    const db = new Database(':memory:')
    try {
      const store = new SqliteEventStore(db), beforeCommit = effects(db), append = store.appendEvents.bind(store)
      vi.spyOn(store, 'appendEvents').mockImplementationOnce(drafts => { append(drafts); throw new Error('synthetic append failure') })
      expect(() => commitAuthorizedPlayerCommand(store, command(), { authorize: () => {}, beforeCommit })).toThrow('synthetic append failure')
      expect(store.readEventsByTypes(['PLAYER_ATE'])).toHaveLength(0); expect(db.prepare('SELECT gold FROM synthetic_wallet').get()).toEqual({ gold: 30 }); expect(db.prepare('SELECT * FROM synthetic_personal').all()).toHaveLength(0)
    } finally { db.close() }
  })
})

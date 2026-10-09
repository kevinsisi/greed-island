import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'
import { assertAccountAllocatorReady, readCanonicalAccountIdAuthority, reserveCanonicalAccountIds } from './accountIdAuthority.js'
import { migrateIdentitySchema, assertUnifiedIdentitySchema } from './schema.js'
import { AuthService } from './authService.js'
import { legacyTestHash } from './schema.testSupport.js'

const databases: Database.Database[] = []
afterEach(() => { for (const db of databases.splice(0)) db.close() })
function oldDatabase() {
  const db = new Database(':memory:'); databases.push(db); db.pragma('foreign_keys=ON')
  db.exec("CREATE TABLE accounts(id INTEGER PRIMARY KEY,email TEXT NOT NULL UNIQUE,password_hash TEXT NOT NULL,created_at INTEGER NOT NULL,role TEXT NOT NULL DEFAULT 'player')")
  db.prepare("INSERT INTO accounts VALUES(42,?,?,123,'admin')").run('owner@example.test', legacyTestHash())
  return db
}
function addCommittedPayload(db: Database.Database, payload: unknown) {
  db.exec('CREATE TABLE event_log(actor_id TEXT,payload_json TEXT)')
  db.prepare('INSERT INTO event_log VALUES(?,?)').run('system', JSON.stringify(payload))
}
// Exact canonical CardWorldStore schema: holder_account_id intentionally has no FK.
function addHeldCard(db: Database.Database) {
  db.exec(`CREATE TABLE world_card_drops(
    id INTEGER PRIMARY KEY AUTOINCREMENT,card_id INTEGER NOT NULL,tile_id TEXT NOT NULL,
    x INTEGER NOT NULL,y INTEGER NOT NULL,dropped_at_tick INTEGER NOT NULL,
    expires_at_tick INTEGER NOT NULL,state TEXT NOT NULL DEFAULT 'available',
    holder_account_id INTEGER,pickup_at_tick INTEGER,store_deadline_tick INTEGER);
    INSERT INTO world_card_drops VALUES(1,1,'town',0,0,1,20,'held',43,1,20)`)
}

describe('verified historical account-ID authority and allocator readiness', () => {
  it('reserves EventLog actors above a non-AUTOINCREMENT source before any normal signup', async () => {
    const db = oldDatabase(); db.exec("CREATE TABLE event_log(actor_id TEXT,payload_json TEXT); INSERT INTO event_log VALUES('43','{}')")
    migrateIdentitySchema(db)
    assertAccountAllocatorReady(db)
    expect(readCanonicalAccountIdAuthority(db)).toBe(43)
    const auth = new AuthService(db, { allowedOrigins: ['https://greed.example.test'] })
    const grant = await auth.register({ kind: 'username', value: 'new-player' }, 'new-synthetic-password', 'https://greed.example.test')
    expect(grant.principal.accountId).toBe(44)
  })
  it('reserves card-action actor/target/proposer references even with no MP identities imported', () => {
    const db = oldDatabase()
    db.exec("CREATE TABLE card_action_log(actor_id TEXT,payload_json TEXT); INSERT INTO card_action_log VALUES('43','{\"targetId\":150,\"proposerId\":160}')")
    migrateIdentitySchema(db)
    expect(readCanonicalAccountIdAuthority(db)).toBe(160)
    expect(db.prepare("SELECT seq FROM sqlite_sequence WHERE name='accounts'").get()).toEqual({ seq: 160 })
    const before = db.prepare('SELECT * FROM card_action_log').all()
    reserveCanonicalAccountIds(db)
    expect(db.prepare('SELECT * FROM card_action_log').all()).toEqual(before)
  })
  it('reserves legacy-readable player goods ownership before signup without rewriting the fact', async () => {
    const db = oldDatabase()
    const payload = { data: { holderType: 'player', holderId: '43', goodsId: 'wood', quantity: 7, tileId: 'town', storedAtTick: 1 } }
    addCommittedPayload(db, payload)
    const before = db.prepare('SELECT * FROM event_log').all()
    migrateIdentitySchema(db)
    expect(readCanonicalAccountIdAuthority(db)).toBe(43)
    const auth = new AuthService(db, { allowedOrigins: ['https://greed.example.test'] })
    const grant = await auth.register({ kind: 'username', value: 'goods-safe-player' }, 'new-synthetic-password', 'https://greed.example.test')
    expect(grant.principal.accountId).toBe(44)
    expect(db.prepare('SELECT * FROM event_log').all()).toEqual(before)
  })
  it.each(['playerActorId', 'sourceActorId', 'targetActorId', 'defeatedByActorId'] as const)('reserves the numeric combat counterpart %s even when the ledger actor is system', key => {
    const db = oldDatabase(); addCommittedPayload(db, { combatId: 'combat', [key]: '43' })
    migrateIdentitySchema(db)
    expect(readCanonicalAccountIdAuthority(db)).toBe(43)
    expect(db.prepare("SELECT seq FROM sqlite_sequence WHERE name='accounts'").get()).toEqual({ seq: 43 })
  })
  it('keeps typed NPC/settlement/building goods IDs and textual combat counterparts outside the account namespace', () => {
    const db = oldDatabase()
    addCommittedPayload(db, [{ holderType: 'npc', holderId: '200' }, { holderType: 'settlement', holderId: '300' }, { holderType: 'building', holderId: '400' }, { sourceActorId: 'npc.other', targetActorId: 'animal.wolf', defeatedByActorId: 'npc.guard', npcActorId: '500' }])
    migrateIdentitySchema(db)
    expect(readCanonicalAccountIdAuthority(db)).toBe(42)
  })
  it.each(['from', 'to'])('fails closed on currently unsupported transport %s player ownership and rolls back', side => {
    const db = oldDatabase(); addCommittedPayload(db, { data: { [`${side}HolderType`]: 'player', [`${side}HolderId`]: '43' } })
    const before = db.prepare('SELECT * FROM accounts').all()
    expect(() => migrateIdentitySchema(db)).toThrow('Unsupported player transport history')
    expect(db.prepare('SELECT * FROM accounts').all()).toEqual(before)
    expect(db.prepare("SELECT name FROM sqlite_master WHERE name='identity_schema'").get()).toBeUndefined()
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1)
  })
  it.each([null, 'npc.other', '0', '9007199254740992'])('rejects an ambiguous explicit player holder %s instead of silently dropping it', holderId => {
    const db = oldDatabase(); addCommittedPayload(db, { data: { holderType: 'player', holderId } })
    expect(() => migrateIdentitySchema(db)).toThrow('Ambiguous historical player reference')
    expect(db.prepare('SELECT id FROM accounts').all()).toEqual([{ id: 42 }])
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1)
  })
  it('reserves non-FK held-card owners so signup cannot inherit a preserved card', async () => {
    const db = oldDatabase(); addHeldCard(db)
    const before = db.prepare('SELECT * FROM world_card_drops').all()
    migrateIdentitySchema(db)
    expect(readCanonicalAccountIdAuthority(db)).toBe(43)
    const auth = new AuthService(db, { allowedOrigins: ['https://greed.example.test'] })
    const grant = await auth.register({ kind: 'username', value: 'card-safe-player' }, 'new-synthetic-password', 'https://greed.example.test')
    expect(grant.principal.accountId).toBe(44)
    expect(db.prepare("SELECT * FROM world_card_drops WHERE holder_account_id=? AND state='held'").all(grant.principal.accountId)).toEqual([])
    expect(db.prepare('SELECT * FROM world_card_drops').all()).toEqual(before)
  })
  it('rejects an incompatible known card-ownership table instead of guessing account semantics', () => {
    const db = oldDatabase(); db.exec('CREATE TABLE world_card_drops(id INTEGER PRIMARY KEY,holder_account_id TEXT)')
    expect(() => migrateIdentitySchema(db)).toThrow('Unsupported world-card ownership schema')
    expect(db.prepare('SELECT id FROM accounts').all()).toEqual([{ id: 42 }])
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1)
  })
  it('fails read-only readiness on unreserved new history and never silently reseeds at startup', () => {
    const db = oldDatabase(); migrateIdentitySchema(db)
    db.exec("CREATE TABLE card_action_log(actor_id TEXT,payload_json TEXT); INSERT INTO card_action_log VALUES('200','{}')")
    const before = db.prepare("SELECT seq FROM sqlite_sequence WHERE name='accounts'").get()
    expect(() => assertAccountAllocatorReady(db)).toThrow('unreserved')
    expect(() => new AuthService(db, { allowedOrigins: ['https://greed.example.test'] })).toThrow('unreserved')
    expect(db.prepare("SELECT seq FROM sqlite_sequence WHERE name='accounts'").get()).toEqual(before)
    migrateIdentitySchema(db)
    expect(() => assertAccountAllocatorReady(db)).not.toThrow()
  })
  it('reserves rejected actors but does not trust attacker-supplied rejected payload IDs', () => {
    const db = oldDatabase()
    db.exec("CREATE TABLE rejected_command_log(actor_id TEXT,payload_json TEXT); INSERT INTO rejected_command_log VALUES('44','{\"accountId\":9007199254740992}')")
    migrateIdentitySchema(db); expect(readCanonicalAccountIdAuthority(db)).toBe(44)
  })
  it('fails ambiguous/unknown/unsafe committed history without mutating the legacy DB', () => {
    const db = oldDatabase(); db.exec("CREATE TABLE unknown_actor_audit(actor_id TEXT,payload_json TEXT); INSERT INTO unknown_actor_audit VALUES('45','{}')")
    const before = db.prepare('SELECT * FROM accounts').all()
    expect(() => migrateIdentitySchema(db)).toThrow('Unsupported actor-bearing history')
    expect(db.prepare('SELECT * FROM accounts').all()).toEqual(before)
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1)
  })
  it('rejects a fake AUTOINCREMENT mention in a comment', () => {
    const db = oldDatabase(); db.exec('DROP TABLE accounts; CREATE TABLE accounts(id INTEGER PRIMARY KEY /* AUTOINCREMENT */,email TEXT)')
    expect(() => reserveCanonicalAccountIds(db)).toThrow('Unsupported account allocator')
  })
  it('rejects a malformed v2 recovery table transactionally before marker advance', () => {
    const db = oldDatabase(); migrateIdentitySchema(db)
    db.exec('DROP TABLE auth_password_resets; UPDATE identity_schema SET version=2; CREATE TABLE auth_password_resets(account_id INTEGER)')
    const before = db.prepare('SELECT * FROM accounts').all()
    expect(() => migrateIdentitySchema(db)).toThrow('Unsupported recovery schema')
    expect(db.prepare('SELECT version FROM identity_schema').get()).toEqual({ version: 2 })
    expect(db.prepare('SELECT * FROM accounts').all()).toEqual(before)
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1)
    expect(() => assertUnifiedIdentitySchema(db)).toThrow('not ready')
  })
  it('rejects recovery FK/unique/index drift even when expected column names exist', () => {
    const db = oldDatabase(); migrateIdentitySchema(db)
    db.exec('DROP INDEX idx_auth_password_resets_account')
    expect(() => assertUnifiedIdentitySchema(db)).toThrow('lookup index')
    db.exec('CREATE INDEX idx_auth_password_resets_account ON auth_password_resets(account_id); CREATE UNIQUE INDEX bad_reset_one_per_account ON auth_password_resets(account_id)')
    expect(() => assertUnifiedIdentitySchema(db)).toThrow('uniqueness')
  })
})

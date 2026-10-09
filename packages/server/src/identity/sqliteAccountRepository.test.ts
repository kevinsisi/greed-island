import { afterEach, describe, expect, it } from 'vitest'
import type Database from 'better-sqlite3'
import { accountId } from './principal.js'
import { migrateIdentitySchema } from './schema.js'
import { SqliteAccountRepository } from './sqliteAccountRepository.js'
import { LEGACY_PROGRESS_FIELDS, planIdentityMigration } from './migrationPlan.js'
import { legacyTestDatabase, legacyTestHash, TEST_PASSWORD } from './schema.testSupport.js'

const databases: Database.Database[] = []
function fixture(admin = true) { const db = legacyTestDatabase(admin); databases.push(db); migrateIdentitySchema(db); return { db, accounts: new SqliteAccountRepository(db, () => 1000) } }
afterEach(() => { for (const db of databases.splice(0)) db.close() })
function importPlan() {
  return planIdentityMigration({ canonical: [{ id: 42, role: 'admin', aliases: [{ kind: 'email', value: 'owner@example.test' }] }], legacy: [{ namespace: 'mp-l390', legacyId: 'player-old', username: 'Original_User', role: 'player', progress: LEGACY_PROGRESS_FIELDS.map(field => ({ field, canonicalRule: `synthetic-approved:${field}` })) }] })
}

describe('one canonical SQLite account repository', () => {
  it('fails closed unless explicit schema migration and FK enforcement are ready', () => {
    const db = legacyTestDatabase(); databases.push(db)
    expect(() => new SqliteAccountRepository(db)).toThrow('not ready')
    migrateIdentitySchema(db); db.pragma('foreign_keys=OFF')
    expect(() => new SqliteAccountRepository(db)).toThrow('foreign-key enforcement')
  })
  it('retains old email credentials, numeric identity and profile without rewriting', async () => {
    const { db, accounts } = fixture()
    const before = db.prepare('SELECT password_hash FROM accounts WHERE id=42').get()
    expect(await accounts.verifyCredentials({ kind: 'email', value: 'OWNER@example.test' }, TEST_PASSWORD)).toEqual({ accountId: 42, role: 'admin' })
    expect(accounts.getProfile(accountId(42))).toMatchObject({ email: 'owner@example.test', nickname: 'Original Name', avatar: 'fox', displayName: 'Original Name' })
    expect(db.prepare('SELECT password_hash FROM accounts WHERE id=42').get()).toEqual(before)
  })
  it('self-registers username-only users as players with no invented email', async () => {
    const { db, accounts } = fixture(false)
    const created = await accounts.createPlayer({ kind: 'username', value: 'New_Player' }, 'new-synthetic-password')
    expect(created.role).toBe('player')
    expect(accounts.getProfile(created.accountId)).toMatchObject({ email: null, username: 'New_Player', displayName: 'New_Player' })
    expect(await accounts.verifyCredentials({ kind: 'username', value: 'new_player' }, 'new-synthetic-password')).toEqual(created)
    expect(accounts.ownershipReadiness()).toEqual({ ready: false, blocker: 'OWNER_BOOTSTRAP_REQUIRED' })
    expect((db.prepare('SELECT password_scheme FROM accounts WHERE id=?').get(created.accountId) as { password_scheme: string }).password_scheme).toBe('scrypt-v1')
  })
  it('rolls back account+alias creation if its enclosing registration step fails', async () => {
    const { db, accounts } = fixture()
    await expect(accounts.createPlayer({ kind: 'username', value: 'rollback-user' }, 'synthetic-password', () => { throw new Error('synthetic session failure') })).rejects.toThrow('session failure')
    expect(accounts.findPrincipalByAlias({ kind: 'username', value: 'rollback-user' })).toBeNull()
    expect(db.prepare('SELECT COUNT(*) count FROM accounts').get()).toEqual({ count: 1 })
  })
  it('preserves legacy username, long password and untruncated display name on planned import/retry', async () => {
    const { db, accounts } = fixture()
    const password = '潮'.repeat(100), name = 'Original long display name '.repeat(3).slice(0, 80)
    expect(name.length).toBe(80)
    const input = { namespace: 'mp-l390', legacyId: 'player-old', username: 'Original_User', name, passwordHash: legacyTestHash(password) }
    const plan = importPlan(), principal = accounts.importLegacyPlayer(input, plan)
    expect(principal).toEqual({ accountId: 43, role: 'player' })
    expect(accounts.getProfile(principal.accountId)).toMatchObject({ email: null, username: 'Original_User', displayName: name })
    expect(await accounts.verifyCredentials({ kind: 'username', value: 'original_user' }, password)).toEqual(principal)
    db.prepare("UPDATE accounts SET nickname='Changed later' WHERE id=43").run()
    expect(accounts.importLegacyPlayer(input, plan)).toEqual(principal)
    expect(accounts.getProfile(principal.accountId)?.displayName).toBe('Changed later')
    expect(db.prepare('SELECT COUNT(*) count FROM accounts').get()).toEqual({ count: 2 })
  })
  it('blocks unreviewed imports and conflicts without role grants or partial inserts', () => {
    const { db, accounts } = fixture()
    const input = { namespace: 'mp-l390', legacyId: 'player-old', username: 'Original_User', name: 'Original', passwordHash: legacyTestHash() }
    const plan = importPlan()
    expect(() => accounts.importLegacyPlayer(input, { ...plan, readyForReviewedImport: false })).toThrow('IMPORT_BLOCKED')
    expect(() => accounts.importLegacyPlayer({ ...input, name: 'x'.repeat(81) }, plan)).toThrow('IMPORT_DESCRIPTOR_CONFLICT')
    expect(() => accounts.importLegacyPlayer(input, { ...plan, identities: plan.identities.map(identity => ({ ...identity, role: 'admin' })) })).toThrow('IMPORT_DESCRIPTOR_CONFLICT')
    expect(db.prepare('SELECT COUNT(*) count FROM accounts').get()).toEqual({ count: 1 })
  })
  it('rejects new explicit imports below the historical sequence but permits exact mapped retries', () => {
    const { db, accounts } = fixture()
    db.exec("UPDATE sqlite_sequence SET seq=100 WHERE name='accounts'")
    const input = { namespace: 'mp-l390', legacyId: 'player-old', username: 'Original_User', name: 'Original', passwordHash: legacyTestHash() }
    expect(() => accounts.importLegacyPlayer(input, importPlan())).toThrow('IMPORT_HISTORICAL_ID_CONFLICT')
    const plan = planIdentityMigration({ canonical: [{ id: 42, role: 'admin', aliases: [{ kind: 'email', value: 'owner@example.test' }] }], legacy: [{ namespace: input.namespace, legacyId: input.legacyId, username: input.username, role: 'player', progress: LEGACY_PROGRESS_FIELDS.map(field => ({ field, canonicalRule: `synthetic-approved:${field}` })) }], canonicalIdHighWaterMark: 100 })
    expect(accounts.importLegacyPlayer(input, plan).accountId).toBe(101)
    expect(accounts.importLegacyPlayer(input, plan).accountId).toBe(101)
  })
  it('also reserves numeric EventLog principals above the SQLite sequence', () => {
    const { db, accounts } = fixture()
    db.prepare('INSERT INTO event_log(sequence,actor_id,payload) VALUES(2,?,?)').run('120', '{}')
    const input = { namespace: 'mp-l390', legacyId: 'player-old', username: 'Original_User', name: 'Original', passwordHash: legacyTestHash() }
    expect(() => accounts.importLegacyPlayer(input, importPlan())).toThrow('IMPORT_HISTORICAL_ID_CONFLICT')
    const plan = planIdentityMigration({ canonical: [{ id: 42, role: 'admin', aliases: [{ kind: 'email', value: 'owner@example.test' }] }], legacy: [{ namespace: input.namespace, legacyId: input.legacyId, username: input.username, role: 'player', progress: LEGACY_PROGRESS_FIELDS.map(field => ({ field, canonicalRule: `synthetic-approved:${field}` })) }], canonicalIdHighWaterMark: 120, canonicalReferencedAccountIds: [120] })
    expect(accounts.importLegacyPlayer(input, plan).accountId).toBe(121)
  })
  it('reserves historical system-event account references and fails on ambiguous history', () => {
    const { db, accounts } = fixture()
    db.prepare('INSERT INTO event_log(sequence,actor_id,payload) VALUES(2,?,?)').run('system', JSON.stringify({ data: { playerAccountId: 150 } }))
    const input = { namespace: 'mp-l390', legacyId: 'player-old', username: 'Original_User', name: 'Original', passwordHash: legacyTestHash() }
    expect(() => accounts.importLegacyPlayer(input, importPlan())).toThrow('IMPORT_HISTORICAL_ID_CONFLICT')
    db.prepare('UPDATE event_log SET payload=? WHERE sequence=2').run('{invalid')
    expect(() => accounts.importLegacyPlayer(input, importPlan())).toThrow('IMPORT_HISTORICAL_ID_CONFLICT')
  })
})

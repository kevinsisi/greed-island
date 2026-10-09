import { afterEach, describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { assertUnifiedIdentitySchema, migrateIdentitySchema } from './schema.js'
import { legacyTestDatabase, nonAccountRows } from './schema.testSupport.js'
import { legacyTestHash } from './schema.testSupport.js'

const databases: Database.Database[] = []
function fixture(admin = true) { const db = legacyTestDatabase(admin); databases.push(db); return db }
afterEach(() => { for (const db of databases.splice(0)) db.close() })

describe('explicit canonical identity schema migration', () => {
  it('preserves every exact synthetic FK/history row and the canonical ID/profile/role/tick', () => {
    const db = fixture()
    const original = db.prepare('SELECT * FROM accounts').get() as Record<string, unknown>
    const progress = nonAccountRows(db)
    migrateIdentitySchema(db)
    assertUnifiedIdentitySchema(db)
    expect(nonAccountRows(db)).toEqual(progress)
    const account = db.prepare('SELECT * FROM accounts').get() as Record<string, unknown>
    for (const [key, value] of Object.entries(original)) expect(account[key]).toEqual(value)
    expect(db.pragma('foreign_key_check')).toEqual([])
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1)
    expect(db.prepare('SELECT * FROM account_login_aliases').all()).toEqual([{ kind: 'email', normalized: 'owner@example.test', display_value: 'owner@example.test', account_id: 42 }])
  })
  it('preserves views/indexes/triggers and the AUTOINCREMENT high-water mark', () => {
    const db = fixture()
    db.prepare("UPDATE sqlite_sequence SET seq=100 WHERE name='accounts'").run()
    migrateIdentitySchema(db)
    expect(db.prepare('SELECT id FROM identity_test_view').get()).toEqual({ id: 42 })
    expect(db.prepare("SELECT name FROM sqlite_master WHERE name='idx_test_nickname'").get()).toEqual({ name: 'idx_test_nickname' })
    db.exec("UPDATE accounts SET nickname='Changed' WHERE id=42")
    expect(db.prepare('SELECT * FROM profile_audit').all()).toEqual([{ account_id: 42, nickname: 'Changed' }])
    expect((db.prepare("SELECT seq FROM sqlite_sequence WHERE name='accounts'").get() as { seq: number }).seq).toBe(100)
  })
  it('is idempotent and never promotes an all-player source', () => {
    const db = fixture(false)
    migrateIdentitySchema(db)
    const before = db.prepare('SELECT * FROM accounts').all()
    migrateIdentitySchema(db)
    expect(db.prepare('SELECT * FROM accounts').all()).toEqual(before)
    expect(db.prepare("SELECT COUNT(*) count FROM accounts WHERE role='admin'").get()).toEqual({ count: 0 })
  })
  it('preserves and reconstructs INSTEAD OF triggers on account views', () => {
    const db = fixture()
    db.exec("CREATE VIEW account_rename_view AS SELECT id,nickname FROM accounts; CREATE TRIGGER rename_account INSTEAD OF UPDATE ON account_rename_view BEGIN UPDATE accounts SET nickname=NEW.nickname WHERE id=NEW.id; END;")
    const progress = nonAccountRows(db)
    migrateIdentitySchema(db)
    expect(nonAccountRows(db)).toEqual(progress)
    db.exec("UPDATE account_rename_view SET nickname='Restored view trigger' WHERE id=42")
    expect(db.prepare('SELECT nickname FROM accounts WHERE id=42').get()).toEqual({ nickname: 'Restored view trigger' })
    expect(db.prepare('SELECT * FROM profile_audit').all()).toEqual([{ account_id: 42, nickname: 'Restored view trigger' }])
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1)
  })
  it('restores the historical ID high-water mark even when every account was deleted', () => {
    const db = fixture()
    db.exec("UPDATE sqlite_sequence SET seq=100 WHERE name='accounts'; DELETE FROM accounts;")
    const progress = nonAccountRows(db)
    migrateIdentitySchema(db)
    expect(nonAccountRows(db)).toEqual(progress)
    expect(db.prepare("SELECT seq FROM sqlite_sequence WHERE name='accounts'").get()).toEqual({ seq: 100 })
    db.prepare("INSERT INTO accounts(email,password_hash,password_scheme,created_at,role) VALUES(?,?,'legacy-mp-scrypt-v1',123,'player')").run('new@example.test', legacyTestHash())
    expect(db.prepare('SELECT id,role FROM accounts').get()).toEqual({ id: 101, role: 'player' })
  })
  it('rolls back account/child rows/schema/objects and restores foreign_keys on failure', () => {
    const db = fixture()
    db.exec("UPDATE accounts SET email='invalid' WHERE id=42")
    const before = db.prepare('SELECT * FROM accounts').all(), progress = nonAccountRows(db)
    const objects = db.prepare("SELECT type,name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name").all()
    expect(() => migrateIdentitySchema(db)).toThrow('Invalid canonical email')
    expect(db.prepare('SELECT * FROM accounts').all()).toEqual(before)
    expect(nonAccountRows(db)).toEqual(progress)
    expect(db.prepare("SELECT type,name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name").all()).toEqual(objects)
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1)
    expect(() => assertUnifiedIdentitySchema(db)).toThrow('not ready')
  })
  it('restores an originally disabled foreign_keys state on success and failure', () => {
    const db = fixture(); db.pragma('foreign_keys = OFF'); migrateIdentitySchema(db)
    expect(db.pragma('foreign_keys', { simple: true })).toBe(0)
    const failed = fixture(); failed.pragma('foreign_keys = OFF'); failed.exec("UPDATE accounts SET email='invalid'")
    expect(() => migrateIdentitySchema(failed)).toThrow()
    expect(failed.pragma('foreign_keys', { simple: true })).toBe(0)
  })
  it('fails closed for unknown columns, existing violations and nested transactions', () => {
    const db = fixture(); db.exec('ALTER TABLE accounts ADD COLUMN unrecognized_progress TEXT')
    expect(() => migrateIdentitySchema(db)).toThrow('Unsupported accounts schema')
    const bad = fixture(); bad.pragma('foreign_keys=OFF'); bad.exec("INSERT INTO inventory VALUES(999,'orphan',1)")
    expect(() => migrateIdentitySchema(bad)).toThrow('foreign-key violations')
    const nested = fixture(); expect(() => nested.transaction(() => migrateIdentitySchema(nested))()).toThrow('outside a transaction')
  })
  it('supports an older canonical schema without manufacturing an administrator', () => {
    const db = new Database(':memory:'); databases.push(db); db.pragma('foreign_keys=ON')
    db.exec('CREATE TABLE accounts(id INTEGER PRIMARY KEY,email TEXT NOT NULL UNIQUE,password_hash TEXT NOT NULL,created_at INTEGER NOT NULL)')
    db.prepare('INSERT INTO accounts VALUES(7,?,?,123)').run('old@example.test', legacyTestHash())
    migrateIdentitySchema(db)
    expect(db.prepare('SELECT id,email,role,nickname,avatar,last_seen_tick FROM accounts').get()).toEqual({ id: 7, email: 'old@example.test', role: 'player', nickname: null, avatar: 'tide', last_seen_tick: 0 })
  })
  it('upgrades recovery metadata additively from v2 without changing accounts/progress/FK state', () => {
    const db = fixture(); migrateIdentitySchema(db)
    db.exec('DROP TABLE auth_password_resets; UPDATE identity_schema SET version=2 WHERE singleton=1;')
    const accounts = db.prepare('SELECT * FROM accounts').all(), progress = nonAccountRows(db)
    expect(() => assertUnifiedIdentitySchema(db)).toThrow('not ready')
    migrateIdentitySchema(db)
    expect(db.prepare('SELECT * FROM accounts').all()).toEqual(accounts)
    expect(nonAccountRows(db)).toEqual(progress)
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1)
    expect(db.prepare('SELECT COUNT(*) count FROM auth_password_resets').get()).toEqual({ count: 0 })
  })
})

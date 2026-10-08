import type Database from 'better-sqlite3'
import { passwordScheme } from './passwordEncoding.js'
import { accountId } from './principal.js'

export const IDENTITY_SCHEMA_VERSION = 2
type Connection = Database.Database
type SchemaItem = { type: string; name: string; sql: string | null }
const ACCOUNT_COLUMNS = ['id', 'email', 'password_hash', 'created_at', 'role', 'nickname', 'avatar', 'last_seen_tick']
const REQUIRED_LEGACY_COLUMNS = ['id', 'email', 'password_hash', 'created_at']
const ACCOUNT_DDL = `
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE,
  password_hash TEXT NOT NULL,
  password_scheme TEXT NOT NULL CHECK(password_scheme IN ('bcrypt-v1','legacy-mp-scrypt-v1','scrypt-v1')),
  created_at INTEGER NOT NULL,
  role TEXT NOT NULL DEFAULT 'player',
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','disabled')),
  nickname TEXT,
  avatar TEXT NOT NULL DEFAULT 'tide',
  display_name TEXT,
  last_seen_tick INTEGER NOT NULL DEFAULT 0
`

export function assertUnifiedIdentitySchema(db: Connection): void {
  const marker = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='identity_schema'").get()
  if (!marker) throw new Error('Unified identity schema is not ready; explicit migration is required.')
  const version = db.prepare('SELECT version FROM identity_schema WHERE singleton=1').get() as { version: number } | undefined
  const columns = db.prepare('PRAGMA table_info(accounts)').all() as Array<{ name: string; notnull: number }>
  const required = ['password_scheme', 'display_name', 'status', ...ACCOUNT_COLUMNS]
  const tables = new Set((db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{ name: string }>).map(row => row.name))
  if (version?.version !== IDENTITY_SCHEMA_VERSION || columns.find(c => c.name === 'email')?.notnull !== 0
    || required.some(name => !columns.some(c => c.name === name))
    || ['account_login_aliases', 'account_source_identities', 'auth_sessions'].some(name => !tables.has(name))) throw new Error('Unified identity schema is not ready; explicit migration is required.')
}

/** Explicit offline migration only. Never called by a constructor or startup. */
export function migrateIdentitySchema(db: Connection): void {
  if (db.inTransaction) throw new Error('Identity migration requires exclusive ownership outside a transaction.')
  const marker = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='identity_schema'").get()
  if (marker) { assertUnifiedIdentitySchema(db); return }
  const foreignKeys = Number(db.pragma('foreign_keys', { simple: true }))
  if ((db.pragma('foreign_key_check') as unknown[]).length > 0) throw new Error('Existing foreign-key violations block identity migration.')
  const exists = !!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='accounts'").get()
  const columns = exists ? db.prepare('PRAGMA table_info(accounts)').all() as Array<{ name: string }> : []
  if (columns.some(c => !ACCOUNT_COLUMNS.includes(c.name)) || (exists && REQUIRED_LEGACY_COLUMNS.some(name => !columns.some(c => c.name === name)))) throw new Error('Unsupported accounts schema; refusing to discard or invent columns.')
  const rows = exists ? db.prepare('SELECT * FROM accounts ORDER BY id').all() as Array<Record<string, unknown>> : []
  for (const row of rows) {
    accountId(row.id)
    if (!passwordScheme(row.password_hash as string)) throw new Error('Unsupported credential format blocks identity migration.')
    if (row.role !== undefined && !['player', 'gm', 'admin', 'agent'].includes(row.role as string)) throw new Error('Invalid canonical role blocks identity migration.')
  }
  const objects = db.prepare("SELECT type,name,sql FROM sqlite_master WHERE sql IS NOT NULL AND (type IN ('view','trigger') OR (type='index' AND tbl_name='accounts')) ORDER BY rowid").all() as SchemaItem[]
  const hasSequence = !!db.prepare("SELECT name FROM sqlite_master WHERE name='sqlite_sequence'").get()
  const oldSequence = exists && hasSequence ? (db.prepare("SELECT seq FROM sqlite_sequence WHERE name='accounts'").get() as { seq: number } | undefined)?.seq ?? 0 : 0
  db.pragma('foreign_keys = OFF')
  try {
    db.transaction(() => {
      // DROP VIEW also drops its INSTEAD OF triggers: remove triggers first.
      for (const item of objects) if (item.type === 'trigger') db.exec(`DROP TRIGGER ${quote(item.name)}`)
      for (const item of objects) if (item.type === 'view') db.exec(`DROP VIEW ${quote(item.name)}`)
      db.exec(`CREATE TABLE identity_accounts_new (${ACCOUNT_DDL})`)
      const insert = db.prepare('INSERT INTO identity_accounts_new(id,email,password_hash,password_scheme,created_at,role,nickname,avatar,last_seen_tick) VALUES(?,?,?,?,?,?,?,?,?)')
      for (const row of rows) insert.run(row.id, row.email, row.password_hash, passwordScheme(row.password_hash as string), row.created_at, row.role ?? 'player', row.nickname ?? null, row.avatar ?? 'tide', row.last_seen_tick ?? 0)
      if (exists) db.exec('DROP TABLE accounts')
      db.exec('ALTER TABLE identity_accounts_new RENAME TO accounts')
      if (oldSequence > 0) {
        const restored = db.prepare("UPDATE sqlite_sequence SET seq=MAX(seq,?) WHERE name='accounts'").run(oldSequence)
        if (restored.changes === 0) db.prepare("INSERT INTO sqlite_sequence(name,seq) VALUES('accounts',?)").run(oldSequence)
      }
      db.exec(`
        CREATE TABLE account_login_aliases (
          kind TEXT NOT NULL CHECK(kind IN ('username','email')),
          normalized TEXT NOT NULL,
          display_value TEXT NOT NULL,
          account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
          PRIMARY KEY(kind,normalized), UNIQUE(account_id,kind)
        );
        CREATE TABLE account_source_identities (
          namespace TEXT NOT NULL,
          legacy_id TEXT NOT NULL,
          account_id INTEGER NOT NULL UNIQUE REFERENCES accounts(id) ON DELETE CASCADE,
          PRIMARY KEY(namespace,legacy_id)
        );
        CREATE TABLE auth_sessions (
          token_hash TEXT PRIMARY KEY,
          account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
          created_at INTEGER NOT NULL,
          expires_at INTEGER NOT NULL,
          revoked_at INTEGER
        );
        CREATE INDEX idx_auth_sessions_account ON auth_sessions(account_id);
        CREATE TABLE identity_schema (singleton INTEGER PRIMARY KEY CHECK(singleton=1), version INTEGER NOT NULL);
        INSERT INTO identity_schema(singleton,version) VALUES(1,${IDENTITY_SCHEMA_VERSION});
      `)
      const alias = db.prepare("INSERT INTO account_login_aliases(kind,normalized,display_value,account_id) VALUES('email',?,?,?)")
      for (const row of rows) {
        if (typeof row.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email.trim())) throw new Error('Invalid canonical email blocks identity migration.')
        alias.run(row.email.trim().toLowerCase(), row.email, row.id)
      }
      // A trigger on a view requires that view to exist again first.
      for (const type of ['index', 'view', 'trigger']) for (const item of objects) if (item.type === type && item.sql) db.exec(item.sql)
      db.exec('CREATE INDEX IF NOT EXISTS idx_accounts_email ON accounts(email)')
      if ((db.pragma('foreign_key_check') as unknown[]).length > 0) throw new Error('Identity migration failed foreign-key validation.')
      assertUnifiedIdentitySchema(db)
    })()
  } finally {
    db.pragma(`foreign_keys = ${foreignKeys ? 'ON' : 'OFF'}`)
  }
}

function quote(name: string): string { return `"${name.replaceAll('"', '""')}"` }

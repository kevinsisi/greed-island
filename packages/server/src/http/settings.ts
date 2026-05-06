// Settings store — persists admin-managed configuration in SQLite.
//
// Currently used for the Gemini API key pool: each row is one key,
// status flags track whether a key has been temporarily disabled by
// the rotation logic (e.g. quota exhausted, auth error). Keys can be
// seeded from GEMINI_API_KEY env at boot AND added/replaced from the
// Settings page.

import type Database from 'better-sqlite3'

type DatabaseConnection = Database.Database

export type ApiKeyStatus = 'active' | 'disabled'

export type ApiKeyRow = Readonly<{
  id: number
  key: string
  source: string
  status: string
  last_error: string | null
  last_used_at: number | null
  failure_count: number
  created_at: number
}>

export type ApiKeyRecord = Readonly<{
  id: number
  key: string
  source: 'env' | 'admin'
  status: ApiKeyStatus
  lastError: string | null
  lastUsedAt: number | null
  failureCount: number
  createdAt: number
}>

export type ApiKeySummary = Readonly<{
  id: number
  fingerprint: string
  source: 'env' | 'admin'
  status: ApiKeyStatus
  lastError: string | null
  lastUsedAt: number | null
  failureCount: number
  createdAt: number
}>

export function initializeSettingsSchema(db: DatabaseConnection): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS api_keys (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT NOT NULL UNIQUE,
      source TEXT NOT NULL DEFAULT 'admin',
      status TEXT NOT NULL DEFAULT 'active',
      last_error TEXT,
      last_used_at INTEGER,
      failure_count INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_api_keys_status ON api_keys(status);
  `)
}

export class SettingsStore {
  constructor(private readonly db: DatabaseConnection) {
    initializeSettingsSchema(db)
  }

  /** Insert keys (idempotent on duplicate). Returns count of newly inserted. */
  addKeys(keys: readonly string[], source: 'env' | 'admin'): number {
    const now = Date.now()
    const insert = this.db.prepare(
      `INSERT OR IGNORE INTO api_keys (key, source, status, created_at)
       VALUES (?, ?, 'active', ?)`
    )
    let inserted = 0
    const txn = this.db.transaction((rows: readonly string[]) => {
      for (const raw of rows) {
        const k = raw.trim()
        if (!k) continue
        const result = insert.run(k, source, now)
        inserted += result.changes
      }
    })
    txn(keys)
    return inserted
  }

  listKeys(): ApiKeyRecord[] {
    const rows = this.db
      .prepare('SELECT * FROM api_keys ORDER BY id ASC')
      .all() as ApiKeyRow[]
    return rows.map(toRecord)
  }

  /** Active keys, oldest used first (so rotation spreads load). */
  listActiveKeys(): ApiKeyRecord[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM api_keys
         WHERE status = 'active'
         ORDER BY COALESCE(last_used_at, 0) ASC, id ASC`
      )
      .all() as ApiKeyRow[]
    return rows.map(toRecord)
  }

  deleteKey(id: number): boolean {
    const result = this.db.prepare('DELETE FROM api_keys WHERE id = ?').run(id)
    return result.changes > 0
  }

  /** Reset all keys to active and clear last_error / failure_count. */
  reactivateAll(): number {
    const result = this.db
      .prepare(
        `UPDATE api_keys
         SET status = 'active', last_error = NULL, failure_count = 0
         WHERE status != 'active'`
      )
      .run()
    return result.changes
  }

  markUsed(id: number): void {
    this.db
      .prepare('UPDATE api_keys SET last_used_at = ? WHERE id = ?')
      .run(Date.now(), id)
  }

  markFailure(id: number, error: string, disable: boolean): void {
    if (disable) {
      this.db
        .prepare(
          `UPDATE api_keys
           SET status = 'disabled', last_error = ?, failure_count = failure_count + 1
           WHERE id = ?`
        )
        .run(error.slice(0, 500), id)
    } else {
      this.db
        .prepare(
          `UPDATE api_keys
           SET last_error = ?, failure_count = failure_count + 1
           WHERE id = ?`
        )
        .run(error.slice(0, 500), id)
    }
  }

  countActive(): number {
    const row = this.db
      .prepare("SELECT COUNT(*) as count FROM api_keys WHERE status = 'active'")
      .get() as { count: number }
    return row.count
  }
}

function toRecord(row: ApiKeyRow): ApiKeyRecord {
  return {
    id: row.id,
    key: row.key,
    source: row.source === 'env' ? 'env' : 'admin',
    status: row.status === 'disabled' ? 'disabled' : 'active',
    lastError: row.last_error,
    lastUsedAt: row.last_used_at,
    failureCount: row.failure_count,
    createdAt: row.created_at,
  }
}

/** Hide the key body — only show last 4 chars. */
export function fingerprintKey(key: string): string {
  if (!key) return '••••'
  if (key.length <= 8) return '•'.repeat(key.length)
  return `••••${key.slice(-4)}`
}

export function summarize(record: ApiKeyRecord): ApiKeySummary {
  return {
    id: record.id,
    fingerprint: fingerprintKey(record.key),
    source: record.source,
    status: record.status,
    lastError: record.lastError,
    lastUsedAt: record.lastUsedAt,
    failureCount: record.failureCount,
    createdAt: record.createdAt,
  }
}

export function parseKeyList(raw: string): string[] {
  return raw
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

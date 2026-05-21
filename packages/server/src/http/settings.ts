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

    -- v0.42.0: KV settings for provider URLs, model selection, priorities.
    CREATE TABLE IF NOT EXISTS kv_settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at INTEGER NOT NULL
    );
  `)
  // v0.42.0: add disabled_until column to api_keys if missing — used for
  // 429 quota cooldown so keys auto-recover instead of staying dead forever.
  const cols = db.prepare("PRAGMA table_info(api_keys)").all() as Array<{ name: string }>
  if (!cols.some((c) => c.name === 'disabled_until')) {
    db.exec("ALTER TABLE api_keys ADD COLUMN disabled_until INTEGER")
  }
}

// v0.42.0 — Quota cooldown. After a 429, the key is disabled for this long
// then automatically retried. Auth errors (401/403) remain permanent.
export const QUOTA_COOLDOWN_MS = 30 * 60 * 1000 // 30 minutes

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

  /** Active keys, oldest used first (so rotation spreads load).
   *  v0.42.0: also auto-reactivates keys whose `disabled_until` has elapsed
   *  (transient 429 quota cooldown — without this, yesterday's quota error
   *  leaves a perfectly good key dead forever). */
  listActiveKeys(): ApiKeyRecord[] {
    const now = Date.now()
    // Promote any cooldown-expired keys back to 'active' before listing.
    this.db
      .prepare(
        `UPDATE api_keys
         SET status = 'active', disabled_until = NULL
         WHERE status = 'disabled' AND disabled_until IS NOT NULL AND disabled_until < ?`
      )
      .run(now)
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

  /** Record a failure on a key. v0.42.0: optionally set a cooldown so quota
   *  (429) errors don't permanently kill the key — pass `cooldownMs` for a
   *  timed disable (auto-recover), omit it for a permanent disable (auth). */
  markFailure(
    id: number,
    error: string,
    disable: boolean,
    cooldownMs?: number,
  ): void {
    const errSlice = error.slice(0, 500)
    if (disable) {
      const disabledUntil = typeof cooldownMs === 'number' && cooldownMs > 0
        ? Date.now() + cooldownMs
        : null
      this.db
        .prepare(
          `UPDATE api_keys
           SET status = 'disabled',
               disabled_until = ?,
               last_error = ?,
               failure_count = failure_count + 1
           WHERE id = ?`
        )
        .run(disabledUntil, errSlice, id)
    } else {
      this.db
        .prepare(
          `UPDATE api_keys
           SET last_error = ?, failure_count = failure_count + 1
           WHERE id = ?`
        )
        .run(errSlice, id)
    }
  }

  // ---- v0.42.0 — generic KV settings (opencode base URL, model, priority) ----

  getSetting(key: string): string | null {
    const row = this.db
      .prepare('SELECT value FROM kv_settings WHERE key = ?')
      .get(key) as { value?: string } | undefined
    const v = row?.value
    return typeof v === 'string' && v.trim().length > 0 ? v.trim() : null
  }

  setSetting(key: string, value: string | null): void {
    const now = Date.now()
    if (value === null || value.trim().length === 0) {
      this.db.prepare('DELETE FROM kv_settings WHERE key = ?').run(key)
      return
    }
    this.db
      .prepare(
        `INSERT INTO kv_settings (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
      )
      .run(key, value.trim(), now)
  }

  listSettings(): Record<string, string> {
    const rows = this.db
      .prepare('SELECT key, value FROM kv_settings')
      .all() as Array<{ key: string; value: string }>
    const out: Record<string, string> = {}
    for (const r of rows) out[r.key] = r.value
    return out
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

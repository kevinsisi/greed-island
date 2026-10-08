// Password reset token store.
//
// No outgoing email service is configured. Tokens are created only through
// the protected admin reset route, which returns a single-use token to an
// authenticated administrator to hand to the player out-of-band. The
// anonymous forgot-password endpoint never creates or discloses a token.
//
// POST /api/auth/reset-password consumes a token and rotates the password
// hash. Expired/used tokens are pruned so they are not retained forever.
import { randomBytes } from 'node:crypto'
import type Database from 'better-sqlite3'

type DatabaseConnection = Database.Database

export const RESET_TOKEN_TTL_MS = 60 * 60 * 1000 // 1 hour

export type PasswordResetRecord = Readonly<{
  id: number
  accountId: number
  token: string
  expiresAt: number
  usedAt: number | null
  createdAt: number
}>

type PasswordResetRow = Readonly<{
  id: number
  account_id: number
  token: string
  expires_at: number
  used_at: number | null
  created_at: number
}>

export class PasswordResetStore {
  constructor(private readonly db: DatabaseConnection) {
    initializePasswordResetSchema(db)
  }

  create(accountId: number, ttlMs: number = RESET_TOKEN_TTL_MS): PasswordResetRecord {
    const now = Date.now()
    const expiresAt = now + Math.max(60_000, ttlMs)
    // Invalidate any prior outstanding tokens for this account so only
    // the most recent reset link works.
    this.db
      .prepare('UPDATE password_resets SET used_at = ? WHERE account_id = ? AND used_at IS NULL')
      .run(now, accountId)
    const token = randomBytes(24).toString('hex')
    const result = this.db
      .prepare(
        'INSERT INTO password_resets (account_id, token, expires_at, used_at, created_at) VALUES (?, ?, ?, NULL, ?)'
      )
      .run(accountId, token, expiresAt, now)
    return {
      id: Number(result.lastInsertRowid),
      accountId,
      token,
      expiresAt,
      usedAt: null,
      createdAt: now,
    }
  }

  findByToken(token: string): PasswordResetRecord | null {
    if (typeof token !== 'string' || token.length === 0) return null
    const row = this.db
      .prepare('SELECT * FROM password_resets WHERE token = ?')
      .get(token) as PasswordResetRow | undefined
    return row ? rowToRecord(row) : null
  }

  consume(token: string): PasswordResetRecord | null {
    const record = this.findByToken(token)
    if (!record) return null
    if (record.usedAt !== null) return null
    if (record.expiresAt < Date.now()) return null
    this.db
      .prepare('UPDATE password_resets SET used_at = ? WHERE id = ?')
      .run(Date.now(), record.id)
    return record
  }

  pruneExpired(now: number = Date.now()): number {
    // Drop any record older than 30 days regardless of state to keep the
    // table compact. Used/expired-but-recent records stay around briefly
    // to aid debugging.
    const cutoff = now - 30 * 24 * 60 * 60 * 1000
    const result = this.db
      .prepare('DELETE FROM password_resets WHERE created_at < ?')
      .run(cutoff)
    return Number(result.changes ?? 0)
  }
}

export function initializePasswordResetSchema(db: DatabaseConnection): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS password_resets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER NOT NULL,
      token TEXT NOT NULL UNIQUE,
      expires_at INTEGER NOT NULL,
      used_at INTEGER,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_password_resets_token ON password_resets(token);
    CREATE INDEX IF NOT EXISTS idx_password_resets_account ON password_resets(account_id);
  `)
}

function rowToRecord(row: PasswordResetRow): PasswordResetRecord {
  return {
    id: row.id,
    accountId: row.account_id,
    token: row.token,
    expiresAt: row.expires_at,
    usedAt: row.used_at,
    createdAt: row.created_at,
  }
}

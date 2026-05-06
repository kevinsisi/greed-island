// Accounts table — stores user credentials and role. Lives in the same
// SQLite database as the kernel event log so a single docker volume
// captures the full server state.
//
// Roles
//   admin  — full GM powers + can promote/demote other users.
//   gm     — can manage Gemini API keys / settings page.
//   player — default role for newly registered accounts. The very
//            first account on a fresh deployment is auto-promoted to
//            admin so a freshly-deployed instance has someone in
//            charge without env-var hand-holding.

import type Database from 'better-sqlite3'
import bcrypt from 'bcryptjs'

type DatabaseConnection = Database.Database

export type AccountRole = 'player' | 'gm' | 'admin'

export const ACCOUNT_ROLES: readonly AccountRole[] = ['player', 'gm', 'admin']

export function isAccountRole(value: unknown): value is AccountRole {
  return value === 'player' || value === 'gm' || value === 'admin'
}

export type AccountRecord = Readonly<{
  id: number
  email: string
  passwordHash: string
  createdAt: number
  role: AccountRole
}>

type AccountRow = Readonly<{
  id: number
  email: string
  password_hash: string
  created_at: number
  role: string
}>

export class AccountStore {
  constructor(
    private readonly db: DatabaseConnection,
    private readonly bcryptCost: number
  ) {
    initializeAccountSchema(db)
  }

  async createAccount(email: string, password: string): Promise<AccountRecord> {
    const normalized = normalizeEmail(email)
    assertValidPassword(password)
    if (this.findByEmail(normalized) !== null) {
      throw new AccountError('EMAIL_TAKEN', 'An account with that email already exists.')
    }
    const passwordHash = await bcrypt.hash(password, this.bcryptCost)
    const createdAt = Date.now()
    const isFirst = this.countAccounts() === 0
    const role: AccountRole = isFirst ? 'admin' : 'player'
    const result = this.db
      .prepare(
        'INSERT INTO accounts (email, password_hash, created_at, role) VALUES (?, ?, ?, ?)'
      )
      .run(normalized, passwordHash, createdAt, role)
    return {
      id: Number(result.lastInsertRowid),
      email: normalized,
      passwordHash,
      createdAt,
      role,
    }
  }

  async verifyCredentials(email: string, password: string): Promise<AccountRecord | null> {
    const normalized = normalizeEmail(email)
    const account = this.findByEmail(normalized)
    if (account === null) {
      // Run a fake compare to keep timing similar between unknown
      // emails and bad passwords.
      await bcrypt.compare(password, '$2a$12$abcdefghijklmnopqrstuvabcdefghijklmnopqrstuvwxyz0123')
      return null
    }
    const ok = await bcrypt.compare(password, account.passwordHash)
    return ok ? account : null
  }

  findById(id: number): AccountRecord | null {
    const row = this.db.prepare('SELECT * FROM accounts WHERE id = ?').get(id) as AccountRow | undefined
    return row ? rowToAccount(row) : null
  }

  findByEmail(email: string): AccountRecord | null {
    const row = this.db
      .prepare('SELECT * FROM accounts WHERE email = ?')
      .get(normalizeEmail(email)) as AccountRow | undefined
    return row ? rowToAccount(row) : null
  }

  countAccounts(): number {
    const row = this.db.prepare('SELECT COUNT(*) as count FROM accounts').get() as { count: number }
    return row.count
  }

  firstAccountId(): number | null {
    const row = this.db.prepare('SELECT MIN(id) as id FROM accounts').get() as {
      id: number | null
    }
    return row?.id ?? null
  }

  listAccounts(limit = 200): AccountRecord[] {
    const safeLimit = Math.max(1, Math.min(500, Math.floor(limit)))
    const rows = this.db
      .prepare('SELECT * FROM accounts ORDER BY id ASC LIMIT ?')
      .all(safeLimit) as AccountRow[]
    return rows.map(rowToAccount)
  }

  setRole(id: number, role: AccountRole): AccountRecord | null {
    const account = this.findById(id)
    if (!account) return null
    this.db.prepare('UPDATE accounts SET role = ? WHERE id = ?').run(role, id)
    return { ...account, role }
  }

  countAdmins(): number {
    const row = this.db
      .prepare("SELECT COUNT(*) as count FROM accounts WHERE role = 'admin'")
      .get() as { count: number }
    return row.count
  }

  ensureAdminAllowList(emails: readonly string[]): number {
    let promoted = 0
    for (const email of emails) {
      const normalized = email.trim().toLowerCase()
      if (!normalized) continue
      const account = this.findByEmail(normalized)
      if (!account) continue
      if (account.role !== 'admin') {
        this.setRole(account.id, 'admin')
        promoted += 1
      }
    }
    return promoted
  }
}

export class AccountError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message)
    this.name = 'AccountError'
  }
}

export function initializeAccountSchema(db: DatabaseConnection): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      role TEXT NOT NULL DEFAULT 'player'
    );
    CREATE INDEX IF NOT EXISTS idx_accounts_email ON accounts(email);
  `)
  // Migration: add role column to legacy databases that pre-date GM roles.
  const cols = db.prepare('PRAGMA table_info(accounts)').all() as Array<{ name: string }>
  if (!cols.some((c) => c.name === 'role')) {
    db.exec("ALTER TABLE accounts ADD COLUMN role TEXT NOT NULL DEFAULT 'player'")
  }
  // Best-effort: if no admin exists, promote the earliest account so the
  // /settings + /admin pages have a controller on a fresh deploy.
  const hasAccounts = (db.prepare('SELECT COUNT(*) AS c FROM accounts').get() as { c: number }).c > 0
  const hasAdmin = (db.prepare("SELECT COUNT(*) AS c FROM accounts WHERE role = 'admin'").get() as { c: number }).c > 0
  if (hasAccounts && !hasAdmin) {
    db.exec(
      "UPDATE accounts SET role = 'admin' WHERE id = (SELECT MIN(id) FROM accounts)"
    )
  }
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function normalizeEmail(email: string): string {
  if (typeof email !== 'string') {
    throw new AccountError('INVALID_EMAIL', 'Email must be a string.')
  }
  const trimmed = email.trim().toLowerCase()
  if (!EMAIL_PATTERN.test(trimmed)) {
    throw new AccountError('INVALID_EMAIL', 'Email is not a valid address.')
  }
  return trimmed
}

export function assertValidPassword(password: string): void {
  if (typeof password !== 'string' || password.length < 8) {
    throw new AccountError('WEAK_PASSWORD', 'Password must be at least 8 characters.')
  }
  if (password.length > 128) {
    throw new AccountError('WEAK_PASSWORD', 'Password must be no more than 128 characters.')
  }
}

function rowToAccount(row: AccountRow): AccountRecord {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    createdAt: row.created_at,
    role: isAccountRole(row.role) ? row.role : 'player',
  }
}

// Accounts table — stores user credentials. Lives in the same SQLite
// database as the kernel event log so a single docker volume captures
// the full server state.

import type Database from 'better-sqlite3'
import bcrypt from 'bcryptjs'

type DatabaseConnection = Database.Database

export type AccountRecord = Readonly<{
  id: number
  email: string
  passwordHash: string
  createdAt: number
}>

type AccountRow = Readonly<{
  id: number
  email: string
  password_hash: string
  created_at: number
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
    const result = this.db
      .prepare(
        'INSERT INTO accounts (email, password_hash, created_at) VALUES (?, ?, ?)'
      )
      .run(normalized, passwordHash, createdAt)
    return {
      id: Number(result.lastInsertRowid),
      email: normalized,
      passwordHash,
      createdAt
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
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_accounts_email ON accounts(email);
  `)
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
    createdAt: row.created_at
  }
}

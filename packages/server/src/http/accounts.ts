// Accounts table — stores user credentials, role, and player profile
// (nickname/avatar). Lives in the same SQLite database as the kernel
// event log so a single docker volume captures the full server state.
//
// Roles
//   admin  — full GM powers + can promote/demote other users + reset
//            other users' passwords.
//   gm     — can manage Gemini API keys / settings page.
//   player — default role for newly registered accounts. The very
//            first account on a fresh deployment is auto-promoted to
//            admin so a freshly-deployed instance has someone in
//            charge without env-var hand-holding.
//
// Profile fields are nullable/defaulted so existing rows on legacy
// databases keep working through the additive ALTER TABLE migration.

import type Database from 'better-sqlite3'
import bcrypt from 'bcryptjs'

type DatabaseConnection = Database.Database

export type AccountRole = 'player' | 'gm' | 'admin'

export const ACCOUNT_ROLES: readonly AccountRole[] = ['player', 'gm', 'admin']

export const DEFAULT_AVATAR = 'tide'

export const AVATAR_PRESETS: readonly string[] = [
  'tide',
  'fox',
  'lantern',
  'sword',
  'leaf',
  'moon',
  'flame',
  'mask',
]

export function isAccountRole(value: unknown): value is AccountRole {
  return value === 'player' || value === 'gm' || value === 'admin'
}

export function isAvatarPreset(value: unknown): value is string {
  return typeof value === 'string' && AVATAR_PRESETS.includes(value)
}

export type AccountRecord = Readonly<{
  id: number
  email: string
  passwordHash: string
  createdAt: number
  role: AccountRole
  nickname: string | null
  avatar: string
}>

type AccountRow = Readonly<{
  id: number
  email: string
  password_hash: string
  created_at: number
  role: string
  nickname: string | null
  avatar: string | null
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
        'INSERT INTO accounts (email, password_hash, created_at, role, nickname, avatar) VALUES (?, ?, ?, ?, NULL, ?)'
      )
      .run(normalized, passwordHash, createdAt, role, DEFAULT_AVATAR)
    return {
      id: Number(result.lastInsertRowid),
      email: normalized,
      passwordHash,
      createdAt,
      role,
      nickname: null,
      avatar: DEFAULT_AVATAR,
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

  async verifyPasswordById(id: number, password: string): Promise<boolean> {
    const account = this.findById(id)
    if (!account) return false
    return bcrypt.compare(password, account.passwordHash)
  }

  async updatePassword(id: number, newPassword: string): Promise<AccountRecord | null> {
    assertValidPassword(newPassword)
    const account = this.findById(id)
    if (!account) return null
    const passwordHash = await bcrypt.hash(newPassword, this.bcryptCost)
    this.db.prepare('UPDATE accounts SET password_hash = ? WHERE id = ?').run(passwordHash, id)
    return { ...account, passwordHash }
  }

  updateProfile(
    id: number,
    patch: { nickname?: string | null; avatar?: string }
  ): AccountRecord | null {
    const account = this.findById(id)
    if (!account) return null
    const fields: string[] = []
    const values: Array<string | null> = []
    if (patch.nickname !== undefined) {
      const nickname = normalizeNickname(patch.nickname)
      fields.push('nickname = ?')
      values.push(nickname)
    }
    if (patch.avatar !== undefined) {
      if (!isAvatarPreset(patch.avatar)) {
        throw new AccountError('INVALID_AVATAR', 'Avatar is not a recognised preset.')
      }
      fields.push('avatar = ?')
      values.push(patch.avatar)
    }
    if (fields.length === 0) return account
    values.push(String(id))
    this.db.prepare(`UPDATE accounts SET ${fields.join(', ')} WHERE id = ?`).run(...values)
    return this.findById(id)
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
      role TEXT NOT NULL DEFAULT 'player',
      nickname TEXT,
      avatar TEXT NOT NULL DEFAULT '${DEFAULT_AVATAR}'
    );
    CREATE INDEX IF NOT EXISTS idx_accounts_email ON accounts(email);
  `)
  // Migrations: add columns to legacy databases that pre-date GM roles
  // and the player profile additions.
  const cols = db.prepare('PRAGMA table_info(accounts)').all() as Array<{ name: string }>
  const colNames = new Set(cols.map((c) => c.name))
  if (!colNames.has('role')) {
    db.exec("ALTER TABLE accounts ADD COLUMN role TEXT NOT NULL DEFAULT 'player'")
  }
  if (!colNames.has('nickname')) {
    db.exec('ALTER TABLE accounts ADD COLUMN nickname TEXT')
  }
  if (!colNames.has('avatar')) {
    db.exec(`ALTER TABLE accounts ADD COLUMN avatar TEXT NOT NULL DEFAULT '${DEFAULT_AVATAR}'`)
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

const NICKNAME_MAX = 24

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

export function normalizeNickname(value: string | null): string | null {
  if (value === null) return null
  if (typeof value !== 'string') {
    throw new AccountError('INVALID_NICKNAME', 'Nickname must be a string.')
  }
  const trimmed = value.trim()
  if (trimmed.length === 0) return null
  if (trimmed.length > NICKNAME_MAX) {
    throw new AccountError('INVALID_NICKNAME', `Nickname must be at most ${NICKNAME_MAX} characters.`)
  }
  return trimmed
}

function rowToAccount(row: AccountRow): AccountRecord {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    createdAt: row.created_at,
    role: isAccountRole(row.role) ? row.role : 'player',
    nickname: typeof row.nickname === 'string' && row.nickname.length > 0 ? row.nickname : null,
    avatar:
      typeof row.avatar === 'string' && AVATAR_PRESETS.includes(row.avatar)
        ? row.avatar
        : DEFAULT_AVATAR,
  }
}

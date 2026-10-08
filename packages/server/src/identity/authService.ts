import { createHash, randomBytes } from 'node:crypto'
import type Database from 'better-sqlite3'
import { accountId, type LoginAlias, type Principal } from './principal.js'
import { SqliteAccountRepository } from './sqliteAccountRepository.js'
import { assertUnifiedIdentitySchema } from './schema.js'
import { hashStoredPassword, passwordScheme, verifyStoredPassword } from './passwordVerifier.js'

export const AUTH_COOKIE = 'greed_session'
export type CookiePolicy = Readonly<{ httpOnly: true; secure: boolean; sameSite: 'strict'; path: '/'; maxAge: number }>
export type SessionGrant = Readonly<{ principal: Principal; token: string; cookie: CookiePolicy }>
export type AuthServiceConfig = Readonly<{ allowedOrigins: readonly string[]; secureCookies?: boolean; sessionMs?: number; now?: () => number }>
const DEFAULT_SESSION_MS = 12 * 60 * 60 * 1000
const TOKEN_FORMAT = /^[a-f0-9]{64}$/

export function sessionTokenFromCookie(header: string | undefined): string | null {
  if (!header) return null
  const values = header.split(';').map(item => item.trim()).filter(item => item.startsWith(`${AUTH_COOKIE}=`)).map(item => item.slice(AUTH_COOKIE.length + 1))
  return values.length === 1 && TOKEN_FORMAT.test(values[0]!) ? values[0]! : null
}

/** Shared canonical DB/session service. Routes supply Origin before any mutation. */
export class AuthService {
  readonly accounts: SqliteAccountRepository
  readonly cookie: CookiePolicy
  private readonly now: () => number
  private readonly origins: ReadonlySet<string>
  private readonly revoked = new Set<(accountId: number) => void>()

  constructor(private readonly db: Database.Database, config: AuthServiceConfig) {
    assertUnifiedIdentitySchema(db)
    this.now = config.now ?? Date.now
    const duration = config.sessionMs ?? DEFAULT_SESSION_MS
    const secureCookies = config.secureCookies !== false
    if (!Number.isSafeInteger(duration) || duration <= 0 || duration > 30 * 24 * 60 * 60 * 1000 || config.allowedOrigins.length === 0) throw new AuthError('INVALID_AUTH_CONFIG')
    const origins = config.allowedOrigins.map(value => {
      const url = new URL(value)
      if (url.origin !== value || (url.protocol !== 'https:' && url.protocol !== 'http:') || url.username || url.password) throw new AuthError('INVALID_AUTH_CONFIG')
      if (!secureCookies && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new AuthError('INSECURE_COOKIE_CONFIG')
      return value
    })
    this.origins = new Set(origins)
    this.accounts = new SqliteAccountRepository(db, this.now)
    this.cookie = { httpOnly: true, sameSite: 'strict', path: '/', secure: secureCookies, maxAge: duration }
  }

  assertOrigin(origin: string | undefined): void {
    if (!origin || !this.origins.has(origin)) throw new AuthError('ORIGIN_NOT_ALLOWED')
  }
  async register(alias: LoginAlias, password: string, origin: string | undefined): Promise<SessionGrant> {
    this.assertOrigin(origin)
    let grant: SessionGrant | undefined
    await this.accounts.createPlayer(alias, password, principal => { grant = this.issue(principal) })
    if (!grant) throw new AuthError('REGISTRATION_FAILED')
    return grant
  }
  async login(alias: LoginAlias, password: string, origin: string | undefined): Promise<SessionGrant | null> {
    this.assertOrigin(origin)
    if (typeof password !== 'string' || password.length > 200) throw new AuthError('INVALID_CREDENTIALS')
    const principal = await this.accounts.verifyCredentials(alias, password)
    return principal ? this.issue(principal) : null
  }
  resolve(token: string | null | undefined): Principal | null {
    if (!token || !TOKEN_FORMAT.test(token)) return null
    const row = this.db.prepare('SELECT account_id,expires_at,revoked_at FROM auth_sessions WHERE token_hash=?').get(tokenHash(token)) as { account_id: number; expires_at: number; revoked_at: number | null } | undefined
    if (!row || row.revoked_at !== null || row.expires_at <= this.now()) return null
    return this.accounts.findPrincipal(accountId(row.account_id))
  }
  requireMutation(token: string | null | undefined, origin: string | undefined): Principal {
    this.assertOrigin(origin)
    const principal = this.resolve(token)
    if (!principal) throw new AuthError('UNAUTHORIZED')
    return principal
  }
  logout(token: string | null | undefined, origin: string | undefined): void {
    this.assertOrigin(origin)
    if (!token || !TOKEN_FORMAT.test(token)) return
    const key = tokenHash(token)
    const session = this.db.prepare('SELECT account_id FROM auth_sessions WHERE token_hash=? AND revoked_at IS NULL').get(key) as { account_id: number } | undefined
    if (!session) return
    this.db.prepare('UPDATE auth_sessions SET revoked_at=? WHERE token_hash=? AND revoked_at IS NULL').run(this.now(), key)
    for (const listener of this.revoked) listener(accountId(session.account_id))
  }
  revokeAccountSessions(id: number, token: string | null | undefined, origin: string | undefined): void {
    const validated = accountId(id)
    const principal = this.requireMutation(token, origin)
    if (principal.accountId !== validated && principal.role !== 'admin') throw new AuthError('FORBIDDEN')
    this.db.prepare('UPDATE auth_sessions SET revoked_at=? WHERE account_id=? AND revoked_at IS NULL').run(this.now(), validated)
    for (const listener of this.revoked) listener(validated)
  }
  async changePassword(token: string | null | undefined, origin: string | undefined, currentPassword: string, newPassword: string): Promise<void> {
    const principal = this.requireMutation(token, origin)
    const row = this.db.prepare('SELECT password_hash,password_scheme FROM accounts WHERE id=?').get(principal.accountId) as { password_hash: string; password_scheme: string } | undefined
    if (!row || passwordScheme(row.password_hash) !== row.password_scheme || typeof currentPassword !== 'string' || currentPassword.length > 200
      || !await verifyStoredPassword(currentPassword, row.password_hash)) throw new AuthError('INVALID_CURRENT_PASSWORD')
    const hash = await hashStoredPassword(newPassword)
    this.db.transaction(() => {
      const current = this.requireMutation(token, origin)
      const latest = this.db.prepare('SELECT password_hash FROM accounts WHERE id=?').get(current.accountId) as { password_hash: string } | undefined
      if (current.accountId !== principal.accountId || latest?.password_hash !== row.password_hash) throw new AuthError('CREDENTIALS_CHANGED')
      this.db.prepare("UPDATE accounts SET password_hash=?,password_scheme='scrypt-v1' WHERE id=?").run(hash, current.accountId)
      this.db.prepare('UPDATE auth_sessions SET revoked_at=? WHERE account_id=? AND revoked_at IS NULL').run(this.now(), current.accountId)
    })()
    for (const listener of this.revoked) listener(principal.accountId)
  }
  onRevoked(listener: (accountId: number) => void): () => void {
    this.revoked.add(listener)
    return () => { this.revoked.delete(listener) }
  }
  private issue(principal: Principal): SessionGrant {
    const current = this.accounts.findPrincipal(principal.accountId)
    if (!current) throw new AuthError('UNAUTHORIZED')
    const token = randomBytes(32).toString('hex')
    const now = this.now()
    this.db.prepare('INSERT INTO auth_sessions(token_hash,account_id,created_at,expires_at,revoked_at) VALUES(?,?,?,?,NULL)').run(tokenHash(token), principal.accountId, now, now + this.cookie.maxAge)
    return { principal: current, token, cookie: this.cookie }
  }
}

function tokenHash(token: string): string { return createHash('sha256').update(token).digest('hex') }
export class AuthError extends Error { constructor(readonly code: string) { super(code); this.name = 'AuthError' } }

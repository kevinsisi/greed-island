import { createHash, randomBytes } from 'node:crypto'
import type Database from 'better-sqlite3'
import { accountId, type AccountRole, type LoginAlias, type Principal } from './principal.js'
import { SqliteAccountRepository, type AccountProfile } from './sqliteAccountRepository.js'
import { assertUnifiedIdentitySchema } from './schema.js'
import { hashStoredPassword, passwordScheme, verifyStoredPassword } from './passwordVerifier.js'

export const AUTH_COOKIE = 'greed_session'
export type CookiePolicy = Readonly<{ httpOnly: true; secure: boolean; sameSite: 'strict'; path: '/'; maxAge: number }>
export type SessionGrant = Readonly<{ principal: Principal; token: string; cookie: CookiePolicy }>
export type AdministrativeProfile = AccountProfile & Readonly<{ status: 'active' | 'disabled' }>
export type PasswordResetGrant = Readonly<{ token: string; expiresAt: number; target: AdministrativeProfile }>
export type AuthServiceConfig = Readonly<{ allowedOrigins: readonly string[]; secureCookies?: boolean; sessionMs?: number; now?: () => number }>
const DEFAULT_SESSION_MS = 12 * 60 * 60 * 1000
const PASSWORD_RESET_MS = 60 * 60 * 1000
const TOKEN_FORMAT = /^[a-f0-9]{64}$/
const AVATAR_PRESETS = ['tide', 'fox', 'lantern', 'sword', 'leaf', 'moon', 'flame', 'mask'] as const

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
      this.db.prepare('UPDATE auth_password_resets SET consumed_at=? WHERE account_id=? AND consumed_at IS NULL').run(this.now(), current.accountId)
    })()
    for (const listener of this.revoked) listener(principal.accountId)
  }
  updateProfile(token: string | null | undefined, origin: string | undefined, patch: Readonly<{ nickname?: string | null; avatar?: string }>): AccountProfile {
    const principal = this.requireMutation(token, origin)
    const fields: string[] = [], values: Array<string | number | null> = []
    if (patch.nickname !== undefined) {
      if (patch.nickname !== null && (typeof patch.nickname !== 'string' || patch.nickname.trim().length > 24)) throw new AuthError('INVALID_NICKNAME')
      fields.push('nickname=?'); values.push(patch.nickname === null ? null : patch.nickname.trim() || null)
    }
    if (patch.avatar !== undefined) {
      if (typeof patch.avatar !== 'string' || !AVATAR_PRESETS.some(avatar => avatar === patch.avatar)) throw new AuthError('INVALID_AVATAR')
      fields.push('avatar=?'); values.push(patch.avatar)
    }
    if (fields.length > 0) this.db.prepare(`UPDATE accounts SET ${fields.join(',')} WHERE id=?`).run(...values, principal.accountId)
    const profile = this.accounts.getProfile(principal.accountId)
    if (!profile) throw new AuthError('UNAUTHORIZED')
    return profile
  }
  onRevoked(listener: (accountId: number) => void): () => void {
    this.revoked.add(listener)
    return () => { this.revoked.delete(listener) }
  }
  listAdministrativeProfiles(token: string | null | undefined): readonly AdministrativeProfile[] {
    this.requireAdministrator(token)
    const rows = this.db.prepare('SELECT id FROM accounts ORDER BY id LIMIT 500').all() as Array<{ id: number }>
    return rows.map(row => this.administrativeProfile(row.id))
  }
  setAccountRole(token: string | null | undefined, origin: string | undefined, targetId: number, role: AccountRole): AdministrativeProfile {
    if (!['player', 'gm', 'admin', 'agent'].includes(role)) throw new AuthError('INVALID_ROLE')
    let changed = false
    const profile = this.db.transaction(() => {
      this.assertOrigin(origin); this.requireAdministrator(token)
      const target = this.administrativeProfile(targetId)
      if (target.role !== role) {
        this.protectLastAdmin(target, role, target.status)
        this.db.prepare('UPDATE accounts SET role=? WHERE id=?').run(role, target.accountId)
        this.revokeStoredSessions(target.accountId); changed = true
      }
      return this.administrativeProfile(target.accountId)
    })()
    if (changed) this.notifyRevoked(profile.accountId)
    return profile
  }
  setAccountStatus(token: string | null | undefined, origin: string | undefined, targetId: number, status: 'active' | 'disabled'): AdministrativeProfile {
    if (status !== 'active' && status !== 'disabled') throw new AuthError('INVALID_STATUS')
    let changed = false
    const profile = this.db.transaction(() => {
      this.assertOrigin(origin); this.requireAdministrator(token)
      const target = this.administrativeProfile(targetId)
      if (target.status !== status) {
        this.protectLastAdmin(target, target.role, status)
        this.db.prepare('UPDATE accounts SET status=? WHERE id=?').run(status, target.accountId)
        this.revokeStoredSessions(target.accountId)
        this.db.prepare('UPDATE auth_password_resets SET consumed_at=? WHERE account_id=? AND consumed_at IS NULL').run(this.now(), target.accountId)
        changed = true
      }
      return this.administrativeProfile(target.accountId)
    })()
    if (changed) this.notifyRevoked(profile.accountId)
    return profile
  }
  issuePasswordReset(token: string | null | undefined, origin: string | undefined, targetId: number): PasswordResetGrant {
    return this.db.transaction(() => {
      this.assertOrigin(origin); this.requireAdministrator(token)
      const target = this.administrativeProfile(targetId)
      if (target.status !== 'active') throw new AuthError('ACCOUNT_DISABLED')
      const credential = this.db.prepare('SELECT password_hash FROM accounts WHERE id=?').get(target.accountId) as { password_hash: string }
      const proof = randomBytes(32).toString('hex'), now = this.now()
      this.db.prepare('UPDATE auth_password_resets SET consumed_at=? WHERE account_id=? AND consumed_at IS NULL').run(now, target.accountId)
      this.db.prepare('INSERT INTO auth_password_resets(token_hash,account_id,credential_fingerprint,created_at,expires_at,consumed_at) VALUES(?,?,?,?,?,NULL)').run(tokenHash(proof), target.accountId, tokenHash(credential.password_hash), now, now + PASSWORD_RESET_MS)
      return { token: proof, expiresAt: now + PASSWORD_RESET_MS, target }
    })()
  }
  async redeemPasswordReset(proof: string, newPassword: string, origin: string | undefined): Promise<SessionGrant> {
    this.assertOrigin(origin)
    if (typeof proof !== 'string' || !TOKEN_FORMAT.test(proof)) throw new AuthError('INVALID_RESET')
    const key = tokenHash(proof)
    const initial = this.resetRecord(key)
    if (!initial || initial.consumed_at !== null || initial.expires_at <= this.now()) throw new AuthError('INVALID_RESET')
    const hash = await hashStoredPassword(newPassword)
    let id = 0
    const grant = this.db.transaction(() => {
      const current = this.resetRecord(key)
      if (!current || current.consumed_at !== null || current.expires_at <= this.now()) throw new AuthError('INVALID_RESET')
      const principal = this.accounts.findPrincipal(accountId(current.account_id))
      const credential = this.db.prepare('SELECT password_hash FROM accounts WHERE id=?').get(current.account_id) as { password_hash: string } | undefined
      if (!principal || !credential || tokenHash(credential.password_hash) !== current.credential_fingerprint) throw new AuthError('INVALID_RESET')
      const consumed = this.db.prepare('UPDATE auth_password_resets SET consumed_at=? WHERE token_hash=? AND consumed_at IS NULL').run(this.now(), key)
      if (consumed.changes !== 1) throw new AuthError('INVALID_RESET')
      this.db.prepare("UPDATE accounts SET password_hash=?,password_scheme='scrypt-v1' WHERE id=?").run(hash, principal.accountId)
      this.revokeStoredSessions(principal.accountId)
      this.db.prepare('UPDATE auth_password_resets SET consumed_at=? WHERE account_id=? AND consumed_at IS NULL').run(this.now(), principal.accountId)
      id = principal.accountId
      return this.issue(principal)
    })()
    this.notifyRevoked(id)
    return grant
  }
  private resetRecord(key: string): { account_id: number; credential_fingerprint: string; expires_at: number; consumed_at: number | null } | undefined {
    return this.db.prepare('SELECT account_id,credential_fingerprint,expires_at,consumed_at FROM auth_password_resets WHERE token_hash=?').get(key) as { account_id: number; credential_fingerprint: string; expires_at: number; consumed_at: number | null } | undefined
  }
  private requireAdministrator(token: string | null | undefined): Principal {
    const principal = this.resolve(token)
    if (!principal) throw new AuthError('UNAUTHORIZED')
    if (principal.role !== 'admin') throw new AuthError('FORBIDDEN')
    return principal
  }
  private administrativeProfile(id: number): AdministrativeProfile {
    const validated = accountId(id)
    const profile = this.accounts.getProfile(validated, { includeDisabled: true })
    const row = this.db.prepare('SELECT status FROM accounts WHERE id=?').get(validated) as { status: 'active' | 'disabled' } | undefined
    if (!profile || !row) throw new AuthError('USER_NOT_FOUND')
    return { ...profile, status: row.status }
  }
  private protectLastAdmin(target: AdministrativeProfile, role: AccountRole, status: 'active' | 'disabled'): void {
    if (target.role !== 'admin' || target.status !== 'active' || (role === 'admin' && status === 'active')) return
    const count = this.db.prepare("SELECT COUNT(*) count FROM accounts WHERE role='admin' AND status='active'").get() as { count: number }
    if (count.count <= 1) throw new AuthError('LAST_ADMIN')
  }
  private revokeStoredSessions(id: number): void {
    this.db.prepare('UPDATE auth_sessions SET revoked_at=? WHERE account_id=? AND revoked_at IS NULL').run(this.now(), accountId(id))
  }
  private notifyRevoked(id: number): void {
    for (const listener of this.revoked) listener(accountId(id))
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

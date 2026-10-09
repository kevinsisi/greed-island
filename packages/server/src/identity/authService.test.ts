import { createHash } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type Database from 'better-sqlite3'
import { AuthService, AUTH_COOKIE, sessionTokenFromCookie } from './authService.js'
import { migrateIdentitySchema } from './schema.js'
import { legacyTestDatabase, TEST_ORIGIN, TEST_PASSWORD } from './schema.testSupport.js'

const databases: Database.Database[] = []
function fixture() {
  const db = legacyTestDatabase(); databases.push(db); migrateIdentitySchema(db)
  let now = 1000
  const config = { allowedOrigins: [TEST_ORIGIN], sessionMs: 1000, now: () => now }
  return { db, config, auth: new AuthService(db, config), advance: () => { now += 1000 } }
}
afterEach(() => { for (const db of databases.splice(0)) db.close(); vi.restoreAllMocks() })
const OWNER = { kind: 'email' as const, value: 'owner@example.test' }

describe('one canonical cookie auth service', () => {
  it('defaults to Secure HttpOnly Strict root-path cookie with no forwarded-header dependency', async () => {
    const { db, auth } = fixture()
    const grant = await auth.login(OWNER, TEST_PASSWORD, TEST_ORIGIN)
    expect(AUTH_COOKIE).toBe('greed_session')
    expect(grant?.cookie).toEqual({ httpOnly: true, sameSite: 'strict', path: '/', secure: true, maxAge: 1000 })
    expect(() => new AuthService(db, { allowedOrigins: [TEST_ORIGIN], secureCookies: false })).toThrow('INSECURE_COOKIE_CONFIG')
    expect(new AuthService(db, { allowedOrigins: ['http://127.0.0.1:4178'], secureCookies: false }).cookie.secure).toBe(false)
  })
  it.each([undefined, 'https://attacker.example.test', TEST_ORIGIN + '.evil.test', TEST_ORIGIN + '/', 'null'])('rejects missing or nonexact Origin before signup/login/logout/mutation', async origin => {
    const { db, auth } = fixture()
    await expect(auth.register({ kind: 'username', value: 'rejected-user' }, 'synthetic-password', origin)).rejects.toThrow('ORIGIN_NOT_ALLOWED')
    await expect(auth.login(OWNER, TEST_PASSWORD, origin)).rejects.toThrow('ORIGIN_NOT_ALLOWED')
    expect(() => auth.logout('0'.repeat(64), origin)).toThrow('ORIGIN_NOT_ALLOWED')
    expect(() => auth.requireMutation('0'.repeat(64), origin)).toThrow('ORIGIN_NOT_ALLOWED')
    expect(db.prepare('SELECT COUNT(*) count FROM accounts').get()).toEqual({ count: 1 })
  })
  it('persists only a token hash and survives a service restart against the same DB', async () => {
    const { db, auth, config } = fixture()
    const log = vi.spyOn(console, 'log'), error = vi.spyOn(console, 'error')
    const grant = (await auth.login(OWNER, TEST_PASSWORD, TEST_ORIGIN))!
    const stored = db.prepare('SELECT * FROM auth_sessions').get() as Record<string, unknown>
    expect(stored.token_hash).toBe(createHash('sha256').update(grant.token).digest('hex'))
    expect(JSON.stringify(stored)).not.toContain(grant.token)
    expect(new AuthService(db, config).resolve(grant.token)).toEqual({ accountId: 42, role: 'admin' })
    expect(log).not.toHaveBeenCalled(); expect(error).not.toHaveBeenCalled()
  })
  it('enforces expiry and freshly rereads role, active status and account existence', async () => {
    const { db, auth, advance } = fixture()
    const grant = (await auth.login(OWNER, TEST_PASSWORD, TEST_ORIGIN))!
    db.exec("UPDATE accounts SET role='player' WHERE id=42")
    expect(auth.resolve(grant.token)).toEqual({ accountId: 42, role: 'player' })
    db.exec("UPDATE accounts SET status='disabled' WHERE id=42")
    expect(auth.resolve(grant.token)).toBeNull()
    db.exec("UPDATE accounts SET status='active' WHERE id=42")
    advance(); expect(auth.resolve(grant.token)).toBeNull()
    expect(() => auth.requireMutation(grant.token, TEST_ORIGIN)).toThrow('UNAUTHORIZED')
  })
  it('revokes logout sessions and notifies stream cleanup subscribers', async () => {
    const { auth } = fixture()
    const cleanup = vi.fn(); const unsubscribe = auth.onRevoked(cleanup)
    const grant = (await auth.login(OWNER, TEST_PASSWORD, TEST_ORIGIN))!
    auth.logout(grant.token, TEST_ORIGIN)
    expect(auth.resolve(grant.token)).toBeNull()
    expect(cleanup).toHaveBeenCalledWith(42)
    expect(() => auth.logout(grant.token, TEST_ORIGIN)).not.toThrow()
    unsubscribe()
  })
  it('parses only one exact cookie and can safely log out after expiry', async () => {
    const { auth, advance } = fixture()
    const grant = (await auth.login(OWNER, TEST_PASSWORD, TEST_ORIGIN))!
    expect(sessionTokenFromCookie(`other=x; ${AUTH_COOKIE}=${grant.token}`)).toBe(grant.token)
    expect(sessionTokenFromCookie(`${AUTH_COOKIE}=${grant.token}; ${AUTH_COOKIE}=${grant.token}`)).toBeNull()
    expect(sessionTokenFromCookie(`${AUTH_COOKIE}=malformed`)).toBeNull()
    advance(); expect(() => auth.logout(grant.token, TEST_ORIGIN)).not.toThrow()
    expect(auth.resolve(grant.token)).toBeNull()
  })
  it('changes the password and atomically revokes every old session', async () => {
    const { auth } = fixture()
    const first = (await auth.login(OWNER, TEST_PASSWORD, TEST_ORIGIN))!, second = (await auth.login(OWNER, TEST_PASSWORD, TEST_ORIGIN))!
    await auth.changePassword(first.token, TEST_ORIGIN, TEST_PASSWORD, 'new-synthetic-password')
    expect(auth.resolve(first.token)).toBeNull(); expect(auth.resolve(second.token)).toBeNull()
    expect(await auth.login(OWNER, TEST_PASSWORD, TEST_ORIGIN)).toBeNull()
    expect((await auth.login(OWNER, 'new-synthetic-password', TEST_ORIGIN))?.principal.accountId).toBe(42)
  })
  it('leaves password and sessions unchanged on bad current password or invalid Origin', async () => {
    const { auth } = fixture()
    const grant = (await auth.login(OWNER, TEST_PASSWORD, TEST_ORIGIN))!
    await expect(auth.changePassword(grant.token, TEST_ORIGIN, 'wrong', 'new-synthetic-password')).rejects.toThrow('INVALID_CURRENT_PASSWORD')
    await expect(auth.changePassword(grant.token, 'https://evil.test', TEST_PASSWORD, 'new-synthetic-password')).rejects.toThrow('ORIGIN_NOT_ALLOWED')
    expect(auth.resolve(grant.token)?.accountId).toBe(42)
  })
  it('rejects arbitrary tokens and prevents a player revoking someone else', async () => {
    const { auth } = fixture()
    expect(auth.resolve('malformed')).toBeNull(); expect(auth.resolve('0'.repeat(64))).toBeNull()
    const player = await auth.register({ kind: 'username', value: 'ordinary-player' }, 'synthetic-password', TEST_ORIGIN)
    expect(player.principal.role).toBe('player')
    expect(() => auth.revokeAccountSessions(42, player.token, TEST_ORIGIN)).toThrow('FORBIDDEN')
    auth.revokeAccountSessions(player.principal.accountId, player.token, TEST_ORIGIN)
    expect(auth.resolve(player.token)).toBeNull()
  })
  it('rolls back new account and alias if session insertion fails', async () => {
    const { db, auth } = fixture()
    db.exec("CREATE TRIGGER fail_test_session BEFORE INSERT ON auth_sessions BEGIN SELECT RAISE(ABORT,'synthetic session failure'); END;")
    await expect(auth.register({ kind: 'username', value: 'rollback-player' }, 'synthetic-password', TEST_ORIGIN)).rejects.toThrow('synthetic session failure')
    expect(db.prepare('SELECT COUNT(*) count FROM accounts').get()).toEqual({ count: 1 })
    expect(db.prepare("SELECT * FROM account_login_aliases WHERE normalized='rollback-player'").get()).toBeUndefined()
  })
})

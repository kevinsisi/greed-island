import express from 'express'
import { createServer, type Server } from 'node:http'
import type Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'
import { AuthService, AUTH_COOKIE } from './authService.js'
import { createUnifiedAuthRouter, EXPECTED_ACCOUNT_HEADER } from './authRouter.js'
import { migrateIdentitySchema } from './schema.js'
import { legacyTestDatabase, TEST_PASSWORD } from './schema.testSupport.js'

const ORIGIN = 'http://127.0.0.1:4178'
const resources: Array<{ server: Server; db: Database.Database }> = []
afterEach(async () => {
  for (const { server, db } of resources.splice(0)) {
    server.closeAllConnections()
    await new Promise<void>(resolve => { server.close(() => resolve()) })
    db.close()
  }
})
async function fixture(attemptsPerWindow = 100) {
  const db = legacyTestDatabase(); migrateIdentitySchema(db)
  let now = 1000
  const auth = new AuthService(db, { allowedOrigins: [ORIGIN], secureCookies: false, sessionMs: 1000, now: () => now })
  const app = express(); app.use('/api', createUnifiedAuthRouter({ auth, attemptsPerWindow, now: () => now }))
  const server = createServer(app); resources.push({ server, db })
  await new Promise<void>(resolve => { server.listen(0, '127.0.0.1', resolve) })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Missing test server address')
  const base = `http://127.0.0.1:${address.port}`
  async function request(path: string, body?: unknown, cookie?: string, origin: string | null = ORIGIN, extra: Record<string, string> = {}) {
    const headers: Record<string, string> = { ...extra }
    if (origin !== null) headers.Origin = origin
    if (body !== undefined) headers['Content-Type'] = 'application/json'
    if (cookie) headers.Cookie = cookie
    return fetch(base + path, { method: body === undefined ? 'GET' : 'POST', headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) })
  }
  return { db, auth, request, base, advance: () => { now += 1000 } }
}
function cookieFrom(response: Response): string {
  const header = response.headers.get('set-cookie')
  if (!header) throw new Error('Missing session cookie')
  return header.split(';')[0]!
}

describe('one cookie auth HTTP adapter', () => {
  it('registers a username-only player with profile/accountId and no JSON token', async () => {
    const { request } = await fixture()
    const response = await request('/api/auth/register', { username: 'New_Player', password: 'synthetic-password' })
    expect(response.status).toBe(201)
    const body = await response.json() as { profile: { accountId: number; username: string; email: null; role: string } }
    expect(Object.keys(body)).toEqual(['profile'])
    expect(body.profile).toMatchObject({ accountId: 43, username: 'New_Player', email: null, role: 'player' })
    expect(response.headers.get('cache-control')).toBe('no-store')
    const cookie = response.headers.get('set-cookie')!
    expect(cookie).toContain(`${AUTH_COOKIE}=`); expect(cookie).toContain('HttpOnly'); expect(cookie).toContain('SameSite=Strict'); expect(cookie).toContain('Path=/')
    expect(cookie).not.toContain('Secure')
    expect(JSON.stringify(body)).not.toContain(cookieFrom(response).split('=')[1]!)
    const me = await request('/api/auth/me', undefined, cookieFrom(response))
    expect((await me.json() as { profile: unknown }).profile).toEqual(body.profile)
  })
  it('logs existing email accounts into the same service with preserved ID/profile', async () => {
    const { request } = await fixture()
    const login = await request('/api/auth/login', { identifier: 'OWNER@example.test', password: TEST_PASSWORD })
    expect(login.status).toBe(200)
    expect((await login.json() as { profile: unknown }).profile).toMatchObject({ accountId: 42, email: 'owner@example.test', displayName: 'Original Name', role: 'admin' })
    const profile = await request('/api/profile', undefined, cookieFrom(login), ORIGIN, { [EXPECTED_ACCOUNT_HEADER]: '42' })
    expect(profile.status).toBe(200)
  })
  it('does not accept old bearer credentials or a second MP auth entry', async () => {
    const { request } = await fixture()
    const me = await request('/api/auth/me', undefined, undefined, ORIGIN, { Authorization: 'Bearer synthetic-old-token' })
    expect(me.status).toBe(401)
    expect((await request('/mp-api/login', { username: 'anything', password: 'synthetic-password' })).status).toBe(404)
  })
  it('requires matching account context for private profile reads while me can synchronize a switched cookie', async () => {
    const { request, auth } = await fixture()
    const loginA = await request('/api/auth/login', { identifier: 'owner@example.test', password: TEST_PASSWORD }), cookieA = cookieFrom(loginA)
    const signupB = await request('/api/auth/register', { username: 'Read_Context_B', password: 'second-synthetic-password' }, cookieA)
    const cookieB = cookieFrom(signupB), profileB = (await signupB.json() as { profile: { accountId: number } }).profile
    const stale = await request('/api/profile', undefined, cookieB, null, { [EXPECTED_ACCOUNT_HEADER]: '42' })
    expect(stale.status).toBe(409); expect(await stale.json()).toEqual({ error: 'ACCOUNT_CHANGED' })
    expect(stale.headers.get('set-cookie')).toBeNull(); expect(stale.headers.get('cache-control')).toBe('no-store')
    const matched = await request('/api/profile', undefined, cookieB, null, { [EXPECTED_ACCOUNT_HEADER]: String(profileB.accountId) })
    expect(matched.status).toBe(200); expect(await matched.json()).toEqual({ profile: profileB })
    for (const extra of [{}, { [EXPECTED_ACCOUNT_HEADER]: '42' }]) {
      const me = await request('/api/auth/me', undefined, cookieB, null, extra)
      expect(me.status).toBe(200); expect(await me.json()).toEqual({ profile: profileB })
    }
    expect(auth.resolve(cookieB.slice(AUTH_COOKIE.length + 1))?.accountId).toBe(profileB.accountId)
  })
  it('rejects missing/invalid private-read assertions without using the header as authentication', async () => {
    const { request } = await fixture()
    const login = await request('/api/auth/login', { identifier: 'owner@example.test', password: TEST_PASSWORD }), cookie = cookieFrom(login)
    for (const header of [undefined, '', '0', '-42', '042', '42,43', '42.0', '9007199254740992']) {
      const response = await request('/api/profile', undefined, cookie, null, header === undefined ? {} : { [EXPECTED_ACCOUNT_HEADER]: header })
      expect(response.status).toBe(400); expect(await response.json()).toEqual({ error: 'ACCOUNT_CONTEXT_REQUIRED' })
    }
    const unauthenticated = await request('/api/profile', undefined, undefined, null, { [EXPECTED_ACCOUNT_HEADER]: '42' })
    expect(unauthenticated.status).toBe(401); expect(await unauthenticated.json()).toEqual({ error: 'UNAUTHORIZED' })
    for (const validSafeId of ['4294967296', '9007199254740991']) {
      const response = await request('/api/profile', undefined, cookie, null, { [EXPECTED_ACCOUNT_HEADER]: validSafeId })
      expect(response.status).toBe(409); expect(await response.json()).toEqual({ error: 'ACCOUNT_CHANGED' })
    }
  })
  it('supports a matching private-read account ID above the 32-bit range', async () => {
    const { request, db } = await fixture()
    db.exec("UPDATE sqlite_sequence SET seq=4294967295 WHERE name='accounts'")
    const signup = await request('/api/auth/register', { username: 'Large_Id_Player', password: 'synthetic-password' })
    expect(signup.status).toBe(201)
    const profile = (await signup.json() as { profile: { accountId: number } }).profile
    expect(profile.accountId).toBe(4294967296)
    const response = await request('/api/profile', undefined, cookieFrom(signup), null, { [EXPECTED_ACCOUNT_HEADER]: String(profile.accountId) })
    expect(response.status).toBe(200); expect(await response.json()).toEqual({ profile })
  })
  it.each([null, 'https://evil.test', ORIGIN + '.evil.test', ORIGIN + '/'])('rejects nonexact Origin before account creation and hides recovery tokens', async origin => {
    const { request, db } = await fixture()
    const signup = await request('/api/auth/register', { username: 'Rejected_User', password: 'synthetic-password' }, undefined, origin)
    expect(signup.status).toBe(403)
    expect(db.prepare('SELECT COUNT(*) count FROM accounts').get()).toEqual({ count: 1 })
    const recovery = await request('/api/auth/forgot-password', { email: 'owner@example.test' })
    expect(recovery.status).toBe(403)
    expect(await recovery.json()).toEqual({ error: 'ADMIN_RECOVERY_REQUIRED' })
  })
  it('rejects extra role/target fields and invalid body types without partial signup', async () => {
    const { request, db } = await fixture()
    for (const body of [[], { username: 'Invalid_User', password: 'synthetic-password', role: 'admin' }, { username: 7, password: 'synthetic-password' }, { username: 'x', password: 'short' }]) {
      expect((await request('/api/auth/register', body)).status).toBe(400)
    }
    expect(db.prepare('SELECT COUNT(*) count FROM accounts').get()).toEqual({ count: 1 })
  })
  it('maps duplicate aliases/bad credentials and bounds the login/signup budget without forwarded-address trust', async () => {
    const { request } = await fixture(2)
    const first = await request('/api/auth/login', { identifier: 'owner@example.test', password: 'wrong' }, undefined, ORIGIN, { 'X-Forwarded-For': '1.2.3.4' })
    expect(first.status).toBe(401)
    const second = await request('/api/auth/login', { identifier: 'owner@example.test', password: 'wrong' }, undefined, ORIGIN, { 'X-Forwarded-For': '5.6.7.8' })
    expect(second.status).toBe(401)
    const third = await request('/api/auth/register', { username: 'Budget_User', password: 'synthetic-password' }, undefined, ORIGIN, { 'X-Forwarded-For': '9.10.11.12' })
    expect(third.status).toBe(429)
    const separate = await fixture()
    await separate.request('/api/auth/register', { username: 'Taken_User', password: 'synthetic-password' })
    expect((await separate.request('/api/auth/register', { username: 'taken_user', password: 'synthetic-password' })).status).toBe(409)
  })
  it('revokes and clears the root-path cookie on repeat logout', async () => {
    const { request } = await fixture()
    const login = await request('/api/auth/login', { identifier: 'owner@example.test', password: TEST_PASSWORD }), cookie = cookieFrom(login)
    const logout = await request('/api/auth/logout', {}, cookie, ORIGIN, { [EXPECTED_ACCOUNT_HEADER]: '42' })
    expect(await logout.json()).toEqual({ ok: true })
    expect(logout.headers.get('set-cookie')).toContain('Path=/')
    expect((await request('/api/auth/me', undefined, cookie)).status).toBe(401)
    expect((await request('/api/auth/logout', {}, cookie, ORIGIN, { [EXPECTED_ACCOUNT_HEADER]: '42' })).status).toBe(200)
  })
  it('closes expired/disabled sessions and revokes all sessions after password change', async () => {
    const { request, db, advance } = await fixture()
    let login = await request('/api/auth/login', { identifier: 'owner@example.test', password: TEST_PASSWORD }), cookie = cookieFrom(login)
    db.exec("UPDATE accounts SET status='disabled' WHERE id=42")
    expect((await request('/api/auth/me', undefined, cookie)).status).toBe(401)
    db.exec("UPDATE accounts SET status='active' WHERE id=42")
    const changed = await request('/api/profile/password', { currentPassword: TEST_PASSWORD, newPassword: 'changed-synthetic-password' }, cookie, ORIGIN, { [EXPECTED_ACCOUNT_HEADER]: '42' })
    expect(changed.status).toBe(200)
    expect((await request('/api/auth/me', undefined, cookie)).status).toBe(401)
    login = await request('/api/auth/login', { identifier: 'owner@example.test', password: 'changed-synthetic-password' }); cookie = cookieFrom(login)
    advance(); expect((await request('/api/profile', undefined, cookie)).status).toBe(401)
  })
  it('rejects stale A-tab logout/password actions against current B cookie without affecting B', async () => {
    const { request, auth } = await fixture()
    const accountA = await request('/api/auth/login', { identifier: 'owner@example.test', password: TEST_PASSWORD }), cookieA = cookieFrom(accountA)
    const signupB = await request('/api/auth/register', { username: 'Second_Player', password: 'second-synthetic-password' }, cookieA)
    const cookieB = cookieFrom(signupB), profileB = (await signupB.json() as { profile: { accountId: number } }).profile
    const stale = { [EXPECTED_ACCOUNT_HEADER]: '42' }
    const logout = await request('/api/auth/logout', {}, cookieB, ORIGIN, stale)
    expect(logout.status).toBe(409); expect(await logout.json()).toEqual({ error: 'ACCOUNT_CHANGED' })
    expect(logout.headers.get('set-cookie')).toBeNull()
    const change = await request('/api/profile/password', { currentPassword: 'second-synthetic-password', newPassword: 'changed-password-for-B' }, cookieB, ORIGIN, stale)
    expect(change.status).toBe(409)
    expect(auth.resolve(cookieB.slice(AUTH_COOKIE.length + 1))?.accountId).toBe(profileB.accountId)
    expect((await request('/api/auth/login', { identifier: 'Second_Player', password: 'second-synthetic-password' })).status).toBe(200)
  })
  it('requires a valid expected-ID assertion without treating it as authentication', async () => {
    const { request } = await fixture()
    const login = await request('/api/auth/login', { identifier: 'owner@example.test', password: TEST_PASSWORD }), cookie = cookieFrom(login)
    for (const header of ['', '0', '42,43', '42.0', '9007199254740992']) {
      const response = await request('/api/auth/logout', {}, cookie, ORIGIN, { [EXPECTED_ACCOUNT_HEADER]: header })
      expect(response.status).toBe(400)
    }
    expect((await request('/api/profile/password', { currentPassword: TEST_PASSWORD, newPassword: 'new-synthetic-password' }, undefined, ORIGIN, { [EXPECTED_ACCOUNT_HEADER]: '42' })).status).toBe(401)
  })
  it('revokes only the incoming prior cookie on successful switch and leaves it intact on failed login', async () => {
    const { request, auth } = await fixture()
    const first = await request('/api/auth/login', { identifier: 'owner@example.test', password: TEST_PASSWORD }), cookieA = cookieFrom(first)
    const separateA = await request('/api/auth/login', { identifier: 'owner@example.test', password: TEST_PASSWORD }), independentA = cookieFrom(separateA)
    const failed = await request('/api/auth/login', { identifier: 'owner@example.test', password: 'wrong' }, cookieA)
    expect(failed.status).toBe(401)
    expect(auth.resolve(cookieA.slice(AUTH_COOKIE.length + 1))?.accountId).toBe(42)
    const notifications: number[] = []; auth.onRevoked(id => notifications.push(id))
    const switched = await request('/api/auth/register', { username: 'Switch_Player', password: 'second-synthetic-password' }, cookieA)
    expect(switched.status).toBe(201)
    expect(auth.resolve(cookieA.slice(AUTH_COOKIE.length + 1))).toBeNull()
    expect(auth.resolve(independentA.slice(AUTH_COOKIE.length + 1))?.accountId).toBe(42)
    expect(notifications).toEqual([42])
  })
})

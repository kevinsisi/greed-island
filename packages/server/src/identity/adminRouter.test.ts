import express from 'express'
import Database from 'better-sqlite3'
import { createServer, type Server } from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'
import { AuthService, AUTH_COOKIE } from './authService.js'
import { createUnifiedAuthRouter, EXPECTED_ACCOUNT_HEADER } from './authRouter.js'
import { createUnifiedAdminRouter } from './adminRouter.js'
import { migrateIdentitySchema } from './schema.js'

const ORIGIN = 'http://127.0.0.1:4178', ADMIN_PASSWORD = 'synthetic-admin-password', PLAYER_PASSWORD = 'synthetic-player-password'
const resources: Array<{ server: Server; db: Database.Database }> = []
afterEach(async () => { for (const { server, db } of resources.splice(0)) { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); db.close() } })
async function fixture() {
  const db = new Database(':memory:'); db.pragma('foreign_keys=ON'); migrateIdentitySchema(db)
  const auth = new AuthService(db, { allowedOrigins: [ORIGIN], secureCookies: false })
  const admin = await auth.accounts.createPlayer({ kind: 'username', value: 'owner-admin' }, ADMIN_PASSWORD)
  db.prepare("UPDATE accounts SET role='admin' WHERE id=?").run(admin.accountId)
  const player = await auth.accounts.createPlayer({ kind: 'username', value: 'ordinary-player' }, PLAYER_PASSWORD)
  const grant = (await auth.login({ kind: 'username', value: 'owner-admin' }, ADMIN_PASSWORD, ORIGIN))!
  const cookie = `${AUTH_COOKIE}=${grant.token}`
  const app = express(); app.use('/api', createUnifiedAuthRouter({ auth })); app.use('/api', createUnifiedAdminRouter({ auth }))
  const server = createServer(app); resources.push({ server, db }); await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('Missing fixture port')
  const base = `http://127.0.0.1:${address.port}`
  const request = (path: string, method = 'GET', body?: unknown, selectedCookie: string | null = cookie, expected: number | string | null = admin.accountId, origin = ORIGIN) => fetch(base + path, {
    method, headers: { Origin: origin, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(selectedCookie ? { Cookie: selectedCookie } : {}), ...(expected === null ? {} : { [EXPECTED_ACCOUNT_HEADER]: String(expected) }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  return { db, auth, admin, player, cookie, request }
}

describe('unified cookie administrator and recovery HTTP boundary', () => {
  it('retains guarded admin listing and last-active-admin protection', async () => {
    const { request, admin } = await fixture()
    const users = await request('/api/admin/users'); expect(users.status).toBe(200)
    expect((await users.json() as { users: unknown[] }).users).toHaveLength(2)
    const demote = await request(`/api/admin/users/${admin.accountId}/role`, 'PUT', { role: 'player' })
    expect(demote.status).toBe(409); expect(await demote.json()).toEqual({ error: 'LAST_ADMIN' })
    const disable = await request(`/api/admin/users/${admin.accountId}/status`, 'PUT', { status: 'disabled' })
    expect(disable.status).toBe(409)
  })
  it('rejects stale A-tab admin reads against B cookie before disclosing users', async () => {
    const { request, auth, admin, player } = await fixture()
    const grantB = (await auth.login({ kind: 'username', value: 'ordinary-player' }, PLAYER_PASSWORD, ORIGIN))!
    const cookieB = `${AUTH_COOKIE}=${grantB.token}`
    const stale = await request('/api/admin/users', 'GET', undefined, cookieB, admin.accountId)
    expect(stale.status).toBe(409); expect(await stale.json()).toEqual({ error: 'ACCOUNT_CHANGED' })
    expect(stale.headers.get('set-cookie')).toBeNull(); expect(stale.headers.get('cache-control')).toBe('no-store')
    const matchedPlayer = await request('/api/admin/users', 'GET', undefined, cookieB, player.accountId)
    expect(matchedPlayer.status).toBe(403); expect(await matchedPlayer.json()).toEqual({ error: 'FORBIDDEN' })
    expect(auth.resolve(grantB.token)?.accountId).toBe(player.accountId)
    expect((await request('/api/admin/users')).status).toBe(200)
  })
  it('requires a positive safe admin-read assertion and never authenticates from the header', async () => {
    const { request, admin } = await fixture()
    for (const expected of [null, '', '0', '-1', '01', '1,2', '1.0', '9007199254740992']) {
      const response = await request('/api/admin/users', 'GET', undefined, undefined, expected)
      expect(response.status).toBe(400); expect(await response.json()).toEqual({ error: 'ACCOUNT_CONTEXT_REQUIRED' })
    }
    const unauthenticated = await request('/api/admin/users', 'GET', undefined, null, admin.accountId)
    expect(unauthenticated.status).toBe(401); expect(await unauthenticated.json()).toEqual({ error: 'UNAUTHORIZED' })
    for (const validSafeId of ['4294967296', '9007199254740991']) {
      const response = await request('/api/admin/users', 'GET', undefined, undefined, validSafeId)
      expect(response.status).toBe(409); expect(await response.json()).toEqual({ error: 'ACCOUNT_CHANGED' })
    }
  })
  it('requires cookie, current admin, Origin and expected actor before proof issuance', async () => {
    const { request, player, db } = await fixture()
    const path = `/api/admin/users/${player.accountId}/reset-password`
    expect((await request(path, 'POST', {}, null)).status).toBe(401)
    expect((await request(path, 'POST', {}, undefined, player.accountId)).status).toBe(409)
    expect((await request(path, 'POST', {}, undefined, null)).status).toBe(400)
    expect((await request(path, 'POST', {}, undefined, undefined, 'https://evil.test')).status).toBe(403)
    expect(db.prepare('SELECT COUNT(*) count FROM auth_password_resets').get()).toEqual({ count: 0 })
  })
  it('keeps self profile editing on the same cookie and expected-ID guard', async () => {
    const { request, admin } = await fixture()
    const updated = await request('/api/profile', 'PATCH', { nickname: '  New Owner  ', avatar: 'moon' })
    expect(updated.status).toBe(200)
    expect((await updated.json() as { profile: unknown }).profile).toMatchObject({ accountId: admin.accountId, nickname: 'New Owner', avatar: 'moon' })
    expect((await request('/api/profile', 'PATCH', { nickname: 'wrong-target' }, undefined, admin.accountId + 1)).status).toBe(409)
    expect((await request('/api/profile', 'PATCH', { email: 'invented@example.test' })).status).toBe(400)
  })
  it('returns reset proof only to admin and redeems into the same profile/cookie without session JSON tokens', async () => {
    const { request, player } = await fixture()
    const issued = await request(`/api/admin/users/${player.accountId}/reset-password`, 'POST', {})
    expect(issued.status).toBe(200)
    const reset = await issued.json() as { token: string; expiresAt: number; resetPath: string; target: { accountId: number } }
    expect(reset.token).toMatch(/^[a-f0-9]{64}$/); expect(reset.target.accountId).toBe(player.accountId)
    expect(reset.resetPath).toBe('/reset-password'); expect(reset.resetPath).not.toContain(reset.token)
    const redeemed = await request('/api/auth/reset-password', 'POST', { token: reset.token, password: 'new-synthetic-password' }, null, null)
    expect(redeemed.status).toBe(200)
    const result = await redeemed.json() as { profile: { accountId: number; email: null } }
    expect(Object.keys(result)).toEqual(['profile']); expect(result.profile).toMatchObject({ accountId: player.accountId, email: null })
    expect(redeemed.headers.get('set-cookie')).toContain(`${AUTH_COOKIE}=`)
    expect((await request('/api/auth/reset-password', 'POST', { token: reset.token, password: 'another-new-password' }, null, null)).status).toBe(400)
  })
  it('keeps anonymous issuance closed and rejects unknown proof without disclosing an account', async () => {
    const { request, player } = await fixture()
    const forgot = await request('/api/auth/forgot-password', 'POST', { email: 'owner-admin@example.test' }, null, null)
    expect(forgot.status).toBe(403); expect(await forgot.json()).toEqual({ error: 'ADMIN_RECOVERY_REQUIRED' })
    const unknown = await request('/api/auth/reset-password', 'POST', { token: '0'.repeat(64), password: 'new-synthetic-password' }, null, null)
    expect(unknown.status).toBe(400); expect(await unknown.json()).toEqual({ error: 'INVALID_RESET' })
    const invalidTarget = await request(`/api/admin/users/${player.accountId}junk/role`, 'PUT', { role: 'admin' })
    expect(invalidTarget.status).toBe(400)
  })
  it('blocks a player from issuing recovery and a stale admin after demotion', async () => {
    const { auth, request, admin, player } = await fixture()
    const grant = (await auth.login({ kind: 'username', value: 'ordinary-player' }, PLAYER_PASSWORD, ORIGIN))!
    const cookie = `${AUTH_COOKIE}=${grant.token}`
    expect((await request(`/api/admin/users/${player.accountId}/reset-password`, 'POST', {}, cookie, player.accountId)).status).toBe(403)
    auth.setAccountRole((await auth.login({ kind: 'username', value: 'owner-admin' }, ADMIN_PASSWORD, ORIGIN))!.token, ORIGIN, player.accountId, 'admin')
    const newAdmin = (await auth.login({ kind: 'username', value: 'ordinary-player' }, PLAYER_PASSWORD, ORIGIN))!
    auth.setAccountRole(newAdmin.token, ORIGIN, admin.accountId, 'player')
    expect((await request('/api/admin/users')).status).toBe(401)
  })
})

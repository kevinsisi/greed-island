import express from 'express'
import { once } from 'node:events'
import type { Server } from 'node:http'
import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'
import { AuthService, AuthError } from '../identity/authService.js'
import { migrateIdentitySchema } from '../identity/schema.js'
import { createHttpAuthorization } from './authorization.js'

const origin = 'http://127.0.0.1:4178'
const databases: Database.Database[] = [], listeners: Server[] = []
afterEach(async () => {
  for (const server of listeners.splice(0)) await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections() })
  for (const db of databases.splice(0)) if (db.open) db.close()
})
async function setup() {
  const db = new Database(':memory:'); databases.push(db); migrateIdentitySchema(db)
  const auth = new AuthService(db, { allowedOrigins: [origin], secureCookies: false })
  const one = await auth.register({ kind: 'username', value: 'real-username-one' }, 'synthetic-test-password', origin)
  const two = await auth.register({ kind: 'username', value: 'real-username-two' }, 'synthetic-test-password', origin)
  const authorization = createHttpAuthorization(auth), app = express()
  app.use((req, res, next) => {
    // A stale upstream decoration is never an authentication authority.
    req.auth = { sub: 999, email: 'forged@example.test', role: 'admin', displayName: 'Forged' }
    res.locals.canonicalClaims = { sub: 999, role: 'admin' }
    next()
  })
  app.get('/self', authorization.session, (_req, res) => res.json(res.locals.canonicalClaims))
  app.post('/write', authorization.forRequest, (_req, res) => res.json(res.locals.canonicalClaims))
  app.get('/admin', authorization.role('admin'), (_req, res) => res.json({ ok: true }))
  app.get('/optional', authorization.optional, (_req, res) => res.json({ principal: res.locals.canonicalClaims ?? null }))
  app.get('/request', authorization.session, (req, res) => res.json(req.auth))
  const server = app.listen(0, '127.0.0.1'); listeners.push(server); await once(server, 'listening')
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('Missing listener')
  return { db, auth, authorization, one, two, base: 'http://127.0.0.1:' + address.port }
}
describe('shared cookie-only legacy authorization seam', () => {
  it('rejects bearer-only and forged request authority, preserving nullable real email', async () => {
    const { base, one } = await setup()
    expect((await fetch(base + '/self', { headers: { Authorization: 'Bearer invented-token' } })).status).toBe(401)
    const profile = await (await fetch(base + '/self', { headers: { Cookie: 'greed_session=' + one.token, 'X-Greed-Account-Id': String(one.principal.accountId) } })).json()
    expect(profile).toEqual({ sub: one.principal.accountId, email: null, role: 'player', displayName: 'real-username-one' })
    expect(await (await fetch(base + '/optional')).json()).toEqual({ principal: null })
    expect(await (await fetch(base + '/request', { headers: { Cookie: 'greed_session=' + one.token, 'X-Greed-Account-Id': String(one.principal.accountId) } })).json()).toEqual(profile)
  })
  it('protects all mutators with Origin and expected cookie actor, never body authority', async () => {
    const { base, one, two } = await setup()
    const headers = { Cookie: 'greed_session=' + one.token, Origin: origin, 'X-Greed-Account-Id': String(one.principal.accountId), 'Content-Type': 'application/json' }
    expect((await fetch(base + '/write', { method: 'POST', headers: { Cookie: headers.Cookie } })).status).toBe(403)
    expect((await fetch(base + '/write', { method: 'POST', headers: { Cookie: headers.Cookie, Origin: origin } })).status).toBe(400)
    expect((await fetch(base + '/write', { method: 'POST', headers: { ...headers, 'X-Greed-Account-Id': String(two.principal.accountId) } })).status).toBe(409)
    const response = await fetch(base + '/write', { method: 'POST', headers, body: JSON.stringify({ accountId: two.principal.accountId }) })
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ sub: one.principal.accountId })
  })
  it('rereads current role/status and reauthorizes the same session at async commit', async () => {
    const { db, auth, base, authorization, one } = await setup()
    const headers = { Cookie: 'greed_session=' + one.token, 'X-Greed-Account-Id': String(one.principal.accountId) }
    expect((await fetch(base + '/admin', { headers })).status).toBe(403)
    db.prepare("UPDATE accounts SET role='admin' WHERE id=?").run(one.principal.accountId)
    expect((await fetch(base + '/admin', { headers })).status).toBe(200)
    db.prepare("UPDATE accounts SET role='player' WHERE id=?").run(one.principal.accountId)
    expect((await fetch(base + '/admin', { headers })).status).toBe(403)
    auth.logout(one.token, origin)
    const req = { headers: { cookie: headers.Cookie }, get: (name: string) => name.toLowerCase() === 'origin' ? origin : name.toLowerCase() === 'x-greed-account-id' ? String(one.principal.accountId) : undefined }
    expect(() => authorization.reauthorizeMutation(req as never)).toThrow(AuthError)
    expect((await fetch(base + '/self', { headers })).status).toBe(401)
  })
  it('rejects a stale A private read after cookie replacement by B', async () => {
    const { base, one, two } = await setup()
    const response = await fetch(base + '/self', { headers: { Cookie: 'greed_session=' + two.token, 'X-Greed-Account-Id': String(one.principal.accountId) } })
    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: 'ACCOUNT_CHANGED' })
    expect((await fetch(base + '/self', { headers: { Cookie: 'greed_session=' + two.token } })).status).toBe(400)
  })
})

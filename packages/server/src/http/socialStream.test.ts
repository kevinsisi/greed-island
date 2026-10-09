import Database from 'better-sqlite3'
import express from 'express'
import { once } from 'node:events'
import type { Server } from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'
import { AuthService } from '../identity/authService.js'
import { migrateIdentitySchema } from '../identity/schema.js'
import { createHttpAuthorization } from './authorization.js'
import { SocialBus } from './socialBus.js'
import { createSocialSseRouter, type ManagedSocialSseRouter } from './socialStream.js'

const origin = 'http://127.0.0.1:4178'
const resources: Array<{ db: Database.Database; server: Server; router: ManagedSocialSseRouter }> = []
afterEach(async () => {
  for (const { db, server, router } of resources.splice(0)) {
    router.closeStreams()
    await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections() })
    db.close()
  }
})
async function setup() {
  const db = new Database(':memory:'); migrateIdentitySchema(db)
  let now = Date.now()
  const auth = new AuthService(db, { allowedOrigins: [origin], secureCookies: false, now: () => now })
  const one = await auth.register({ kind: 'username', value: 'stream-user-one' }, 'synthetic-stream-password', origin)
  const two = await auth.register({ kind: 'username', value: 'stream-user-two' }, 'synthetic-stream-password', origin)
  const bus = new SocialBus()
  const router = createSocialSseRouter({ bus, authConfig: createHttpAuthorization(auth), heartbeatMs: 20 })
  const app = express(); app.use('/api', router)
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening')
  resources.push({ db, server, router })
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('Missing socket')
  const base = `http://127.0.0.1:${address.port}/api/social/stream`
  return { db, auth, bus, one, two, router, base, advance: (ms: number) => { now += ms } }
}
async function until(reader: ReadableStreamDefaultReader<Uint8Array>, predicate: (text: string) => boolean) {
  let text = ''
  const deadline = Date.now() + 3000
  while (!predicate(text)) {
    if (Date.now() > deadline) throw new Error('Stream assertion timed out')
    const chunk = await Promise.race([reader.read(), new Promise<never>((_resolve, reject) => setTimeout(() => reject(new Error('Stream stalled')), 3000))])
    if (chunk.done) throw new Error('Stream ended before expected frame: ' + text)
    text += new TextDecoder().decode(chunk.value)
  }
  return text
}
describe('private Social stream single-cookie contract', () => {
  it('rejects bearer/query credentials and missing, malformed or stale account assertions', async () => {
    const { base, one, two } = await setup()
    expect((await fetch(base + '?access_token=' + one.principal.accountId)).status).toBe(401)
    expect((await fetch(base, { headers: { Authorization: 'Bearer ' + one.token } })).status).toBe(401)
    const headers = { Cookie: 'greed_session=' + one.token }
    expect((await fetch(base, { headers })).status).toBe(400)
    expect((await fetch(base + '?expectedAccountId=01', { headers })).status).toBe(400)
    const stale = await fetch(base + '?expectedAccountId=' + two.principal.accountId, { headers })
    expect(stale.status).toBe(409); expect(await stale.json()).toEqual({ error: 'ACCOUNT_CHANGED' })
    expect((await fetch(base + '?expectedAccountId=' + one.principal.accountId, { headers: { ...headers, Origin: 'https://evil.example' } })).status).toBe(403)
  })
  it('delivers only the cookie owner hints and immediately invalidates only the revoked session', async () => {
    const { base, auth, bus, one, two } = await setup()
    const otherSession = await auth.login({ kind: 'username', value: 'stream-user-one' }, 'synthetic-stream-password', origin)
    if (!otherSession) throw new Error('Synthetic login failed')
    const open = async (token: string) => {
      const response = await fetch(base + '?expectedAccountId=' + one.principal.accountId, { headers: { Cookie: 'greed_session=' + token } })
      expect(response.status).toBe(200)
      const reader = response.body!.getReader(); await until(reader, text => text.includes('event: hello'))
      return reader
    }
    const first = await open(one.token), second = await open(otherSession.token)
    bus.publish({ type: 'message.new', to: two.principal.accountId, from: one.principal.accountId, messageId: 1, preview: 'other-account-private', occurredAt: new Date().toISOString() })
    bus.publish({ type: 'message.new', to: one.principal.accountId, from: two.principal.accountId, messageId: 2, preview: 'owner-private', occurredAt: new Date().toISOString() })
    const received = await until(first, text => text.includes('owner-private'))
    expect(received).not.toContain('other-account-private')
    await until(second, text => text.includes('owner-private'))
    auth.logout(one.token, origin)
    expect(await until(first, text => text.includes('event: session.invalidated'))).toContain('UNAUTHORIZED')
    expect((await first.read()).done).toBe(true)
    bus.publish({ type: 'friend.request', to: one.principal.accountId, from: two.principal.accountId, requestId: 3, occurredAt: new Date().toISOString() })
    expect(await until(second, text => text.includes('event: friend.request'))).not.toContain('session.invalidated')
    await second.cancel()
  })
  it('closes on current role/status change or expiry without waiting for another private event', async () => {
    const { base, auth, db, bus, one, two, advance } = await setup()
    const open = async (id: number, token: string) => {
      const response = await fetch(base + '?expectedAccountId=' + id, { headers: { Cookie: 'greed_session=' + token } })
      const reader = response.body!.getReader(); await until(reader, text => text.includes('event: hello')); return reader
    }
    const role = await open(one.principal.accountId, one.token)
    db.prepare("UPDATE accounts SET role='admin' WHERE id=?").run(one.principal.accountId)
    await until(role, text => text.includes('session.invalidated')); expect((await role.read()).done).toBe(true)
    const disabled = await open(two.principal.accountId, two.token)
    db.prepare("UPDATE accounts SET status='disabled' WHERE id=?").run(two.principal.accountId)
    await until(disabled, text => text.includes('session.invalidated')); expect((await disabled.read()).done).toBe(true)
    const third = await auth.register({ kind: 'username', value: 'stream-user-three' }, 'synthetic-stream-password', origin)
    const expired = await open(third.principal.accountId, third.token)
    advance(13 * 60 * 60 * 1000)
    await until(expired, text => text.includes('session.invalidated')); expect((await expired.read()).done).toBe(true)
    expect(bus.hasSubscribers(one.principal.accountId)).toBe(false)
    expect(bus.hasSubscribers(two.principal.accountId)).toBe(false)
    expect(bus.hasSubscribers(third.principal.accountId)).toBe(false)
  })
  it('bounds slow-client buffering and idempotently closes server-owned subscriptions', async () => {
    const { base, bus, router, one, two } = await setup()
    const response = await fetch(base + '?expectedAccountId=' + one.principal.accountId, { headers: { Cookie: 'greed_session=' + one.token } })
    const reader = response.body!.getReader(); await until(reader, text => text.includes('event: hello'))
    // Publish in one synchronous turn without reading. write(false) must end
    // the subscription rather than queueing private hints indefinitely.
    for (let id = 0; id < 3000; id++) bus.publish({ type: 'message.new', to: one.principal.accountId, from: two.principal.accountId, messageId: id, preview: 'x'.repeat(80), occurredAt: new Date().toISOString() })
    expect(bus.hasSubscribers(one.principal.accountId)).toBe(false)
    await reader.cancel()
    router.closeStreams(); router.closeStreams()
    expect((await fetch(base + '?expectedAccountId=' + one.principal.accountId, { headers: { Cookie: 'greed_session=' + one.token } })).status).toBe(503)
  })
})

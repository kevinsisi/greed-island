import Database from 'better-sqlite3'
import express from 'express'
import { once } from 'node:events'
import type { Server } from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'
import { AuthService } from '../identity/authService.js'
import { migrateIdentitySchema } from '../identity/schema.js'
import { createHttpAuthorization } from './authorization.js'
import { createCanonicalAccountView } from './canonicalAccountView.js'
import { createSocialRouter } from './social.js'
import { SocialBus } from './socialBus.js'
import { SocialStore } from './socialStore.js'
import type { SimulationRuntime } from '../sim/runtime.js'

const origin = 'http://127.0.0.1:4178'
const resources: Array<{ db: Database.Database; server: Server }> = []
afterEach(async () => {
  for (const { db, server } of resources.splice(0)) {
    await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections() }); db.close()
  }
})
async function setup() {
  const db = new Database(':memory:'); migrateIdentitySchema(db)
  const auth = new AuthService(db, { allowedOrigins: [origin], secureCookies: false })
  const one = await auth.register({ kind: 'email', value: 'private-one@example.test' }, 'synthetic-social-password', origin)
  const two = await auth.register({ kind: 'username', value: 'social-two' }, 'synthetic-social-password', origin)
  const three = await auth.register({ kind: 'email', value: 'private-three@example.test' }, 'synthetic-social-password', origin)
  const social = new SocialStore(db), bus = new SocialBus()
  const actors = [one, two, three].map((grant, index) => ({ accountId: grant.principal.accountId,
    tileId: index === 2 ? 't_forest' : 't_dock', x: index, z: index, sequence: index + 1, movementStep: 1 }))
  const runtime = {
    getCurrentTick: () => 100,
    getAdmittedPlayerWorldActors: () => actors.map(actor => ({ ...actor })),
    getPlayerWorldGridPose: (id: number) => actors.some(actor => actor.accountId === id) ? { subCol: id, subRow: 2, subZ: 0 } : null,
  } as unknown as SimulationRuntime
  const app = express(); app.use(express.json({ limit: '4kb' }))
  app.use('/api', createSocialRouter({ runtime, social, accounts: createCanonicalAccountView(db, auth.accounts), bus, authConfig: createHttpAuthorization(auth) }))
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening'); resources.push({ db, server })
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('Missing socket')
  const headers = (grant: typeof one) => ({ Cookie: 'greed_session=' + grant.token, Origin: origin, 'X-Greed-Account-Id': String(grant.principal.accountId), 'Content-Type': 'application/json' })
  return { db, auth, social, bus, actors, one, two, three, headers, base: `http://127.0.0.1:${address.port}/api/social` }
}
describe('same-cookie preserved Social family', () => {
  it('guards every mounted REST route against anonymous, stale-context and revoked sessions', async () => {
    const { base, auth, one, two, headers } = await setup()
    const routes = [
      ['POST', '/friend-request/1'], ['POST', '/friend-accept/1'], ['POST', '/friend-reject/1'],
      ['GET', '/friends'], ['GET', '/friend-requests'], ['DELETE', '/friends/1'],
      ['POST', '/message/1'], ['GET', '/messages/1'], ['POST', '/messages/1/read'],
      ['GET', '/conversations'], ['POST', '/presence'], ['GET', '/nearby'],
      ['POST', '/alliance/create'], ['POST', '/alliance/invite/1'], ['POST', '/alliance/leave'], ['GET', '/alliance'],
    ] as const
    for (const [method, route] of routes) {
      const options = { method, ...(method === 'GET' ? {} : { body: '{}' }) }
      expect((await fetch(base + route, { ...options, headers: { Origin: origin, 'Content-Type': 'application/json' } })).status, method + ' ' + route).toBe(401)
      expect((await fetch(base + route, { ...options, headers: { ...headers(two), 'X-Greed-Account-Id': String(one.principal.accountId) } })).status, method + ' ' + route).toBe(409)
    }
    auth.logout(one.token, origin)
    for (const [method, route] of routes) {
      expect((await fetch(base + route, { method, headers: headers(one), ...(method === 'GET' ? {} : { body: '{}' }) })).status, method + ' ' + route).toBe(401)
    }
  })
  it('keeps inbox reads private and side-effect-free; mark-read is an actor-guarded POST', async () => {
    const { base, db, social, one, two, three, headers } = await setup()
    const own = social.insertMessage(two.principal.accountId, one.principal.accountId, 'hello owner')
    social.insertMessage(two.principal.accountId, three.principal.accountId, 'third-party secret')
    expect((await fetch(base + '/messages/' + two.principal.accountId)).status).toBe(401)
    const read = await fetch(base + '/messages/' + two.principal.accountId, { headers: headers(one) })
    expect(read.status).toBe(200)
    const payload = await read.json() as { peer: unknown; messages: Array<{ content: string; readAt: string | null }> }
    expect(payload.peer).toEqual({ id: two.principal.accountId, displayName: 'social-two' })
    expect(payload.messages).toHaveLength(1); expect(payload.messages[0]).toMatchObject({ content: 'hello owner', readAt: null })
    expect(social.listMessagesBetween(one.principal.accountId, two.principal.accountId, 50)[0]!.read_at).toBeNull()
    const wrong = await fetch(base + '/messages/' + two.principal.accountId + '/read', { method: 'POST', headers: { ...headers(one), 'X-Greed-Account-Id': String(three.principal.accountId) } })
    expect(wrong.status).toBe(409)
    const marked = await fetch(base + '/messages/' + two.principal.accountId + '/read', { method: 'POST', headers: headers(one) })
    expect(await marked.json()).toEqual({ marked: 1 })
    expect(social.listMessagesBetween(one.principal.accountId, two.principal.accountId, 50)[0]!.id).toBe(own.id)
    expect(social.listMessagesBetween(one.principal.accountId, two.principal.accountId, 50)[0]!.read_at).not.toBeNull()
    expect(social.listMessagesBetween(two.principal.accountId, three.principal.accountId, 50)[0]!.read_at).toBeNull()
    db.prepare("UPDATE accounts SET status='disabled' WHERE id=?").run(two.principal.accountId)
    const archived = await (await fetch(base + '/messages/' + two.principal.accountId, { headers: headers(one) })).json() as { peer: unknown; messages: unknown[] }
    expect(archived.peer).toEqual({ id: two.principal.accountId, displayName: 'Unavailable account' })
    expect(archived.messages).toHaveLength(1)
    expect((await fetch(base + '/message/' + two.principal.accountId, { method: 'POST', headers: headers(one), body: JSON.stringify({ content: 'disabled target' }) })).status).toBe(404)
  })
  it('derives nearby/presence from admitted canonical actors, ignoring supplied position', async () => {
    const { base, social, actors, one, two, three, headers } = await setup()
    const response = await fetch(base + '/presence', { method: 'POST', headers: headers(one), body: JSON.stringify({ accountId: three.principal.accountId, tileId: 'hub', x: 999, y: 999, z: 16 }) })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ location: { userId: one.principal.accountId, tileId: 't_dock', x: one.principal.accountId, y: 2, z: 0, lastSeenTick: 100 } })
    expect(social.getPlayerLocation(one.principal.accountId)).toBeNull()
    const nearby = await fetch(base + '/nearby?tileId=t_dock', { headers: headers(one) })
    expect(await nearby.json()).toEqual({ tileId: 't_dock', players: [{ id: two.principal.accountId, displayName: 'social-two', tileId: 't_dock', x: two.principal.accountId, y: 2, z: 0, lastSeenTick: 100 }] })
    expect((await fetch(base + '/nearby?tileId=t_forest', { headers: headers(one) })).status).toBe(409)
    actors.splice(0, 1)
    expect((await fetch(base + '/presence', { method: 'POST', headers: headers(one), body: '{}' })).status).toBe(409)
  })
  it('enforces target ownership, stale read context, revocation and peer alias privacy', async () => {
    const { base, auth, social, one, two, three, headers } = await setup()
    const request = social.createFriendRequest(one.principal.accountId, two.principal.accountId)
    expect((await fetch(base + '/friend-accept/' + request.id, { method: 'POST', headers: headers(three) })).status).toBe(403)
    expect((await fetch(base + '/friend-accept/' + request.id, { method: 'POST', headers: headers(two) })).status).toBe(200)
    const friends = await fetch(base + '/friends', { headers: headers(two) })
    const text = await friends.text(); expect(text).not.toContain('email'); expect(text).not.toContain('private-one@example.test')
    expect((await fetch(base + '/conversations', { headers: { ...headers(two), 'X-Greed-Account-Id': String(one.principal.accountId) } })).status).toBe(409)
    auth.logout(two.token, origin)
    expect((await fetch(base + '/friends', { headers: headers(two) })).status).toBe(401)
    const before = social.listMessagesBetween(one.principal.accountId, three.principal.accountId, 50)
    expect((await fetch(base + '/message/' + three.principal.accountId, { method: 'POST', headers: { ...headers(one), Origin: 'https://evil.example' }, body: JSON.stringify({ content: 'forged' }) })).status).toBe(403)
    expect(social.listMessagesBetween(one.principal.accountId, three.principal.accountId, 50)).toEqual(before)
  })
  it('preserves alliance leader/member ownership without exposing member aliases', async () => {
    const { base, social, one, two, three, headers } = await setup()
    const created = await fetch(base + '/alliance/create', { method: 'POST', headers: headers(one), body: JSON.stringify({ name: 'Synthetic Alliance' }) })
    expect(created.status).toBe(201)
    expect((await created.text())).not.toContain('private-one@example.test')
    expect((await fetch(base + '/alliance/invite/' + two.principal.accountId, { method: 'POST', headers: headers(three) })).status).toBe(400)
    expect((await fetch(base + '/alliance/invite/' + two.principal.accountId, { method: 'POST', headers: headers(one) })).status).toBe(201)
    expect((await fetch(base + '/alliance/invite/' + three.principal.accountId, { method: 'POST', headers: headers(two) })).status).toBe(403)
    const members = await fetch(base + '/alliance', { headers: headers(two) })
    expect((await members.text())).not.toContain('email')
    expect((await fetch(base + '/alliance/leave', { method: 'POST', headers: headers(two) })).status).toBe(200)
    expect(social.getAllianceForUser(two.principal.accountId)).toBeNull()
    expect(social.getAllianceForUser(one.principal.accountId)!.members).toHaveLength(1)
  })
})

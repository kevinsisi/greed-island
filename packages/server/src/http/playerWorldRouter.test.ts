import express from 'express'
import type { Server } from 'node:http'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { accountId, type Principal } from '../identity/principal.js'
import type { SqliteEventStore } from '../kernel/eventStore.js'
import { getKnownMapEdges, getKnownMapRegions, getMapAdjacency } from '../sim/mapGraph.js'
import type { PlayerWorldNpc } from '../playerWorld/types.js'
import { PlayerWorldService } from '../playerWorld/service.js'
import type { PlayerWorldSnapshot } from '../playerWorld/snapshot.js'
import { EventFixture } from '../playerWorld/service.testSupport.js'
import { createPlayerWorldRouter, type PlayerWorldAuth } from './playerWorldRouter.js'

// Real HTTP/SSE protocol with a pure EventFixture. Native SQLite integration is tested separately in CI.
const ORIGIN = 'http://localhost:4178', alice = accountId(1), bob = accountId(2)
const tokenA = 'a'.repeat(64), tokenB = 'b'.repeat(64), tokenA2 = 'c'.repeat(64)
const cookie = (token: string) => `greed_session=${token}`
const body = (commandId: string, type = 'move', payload: object = { dx: 1, dz: 0 }) => ({ commandId, type, payload })
function authError(code: string) { return Object.assign(new Error(code), { code }) }
function testCookie(header: string | undefined): string | null {
  const values = header?.split(';').map(item => item.trim()).filter(item => item.startsWith('greed_session=')).map(item => item.slice('greed_session='.length)) ?? []
  return values.length === 1 && /^[a-f0-9]{64}$/.test(values[0]!) ? values[0]! : null
}
const cleanups: Array<() => Promise<void>> = []
afterEach(async () => { while (cleanups.length) await cleanups.pop()!() })
async function setup(autoFlush = true, broadParentParser = false) {
  const fixture = new EventFixture(), revoked = new Set<(id: number) => void>(), sessions = new Map<string, Principal>([
    [tokenA, { accountId: alice, role: 'player' }], [tokenB, { accountId: bob, role: 'player' }], [tokenA2, { accountId: alice, role: 'player' }],
  ])
  const auth: PlayerWorldAuth = {
    assertOrigin: origin => { if (origin !== ORIGIN) throw authError('ORIGIN_NOT_ALLOWED') },
    resolve: token => token ? sessions.get(token) ?? null : null,
    requireMutation(token, origin) { this.assertOrigin(origin); const principal = this.resolve(token); if (!principal) throw authError('UNAUTHORIZED'); return principal },
    onRevoked: listener => { revoked.add(listener); return () => { revoked.delete(listener) } },
  }
  const source = { getMap: () => ({ regions: getKnownMapRegions(), adjacency: getMapAdjacency(), edges: getKnownMapEdges() }),
    getTick: () => 3, getRevision: () => fixture.events.at(-1)?.sequence ?? 0, getNpcs: (): PlayerWorldNpc[] => [] }
  const service = new PlayerWorldService(fixture as unknown as SqliteEventStore, source)
  const runtime = { getPlayerWorldSnapshot: (id: typeof alice) => service.snapshot(id),
    submitPlayerWorldCommand: vi.fn((id: typeof alice, input: unknown, authorize?: () => void) => service.submit(id, input, authorize)),
    subscribePlayerWorld: (id: typeof alice, listener: Parameters<PlayerWorldService['subscribeAccount']>[1]) => service.subscribeAccount(id, listener) }
  const router = createPlayerWorldRouter({ runtime, authService: auth, sessionTokenFromCookie: testCookie, heartbeatMs: 10 })
  const app = express(); if (broadParentParser) app.use(express.json({ limit: '10mb' })); app.use('/api', router)
  const server: Server = await new Promise(resolve => { const started = app.listen(0, '127.0.0.1', () => resolve(started)) })
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('Missing test listener.')
  const base = `http://127.0.0.1:${address.port}/api/world`
  const timer = autoFlush ? setInterval(() => service.advanceMovementStep(), 20) : undefined
  const controllers: AbortController[] = []
  const snapshot = (token?: string) => fetch(`${base}/snapshot`, { headers: token ? { Cookie: cookie(token) } : {} })
  const command = (token: string, data: unknown, origin: string | null = ORIGIN, expectedId = sessions.get(token)?.accountId) => fetch(`${base}/command`, {
    method: 'POST', headers: { Cookie: cookie(token), 'Content-Type': 'application/json', ...(expectedId ? { 'X-Greed-Account-Id': String(expectedId) } : {}), ...(origin ? { Origin: origin } : {}) }, body: JSON.stringify(data) })
  const stream = async (token: string) => { const controller = new AbortController(); controllers.push(controller)
    const response = await fetch(`${base}/stream`, { headers: { Cookie: cookie(token) }, signal: controller.signal }); return { response, controller } }
  const revoke = (token: string) => { const id = sessions.get(token)?.accountId; sessions.delete(token); if (id) for (const listener of revoked) listener(id) }
  cleanups.push(async () => { if (timer) clearInterval(timer); router.closeStreams(); controllers.forEach(controller => controller.abort())
    service.cancelPending(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())) })
  return { fixture, service, runtime, router, source, sessions, revoked, base, snapshot, command, stream, revoke }
}
async function waitFor(check: () => boolean) { for (let tries = 0; tries < 100; tries += 1) { if (check()) return; await new Promise(resolve => setTimeout(resolve, 5)) }; throw new Error('Test condition timed out.') }
async function firstSnapshot(response: Response) {
  const reader = response.body!.getReader(), decoder = new TextDecoder(); let text = ''
  for (;;) { const read = await reader.read(); if (read.done) throw new Error('Snapshot stream closed early.'); text += decoder.decode(read.value)
    const frames = text.split('\n\n'), frame = frames.find(frame => frame.split('\n').includes('event: snapshot'))
    if (frame) { const data = frame.split('\n').find(line => line.startsWith('data: ')); return { snapshot: JSON.parse(data!.slice(6)), reader } }
  }
}
async function snapshotMatching(reader: ReadableStreamDefaultReader<Uint8Array>, matches: (snapshot: PlayerWorldSnapshot) => boolean) {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Live chat SSE frame timed out.')), 2000) })
  const read = async () => {
    const decoder = new TextDecoder(); let buffered = ''
    for (;;) {
      const chunk = await reader.read(); if (chunk.done) throw new Error('Live chat SSE stream closed early.')
      buffered += decoder.decode(chunk.value, { stream: true })
      let end: number
      while ((end = buffered.indexOf('\n\n')) >= 0) {
        const frame = buffered.slice(0, end); buffered = buffered.slice(end + 2)
        if (!frame.split('\n').includes('event: snapshot')) continue
        const data = frame.split('\n').find(line => line.startsWith('data: ')); if (!data) continue
        const snapshot = JSON.parse(data.slice(6)) as PlayerWorldSnapshot; if (matches(snapshot)) return snapshot
      }
    }
  }
  try { return await Promise.race([read(), timeout]) } finally { if (timer) clearTimeout(timer) }
}
async function ended(reader: ReadableStreamDefaultReader<Uint8Array>) { for (;;) { if ((await reader.read()).done) return } }

describe('one-session canonical world HTTP/SSE protocol', () => {
  it('returns401 only for invalid auth, and typed409 WORLD_ENTRY_REQUIRED for a valid session without position', async () => {
    const harness = await setup(); expect((await harness.snapshot()).status).toBe(401)
    const response = await harness.snapshot(tokenA); expect(response.status).toBe(409); expect(await response.json()).toMatchObject({ error: 'WORLD_ENTRY_REQUIRED' })
    expect(harness.fixture.events).toHaveLength(0)
    const duplicate = await fetch(`${harness.base}/snapshot`, { headers: { Cookie: `${cookie(tokenA)}; ${cookie(tokenA2)}` } }); expect(duplicate.status).toBe(401)
    const old = await fetch(`${harness.base}/snapshot`, { headers: { Cookie: `greed_mp_session=${tokenA}` } }); expect(old.status).toBe(401)
  })
  it('uses authenticated principal, strict intent fields, and mandatory trusted Origin', async () => {
    const harness = await setup()
    expect((await harness.command(tokenA, body('join', 'enter', {}), null)).status).toBe(403)
    expect((await harness.command(tokenA, body('join', 'enter', {}), 'https://evil.example')).status).toBe(403)
    expect((await harness.command(tokenA, body('forge', 'enter', { accountId: 2, x: 99 }))).status).toBe(400)
    const joined = await harness.command(tokenA, body('join', 'enter', {})); expect(joined.status).toBe(200); expect(await joined.json()).toMatchObject({ accepted: true, commandId: 'join' })
    expect(harness.service.getPosition(alice)?.accountId).toBe(1); expect(harness.service.getPosition(bob)).toBeNull()
    const crossSite = await fetch(`${harness.base}/snapshot`, { headers: { Cookie: cookie(tokenA), 'Sec-Fetch-Site': 'cross-site' } }); expect(crossSite.status).toBe(403)
  })
  it('revalidates queued authorization at flush and does not cancel another valid session', async () => {
    const harness = await setup(false); harness.service.execute(alice, body('join', 'enter', {})); harness.service.connect(alice)
    const expired = harness.command(tokenA, body('expired')); const live = harness.command(tokenA2, body('live'))
    await waitFor(() => harness.runtime.submitPlayerWorldCommand.mock.calls.length === 2)
    harness.revoke(tokenA); harness.service.advanceMovementStep()
    expect((await expired).status).toBe(401); expect((await live).status).toBe(200); expect(harness.fixture.events).toHaveLength(2)
  })
  it('streams initial snapshot and reference-counts two tabs without duplicate avatars or position deletion', async () => {
    const harness = await setup(); harness.service.execute(alice, body('join', 'enter', {}))
    const one = await harness.stream(tokenA), first = await firstSnapshot(one.response)
    expect(one.response.status).toBe(200); expect(one.response.headers.get('content-type')).toContain('text/event-stream')
    expect(first.snapshot).toMatchObject({ version: 1, worldId: 'canonical-world', selfId: 1 })
    expect(first.snapshot.players).toHaveLength(1); expect(first.snapshot.players[0].online).toBe(true)
    const two = await harness.stream(tokenA2); await firstSnapshot(two.response); one.controller.abort()
    await waitFor(() => harness.service.snapshot(alice).players[0]?.online === true)
    expect(harness.service.snapshot(alice).players).toHaveLength(1)
    two.controller.abort(); await waitFor(() => harness.service.snapshot(alice).players[0]?.online === false)
    expect(harness.service.getPosition(alice)).not.toBeNull(); expect(harness.fixture.events).toHaveLength(1)
  })
  it('revalidates idle expiry on heartbeat, and logout of one token leaves another valid stream online', async () => {
    const harness = await setup(); harness.service.execute(alice, body('join', 'enter', {}))
    const one = await harness.stream(tokenA), first = await firstSnapshot(one.response), two = await harness.stream(tokenA2); await firstSnapshot(two.response)
    harness.revoke(tokenA); await ended(first.reader); expect(harness.service.snapshot(alice).players[0]?.online).toBe(true)
    // Expiry has no revocation callback; heartbeat still terminates the invalid session.
    harness.sessions.delete(tokenA2); await waitFor(() => harness.service.snapshot(alice).players[0]?.online === false)
    expect(harness.service.getPosition(alice)).not.toBeNull()
  })
  it('stream-before-entry fails409 without allocating presence or a socket subscription', async () => {
    const harness = await setup(), result = await harness.stream(tokenA)
    expect(result.response.status).toBe(409); expect(await result.response.json()).toMatchObject({ error: 'WORLD_ENTRY_REQUIRED' })
    expect(harness.fixture.events).toHaveLength(0)
  })
  it('shutdown unregisters revocation observers and returns503 for later requests', async () => {
    const harness = await setup(); expect(harness.revoked.size).toBe(1); harness.router.closeStreams(); harness.router.closeStreams()
    expect(harness.revoked.size).toBe(0); expect((await harness.snapshot(tokenA)).status).toBe(503)
  })
  it('limits malformed and oversized payloads before gameplay mutation', async () => {
    const harness = await setup()
    const malformed = await fetch(`${harness.base}/command`, { method: 'POST', headers: { Cookie: cookie(tokenA), Origin: ORIGIN, 'Content-Type': 'application/json' }, body: '{' })
    expect(malformed.status).toBe(400); expect(await malformed.json()).toMatchObject({ error: 'INVALID_JSON' })
    const huge = await harness.command(tokenA, { text: 'x'.repeat(5000) }); expect(huge.status).toBe(413); expect(harness.fixture.events).toHaveLength(0)
  })
})

describe('canonical stream setup cleanup', () => {
  it('returns a typed setup failure rather than ending an empty200 response', async () => {
    const harness = await setup(); harness.service.execute(alice, body('join', 'enter', {}))
    const { PlayerWorldError } = await import('../playerWorld/types.js')
    vi.spyOn(harness.runtime, 'subscribePlayerWorld').mockImplementation(() => { throw new PlayerWorldError(409, 'WORLD_FULL', 'Full') })
    const stream = await harness.stream(tokenA); expect(stream.response.status).toBe(409)
    expect(await stream.response.json()).toMatchObject({ error: 'WORLD_FULL' })
    expect(harness.service.snapshot(alice).players[0]?.online).toBe(false)
  })
})


describe('bounded canonical stream frames', () => {
  it('delivers a valid snapshot larger than socket high-water without closing a healthy reader', async () => {
    const harness = await setup(); harness.service.execute(alice, body('join', 'enter', {}))
    vi.spyOn(harness.source, 'getNpcs').mockReturnValue(Array.from({ length: 150 }, (_, index) => ({
      id: `synthetic-${index}`, name: { zh: `Synthetic resident ${index}`, en: `Synthetic resident ${index}` },
      color: 1, location: 't_dock', activity: 'idle', buildingId: null, travelRoute: null, deceased: false, subCol: 7, subRow: 5, subZ: 0,
    })))
    const connection = await harness.stream(tokenA), initial = await firstSnapshot(connection.response)
    expect(initial.snapshot.npcs).toHaveLength(150)
    expect(Buffer.byteLength(JSON.stringify(initial.snapshot))).toBeGreaterThan(16 * 1024)
    await new Promise(resolve => setTimeout(resolve, 30))
    expect(harness.service.snapshot(alice).players[0]?.online).toBe(true)
  })
  it('bounds per-account streams without creating duplicate players', async () => {
    const harness = await setup(); harness.service.execute(alice, body('join', 'enter', {}))
    for (let tab = 0; tab < 4; tab += 1) { const connection = await harness.stream(tokenA); await firstSnapshot(connection.response) }
    const fifth = await harness.stream(tokenA); expect(fifth.response.status).toBe(429)
    expect(await fifth.response.json()).toMatchObject({ error: 'STREAM_LIMIT' })
    expect(harness.service.snapshot(alice).players).toHaveLength(1); expect(harness.fixture.events).toHaveLength(1)
  })
})


describe('canonical cross-tab identity assertion', () => {
  it('rejects tabA/accountA intent after the shared cookie switched toB, without moving either actor', async () => {
    const harness = await setup(); harness.service.execute(alice, body('joinA', 'enter', {})); harness.service.execute(bob, body('joinB', 'enter', {}))
    const before = harness.fixture.events.length
    const stale = await harness.command(tokenB, body('stale-tab-A'), ORIGIN, alice)
    expect(stale.status).toBe(409); expect(await stale.json()).toMatchObject({ error: 'ACCOUNT_CHANGED' })
    expect(harness.runtime.submitPlayerWorldCommand).not.toHaveBeenCalled(); expect(harness.fixture.events).toHaveLength(before)
    expect(harness.service.getPosition(alice)?.x).toBe(0); expect(harness.service.getPosition(bob)?.x).toBe(0)
  })
  it('requires a positive safe numeric assertion and never trusts it as the principal', async () => {
    const harness = await setup()
    const missing = await fetch(`${harness.base}/command`, { method: 'POST', headers: { Cookie: cookie(tokenA), Origin: ORIGIN, 'Content-Type': 'application/json' }, body: JSON.stringify(body('join', 'enter', {})) })
    expect(missing.status).toBe(400); expect(await missing.json()).toMatchObject({ error: 'ACCOUNT_CONTEXT_REQUIRED' })
    expect(harness.fixture.events).toHaveLength(0)
  })
})


describe('canonical route composition limits', () => {
  it('retains4KiB world-body enforcement even if a broader parent parser ran first', async () => {
    const harness = await setup(true, true)
    const response = await harness.command(tokenA, { text: 'x'.repeat(5000) })
    expect(response.status).toBe(413); expect(await response.json()).toMatchObject({ error: 'PAYLOAD_TOO_LARGE' })
    expect(harness.runtime.submitPlayerWorldCommand).not.toHaveBeenCalled(); expect(harness.fixture.events).toHaveLength(0)
  })
})

describe('canonical world chat HTTP binding', () => {
  it('uses the same authenticated queue/stream, exposes plain public chat, and rejects disconnected gameplay', async () => {
    const harness = await setup(); harness.service.execute(alice, body('join', 'enter', {})); harness.service.execute(bob, body('join', 'enter', {}))
    const offline = await harness.command(tokenA, body('offline-chat', 'chat', { text: 'no slot' }))
    expect(offline.status).toBe(409); expect(await offline.json()).toMatchObject({ error: 'WORLD_CONNECTION_REQUIRED' })
    const streamA = await harness.stream(tokenA), streamB = await harness.stream(tokenB); await firstSnapshot(streamA.response); const peerStream = await firstSnapshot(streamB.response)
    harness.service.setDisplayNameResolver(id => `Public ${id}`)
    const sent = await harness.command(tokenA, body('world-chat', 'chat', { text: '<b>plain text</b>' })); expect(sent.status).toBe(200)
    const liveB = await snapshotMatching(peerStream.reader, snapshot => snapshot.messages?.some((message: { text: string }) => message.text === '<b>plain text</b>'))
    expect(liveB.selfId).toBe(2)
    expect(liveB.messages).toHaveLength(1)
    expect(liveB.messages[0]).toMatchObject({ accountId: 1, tileId: 't_dock', displayName: 'Public 1', text: '<b>plain text</b>' })
    const snapshotB = await (await harness.snapshot(tokenB)).json()
    expect(snapshotB.messages).toHaveLength(1); expect(snapshotB.messages[0]).toMatchObject({ accountId: 1, tileId: 't_dock', displayName: 'Public 1', text: '<b>plain text</b>' })
    expect(snapshotB.messages[0]).not.toHaveProperty('email'); expect(snapshotB.messages[0]).not.toHaveProperty('role')
    const repeated = await harness.command(tokenA, body('world-chat', 'chat', { text: '<b>plain text</b>' }))
    expect(repeated.status).toBe(200); expect(await repeated.json()).toMatchObject({ duplicate: true })
    expect(harness.service.snapshot(bob).messages).toHaveLength(1)
  })
})


describe('canonical harbor beacon HTTP binding', () => {
  it('uses the same authenticated admitted queue and peer SSE for original two-player contribution/open/progress', async () => {
    const harness = await setup(false); harness.service.setHarborProgressPolicy(() => 'new-player')
    for (const id of [alice,bob]) { harness.service.execute(id, body('enter', 'enter', {})); harness.service.connect(id) }
    for (let step = 0; step < 30; step++) { harness.service.advanceMovementStep(); harness.service.executeBatch([alice,bob].map(id => ({ accountId: id, body: body(`walk${step}`, 'move', { dx: 0, dz: 1 }) }))) }
    const stream = await harness.stream(tokenB), peer = await firstSnapshot(stream.response)
    expect(peer.snapshot.harborProgress).toEqual({ status: 'ready', supplies: 1, rewards: 0 })
    const one = harness.command(tokenA, body('contribute', 'contribute', {})), two = harness.command(tokenB, body('contribute', 'contribute', {}))
    await waitFor(() => harness.runtime.submitPlayerWorldCommand.mock.calls.length === 2)
    const before = harness.fixture.transactions; harness.service.advanceMovementStep()
    expect((await one).status).toBe(200); expect((await two).status).toBe(200); expect(harness.fixture.transactions - before).toBe(1)
    const opened = await snapshotMatching(peer.reader, snapshot => snapshot.beacon.phase === 'collecting')
    expect(opened.beacon).toMatchObject({ id: 'harbor-beacon-1', tileId: 't_dock', x: 0, z: 6, radius: 2.5, required: 2, contributors: [1,2], completed: false })
    expect(opened.beacon.closesAtTick! - opened.beacon.tick).toBe(300)
    expect(opened.harborProgress).toEqual({ status: 'ready', supplies: 0, rewards: 0 })
    expect(opened.players.every(player => player.harborProgress.supplies === 0)).toBe(true)
    const forged = await harness.command(tokenA, body('forged', 'contribute', { accountId: 2, supplies: 999 })); expect(forged.status).toBe(400)
    const expectedCalls = harness.runtime.submitPlayerWorldCommand.mock.calls.length + 1
    const retry = harness.command(tokenA, body('contribute', 'contribute', {})); await waitFor(() => harness.runtime.submitPlayerWorldCommand.mock.calls.length === expectedCalls)
    harness.service.advanceMovementStep(); expect(await (await retry).json()).toMatchObject({ accepted: true, duplicate: true })
    expect(harness.fixture.events.filter(event => event.eventType === 'PLAYER_HARBOR_CONTRIBUTED')).toHaveLength(2)
  })
})

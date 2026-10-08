import Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createMultiplayerApp, hashPassword } from './http.js'
import { MultiplayerRuntime } from './runtime.js'
import { generateRoster } from './domain.js'

type Snapshot = ReturnType<MultiplayerRuntime['snapshot']>
const ORIGIN = 'http://localhost:4178'
const A = 'player-a'
const B = 'player-b'
const C = 'player-3'
// Isolated test-only fixture passwords. Never load environment credentials or production accounts.
const fixtures = [
  { id: A, username: 'alice-test', passwordHash: hashPassword('test-only-password-a'), name: 'Alice' },
  { id: B, username: 'bob-test', passwordHash: hashPassword('test-only-password-b'), name: 'Bob' },
  { id: C, username: 'charlie-test', passwordHash: hashPassword('test-only-password-c'), name: 'Charlie' },
]

let db: Database.Database
let runtime: MultiplayerRuntime
let server: Server
let base: string
const streams: Array<{ abort: AbortController; reader: ReadableStreamDefaultReader<Uint8Array> }> = []
let accountDirectory: string
let accountsPath: string

function command(type: string, payload: unknown = {}, commandId = randomUUID()) {
  return { commandId, type, payload }
}

async function post(path: string, body: unknown, cookie?: string, origin: string | null = ORIGIN) {
  return fetch(`${base}/mp-api/${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(cookie ? { cookie } : {}),
      ...(origin === null ? {} : { origin }),
    },
    body: JSON.stringify(body),
  })
}

async function login(username: string, password: string) {
  const response = await post('login', { username, password })
  expect(response.status).toBe(200)
  const header = response.headers.get('set-cookie')
  expect(header).toBeTruthy()
  return { response, header: header!, cookie: header!.split(';')[0]! }
}

async function snapshot(cookie: string) {
  const response = await fetch(`${base}/mp-api/snapshot`, { headers: { cookie } })
  expect(response.status).toBe(200)
  return await response.json() as Snapshot
}

async function connect(cookie: string) {
  const abort = new AbortController()
  const response = await fetch(`${base}/mp-api/stream`, {
    headers: { cookie, accept: 'text/event-stream' },
    signal: abort.signal,
  })
  expect(response.status).toBe(200)
  expect(response.headers.get('content-type')).toContain('text/event-stream')
  const reader = response.body!.getReader()
  streams.push({ abort, reader })
  let buffer = ''
  const decoder = new TextDecoder()

  async function nextSnapshot() {
    const deadline = new AbortController()
    const timeout = setTimeout(() => deadline.abort(), 3_000)
    try {
      while (true) {
        const end = buffer.indexOf('\n\n')
        if (end >= 0) {
          const frame = buffer.slice(0, end)
          buffer = buffer.slice(end + 2)
          if (!frame.split('\n').some((line) => line.trim() === 'event: snapshot')) continue
          const data = frame.split('\n').filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trimStart()).join('\n')
          return JSON.parse(data) as Snapshot
        }
        const result = await Promise.race([
          reader.read(),
          new Promise<never>((_, reject) => {
            if (deadline.signal.aborted) reject(new Error('Timed out waiting for an SSE snapshot'))
            else deadline.signal.addEventListener('abort', () => reject(new Error('Timed out waiting for an SSE snapshot')), { once: true })
          }),
        ])
        if (result.done) throw new Error('SSE ended before a snapshot arrived')
        buffer += decoder.decode(result.value, { stream: true }).replace(/\r\n/g, '\n')
      }
    } finally {
      clearTimeout(timeout)
    }
  }

  async function until(predicate: (value: Snapshot) => boolean) {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const value = await nextSnapshot()
      if (predicate(value)) return value
    }
    throw new Error('Expected room update did not arrive in ten SSE snapshots')
  }
  return { abort, nextSnapshot, until }
}

beforeEach(async () => {
  accountDirectory = mkdtempSync(join(tmpdir(), 'greed-mp-accounts-'))
  accountsPath = join(accountDirectory, 'accounts.json')
  db = new Database(':memory:')
  runtime = new MultiplayerRuntime(db, { roster: generateRoster(3), config: { maxOnlinePlayers: 2, minParticipants: 2, participationWindowTicks: 3 } })
  const app = createMultiplayerApp({ runtime, fixtures, accountsPath, allowedOrigins: [ORIGIN, 'http://127.0.0.1:4178'] })
  server = await new Promise<Server>((resolve, reject) => {
    const candidate = app.listen(0, '127.0.0.1', () => resolve(candidate))
    candidate.once('error', reject)
  })
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterEach(async () => {
  for (const stream of streams.splice(0)) {
    stream.abort.abort()
    await stream.reader.cancel().catch(() => undefined)
  }
  runtime?.stop()
  if (server) {
    server.closeAllConnections()
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  }
  if (db?.open) db.close()
  rmSync(accountDirectory, { recursive: true, force: true })
})

describe('isolated multiplayer HTTP sessions', () => {
  it('registers a persistent player, logs them in immediately, rejects invalid and duplicate accounts, and never stores plaintext', async () => {
    const registered = await post('register', { username: 'New_Player-1', password: 'long-test-password' })
    expect(registered.status).toBe(201)
    expect(registered.headers.get('set-cookie')).toMatch(/HttpOnly/i)
    const payload = await registered.json() as { snapshot: Snapshot }
    const playerId = payload.snapshot.selfId
    expect(payload.snapshot.players.some(player => player.id === playerId)).toBe(true)
    expect((await post('login', { username: 'new_player-1', password: 'long-test-password' })).status).toBe(200)
    expect((await fetch(`${base}/mp-api/snapshot`, { headers: { cookie: registered.headers.get('set-cookie')!.split(';')[0]! } })).status).toBe(200)
    expect((await post('register', { username: 'new_player-1', password: 'long-test-password' })).status).toBe(409)
    for (const body of [
      { username: 'ab', password: 'long-test-password' },
      { username: 'bad name', password: 'long-test-password' },
      { username: 'valid-name', password: 'short' },
      { username: 'valid-name', password: 'long-test-password', extra: true },
    ]) expect((await post('register', body)).status).toBe(400)
    const stored = readFileSync(accountsPath, 'utf8')
    expect(stored).not.toContain('long-test-password')
    expect(stored).toContain(':')
    const first = await login(fixtures[0]!.username, 'test-only-password-a')
    const second = await login(fixtures[1]!.username, 'test-only-password-b')
    await connect(first.cookie)
    await connect(second.cookie)
    const full = await fetch(`${base}/mp-api/stream`, { headers: { cookie: registered.headers.get('set-cookie')!.split(';')[0]! } })
    expect(full.status).toBe(409)
    expect(await full.json()).toMatchObject({ error: 'ROOM_FULL' })
  })

  it('serializes concurrent case-insensitive registrations and shares the IP budget between login and register', async () => {
    const results = await Promise.all([
      post('register', { username: 'parallel-account', password: 'a-long-test-password' }),
      post('register', { username: 'PARALLEL-ACCOUNT', password: 'another-long-password' }),
    ])
    expect(results.map(result => result.status).sort()).toEqual([201, 409])
    for (let attempt = 0; attempt < 18; attempt += 1) await post('login', { username: 'missing', password: 'wrong-password' })
    expect((await post('register', { username: 'budget-account', password: 'a-long-test-password' })).status).toBe(429)
  })

  it('allows only a valid one-time claim code to register the reserved admin and exposes role only to self', async () => {
    const { writeFileSync } = await import('node:fs')
    const claimPath = join(accountDirectory, 'claim')
    writeFileSync(claimPath, 'one-time-test-claim-code', { mode: 0o600 })
    const app = createMultiplayerApp({ runtime, fixtures, accountsPath, adminClaimFilePath: claimPath, allowedOrigins: [ORIGIN] })
    const candidate = await new Promise<Server>((resolve, reject) => { const server = app.listen(0, '127.0.0.1', () => resolve(server)); server.once('error', reject) })
    const claimBase = `http://127.0.0.1:${(candidate.address() as AddressInfo).port}`
    try {
      const blocked = await fetch(`${claimBase}/mp-api/register`, { method: 'POST', headers: { origin: ORIGIN, 'content-type': 'application/json' }, body: JSON.stringify({ username: 'kevin950805', password: 'long-test-password' }) })
      expect(blocked.status).toBe(403)
      const blockedBody = await blocked.json() as { error: string; message: string }
      const wrongClaim = await fetch(`${claimBase}/mp-api/register`, { method: 'POST', headers: { origin: ORIGIN, 'content-type': 'application/json' }, body: JSON.stringify({ username: 'kevin950805', password: 'long-test-password', claimCode: 'wrong-code' }) })
      expect(wrongClaim.status).toBe(403)
      const wrongClaimBody = await wrongClaim.json() as { error: string; message: string }
      expect(wrongClaimBody).toEqual(blockedBody)
      expect(JSON.stringify(wrongClaimBody)).not.toContain('wrong-code')
      const claimed = await fetch(`${claimBase}/mp-api/register`, { method: 'POST', headers: { origin: ORIGIN, 'content-type': 'application/json' }, body: JSON.stringify({ username: 'kevin950805', password: 'long-test-password', claimCode: 'one-time-test-claim-code' }) })
      expect(claimed.status).toBe(201)
      expect(readFileSync(accountsPath, 'utf8')).not.toContain('one-time-test-claim-code')
      expect(existsSync(`${claimPath}.used`)).toBe(true)
      expect((await fetch(`${claimBase}/mp-api/admin/ping`, { headers: { cookie: claimed.headers.get('set-cookie')!.split(';')[0]! } })).status).toBe(200)
      expect((await claimed.clone().json() as { snapshot: Snapshot }).snapshot.players.every(player => !('role' in player))).toBe(true)
      expect(await claimed.clone().text()).not.toContain('one-time-test-claim-code')
      expect(await claimed.clone().text()).not.toContain('long-test-password')
      const ordinary = await fetch(`${claimBase}/mp-api/login`, { method: 'POST', headers: { origin: ORIGIN, 'content-type': 'application/json' }, body: JSON.stringify({ username: fixtures[0]!.username, password: 'test-only-password-a' }) })
      const ordinaryCookie = ordinary.headers.get('set-cookie')!.split(';')[0]!
      expect((await fetch(`${claimBase}/mp-api/admin/ping`, { headers: { cookie: ordinaryCookie } })).status).toBe(403)
      expect(await (await fetch(`${claimBase}/mp-api/me`, { headers: { cookie: ordinaryCookie } })).json()).toMatchObject({ role: 'player' })
      const reusedClaim = await fetch(`${claimBase}/mp-api/register`, { method: 'POST', headers: { origin: ORIGIN, 'content-type': 'application/json' }, body: JSON.stringify({ username: 'kevin950805', password: 'long-test-password', claimCode: 'one-time-test-claim-code' }) })
      expect(reusedClaim.status).toBe(403)
      expect(await reusedClaim.json()).toEqual(blockedBody)
    } finally { candidate.closeAllConnections(); await new Promise<void>(resolve => candidate.close(() => resolve())) }
  })
  it('requires authentication and issues separate opaque, scoped, HttpOnly cookies', async () => {
    for (const route of ['snapshot', 'stream']) {
      const response = await fetch(`${base}/mp-api/${route}`)
      expect(response.status).toBe(401)
    }
    expect((await post('command', command('chat', { text: 'anonymous' }))).status).toBe(401)
    expect((await post('login', { username: fixtures[0]!.username, password: 'wrong' })).status).toBe(401)
    const a = await login(fixtures[0]!.username, 'test-only-password-a')
    const b = await login(fixtures[1]!.username, 'test-only-password-b')
    expect(a.cookie).not.toBe(b.cookie)
    for (const session of [a, b]) {
      expect(session.header).toMatch(/;\s*HttpOnly/i)
      expect(session.header).toMatch(/;\s*SameSite=Strict/i)
      expect(session.header).toMatch(/;\s*Path=\/mp-api(?:;|$)/i)
      expect(session.cookie).not.toContain('test-only-password')
      expect(session.cookie).not.toContain('player-')
    }
    expect((await snapshot(a.cookie)).selfId).toBe(A)
    expect((await snapshot(b.cookie)).selfId).toBe(B)
    const forged = await fetch(`${base}/mp-api/snapshot`, { headers: { cookie: `${a.cookie.split('=')[0]}=forged` } })
    expect(forged.status).toBe(401)
  })

  it.each([null, 'https://example.invalid', 'http://localhost:41780', 'http://localhost:4178.attacker.invalid', 'null'])(
    'rejects mutations from missing or untrusted Origin %s', async (origin) => {
      const a = await login(fixtures[0]!.username, 'test-only-password-a')
      const before = runtime.snapshot(A)
      expect((await post('command', command('chat', { text: 'blocked' }), a.cookie, origin)).status).toBe(403)
      expect((await post('login', { username: fixtures[0]!.username, password: 'test-only-password-a' }, undefined, origin)).status).toBe(403)
      expect((await post('logout', {}, a.cookie, origin)).status).toBe(403)
      expect(runtime.snapshot(A)).toEqual(before)
      expect((await snapshot(a.cookie)).selfId).toBe(A)
    },
  )

  it('fixes the command actor to the session and refuses spoofed identities or resource results', async () => {
    const a = await login(fixtures[0]!.username, 'test-only-password-a')
    await connect(a.cookie)
    const before = runtime.snapshot(A)
    for (const input of [
      { ...command('move', { dx: 0, dz: 1 }), actorId: B },
      command('move', { dx: 0, dz: 1, playerId: B }),
      command('contribute', { playerId: B }),
      command('contribute', { rewards: 999, supplies: 999 }),
    ]) {
      expect((await post('command', input, a.cookie)).status).toBe(400)
    }
    expect(runtime.snapshot(A)).toEqual(before)
    const accepted = await post('command', command('move', { dx: 0, dz: 1 }), a.cookie)
    expect(accepted.status).toBe(200)
    const after = await snapshot(a.cookie)
    expect(after.players.find((entry) => entry.id === B)).toEqual(before.players.find((entry) => entry.id === B))
    expect(after.players.find((entry) => entry.id === A)!.z).toBeGreaterThan(before.players.find((entry) => entry.id === A)!.z)
  })

  it('streams shared movement and chat to both sessions and restores missed updates on reconnect', async () => {
    const a = await login(fixtures[0]!.username, 'test-only-password-a')
    const b = await login(fixtures[1]!.username, 'test-only-password-b')
    const streamA = await connect(a.cookie)
    expect((await streamA.nextSnapshot()).selfId).toBe(A)
    const streamB = await connect(b.cookie)
    expect((await streamB.nextSnapshot()).selfId).toBe(B)

    const move = await post('command', command('move', { dx: 0, dz: 1 }), a.cookie)
    expect(move.status).toBe(200)
    const result = await move.json() as { accepted: boolean; revision: number }
    expect(result.accepted).toBe(true)
    expect(result).not.toHaveProperty('snapshot')
    runtime.advanceTick()
    const observedA = await streamA.until((value) => value.revision >= result.revision)
    const observedB = await streamB.until((value) => value.revision >= result.revision)
    expect(observedA.players).toEqual(observedB.players)
    expect(observedB.players.find((entry) => entry.id === A)!.z).toBeGreaterThan(-6)

    const chat = await post('command', command('chat', { text: '一起修好信標。' }), b.cookie)
    expect(chat.status).toBe(200)
    runtime.advanceTick()
    const chatA = await streamA.until((value) => value.messages.some((entry) => entry.text === '一起修好信標。'))
    const chatB = await streamB.until((value) => value.messages.some((entry) => entry.text === '一起修好信標。'))
    expect(chatA.messages).toEqual(chatB.messages)
    expect(chatA.messages.at(-1)).toMatchObject({ playerId: B, text: '一起修好信標。' })

    streamA.abort.abort()
    runtime.advanceTick()
    expect((await post('command', command('move', { dx: 1, dz: 0 }), b.cookie)).status).toBe(200)
    const reconnect = await connect(a.cookie)
    const restored = await reconnect.nextSnapshot()
    expect(restored.selfId).toBe(A)
    expect(restored.players).toEqual((await snapshot(a.cookie)).players)
    expect(restored.revision).toBe(runtime.snapshot(A).revision)
    expect(restored.messages).toEqual(chatA.messages)
  })

  it('atomically completes the collection window under simultaneous duplicate and fresh request IDs', async () => {
    const a = await login(fixtures[0]!.username, 'test-only-password-a')
    const b = await login(fixtures[1]!.username, 'test-only-password-b')
    await connect(a.cookie)
    await connect(b.cookie)
    for (let step = 0; step < 30; step += 1) {
      runtime.advanceTick()
      const responses = await Promise.all([
        post('command', command('move', { dx: 0, dz: 1 }), a.cookie),
        post('command', command('move', { dx: 0, dz: 1 }), b.cookie),
      ])
      expect(responses.map((entry) => entry.status)).toEqual([200, 200])
    }
    const aContribution = command('contribute')
    const bContribution = command('contribute')
    const responses = await Promise.all([
      post('command', aContribution, a.cookie),
      post('command', bContribution, b.cookie),
      post('command', aContribution, a.cookie),
      post('command', bContribution, b.cookie),
    ])
    expect(responses.map((entry) => entry.status)).toEqual([200, 200, 200, 200])
    const freshRequests = await Promise.all([
      post('command', command('contribute'), a.cookie),
      post('command', command('contribute'), b.cookie),
    ])
    expect(freshRequests.map((entry) => entry.status)).toEqual([409, 409])
    const collecting = await snapshot(a.cookie)
    expect(collecting.beacon).toMatchObject({ phase: 'collecting', completed: false, closesAtTick: collecting.tick + 3 })
    expect(collecting.players.every((player) => player.rewards === 0)).toBe(true)
    runtime.advanceTick()
    runtime.advanceTick()
    expect(runtime.snapshot(A).beacon.completed).toBe(false)
    runtime.advanceTick()
    const doneA = await snapshot(a.cookie)
    const doneB = await snapshot(b.cookie)
    expect(doneA.beacon).toEqual(doneB.beacon)
    expect(doneA.beacon.completed).toBe(true)
    expect(new Set(doneA.beacon.contributors)).toEqual(new Set([A, B]))
    expect(doneA.players.filter((player) => [A, B].includes(player.id)).map(({ supplies, rewards }) => ({ supplies, rewards }))).toEqual([
      { supplies: 0, rewards: 1 }, { supplies: 0, rewards: 1 },
    ])
    expect(doneA.players.find((player) => player.id === C)).toMatchObject({ supplies: 1, rewards: 0 })
    const repeated = await post('command', bContribution, b.cookie)
    expect(repeated.status).toBe(200)
    expect((await repeated.json() as { duplicate: boolean }).duplicate).toBe(true)
    expect((await snapshot(a.cookie)).revision).toBe(doneA.revision)
  })

  it('invalidates the logged-out cookie while leaving the other identity usable', async () => {
    const a = await login(fixtures[0]!.username, 'test-only-password-a')
    const b = await login(fixtures[1]!.username, 'test-only-password-b')
    await connect(a.cookie)
    await connect(b.cookie)
    const response = await post('logout', {}, a.cookie)
    expect(response.status).toBeGreaterThanOrEqual(200)
    expect(response.status).toBeLessThan(300)
    expect((await fetch(`${base}/mp-api/snapshot`, { headers: { cookie: a.cookie } })).status).toBe(401)
    expect((await post('command', command('chat', { text: 'logged out' }), a.cookie)).status).toBe(401)
    expect((await snapshot(b.cookie)).selfId).toBe(B)
    expect((await snapshot(b.cookie)).capacity).toMatchObject({ onlinePlayers: 1, reservedPlayers: 0 })
    expect(runtime.hasConnection(A)).toBe(false)
    expect((await post('command', command('chat', { text: 'still online' }), b.cookie)).status).toBe(200)
  })

  it('requires a room connection even with a valid session cookie', async () => {
    const a = await login(fixtures[0]!.username, 'test-only-password-a')
    const response = await post('command', command('chat', { text: 'not admitted' }), a.cookie)
    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ error: 'ROOM_CONNECTION_REQUIRED' })
    expect((await snapshot(a.cookie)).capacity.selfHasSlot).toBe(false)
    expect(runtime.snapshot(A).messages).toHaveLength(0)
  })

  it('returns JSON before SSE headers when full and releases logout slots immediately', async () => {
    const a = await login(fixtures[0]!.username, 'test-only-password-a')
    const b = await login(fixtures[1]!.username, 'test-only-password-b')
    const c = await login(fixtures[2]!.username, 'test-only-password-c')
    await connect(a.cookie)
    await connect(b.cookie)
    const denied = await fetch(`${base}/mp-api/stream`, { headers: { cookie: c.cookie } })
    expect(denied.status).toBe(409)
    expect(denied.headers.get('content-type')).toContain('application/json')
    expect(await denied.json()).toMatchObject({ error: 'ROOM_FULL' })
    expect((await snapshot(c.cookie)).capacity).toMatchObject({ onlinePlayers: 2, selfHasSlot: false })
    expect((await post('command', command('chat', { text: 'full' }), c.cookie)).status).toBe(409)
    await post('logout', {}, a.cookie)
    const admitted = await connect(c.cookie)
    expect((await admitted.nextSnapshot()).capacity).toMatchObject({ onlinePlayers: 2, reservedPlayers: 0, selfHasSlot: true })
  })

  it('counts duplicate streams once and rejects a third without evicting existing streams', async () => {
    const a = await login(fixtures[0]!.username, 'test-only-password-a')
    await connect(a.cookie)
    await connect(a.cookie)
    const denied = await fetch(`${base}/mp-api/stream`, { headers: { cookie: a.cookie } })
    expect(denied.status).toBe(409)
    expect(await denied.json()).toMatchObject({ error: 'TOO_MANY_CONNECTIONS' })
    expect((await snapshot(a.cookie)).capacity).toMatchObject({ onlinePlayers: 1, reservedPlayers: 0, selfHasSlot: true })
    await post('logout', {}, a.cookie)
    expect(runtime.snapshot(A).capacity).toMatchObject({ onlinePlayers: 0, reservedPlayers: 0 })
  })
})

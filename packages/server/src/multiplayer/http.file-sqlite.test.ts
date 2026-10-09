import Database from 'better-sqlite3'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { createMultiplayerApp, hashPassword } from './http.js'
import { BEACON, generateRoster } from './domain.js'
import { MultiplayerRuntime } from './runtime.js'
import type { FixtureIdentity, RosterPlayer } from './types.js'

type Snapshot = ReturnType<MultiplayerRuntime['snapshot']>
type Stream = {
  abort: AbortController
  reader: ReadableStreamDefaultReader<Uint8Array>
  buffer: string
}

const ORIGIN = 'http://localhost:4178'
const openConnections: Array<{ directory: string; db?: Database.Database; runtime?: MultiplayerRuntime; server?: Server; streams: Stream[] }> = []

function command(type: string, payload: unknown = {}) {
  return { commandId: crypto.randomUUID(), type, payload }
}

async function listen(app: ReturnType<typeof createMultiplayerApp>): Promise<Server> {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', () => resolve(server))
    server.once('error', reject)
  })
}

async function stopServer(server: Server): Promise<void> {
  server.closeAllConnections()
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
}

function fixtureSetup(directory: string) {
  const path = join(directory, 'room.sqlite')
  const roster: RosterPlayer[] = generateRoster(51).map(player => ({ ...player, x: BEACON.x, z: BEACON.z }))
  const fixtures: FixtureIdentity[] = roster.map((player, index) => ({
    id: player.id,
    name: player.name,
    username: `load-test-${index + 1}`,
    passwordHash: hashPassword(`load-test-password-${index + 1}`),
  }))

  function open() {
    const db = new Database(path)
    const runtime = new MultiplayerRuntime(db, {
      roster,
      config: { maxOnlinePlayers: 50, minParticipants: 2, participationWindowTicks: 300 },
    })
    const server = listen(createMultiplayerApp({ runtime, fixtures, allowedOrigins: [ORIGIN] }))
    return { db, runtime, server }
  }
  return { path, roster, fixtures, open }
}

async function login(base: string, fixture: FixtureIdentity) {
  const fixtureNumber = Number(fixture.username.slice('load-test-'.length))
  const response = await fetch(`${base}/mp-api/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: ORIGIN },
    body: JSON.stringify({ username: fixture.username, password: `load-test-password-${fixtureNumber}` }),
  })
  expect(response.status).toBe(200)
  const cookie = response.headers.get('set-cookie')?.split(';')[0]
  expect(cookie).toBeTruthy()
  return cookie!
}

async function connect(base: string, cookie: string, streams: Stream[]): Promise<Stream> {
  const abort = new AbortController()
  const response = await fetch(`${base}/mp-api/stream`, {
    headers: { cookie, accept: 'text/event-stream' },
    signal: abort.signal,
  })
  expect(response.status).toBe(200)
  expect(response.headers.get('content-type')).toContain('text/event-stream')
  const stream = { abort, reader: response.body!.getReader(), buffer: '' }
  streams.push(stream)
  return stream
}

async function nextSnapshot(stream: Stream): Promise<Snapshot> {
  const deadline = setTimeout(() => stream.abort.abort(), 10_000)
  const decoder = new TextDecoder()
  try {
    while (true) {
      const end = stream.buffer.indexOf('\n\n')
      if (end >= 0) {
        const frame = stream.buffer.slice(0, end)
        stream.buffer = stream.buffer.slice(end + 2)
        if (!frame.split('\n').some(line => line.trim() === 'event: snapshot')) continue
        const data = frame.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n')
        return JSON.parse(data) as Snapshot
      }
      const result = await stream.reader.read()
      if (result.done) throw new Error('SSE closed before the expected snapshot')
      stream.buffer += decoder.decode(result.value, { stream: true }).replace(/\r\n/g, '\n')
    }
  } finally {
    clearTimeout(deadline)
  }
}

async function until(stream: Stream, predicate: (snapshot: Snapshot) => boolean): Promise<Snapshot> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const snapshot = await nextSnapshot(stream)
    if (predicate(snapshot)) return snapshot
  }
  throw new Error('Expected SSE state was not observed')
}

async function post(base: string, cookie: string, type: string, payload: unknown = {}) {
  return fetch(`${base}/mp-api/command`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie, origin: ORIGIN },
    body: JSON.stringify(command(type, payload)),
  })
}

afterEach(async () => {
  vi.useRealTimers()
  for (const item of openConnections.splice(0)) {
    for (const stream of item.streams) {
      stream.abort.abort()
      await stream.reader.cancel().catch(() => undefined)
    }
    item.runtime?.stop()
    if (item.server) await stopServer(item.server)
    if (item.db?.open) item.db.close()
    rmSync(item.directory, { recursive: true, force: true })
  }
})

describe('file-backed 50-player multiplayer HTTP integration', () => {
  it('broadcasts to 50 SSE clients, rejects client 51, retains a reconnecting seat, settles a 30-second shared event once, and reopens persisted state', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'greed-multiplayer-http-file-'))
    const fixture = fixtureSetup(directory)
    const cleanup: (typeof openConnections)[number] = { directory, streams: [] }
    openConnections.push(cleanup)

    let opened = fixture.open()
    cleanup.db = opened.db
    cleanup.runtime = opened.runtime
    cleanup.server = await opened.server
    let base = `http://127.0.0.1:${(cleanup.server.address() as AddressInfo).port}`

    vi.useFakeTimers({ toFake: ['Date'] })
    const cookies: string[] = []
    for (let start = 0; start < fixture.fixtures.length; start += 20) {
      const batch = await Promise.all(fixture.fixtures.slice(start, start + 20).map(identity => login(base, identity)))
      cookies.push(...batch)
      if (start + 20 < fixture.fixtures.length) vi.setSystemTime(Date.now() + 60_001)
    }
    vi.useRealTimers()
    const streams = await Promise.all(cookies.slice(0, 50).map(cookie => connect(base, cookie, cleanup.streams)))
    const initial = await Promise.all(streams.map(nextSnapshot))
    expect(initial.map(snapshot => snapshot.selfId)).toEqual(fixture.roster.slice(0, 50).map(player => player.id))
    expect(initial.every(snapshot => snapshot.capacity.maxOnlinePlayers === 50)).toBe(true)

    const rejected = await fetch(`${base}/mp-api/stream`, { headers: { cookie: cookies[50]! } })
    expect(rejected.status).toBe(409)
    expect(await rejected.json()).toMatchObject({ error: 'ROOM_FULL' })

    const moveResponses = await Promise.all(cookies.slice(0, 50).map(cookie => post(base, cookie, 'move', { dx: 0, dz: 1 })))
    expect(moveResponses.every(response => response.status === 200)).toBe(true)
    opened.runtime.advanceTick()
    const movedSnapshots = await Promise.all(streams.map(stream => until(stream, snapshot => snapshot.players.some(player => player.z > BEACON.z))))
    expect(movedSnapshots.every(snapshot => snapshot.players.filter(player => player.z > BEACON.z).length === 50)).toBe(true)

    const chatText = 'broadcast-to-all-50'
    const chatResponse = await post(base, cookies[0]!, 'chat', { text: chatText })
    expect(chatResponse.status).toBe(200)
    opened.runtime.advanceTick()
    const chatSnapshots = await Promise.all(streams.map(stream => until(stream, snapshot => snapshot.messages.some(message => message.text === chatText))))
    expect(chatSnapshots.every(snapshot => snapshot.messages.some(message => message.playerId === fixture.roster[0]!.id && message.text === chatText))).toBe(true)

    streams[0]!.abort.abort()
    await streams[0]!.reader.cancel().catch(() => undefined)
    const reconnected = await connect(base, cookies[0]!, cleanup.streams)
    const reconnectSnapshot = await nextSnapshot(reconnected)
    expect(reconnectSnapshot.capacity).toMatchObject({ maxOnlinePlayers: 50, selfHasSlot: true, onlinePlayers: 50, reservedPlayers: 0 })

    const contributions = await Promise.all(cookies.slice(0, 50).map(cookie => post(base, cookie, 'contribute')))
    expect(contributions.every(response => response.status === 200)).toBe(true)
    expect(opened.runtime.snapshot(fixture.roster[0]!.id).beacon).toMatchObject({ phase: 'collecting', completed: false })
    for (let tick = 0; tick < 300; tick += 1) opened.runtime.advanceTick()
    const settled = opened.runtime.snapshot(fixture.roster[0]!.id)
    expect(settled.beacon).toMatchObject({ phase: 'completed', completed: true })
    expect(settled.players.slice(0, 50).every(player => player.rewards === 1 && player.supplies === 0)).toBe(true)
    expect(settled.players[50]).toMatchObject({ rewards: 0, supplies: 1 })
    await connect(base, cookies[1]!, cleanup.streams)
    const duplicateClaim = await post(base, cookies[1]!, 'contribute')
    expect(duplicateClaim.status).toBe(409)
    expect(await duplicateClaim.json()).toMatchObject({ error: 'ALREADY_CONTRIBUTED' })
    expect(opened.runtime.snapshot(fixture.roster[0]!.id).players.slice(0, 50).every(player => player.rewards === 1)).toBe(true)

    for (const stream of cleanup.streams) {
      stream.abort.abort()
      await stream.reader.cancel().catch(() => undefined)
    }
    cleanup.streams.length = 0
    opened.runtime.stop()
    await stopServer(cleanup.server)
    opened.db.close()

    opened = await fixture.open()
    cleanup.db = opened.db
    cleanup.runtime = opened.runtime
    cleanup.server = await opened.server
    base = `http://127.0.0.1:${(cleanup.server.address() as AddressInfo).port}`
    const reopenedCookie = await login(base, fixture.fixtures[0]!)
    const reopenedSnapshot = await (await fetch(`${base}/mp-api/snapshot`, { headers: { cookie: reopenedCookie } })).json() as Snapshot
    expect(reopenedSnapshot.players.map(({ rewards, supplies }) => ({ rewards, supplies }))).toEqual(settled.players.map(({ rewards, supplies }) => ({ rewards, supplies })))
    expect(reopenedSnapshot.beacon).toEqual(settled.beacon)
  }, 180_000)
})

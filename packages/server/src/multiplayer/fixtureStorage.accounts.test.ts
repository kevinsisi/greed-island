import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { AccountStore } from './accounts.js'
import { SqliteEventStore } from '../kernel/eventStore.js'
import { createMultiplayerApp, hashPassword } from './http.js'
import { openFixtureStore, preparePersistentDataDirectory, type FixtureStore } from './fixtureStorage.js'

const ORIGIN = 'http://localhost:4178'
const directories: string[] = []
afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }) })

async function start(store: FixtureStore, dataDir: string): Promise<{ server: Server; base: string }> {
  const server = await new Promise<Server>((resolve, reject) => {
    const candidate = createMultiplayerApp({
      runtime: store.runtime,
      fixtures: store.fixtures,
      accountsPath: join(dataDir, 'accounts.json'),
      allowedOrigins: [ORIGIN],
    }).listen(0, '127.0.0.1', () => resolve(candidate))
    candidate.once('error', reject)
  })
  return { server, base: `http://127.0.0.1:${(server.address() as AddressInfo).port}` }
}

async function stop(store: FixtureStore | undefined, server: Server | undefined): Promise<void> {
  if (server) {
    server.closeAllConnections()
    await new Promise<void>(resolve => server.close(() => resolve()))
  }
  if (store) { store.runtime.stop(); if (store.db.open) store.db.close() }
}

describe('registered accounts survive fixture-store restart', () => {
  it('reopens the same SQLite event log, keeps all fixtures, and lets the registered account log in', async () => {
    const root = mkdtempSync(join(tmpdir(), 'greed-multiplayer-registration-restart-'))
    directories.push(root)
    const dataDir = join(root, 'persistent-room')
    const prepared = preparePersistentDataDirectory(dataDir)
    let store: FixtureStore | undefined = openFixtureStore(prepared.dataDir, 50, prepared.existing)
    let server: Server | undefined
    try {
      const firstRun = await start(store, dataDir)
      server = firstRun.server
      const password = 'restart-test-passphrase-22'
      const registered = await fetch(`${firstRun.base}/mp-api/register`, {
        method: 'POST',
        headers: { origin: ORIGIN, 'content-type': 'application/json' },
        body: JSON.stringify({ username: 'restart-traveler', password }),
      })
      expect(registered.status).toBe(201)
      const registeredBody = await registered.json() as { snapshot: { selfId: string } }
      const playerId = registeredBody.snapshot.selfId
      await stop(store, server)
      store = undefined
      server = undefined

      store = openFixtureStore(dataDir, 50, true)
      expect(store.credentials).toHaveLength(50)
      const restarted = await start(store, dataDir)
      server = restarted.server

      const newLogin = await fetch(`${restarted.base}/mp-api/login`, {
        method: 'POST',
        headers: { origin: ORIGIN, 'content-type': 'application/json' },
        body: JSON.stringify({ username: 'restart-traveler', password }),
      })
      expect(newLogin.status).toBe(200)
      const cookie = newLogin.headers.get('set-cookie')!.split(';')[0]!
      const snapshotResponse = await fetch(`${restarted.base}/mp-api/snapshot`, { headers: { cookie } })
      expect(snapshotResponse.status).toBe(200)
      const snapshot = await snapshotResponse.json() as { players: Array<{ id: string }> }
      expect(snapshot.players.map(player => player.id)).toContain(playerId)

      const fixture = store.credentials[0]!
      const fixtureLogin = await fetch(`${restarted.base}/mp-api/login`, {
        method: 'POST',
        headers: { origin: ORIGIN, 'content-type': 'application/json' },
        body: JSON.stringify({ username: fixture.username, password: fixture.password }),
      })
      expect(fixtureLogin.status).toBe(200)
    } finally {
      await stop(store, server)
    }
  })

  it('rejects a room event player with no fixture credential or registered account', () => {
    const root = mkdtempSync(join(tmpdir(), 'greed-multiplayer-unknown-player-'))
    directories.push(root)
    const dataDir = join(root, 'persistent-room')
    const prepared = preparePersistentDataDirectory(dataDir)
    const first = openFixtureStore(prepared.dataDir, 50, prepared.existing)
    first.runtime.addPlayer({ id: 'player-unrecognized', name: 'unrecognized', x: 0, z: -6 })
    first.runtime.stop()
    first.db.close()

    expect(() => openFixtureStore(dataDir, 50, true)).toThrow(/Fixture credentials do not match the persisted fixture roster/i)
  })

  it('recovers an account file entry whose player-joined event was not committed before a crash', async () => {
    const root = mkdtempSync(join(tmpdir(), 'greed-multiplayer-orphan-account-'))
    directories.push(root)
    const dataDir = join(root, 'persistent-room')
    const prepared = preparePersistentDataDirectory(dataDir)
    const first = openFixtureStore(prepared.dataDir, 50, prepared.existing)
    const orphan = { id: 'player-orphaned-register', name: 'orphan-recovery', username: 'orphan-recovery', passwordHash: hashPassword('orphan-test-passphrase-22'), role: 'player' as const }
    new AccountStore(join(dataDir, 'accounts.json')).write([orphan])
    first.runtime.stop()
    first.db.close()

    const recovered = openFixtureStore(dataDir, 50, true)
    const server = await start(recovered, dataDir)
    try {
      expect(new SqliteEventStore(recovered.db).readEvents().some(event => event.eventType === 'MP_PLAYER_JOINED' && (event.payload as { player?: { id?: string } }).player?.id === orphan.id)).toBe(true)
      const login = await fetch(`${server.base}/mp-api/login`, {
        method: 'POST',
        headers: { origin: ORIGIN, 'content-type': 'application/json' },
        body: JSON.stringify({ username: orphan.username, password: 'orphan-test-passphrase-22' }),
      })
      expect(login.status).toBe(200)
      const cookie = login.headers.get('set-cookie')!.split(';')[0]!
      const snapshot = await (await fetch(`${server.base}/mp-api/snapshot`, { headers: { cookie } })).json() as { players: Array<{ id: string }> }
      expect(snapshot.players.map(player => player.id)).toContain(orphan.id)
    } finally { await stop(recovered, server.server) }
  })
})

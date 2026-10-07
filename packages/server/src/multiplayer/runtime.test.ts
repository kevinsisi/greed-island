import Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SqliteEventStore } from '../kernel/eventStore.js'
import { applyEvents, DomainError, projectEvents } from './domain.js'
import { MultiplayerRuntime } from './runtime.js'

type Snapshot = ReturnType<MultiplayerRuntime['snapshot']>
const A = 'player-a'
const B = 'player-b'
const openRooms: Array<{ db: Database.Database; runtime: MultiplayerRuntime }> = []

function room(path = ':memory:') {
  const db = new Database(path)
  const runtime = new MultiplayerRuntime(db)
  openRooms.push({ db, runtime })
  return { db, runtime }
}

function command(type: string, payload: unknown = {}, commandId = randomUUID()) {
  return { commandId, type, payload }
}

function player(snapshot: Snapshot, id: string) {
  const result = snapshot.players.find((entry) => entry.id === id)
  if (!result) throw new Error(`Missing player ${id}`)
  return result
}

function walk(runtime: MultiplayerRuntime, id: string, dx: number, dz: number, steps: number) {
  for (let step = 0; step < steps; step += 1) {
    runtime.advanceTick()
    runtime.execute(id, command('move', { dx, dz }))
  }
}

function walkToBeacon(runtime: MultiplayerRuntime, id: string) {
  // Both fixture spawns have a clear, straight path to the beacon interaction radius.
  walk(runtime, id, 0, 1, 30)
  const snapshot = runtime.snapshot(id)
  const self = player(snapshot, id)
  expect(Math.hypot(self.x - snapshot.beacon.x, self.z - snapshot.beacon.z)).toBeLessThanOrEqual(snapshot.beacon.radius)
}

afterEach(() => {
  for (const { db, runtime } of openRooms.splice(0)) {
    runtime.stop()
    if (db.open) db.close()
  }
})

describe('authoritative multiplayer room', () => {
  it('shares one room while identifying each authenticated player separately', () => {
    const { runtime } = room()
    const a = runtime.snapshot(A)
    const b = runtime.snapshot(B)
    expect(a.selfId).toBe(A)
    expect(b.selfId).toBe(B)
    expect(a.players).toEqual(b.players)
    expect(a.players).toHaveLength(2)
    expect(a.players.map(({ supplies, rewards }) => ({ supplies, rewards }))).toEqual([
      { supplies: 1, rewards: 0 }, { supplies: 1, rewards: 0 },
    ])
    expect(a.npcIntegrated).toBe(false)
    expect(() => runtime.snapshot('unknown-player')).toThrow(DomainError)
    expect(() => runtime.execute('unknown-player', command('chat', { text: 'hello' }))).toThrow(DomainError)
  })

  it('normalizes diagonal movement, limits it per tick, and never moves a peer', () => {
    const { runtime } = room()
    const before = runtime.snapshot(A)
    const moved = runtime.execute(A, command('move', { dx: 1, dz: 1 })).snapshot
    const initial = player(before, A)
    const actual = player(moved, A)
    expect(Math.hypot(actual.x - initial.x, actual.z - initial.z)).toBeCloseTo(0.4, 5)
    expect(player(moved, B)).toEqual(player(before, B))
    expect(() => runtime.execute(A, command('move', { dx: 0, dz: 1 }))).toThrowError(
      expect.objectContaining({ status: 429, code: 'MOVE_RATE_LIMIT' }),
    )
    expect(runtime.snapshot(A)).toEqual(moved)
    runtime.advanceTick()
    const next = runtime.execute(A, command('move', { dx: 0, dz: 1 })).snapshot
    expect(player(next, A).z - actual.z).toBeCloseTo(0.4, 5)
  })

  it('keeps movement within world bounds and blocks passage through buildings', () => {
    const { runtime } = room()
    walk(runtime, A, 0, -1, 100)
    let snapshot = runtime.snapshot(A)
    expect(player(snapshot, A).z).toBeGreaterThanOrEqual(snapshot.world.minZ)
    walk(runtime, A, -1, 0, 100)
    snapshot = runtime.snapshot(A)
    expect(player(snapshot, A).x).toBeGreaterThanOrEqual(snapshot.world.minX)

    // Player B approaches the southern face of the eastern building.
    walk(runtime, B, 1, 0, 12)
    const building = runtime.snapshot(B).world.obstacles.find((entry) => entry.x > 0)!
    expect(building).toBeDefined()
    for (let step = 0; step < 100; step += 1) {
      walk(runtime, B, 0, 1, 1)
      const position = player(runtime.snapshot(B), B)
      expect(position.z).toBeLessThanOrEqual(building.z - building.depth / 2)
    }
  })

  it.each([
    null,
    [],
    { type: 'move', payload: { dx: 0, dz: 1 } },
    command('move', { dx: Number.NaN, dz: 1 }),
    command('move', { dx: 0, dz: Number.POSITIVE_INFINITY }),
    command('move', { dx: '0', dz: 1 }),
    command('move', { x: 0, z: 6 }),
    command('move', { dx: 0, dz: 1, playerId: B }),
    command('contribute', { playerId: B }),
    command('contribute', { supplies: 100, rewards: 100 }),
    command('chat', { text: '' }),
    command('chat', { text: 'x'.repeat(10_000) }),
    { ...command('chat', { text: 'hello' }), actorId: B },
    command('award', { playerId: A, quantity: 1 }),
  ])('rejects malformed or forged commands without changing committed state (%#)', (input) => {
    const { runtime } = room()
    const before = runtime.snapshot(A)
    expect(() => runtime.execute(A, input)).toThrow(DomainError)
    expect(runtime.snapshot(A)).toEqual(before)
  })

  it('requires two distinct nearby players, consumes real supplies and awards each exactly once', () => {
    const { runtime } = room()
    expect(() => runtime.execute(A, command('contribute'))).toThrow(DomainError)
    walkToBeacon(runtime, A)
    const first = command('contribute')
    runtime.execute(A, first)
    let snapshot = runtime.snapshot(A)
    expect(snapshot.beacon.contributors).toEqual([A])
    expect(snapshot.beacon.completed).toBe(false)
    expect(player(snapshot, A)).toMatchObject({ supplies: 0, rewards: 0 })
    expect(() => runtime.execute(A, command('contribute'))).toThrow(DomainError)

    walkToBeacon(runtime, B)
    const second = command('contribute')
    runtime.execute(B, second)
    snapshot = runtime.snapshot(A)
    expect(snapshot.beacon.completed).toBe(true)
    expect(new Set(snapshot.beacon.contributors)).toEqual(new Set([A, B]))
    expect(snapshot.players.map(({ supplies, rewards }) => ({ supplies, rewards }))).toEqual([
      { supplies: 0, rewards: 1 }, { supplies: 0, rewards: 1 },
    ])
    expect(runtime.execute(A, first).duplicate).toBe(true)
    expect(runtime.execute(B, second).duplicate).toBe(true)
    expect(() => runtime.execute(A, command('contribute'))).toThrow(DomainError)
    expect(() => runtime.execute(B, command('contribute'))).toThrow(DomainError)
    expect(runtime.snapshot(A)).toEqual(snapshot)
  })

  it('returns duplicate receipts without reprojecting or publishing and rejects changed request bodies', () => {
    const { runtime } = room()
    const notify = vi.fn()
    const unsubscribe = runtime.subscribe(notify)
    const original = command('chat', { text: 'Meet at the beacon.' })
    runtime.execute(A, original)
    const snapshot = runtime.snapshot(A)
    const calls = notify.mock.calls.length
    expect(runtime.execute(A, original)).toMatchObject({ duplicate: true, snapshot })
    expect(notify).toHaveBeenCalledTimes(calls)
    expect(() => runtime.execute(A, { ...original, payload: { text: 'Changed message' } })).toThrow(DomainError)
    expect(runtime.snapshot(A)).toEqual(snapshot)
    unsubscribe()
  })

  it('scopes command receipts to the authenticated player, even when IDs are equal', () => {
    const { runtime } = room()
    const sharedId = randomUUID()
    runtime.execute(A, command('chat', { text: 'A message' }, sharedId))
    runtime.execute(B, command('chat', { text: 'B message' }, sharedId))
    expect(runtime.snapshot(A).messages.map(({ playerId, text }) => ({ playerId, text }))).toEqual([
      { playerId: A, text: 'A message' }, { playerId: B, text: 'B message' },
    ])
  })

  it('makes the projection independently safe against duplicate and out-of-order event delivery', () => {
    const { db, runtime } = room()
    walkToBeacon(runtime, A)
    walkToBeacon(runtime, B)
    runtime.execute(A, command('contribute'))
    runtime.execute(B, command('contribute'))
    const events = new SqliteEventStore(db).readEvents()
    const projected = projectEvents(events)
    expect(projected.players.map((entry) => entry.rewards)).toEqual([1, 1])
    expect(projectEvents([...events].reverse().concat(events))).toEqual(projected)
    expect(applyEvents(projected, events)).toEqual(projected)
  })

  it('rolls back contribution, completion and both rewards together if receipt persistence fails', () => {
    const { db, runtime } = room()
    walkToBeacon(runtime, A)
    walkToBeacon(runtime, B)
    runtime.execute(A, command('contribute'))
    const before = runtime.snapshot(A)
    const store = new SqliteEventStore(db)
    const eventsBefore = store.readEvents()
    const contribution = command('contribute')
    db.exec("CREATE TRIGGER test_fail_receipt BEFORE INSERT ON mp_command_receipts WHEN NEW.player_id = 'player-b' BEGIN SELECT RAISE(ABORT, 'fixture write failure'); END")
    expect(() => runtime.execute(B, contribution)).toThrow('fixture write failure')
    expect(runtime.snapshot(A)).toEqual(before)
    expect(store.readEvents()).toEqual(eventsBefore)
    db.exec('DROP TRIGGER test_fail_receipt')
    runtime.execute(B, contribution)
    const after = runtime.snapshot(A)
    expect(after.beacon.completed).toBe(true)
    expect(after.players.map(({ supplies, rewards }) => ({ supplies, rewards }))).toEqual([
      { supplies: 0, rewards: 1 }, { supplies: 0, rewards: 1 },
    ])
  })

  it('returns detached snapshots so a consumer cannot mutate authoritative resources', () => {
    const { runtime } = room()
    const before = runtime.snapshot(A)
    const external = runtime.snapshot(A)
    player(external, A).supplies = 999
    player(external, B).rewards = 999
    external.beacon.contributors.push(B)
    external.messages.push({ id: 'fake', playerId: B, name: 'fake', text: 'fake', tick: 0 })
    expect(runtime.snapshot(A)).toEqual(before)
  })

  it('reconstructs identical durable state and receipts after SQLite closes and reopens', () => {
    const directory = mkdtempSync(join(tmpdir(), 'greed-multiplayer-test-'))
    const path = join(directory, 'room.sqlite')
    try {
      const original = room(path)
      walkToBeacon(original.runtime, A)
      walkToBeacon(original.runtime, B)
      const a = command('contribute')
      const b = command('contribute')
      original.runtime.execute(A, a)
      original.runtime.execute(B, b)
      original.runtime.execute(B, command('chat', { text: 'The beacon is lit.' }))
      const snapshot = original.runtime.snapshot(A)
      original.runtime.stop()
      original.db.close()

      const reopened = room(path).runtime
      expect(reopened.snapshot(A)).toEqual(snapshot)
      expect(reopened.execute(A, a).duplicate).toBe(true)
      expect(reopened.execute(B, b).duplicate).toBe(true)
      expect(() => reopened.execute(A, command('contribute'))).toThrow(DomainError)
      expect(() => reopened.execute(B, command('contribute'))).toThrow(DomainError)
      expect(reopened.snapshot(A)).toEqual(snapshot)
    } finally {
      for (const { db, runtime } of openRooms.splice(0)) {
        runtime.stop()
        if (db.open) db.close()
      }
      rmSync(directory, { recursive: true, force: true })
    }
  })
})

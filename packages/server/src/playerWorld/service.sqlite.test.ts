import Database from 'better-sqlite3'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { accountId } from '../identity/principal.js'
import { SqliteEventStore } from '../kernel/eventStore.js'
import { getKnownMapEdges, getKnownMapRegions, getMapAdjacency } from '../sim/mapGraph.js'
import { PlayerWorldService } from './service.js'
import { PLAYER_WORLD_EVENT_TYPES } from './types.js'

const alice = accountId(1), bob = accountId(2)
const body = (commandId: string, type = 'move', payload: object = { dx: 1, dz: 0 }) => ({ commandId, type, payload })
function setup(db: Database.Database, observer = vi.fn()) {
  const store = new SqliteEventStore(db)
  const source = { getMap: () => ({ regions: getKnownMapRegions(), adjacency: getMapAdjacency(), edges: getKnownMapEdges() }),
    getTick: () => 3, getRevision: () => store.readLatestFactSnapshot().lastSequence, getNpcs: () => [] }
  return { store, service: new PlayerWorldService(store, source, { onCommitted: observer }), observer }
}

describe('canonical player-world actual better-sqlite3 integration', () => {
  it('persists every accepted movement and water crossing through a file reopen without changing existing player progress', () => {
    const directory = mkdtempSync(join(tmpdir(), 'greed-player-world-')), path = join(directory, 'canonical.sqlite')
    let db = new Database(path)
    try {
      db.exec('CREATE TABLE existing_progress(account_id INTEGER PRIMARY KEY, gold INTEGER, quest_json TEXT)')
      db.prepare('INSERT INTO existing_progress VALUES(?,?,?)').run(1, 321, '{"oldTask":"unmapped"}')
      const { service, store } = setup(db); service.execute(alice, body('join', 'enter', {}))
      for (let step = 0; step < 55; step += 1) { service.advanceMovementStep(); service.execute(alice, body(`move-${step}`, 'move', { dx: 0, dz: 1 })) }
      expect(service.getPosition(alice)).toMatchObject({ tileId: 't_dock', x: 0, z: 16 })
      service.advanceMovementStep(); const crossing = service.execute(alice, body('cross', 'transition', { toTileId: 't_central' }))
      const expected = service.getPosition(alice); expect(expected).toMatchObject({ tileId: 't_central', x: 7, z: 9 })
      expect(store.readEventsByTypes(PLAYER_WORLD_EVENT_TYPES)).toHaveLength(57)
      db.close(); db = new Database(path); const reopened = setup(db)
      expect(reopened.service.getPosition(alice)).toEqual(expected)
      expect(reopened.service.execute(alice, body('cross', 'transition', { toTileId: 't_central' }))).toEqual({ ...crossing, duplicate: true })
      expect(db.prepare('SELECT * FROM existing_progress').get()).toEqual({ account_id: 1, gold: 321, quest_json: '{"oldTask":"unmapped"}' })
      reopened.service.advanceMovementStep(); reopened.service.execute(alice, body('return', 'transition', { toTileId: 't_dock' }))
      expect(reopened.service.getPosition(alice)).toMatchObject({ tileId: 't_dock', x: 0, z: 16 })
    } finally { if (db.open) db.close(); rmSync(directory, { recursive: true, force: true }) }
  })
  it('receipts and position events remain atomic if append fails after SQLite insertion', () => {
    const db = new Database(':memory:')
    try {
      const { store, service, observer } = setup(db), original = store.appendEvents.bind(store)
      const spy = vi.spyOn(store, 'appendEvents').mockImplementation(drafts => { original(drafts); throw new Error('after-insert') })
      expect(() => service.execute(alice, body('join', 'enter', {}))).toThrow('after-insert')
      expect(store.readEvents()).toHaveLength(0); expect(service.getPosition(alice)).toBeNull(); expect(observer).not.toHaveBeenCalled()
      spy.mockRestore(); expect(service.execute(alice, body('join', 'enter', {})).duplicate).toBeUndefined()
    } finally { db.close() }
  })
  it('concurrent queue retries commit one fact and conflicting reuse cannot overwrite it', async () => {
    const db = new Database(':memory:')
    try {
      const { service, store } = setup(db), first = service.submit(alice, body('join', 'enter', {})), retry = service.submit(alice, body('join', 'enter', {}))
      service.advanceMovementStep(); const joined = await Promise.all([first, retry])
      expect(joined[0]?.revision).toBe(joined[1]?.revision); expect(joined[1]?.duplicate).toBe(true)
      expect(store.readEvents()).toHaveLength(1)
      expect(() => service.execute(alice, body('join'))).toThrow('different content')
      expect(store.readEventsByActorCommand('1', 'player-world:1:join', PLAYER_WORLD_EVENT_TYPES)).toHaveLength(1)
      expect(store.readLatestEventsPerActor(PLAYER_WORLD_EVENT_TYPES)).toHaveLength(1)
    } finally { db.close() }
  })
  it('small synthetic queued workload reports event/transaction rate and bounded snapshot fanout', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'greed-player-benchmark-')), path = join(directory, 'synthetic.sqlite'), db = new Database(path)
    try {
      db.pragma('journal_mode = WAL'); db.pragma('synchronous = FULL')
      const { service, store } = setup(db)
      service.executeBatch([{ accountId: alice, body: body('join', 'enter', {}) }, { accountId: bob, body: body('join', 'enter', {}) }])
      const disconnectAlice = service.connect(alice), disconnectBob = service.connect(bob), published = vi.fn()
      const unsubscribe = service.subscribe(() => { service.snapshot(alice); service.snapshot(bob); published() })
      service.advanceMovementStep(); published.mockClear()
      const transaction = vi.spyOn(store, 'runInTransaction'), steps = 100, started = performance.now()
      for (let step = 0; step < steps; step += 1) {
        const dx = step % 2 ? -1 : 1
        const pending = [service.submit(alice, body(`m-${step}`, 'move', { dx, dz: 0 })), service.submit(bob, body(`m-${step}`, 'move', { dx, dz: 0 }))]
        service.advanceMovementStep(); await Promise.all(pending)
      }
      const elapsedMs = performance.now() - started
      expect(transaction).toHaveBeenCalledTimes(steps); expect(store.readEvents()).toHaveLength(2 + 2 * steps)
      expect(published).toHaveBeenCalledTimes(steps)
      console.info('[canonical-player-world synthetic benchmark]', JSON.stringify({ players: 2, movementEvents: 2 * steps,
        transactions: steps, snapshotPublications: published.mock.calls.length, elapsedMs,
        eventsPerSecond: 2 * steps * 1000 / elapsedMs, transactionsPerSecond: steps * 1000 / elapsedMs,
        durability: 'file-backed better-sqlite3 WAL synchronous=FULL; all accepted steps', liveLoad: false }))
      unsubscribe(); disconnectAlice(); disconnectBob()
    } finally { db.close(); rmSync(directory, { recursive: true, force: true }) }
  })
})

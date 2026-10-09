import Database from 'better-sqlite3'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { accountId } from '../identity/principal.js'
import { SqliteEventStore } from '../kernel/eventStore.js'
import { getKnownMapEdges, getKnownMapRegions, getMapAdjacency } from '../sim/mapGraph.js'
import { PlayerWorldService } from './service.js'

const enter = { commandId: 'enter', type: 'enter', payload: {} }
const move = { commandId: 'move', type: 'move', payload: { dx: 1, dz: 0 } }
function create(db: Database.Database) {
  const store = new SqliteEventStore(db)
  const source = { getMap: () => ({ regions: getKnownMapRegions(), adjacency: getMapAdjacency(), edges: getKnownMapEdges() }),
    getTick: () => 3, getRevision: () => store.readLatestFactSnapshot().lastSequence, getNpcs: () => [] }
  return { store, service: new PlayerWorldService(store, source) }
}
describe('canonical50-account native capacity and restart, no external load', () => {
  it('persists one50-account movement batch, bounds personalized fanout, rejects51st admission and reopens exactly', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'greed-capacity-synthetic-')), path = join(directory, 'canonical.sqlite')
    let db = new Database(path)
    try {
      db.pragma('journal_mode = WAL'); db.pragma('synchronous = FULL')
      const { store, service } = create(db), ids = Array.from({ length: 51 }, (_, index) => accountId(index + 1))
      service.executeBatch(ids.map(id => ({ accountId: id, body: enter })))
      const listeners = ids.slice(0, 50).map(() => vi.fn()), disconnect = ids.slice(0, 50).map((id, index) => service.subscribeAccount(id, listeners[index]!))
      expect(() => service.connect(ids[50]!)).toThrow('capacity is full')
      await expect(service.submit(ids[50]!, move)).rejects.toMatchObject({ code: 'WORLD_CONNECTION_REQUIRED' })
      const extraTab = service.subscribeAccount(ids[0]!, () => {}); expect(service.snapshot(ids[0]!).players).toHaveLength(50)
      service.advanceMovementStep(); listeners.forEach(listener => listener.mockClear())
      const transaction = vi.spyOn(store, 'runInTransaction'), publications = vi.fn(); service.subscribe(publications)
      const start = performance.now(), pending = ids.slice(0, 50).map(id => service.submit(id, move))
      service.advanceMovementStep(); const acks = await Promise.all(pending), elapsedMs = performance.now() - start
      expect(transaction).toHaveBeenCalledOnce(); expect(publications).toHaveBeenCalledOnce(); expect(acks).toHaveLength(50)
      expect(new Set(acks.map(ack => ack.revision)).size).toBe(50); expect(store.readEvents()).toHaveLength(101)
      listeners.forEach(listener => { expect(listener).toHaveBeenCalledOnce(); expect(listener.mock.calls[0]![0].players).toHaveLength(50) })
      const bytes = listeners.reduce((sum, listener) => sum + Buffer.byteLength(JSON.stringify(listener.mock.calls[0]![0])), 0)
      const expected = ids.map(id => service.getPosition(id)); disconnect[0]!(); expect(() => service.connect(ids[50]!)).toThrow('capacity is full')
      extraTab(); const newcomer = service.connect(ids[50]!); expect(() => service.connect(ids[0]!)).toThrow('capacity is full')
      newcomer(); const restored = service.connect(ids[0]!); restored(); disconnect.forEach(close => close())
      db.close(); db = new Database(path); const reopened = create(db)
      expect(ids.map(id => reopened.service.getPosition(id))).toEqual(expected)
      const resumed = ids.slice(0, 50).map(id => reopened.service.connect(id)); expect(() => reopened.service.connect(ids[50]!)).toThrow('capacity is full')
      expect(reopened.service.execute(ids[0]!, move)).toMatchObject({ accepted: true, duplicate: true })
      resumed.forEach(close => close()); expect(reopened.store.readEvents()).toHaveLength(101)
      console.info('[canonical50-account bounded synthetic]', JSON.stringify({ accounts: 50, acceptedMovementEvents: 50,
        transactions: 1, observablePublications: 1, personalizedSnapshots: 50, serializedSnapshotBytes: bytes, elapsedMs,
        eventsPerSecond: 50 * 1000 / elapsedMs, durability: 'file-backed better-sqlite3 WAL FULL; all accepted steps',
        admissionCap: 50, perAccountTabsCountOnce: true, reopenedPositions: 51, externalNetworkLoad: false, productionLoad: false }))
    } finally { if (db.open) db.close(); rmSync(directory, { recursive: true, force: true }) }
  })
})

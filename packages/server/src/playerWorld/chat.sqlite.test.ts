import Database from 'better-sqlite3'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { accountId } from '../identity/principal.js'
import { SqliteEventStore } from '../kernel/eventStore.js'
import { getKnownMapEdges, getKnownMapRegions, getMapAdjacency } from '../sim/mapGraph.js'
import { PlayerWorldService } from './service.js'

const alice = accountId(1), bob = accountId(2), enter = { commandId: 'enter', type: 'enter', payload: {} }
const chat = (commandId: string, text: string) => ({ commandId, type: 'chat', payload: { text } })
function create(db: Database.Database) {
  const store = new SqliteEventStore(db), source = { getMap: () => ({ regions: getKnownMapRegions(), adjacency: getMapAdjacency(), edges: getKnownMapEdges() }),
    getTick: () => 3, getRevision: () => store.readLatestFactSnapshot().lastSequence, getNpcs: () => [] }
  return { store, service: new PlayerWorldService(store, source) }
}
describe('canonical chat actual SQLite durability', () => {
  it('persists shared chat/actor/tile and idempotent ACK across file reopen without changing positions', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'greed-chat-synthetic-')), path = join(directory, 'canonical.sqlite'); let db = new Database(path)
    try {
      const { service } = create(db); service.execute(alice, enter); service.execute(bob, enter); const disconnect = service.connect(alice)
      const before = service.getPosition(alice), pending = service.submit(alice, chat('first', 'world text')); service.advanceMovementStep(); const ack = await pending
      const messages = service.snapshot(alice).messages; expect(service.getPosition(alice)).toEqual(before); disconnect()
      db.close(); db = new Database(path); const reopened = create(db)
      expect(reopened.service.snapshot(bob).messages).toEqual(messages)
      const live = reopened.service.connect(alice), retry = reopened.service.submit(alice, chat('first', 'world text')); reopened.service.advanceMovementStep()
      expect(await retry).toEqual({ ...ack, duplicate: true }); expect(reopened.store.readEventsByTypes(['PLAYER_WORLD_CHAT_POSTED'])).toHaveLength(1)
      expect(reopened.service.getPosition(alice)).toEqual(before); live()
    } finally { if (db.open) db.close(); rmSync(directory, { recursive: true, force: true }) }
  })
  it('rolls a mixed move/chat batch back after insertion and keeps private NPC dialogue out of the public projection', async () => {
    const db = new Database(':memory:')
    try {
      const { service, store } = create(db); service.execute(alice, enter); service.connect(alice)
      store.appendEvents([{ eventId: 'private-npc-dialog', eventType: 'PLAYER_NPC_DIALOGUE', actorId: '1', occurredAt: 0,
        deterministicKey: 'private-npc-dialog', version: 1, payload: { data: { playerMessage: 'private' } } }])
      const original = store.appendEvents.bind(store), fail = vi.spyOn(store, 'appendEvents').mockImplementation(drafts => { original(drafts); throw new Error('after-insert') })
      const pending = [service.submit(alice, { commandId: 'move', type: 'move', payload: { dx: 1, dz: 0 } }).catch(error => error),
        service.submit(alice, chat('chat', 'public')).catch(error => error)]
      service.advanceMovementStep(); expect((await Promise.all(pending)).every(error => error.message === 'after-insert')).toBe(true)
      expect(service.getPosition(alice)?.x).toBe(0); expect(service.snapshot(alice).messages).toHaveLength(0)
      fail.mockRestore(); expect(store.readEventsByTypes(['PLAYER_WORLD_CHAT_POSTED'])).toHaveLength(0)
    } finally { db.close() }
  })
})

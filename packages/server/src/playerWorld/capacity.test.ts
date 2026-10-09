import { describe, expect, it, vi } from 'vitest'
import { accountId } from '../identity/principal.js'
import type { SqliteEventStore } from '../kernel/eventStore.js'
import { getKnownMapEdges, getKnownMapRegions, getMapAdjacency } from '../sim/mapGraph.js'
import { PlayerWorldService } from './service.js'
import { EventFixture } from './service.testSupport.js'

const enter = { commandId: 'enter', type: 'enter', payload: {} }
const move = { commandId: 'move', type: 'move', payload: { dx: 1, dz: 0 } }
describe('declared canonical capacity, pure in-process verification', () => {
  it('admits50 unique accounts, batches50 queued moves, and preserves capacity under multiple tabs/reconnect', async () => {
    const fixture = new EventFixture(), ids = Array.from({ length: 51 }, (_, index) => accountId(index + 1))
    const source = { getMap: () => ({ regions: getKnownMapRegions(), adjacency: getMapAdjacency(), edges: getKnownMapEdges() }),
      getTick: () => 3, getRevision: () => fixture.events.at(-1)?.sequence ?? 0, getNpcs: () => [] }
    const service = new PlayerWorldService(fixture as unknown as SqliteEventStore, source)
    service.executeBatch(ids.map(id => ({ accountId: id, body: enter })))
    const snapshots = ids.slice(0, 50).map(() => vi.fn()), disconnect = ids.slice(0, 50).map((id, index) => service.subscribeAccount(id, snapshots[index]!))
    expect(() => service.connect(ids[50]!)).toThrow('capacity is full')
    await expect(service.submit(ids[50]!, move)).rejects.toMatchObject({ code: 'WORLD_CONNECTION_REQUIRED' })
    service.advanceMovementStep(); snapshots.forEach(listener => listener.mockClear())
    const before = fixture.transactions, pending = ids.slice(0, 50).map(id => service.submit(id, move))
    service.advanceMovementStep(); const acks = await Promise.all(pending)
    expect(acks).toHaveLength(50); expect(fixture.transactions - before).toBe(1); expect(fixture.events).toHaveLength(101)
    snapshots.forEach(listener => { expect(listener).toHaveBeenCalledOnce(); expect(listener.mock.calls[0]![0].players).toHaveLength(50) })
    const secondTab = service.subscribeAccount(ids[0]!, () => {}); disconnect[0]!()
    expect(() => service.connect(ids[50]!)).toThrow('capacity is full'); expect(service.snapshot(ids[0]!).map.regionOnlineCounts.t_dock).toBe(50)
    secondTab(); const newcomer = service.connect(ids[50]!); expect(() => service.connect(ids[0]!)).toThrow('capacity is full')
    newcomer(); const restored = service.connect(ids[0]!)
    expect(service.getPosition(ids[0]!)?.x).toBe(0.4); expect(service.snapshot(ids[0]!).players).toHaveLength(50)
    restored(); disconnect.forEach(close => close()); expect(fixture.events).toHaveLength(101)
  })
})

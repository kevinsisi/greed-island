import { describe, expect, it, vi } from 'vitest'
import { accountId } from '../identity/principal.js'
import type { SqliteEventStore } from '../kernel/eventStore.js'
import { getKnownMapEdges, getKnownMapRegions, getMapAdjacency } from '../sim/mapGraph.js'
import { PlayerWorldService } from './service.js'

import { EventFixture } from './service.testSupport.js'

const alice = accountId(1), bob = accountId(2)
const body = (commandId: string, type = 'move', payload: object = { dx: 1, dz: 0 }) => ({ commandId, type, payload })
function setup(observer = vi.fn()) {
  const fixture = new EventFixture()
  const source = { getMap: () => ({ regions: getKnownMapRegions(), adjacency: getMapAdjacency(), edges: getKnownMapEdges() }),
    getTick: () => 3, getRevision: () => fixture.events.at(-1)?.sequence ?? 0, getNpcs: () => [] }
  const create = () => new PlayerWorldService(fixture as unknown as SqliteEventStore, source, { onCommitted: observer, now: () => 10 })
  return { fixture, source, create, service: create(), observer }
}

describe('canonical player-world service pure event-fixture tests', () => {
  it('has event-only durable receipts and returns identical retries across a fresh projection', () => {
    const { service, create, fixture } = setup()
    const one = service.execute(alice, body('join', 'enter', {})); expect(one.revision).toBe(1)
    expect(service.execute(alice, body('join', 'enter', {}))).toEqual({ ...one, duplicate: true })
    expect(create().execute(alice, body('join', 'enter', {}))).toEqual({ ...one, duplicate: true })
    expect(fixture.events).toHaveLength(1)
    expect(() => service.execute(alice, body('join'))).toThrow('different content')
    service.execute(bob, body('join', 'enter', {})); expect(fixture.events).toHaveLength(2)
  })
  it('does not project or notify until the transaction actually commits', () => {
    const { service, fixture, observer } = setup()
    fixture.beforeCommit = () => { expect(service.getPosition(alice)).toBeNull(); expect(observer).not.toHaveBeenCalled() }
    service.execute(alice, body('join', 'enter', {})); expect(service.getPosition(alice)?.x).toBe(0); expect(observer).toHaveBeenCalledOnce()
  })
  it('rolls back all members of an invalid atomic batch and keeps the original projection', () => {
    const { service, fixture, observer } = setup()
    service.execute(alice, body('join', 'enter', {})); observer.mockClear()
    expect(() => service.executeBatch([{ accountId: bob, body: body('join', 'enter', {}) },
      { accountId: alice, body: body('invalid', 'transition', { toTileId: 't_central' }) }])).toThrow('Walk to')
    expect(fixture.events).toHaveLength(1); expect(service.getPosition(bob)).toBeNull(); expect(observer).not.toHaveBeenCalled()
  })
  it('rollback after append never publishes or creates a false successful receipt', () => {
    const { service, fixture, observer } = setup(); fixture.failCommit = true
    expect(() => service.execute(alice, body('join', 'enter', {}))).toThrow('synthetic transaction failure')
    expect(fixture.events).toHaveLength(0); expect(service.getPosition(alice)).toBeNull(); expect(observer).not.toHaveBeenCalled()
    fixture.failCommit = false; expect(service.execute(alice, body('join', 'enter', {})).duplicate).toBeUndefined()
  })
  it('actual queued two-player intents share one transaction and one snapshot publication per cadence', async () => {
    const { service, fixture, observer } = setup(), publish = vi.fn(); service.subscribe(publish)
    const joined = [service.submit(alice, body('join', 'enter', {})), service.submit(bob, body('join', 'enter', {}))]
    expect(fixture.transactions).toBe(0); expect(service.getPosition(alice)).toBeNull()
    service.advanceMovementStep(); await Promise.all(joined)
    service.connect(alice); service.connect(bob)
    expect(fixture.transactions).toBe(1); expect(observer).toHaveBeenCalledOnce(); expect(publish).toHaveBeenCalledOnce()
    const moved = [service.submit(alice, body('move')), service.submit(bob, body('move'))]
    service.advanceMovementStep(); await Promise.all(moved)
    expect(fixture.transactions).toBe(2); expect(fixture.events).toHaveLength(4); expect(publish).toHaveBeenCalledTimes(2)
    service.advanceMovementStep(); expect(publish).toHaveBeenCalledTimes(2)
  })
  it('a rejected queued peer does not roll back another player, while duplicate submissions create one event', async () => {
    const { service, fixture } = setup(); service.execute(alice, body('join', 'enter', {})); service.execute(bob, body('join', 'enter', {}))
    service.connect(alice); service.connect(bob)
    const one = service.submit(alice, body('move')), retry = service.submit(alice, body('move'))
    const invalid = service.submit(bob, body('bad', 'transition', { toTileId: 't_central' })).catch(error => error)
    service.advanceMovementStep(); const results = await Promise.all([one, retry, invalid])
    expect(results[0]).toMatchObject({ accepted: true }); expect(results[1]).toMatchObject({ accepted: true, duplicate: true })
    expect(results[2]).toMatchObject({ code: 'PORTAL_OUT_OF_RANGE' }); expect(fixture.events).toHaveLength(3)
  })
  it('every accepted computed step is an Event with no five-second checkpoint loss', () => {
    const { service, fixture, create } = setup(); service.execute(alice, body('join', 'enter', {}))
    for (let step = 0; step < 10; step += 1) { service.advanceMovementStep(); service.execute(alice, body(`move-${step}`)) }
    expect(fixture.events).toHaveLength(11); expect(create().getPosition(alice)).toEqual(service.getPosition(alice))
    expect(create().getMovementStep()).toBeGreaterThan(service.getPosition(alice)!.movementStep)
  })
  it('revocation cancels queued commands, clears online state, and stale disconnect cannot evict a reconnect', async () => {
    const { service, fixture } = setup(); service.execute(alice, body('join', 'enter', {}))
    const stale = service.connect(alice), queued = service.submit(alice, body('move')).catch(error => error)
    service.disconnectAccount(alice); const fresh = service.connect(alice); stale()
    expect(service.snapshot(alice).players[0]?.online).toBe(true); expect(await queued).toMatchObject({ code: 'COMMAND_CANCELLED' })
    service.advanceMovementStep(); expect(fixture.events).toHaveLength(1); fresh(); expect(service.snapshot(alice).players[0]?.online).toBe(false)
  })
  it('observer failure cannot turn a committed action into a false rejected ACK', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try { const { service, fixture } = setup(vi.fn(() => { throw new Error('observer') }))
      expect(service.execute(alice, body('join', 'enter', {}))).toMatchObject({ accepted: true }); expect(fixture.events).toHaveLength(1)
    } finally { spy.mockRestore() }
  })
})

describe('canonical account-scoped subscription', () => {
  it('uses one presence entry for two tabs and unsubscribe keeps the persisted position', () => {
    const { service, fixture } = setup(); service.execute(alice, body('join', 'enter', {}))
    const first = vi.fn(), second = vi.fn(), disconnectOne = service.subscribeAccount(alice, first), disconnectTwo = service.subscribeAccount(alice, second)
    service.advanceMovementStep(); expect(service.snapshot(alice).players).toHaveLength(1)
    expect(first).toHaveBeenCalledOnce(); expect(second).toHaveBeenCalledOnce()
    expect(first.mock.calls[0]![0]).toBe(second.mock.calls[0]![0])
    disconnectOne(); disconnectOne(); expect(service.snapshot(alice).players[0]?.online).toBe(true)
    disconnectTwo(); expect(service.snapshot(alice).players[0]?.online).toBe(false)
    expect(service.getPosition(alice)).not.toBeNull(); expect(fixture.events).toHaveLength(1)
  })
})

describe('canonical player identity boundary', () => {
  it('revalidates each queued session at flush without cancelling another valid session for the account', async () => {
    const { service, fixture } = setup(); service.execute(alice, body('join', 'enter', {}))
    service.connect(alice)
    let authorized = true
    const invalid = service.submit(alice, body('expired'), () => { if (!authorized) throw new Error('UNAUTHORIZED') }).catch(error => error)
    const valid = service.submit(alice, body('live'), () => {})
    authorized = false; service.advanceMovementStep()
    expect(await invalid).toMatchObject({ message: 'UNAUTHORIZED' }); expect(await valid).toMatchObject({ accepted: true })
    expect(fixture.events).toHaveLength(2)
  })
  it('fetches public display names once per account per cadence, without persisting duplicate identity truth', () => {
    const { service, fixture } = setup(); service.execute(alice, body('join', 'enter', {})); service.execute(bob, body('join', 'enter', {}))
    service.connect(alice); service.connect(bob); let renamed = false
    const resolver = vi.fn(id => renamed ? `New ${id}` : `Public ${id}`); service.setDisplayNameResolver(resolver)
    service.snapshot(alice); service.snapshot(bob); expect(resolver).toHaveBeenCalledTimes(2)
    renamed = true; service.advanceMovementStep()
    expect(service.snapshot(alice).players.map(player => player.displayName)).toEqual(['New 1', 'New 2'])
    expect(resolver).toHaveBeenCalledTimes(4); expect(JSON.stringify(fixture.events)).not.toContain('Public')
  })
})


describe('hard admitted gameplay capacity', () => {
  it('rejects unadmitted commands at enqueue and after the last connection closes before flush', async () => {
    const { service, fixture } = setup(); service.execute(alice, body('join', 'enter', {}))
    await expect(service.submit(alice, body('offline'))).rejects.toMatchObject({ code: 'WORLD_CONNECTION_REQUIRED' })
    const disconnect = service.connect(alice), pending = service.submit(alice, body('queued')).catch(error => error)
    disconnect(); service.advanceMovementStep(); expect(await pending).toMatchObject({ code: 'WORLD_CONNECTION_REQUIRED' })
    expect(fixture.events).toHaveLength(1); expect(service.getPosition(alice)?.x).toBe(0)
  })
  it('keeps a queued command valid when another tab for the same account remains admitted', async () => {
    const { service, fixture } = setup(); service.execute(alice, body('join', 'enter', {}))
    const first = service.connect(alice), second = service.connect(alice), pending = service.submit(alice, body('queued'))
    first(); service.advanceMovementStep(); expect(await pending).toMatchObject({ accepted: true })
    expect(fixture.events).toHaveLength(2); second()
  })
})

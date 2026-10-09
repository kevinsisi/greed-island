import { describe, expect, it, vi } from 'vitest'
import { accountId } from '../identity/principal.js'
import type { SqliteEventStore } from '../kernel/eventStore.js'
import { getKnownMapEdges, getKnownMapRegions, getMapAdjacency } from '../sim/mapGraph.js'
import { PlayerWorldService } from './service.js'
import { EventFixture } from './service.testSupport.js'
import { parsePlayerWorldIntent } from './ruleEngine.js'
import { PlayerWorldChatProjection, WORLD_CHAT_EVENT_TYPE } from './chat.js'

const alice = accountId(1), bob = accountId(2)
const enter = { commandId: 'enter', type: 'enter', payload: {} }
const message = (commandId: string, text = 'hello') => ({ commandId, type: 'chat', payload: { text } })
function setup() {
  const fixture = new EventFixture()
  const source = { getMap: () => ({ regions: getKnownMapRegions(), adjacency: getMapAdjacency(), edges: getKnownMapEdges() }),
    getTick: () => 3, getRevision: () => fixture.events.at(-1)?.sequence ?? 0, getNpcs: () => [] }
  const create = () => new PlayerWorldService(fixture as unknown as SqliteEventStore, source)
  return { fixture, source, create, service: create() }
}
describe('one canonical public world chat', () => {
  it.each(['', 'x'.repeat(241), 'bad\u0000text'])('rejects invalid text %j', text => expect(() => parsePlayerWorldIntent(message('c', text))).toThrow())
  it('accepts plain text only and rejects client identity/tile/name overrides', () => {
    expect(parsePlayerWorldIntent(message('c', '  <b>hello</b>  '))).toMatchObject({ payload: { text: '<b>hello</b>' } })
    expect(() => parsePlayerWorldIntent({ ...message('c'), payload: { text: 'hi', accountId: 2 } })).toThrow()
    expect(() => parsePlayerWorldIntent({ ...message('c'), payload: { text: 'hi', tileId: 't_central' } })).toThrow()
    expect(() => parsePlayerWorldIntent({ ...message('c'), payload: { text: 'hi', displayName: 'claimed' } })).toThrow()
  })
  it('uses server actor/tile/public name, commits a distinct chat fact and never changes the position', async () => {
    const { fixture, service } = setup(); service.execute(alice, enter); service.connect(alice)
    service.setDisplayNameResolver(() => 'Public name'); const before = service.getPosition(alice), pending = service.submit(alice, message('chat', '<script>data only</script>'))
    service.advanceMovementStep(); await pending
    const event = fixture.events.at(-1)!; expect(event.eventType).toBe(WORLD_CHAT_EVENT_TYPE); expect(event.actorId).toBe('1')
    expect(event.payload).toMatchObject({ data: { accountId: 1, tileId: 't_dock', displayName: 'Public name', text: '<script>data only</script>' } })
    expect(event.payload).not.toMatchObject({ data: { x: 0 } }); expect(service.getPosition(alice)).toEqual(before)
    expect(service.snapshot(alice).messages[0]).toMatchObject({ accountId: 1, tileId: 't_dock', text: '<script>data only</script>' })
  })
  it('shares one world channel across canonical sender regions and never includes private NPC dialogue', () => {
    const { fixture, service, create } = setup(); service.execute(alice, enter); service.execute(bob, enter)
    const entered = fixture.events[1]!
    fixture.events.push({ ...entered, sequence: 3, eventId: 'bob-central', deterministicKey: 'bob-central',
      payload: { ...(entered.payload as object), data: { ...((entered.payload as { data: object }).data), tileId: 't_central', x: 7, z: 9 } } })
    fixture.events.push({ eventId: 'private-dialogue', eventType: 'PLAYER_NPC_DIALOGUE', actorId: '1', sequence: 4,
      occurredAt: 0, deterministicKey: 'private', version: 1, payload: { data: { playerMessage: 'private text' } } })
    const restored = create(); restored.execute(alice, message('dock-chat', 'dock')); restored.execute(bob, message('central-chat', 'central'))
    expect(restored.snapshot(alice).messages.map(item => item.tileId)).toEqual(['t_dock', 't_central'])
    expect(restored.snapshot(bob).messages.map(item => item.text)).toEqual(['dock', 'central'])
    expect(JSON.stringify(restored.snapshot(alice).messages)).not.toContain('private text')
  })
  it('retries are idempotent across reconstruction, text conflicts reject and cooldown survives restart', () => {
    const { service, create, fixture } = setup(); service.execute(alice, enter)
    const accepted = service.execute(alice, message('chat'))
    expect(create().execute(alice, message('chat'))).toEqual({ ...accepted, duplicate: true })
    expect(() => service.execute(alice, message('chat', 'changed'))).toThrow('different content')
    const restarted = create(); expect(() => restarted.execute(alice, message('too-soon'))).toThrow('wait before')
    for (let step = 0; step < 5; step += 1) restarted.advanceMovementStep()
    restarted.execute(alice, message('later')); expect(fixture.events.filter(event => event.eventType === WORLD_CHAT_EVENT_TYPE)).toHaveLength(2)
  })
  it('batches different players, rejects one spammer independently, and publishes once per cadence', async () => {
    const { service, fixture } = setup(); service.execute(alice, enter); service.execute(bob, enter); service.connect(alice); service.connect(bob)
    const publish = vi.fn(); service.subscribe(publish); service.advanceMovementStep(); publish.mockClear()
    const first = service.submit(alice, message('one')), spam = service.submit(alice, message('spam')).catch(error => error), other = service.submit(bob, message('two'))
    const before = fixture.transactions; service.advanceMovementStep(); expect(await first).toMatchObject({ accepted: true })
    expect(await spam).toMatchObject({ code: 'CHAT_RATE_LIMIT' }); expect(await other).toMatchObject({ accepted: true })
    expect(fixture.transactions - before).toBe(1); expect(publish).toHaveBeenCalledOnce(); expect(service.snapshot(alice).messages).toHaveLength(2)
  })
  it('rolls chat and position back together and rejects chat when not admitted', async () => {
    const { service, fixture } = setup(); service.execute(alice, enter)
    await expect(service.submit(alice, message('offline'))).rejects.toMatchObject({ code: 'WORLD_CONNECTION_REQUIRED' })
    service.connect(alice); fixture.failCommit = true
    const queued = service.submit(alice, message('rollback')).catch(error => error); service.advanceMovementStep()
    expect(await queued).toMatchObject({ message: 'synthetic transaction failure' }); expect(service.snapshot(alice).messages).toHaveLength(0)
    expect(fixture.events).toHaveLength(1)
  })
  it('bounds visible history at100 while restoring an older sender cooldown from latest-per-account receipts', () => {
    const projection = new PlayerWorldChatProjection()
    const events = Array.from({ length: 101 }, (_, index) => ({ sequence: index + 1, eventId: `chat-${index}`, eventType: WORLD_CHAT_EVENT_TYPE,
      actorId: index === 0 ? '1' : '2', occurredAt: 0, version: 1, deterministicKey: `chat-${index}`, tick: 3,
      payload: { data: { accountId: index === 0 ? 1 : 2, tileId: 't_dock', text: 'synthetic', postedAtMovementStep: index,
        clientCommandId: `c-${index}`, intentDigest: 'a'.repeat(64) } } }))
    projection.rebuildFromEvents(events.slice(-100), [events[0]!, events[100]!])
    expect(projection.list()).toHaveLength(100); expect(projection.getLastPostedStep(alice)).toBe(0); expect(projection.getMaximumPostedStep()).toBe(100)
  })
})

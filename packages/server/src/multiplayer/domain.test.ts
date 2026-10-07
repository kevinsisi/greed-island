import { describe, expect, it } from 'vitest'
import type { Event, EventDraft } from '../kernel/types.js'
import {
  applyEvents, BEACON, DomainError, emptyState, evaluateCommand, evaluateSystemCommand,
  parseCommand, PLAYER_RADIUS, projectEvents, WORLD,
} from './domain.js'
import type { RoomState } from './types.js'

const A = 'player-a'
const B = 'player-b'

/** An in-memory EventLog for pure rule/reducer tests; no HTTP or SQLite substitute. */
function simulation() {
  const events: Event[] = []
  let state = emptyState()
  let nextCommand = 0
  function commit(drafts: readonly EventDraft[]) {
    const committed = drafts.map((draft, index) => ({ ...draft, sequence: events.length + index + 1 }))
    events.push(...committed)
    state = applyEvents(state, committed)
    return committed
  }
  commit(evaluateSystemCommand(state, { type: 'initialize' }))
  return {
    get state() { return state },
    get events() { return events },
    tick() { return commit(evaluateSystemCommand(state, { type: 'tick', tick: state.tick + 1 })) },
    execute(actor: string, type: string, payload: unknown = {}) {
      return commit(evaluateCommand(state, actor, parseCommand({ commandId: `test-${++nextCommand}`, type, payload })))
    },
  }
}

function player(state: RoomState, id: string) {
  const found = state.players.find((entry) => entry.id === id)
  if (!found) throw new Error(`Missing player ${id}`)
  return found
}

function walk(sim: ReturnType<typeof simulation>, id: string, dx: number, dz: number, steps: number) {
  for (let step = 0; step < steps; step += 1) {
    sim.tick()
    sim.execute(id, 'move', { dx, dz })
  }
}

describe('multiplayer pure Command → Rule → Event → Projection', () => {
  it('initializes two finite-resource players and advances only through explicit system commands', () => {
    const sim = simulation()
    expect(sim.state.players.map(({ id, supplies, rewards }) => ({ id, supplies, rewards }))).toEqual([
      { id: A, supplies: 1, rewards: 0 }, { id: B, supplies: 1, rewards: 0 },
    ])
    expect(sim.state.tick).toBe(0)
    const tickEvents = sim.tick()
    expect(tickEvents.map(({ eventType, actorId, tick }) => ({ eventType, actorId, tick }))).toEqual([
      { eventType: 'MP_TICK', actorId: 'system', tick: 1 },
    ])
    expect(projectEvents(sim.events)).toEqual(sim.state)
  })

  it('rejects repeated initialization and discontinuous system ticks', () => {
    const sim = simulation()
    const before = structuredClone(sim.state)
    expect(() => evaluateSystemCommand(sim.state, { type: 'initialize' })).toThrow(DomainError)
    for (const tick of [0, -1, 2, 1.5, Infinity, Number.NaN]) {
      expect(() => evaluateSystemCommand(sim.state, { type: 'tick', tick })).toThrow(DomainError)
    }
    expect(sim.state).toEqual(before)
  })

  it('compiles identical intent against identical state into identical events without mutating state', () => {
    const sim = simulation()
    const before = structuredClone(sim.state)
    const input = parseCommand({ commandId: 'deterministic-step', type: 'move', payload: { dx: 1, dz: 1 } })
    const first = evaluateCommand(sim.state, A, input)
    const second = evaluateCommand(sim.state, A, input)
    expect(first).toEqual(second)
    expect(sim.state).toEqual(before)
    expect(first).toHaveLength(1)
    expect(first[0]).toMatchObject({ eventType: 'MP_MOVED', actorId: A, tick: 0 })
  })

  it('limits diagonal speed and a burst of distinct commands to one move per server tick', () => {
    const sim = simulation()
    const before = { ...player(sim.state, A) }
    const peer = { ...player(sim.state, B) }
    sim.execute(A, 'move', { dx: 1, dz: 1 })
    const after = player(sim.state, A)
    expect(Math.hypot(after.x - before.x, after.z - before.z)).toBeCloseTo(0.4, 5)
    const committed = sim.events.length
    for (let attempt = 0; attempt < 10; attempt += 1) {
      expect(() => sim.execute(A, 'move', { dx: 1, dz: 1 })).toThrowError(expect.objectContaining({ code: 'MOVE_RATE_LIMIT', status: 429 }))
    }
    expect(sim.events).toHaveLength(committed)
    expect(player(sim.state, B)).toEqual(peer)
    sim.tick()
    sim.execute(A, 'move', { dx: 0, dz: 1 })
    expect(player(sim.state, A).z - after.z).toBeCloseTo(0.4, 5)
  })

  it('stops at world boundaries and does not tunnel through the eastern building', () => {
    const sim = simulation()
    walk(sim, A, 0, -1, 100)
    expect(player(sim.state, A).z).toBeGreaterThanOrEqual(WORLD.minZ + PLAYER_RADIUS)
    walk(sim, A, -1, 0, 100)
    expect(player(sim.state, A).x).toBeGreaterThanOrEqual(WORLD.minX + PLAYER_RADIUS)
    walk(sim, B, 1, 0, 12)
    const obstacle = WORLD.obstacles.find((entry) => entry.x > 0)!
    for (let attempt = 0; attempt < 100; attempt += 1) {
      walk(sim, B, 0, 1, 1)
      expect(player(sim.state, B).z).toBeLessThanOrEqual(obstacle.z - obstacle.depth / 2 - PLAYER_RADIUS)
    }
  })

  it.each([
    { dx: Number.NaN, dz: 1 }, { dx: 1, dz: Infinity }, { dx: -Infinity, dz: 0 },
    { dx: '0', dz: 1 }, { dx: 0 }, { dx: 2, dz: 0 }, { dx: 0, dz: -2 },
  ])('rejects invalid directions without producing events (%#)', (payload) => {
    const sim = simulation()
    const before = structuredClone(sim.state)
    const count = sim.events.length
    expect(() => sim.execute(A, 'move', payload)).toThrow(DomainError)
    expect(sim.state).toEqual(before)
    expect(sim.events).toHaveLength(count)
  })

  it.each([
    null, [], {},
    { commandId: 'a', type: 'move', payload: { dx: 1, dz: 0, playerId: B } },
    { commandId: 'a', type: 'contribute', payload: { playerId: B } },
    { commandId: 'a', type: 'contribute', payload: { supplies: 99, rewards: 99 } },
    { commandId: 'a', type: 'chat', actorId: B, payload: { text: 'spoof' } },
    { commandId: 'a', type: 'award', payload: {} },
    { commandId: 'a', type: 'tick', payload: {} },
    { commandId: 'a', type: 'initialize', payload: {} },
    { commandId: 'a'.repeat(101), type: 'contribute', payload: {} },
  ])('does not accept client-owned identity, resources, system commands or malformed shapes (%#)', (input) => {
    expect(() => parseCommand(input)).toThrow(DomainError)
  })

  it('uses server identity in shared chat and enforces content and tick-based rate limits', () => {
    const sim = simulation()
    sim.execute(A, 'chat', { text: '  一起修好信標。  ' })
    expect(sim.state.messages[0]).toMatchObject({ playerId: A, text: '一起修好信標。', tick: 0, name: player(sim.state, A).name })
    expect(() => sim.execute(A, 'chat', { text: 'again' })).toThrowError(expect.objectContaining({ code: 'CHAT_RATE_LIMIT' }))
    expect(() => sim.execute(B, 'chat', { text: '\u0000' })).toThrow(DomainError)
    expect(() => sim.execute(B, 'chat', { text: 'x'.repeat(241) })).toThrow(DomainError)
    expect(() => sim.execute(B, 'chat', { text: '   ' })).toThrow(DomainError)
    for (let tick = 0; tick < 5; tick += 1) sim.tick()
    sim.execute(A, 'chat', { text: 'ready' })
    expect(sim.state.messages).toHaveLength(2)
    expect(() => sim.execute('not-a-fixture', 'chat', { text: 'intruder' })).toThrowError(expect.objectContaining({ status: 401 }))
  })

  it('requires nearby distinct contributors and derives completion and both rewards as one event batch', () => {
    const sim = simulation()
    expect(() => sim.execute(A, 'contribute')).toThrowError(expect.objectContaining({ code: 'OUT_OF_RANGE' }))
    walk(sim, A, 0, 1, 30)
    expect(Math.hypot(player(sim.state, A).x - BEACON.x, player(sim.state, A).z - BEACON.z)).toBeLessThan(BEACON.radius)
    const first = sim.execute(A, 'contribute')
    expect(first.map((event) => event.eventType)).toEqual(['MP_CONTRIBUTED'])
    expect(player(sim.state, A)).toMatchObject({ supplies: 0, rewards: 0 })
    expect(sim.state.completed).toBe(false)
    expect(() => sim.execute(A, 'contribute')).toThrowError(expect.objectContaining({ code: 'ALREADY_CONTRIBUTED' }))
    walk(sim, B, 0, 1, 30)
    const completed = sim.execute(B, 'contribute')
    expect(completed.map((event) => event.eventType)).toEqual(['MP_CONTRIBUTED', 'MP_BEACON_COMPLETED', 'MP_REWARDED', 'MP_REWARDED'])
    expect(sim.state.completed).toBe(true)
    expect(new Set(sim.state.contributors)).toEqual(new Set([A, B]))
    expect(sim.state.players.map(({ supplies, rewards }) => ({ supplies, rewards }))).toEqual([
      { supplies: 0, rewards: 1 }, { supplies: 0, rewards: 1 },
    ])
    const done = structuredClone(sim.state)
    for (const id of [A, B]) expect(() => sim.execute(id, 'contribute')).toThrow(DomainError)
    expect(sim.state).toEqual(done)
  })

  it('preserves state and rewards under full replay, reverse delivery and duplicate projection', () => {
    const sim = simulation()
    for (const id of [A, B]) {
      walk(sim, id, 0, 1, 30)
      sim.execute(id, 'contribute')
    }
    expect(projectEvents(sim.events)).toEqual(sim.state)
    expect(projectEvents([...sim.events].reverse().concat(sim.events))).toEqual(sim.state)
    expect(applyEvents(sim.state, sim.events)).toEqual(sim.state)
    expect(applyEvents(sim.state, [...sim.events].reverse())).toEqual(sim.state)
  })
})

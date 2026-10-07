import { describe, expect, it } from 'vitest'
import type { Event, EventDraft } from '../kernel/types.js'
import {
  applyEvents, BEACON, DomainError, emptyState, evaluateCommand, evaluateSystemCommand,
  parseCommand, PLAYER_RADIUS, projectEvents, WORLD,
} from './domain.js'
import type { RoomConfig, RoomState, RosterPlayer } from './types.js'

const A = 'player-a'
const B = 'player-b'
const DEFAULT_CONFIG: RoomConfig = { maxOnlinePlayers: 50, minParticipants: 2, participationWindowTicks: 300 }
const pair: RosterPlayer[] = [
  { id: A, name: 'Test A', x: -2, z: -6 }, { id: B, name: 'Test B', x: 2, z: -6 },
]

function beaconRoster(count: number): RosterPlayer[] {
  return Array.from({ length: count }, (_, index) => ({
    id: index === 0 ? A : index === 1 ? B : `player-${index + 1}`,
    name: `Test ${index + 1}`, x: 0, z: 6,
  }))
}

/** An in-memory EventLog for pure rule/reducer tests; no HTTP or SQLite substitute. */
function simulation(options: { roster?: readonly RosterPlayer[]; config?: RoomConfig } = {}) {
  const events: Event[] = []
  let state = emptyState()
  let nextCommand = 0
  function commit(drafts: readonly EventDraft[]) {
    const committed = drafts.map((draft, index) => ({ ...draft, sequence: events.length + index + 1 }))
    events.push(...committed)
    state = applyEvents(state, committed)
    return committed
  }
  commit(evaluateSystemCommand(state, { type: 'initialize', ...options }))
  return {
    get state() { return state },
    get events() { return events },
    tick() { return commit(evaluateSystemCommand(state, { type: 'tick', tick: state.tick + 1 })) },
    execute(actor: string, type: string, payload: unknown = {}) {
      return commit(evaluateCommand(state, actor, parseCommand({ commandId: `test-${++nextCommand}`, type, payload })))
    },
  }
}

function closeWindow(sim: ReturnType<typeof simulation>) {
  const closesAt = sim.state.closesAtTick
  expect(closesAt).not.toBeNull()
  while (sim.state.tick < closesAt!) sim.tick()
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
  it('initializes the default 50-player roster with finite server-owned resources', () => {
    const sim = simulation()
    expect(sim.state.players).toHaveLength(50)
    expect(new Set(sim.state.players.map(({ id }) => id)).size).toBe(50)
    expect(new Set(sim.state.players.map(({ name }) => name)).size).toBe(50)
    expect(sim.state.players.every(({ supplies, rewards }) => supplies === 1 && rewards === 0)).toBe(true)
    expect(sim.state.players.slice(0, 2).map(({ id }) => id)).toEqual([A, B])
    expect(sim.state.config).toEqual(DEFAULT_CONFIG)
    expect(sim.state.closesAtTick).toBeNull()
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

  it.each(['__proto__', 'constructor', 'toString'])('enforces the same move limit for data-only roster ID %s after clone and replay', (id) => {
    const sim = simulation({ roster: [{ id, name: 'Special ID', x: 0, z: 0 }, pair[1]!] })
    sim.execute(id, 'move', { dx: 1, dz: 0 })
    expect(player(sim.state, id).x).toBeCloseTo(0.4, 5)
    expect(Object.hasOwn(sim.state.movedAt, id)).toBe(true)
    const repeat = parseCommand({ commandId: 'another-move', type: 'move', payload: { dx: 1, dz: 0 } })
    for (const state of [sim.state, structuredClone(sim.state), projectEvents(sim.events)]) {
      expect(() => evaluateCommand(state, id, repeat)).toThrowError(expect.objectContaining({ code: 'MOVE_RATE_LIMIT' }))
    }
    sim.tick()
    sim.execute(id, 'move', { dx: 1, dz: 0 })
    expect(player(sim.state, id).x).toBeCloseTo(0.8, 5)
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
  ].map((input) => ({ input })))('does not accept client-owned identity, resources, system commands or malformed shapes (%#)', ({ input }) => {
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

  it('requires nearby distinct contributors and waits for the exact closing tick before awarding', () => {
    const sim = simulation({ roster: pair })
    expect(() => sim.execute(A, 'contribute')).toThrowError(expect.objectContaining({ code: 'OUT_OF_RANGE' }))
    walk(sim, A, 0, 1, 30)
    expect(Math.hypot(player(sim.state, A).x - BEACON.x, player(sim.state, A).z - BEACON.z)).toBeLessThan(BEACON.radius)
    const first = sim.execute(A, 'contribute')
    expect(first.map((event) => event.eventType)).toEqual(['MP_CONTRIBUTED'])
    expect(player(sim.state, A)).toMatchObject({ supplies: 0, rewards: 0 })
    expect(sim.state.completed).toBe(false)
    expect(() => sim.execute(A, 'contribute')).toThrowError(expect.objectContaining({ code: 'ALREADY_CONTRIBUTED' }))
    walk(sim, B, 0, 1, 30)
    const opened = sim.execute(B, 'contribute')
    expect(opened.map((event) => event.eventType)).toEqual(['MP_CONTRIBUTED', 'MP_COLLECTION_OPENED'])
    expect(sim.state.completed).toBe(false)
    const closingTick = sim.state.tick + 300
    expect(sim.state.closesAtTick).toBe(closingTick)
    while (sim.state.tick < closingTick - 1) sim.tick()
    expect(sim.state.players.every(({ rewards }) => rewards === 0)).toBe(true)
    const completed = sim.tick()
    expect(completed.map((event) => event.eventType)).toEqual(['MP_TICK', 'MP_BEACON_COMPLETED', 'MP_REWARDED', 'MP_REWARDED'])
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
    const sim = simulation({ roster: pair })
    for (const id of [A, B]) {
      walk(sim, id, 0, 1, 30)
      sim.execute(id, 'contribute')
    }
    closeWindow(sim)
    expect(projectEvents(sim.events)).toEqual(sim.state)
    expect(projectEvents([...sim.events].reverse().concat(sim.events))).toEqual(sim.state)
    expect(applyEvents(sim.state, sim.events)).toEqual(sim.state)
    expect(applyEvents(sim.state, [...sim.events].reverse())).toEqual(sim.state)
  })

  it('accepts 50 distinct contributions in one window and awards all 50 exactly once', () => {
    const roster = beaconRoster(50)
    const sim = simulation({ roster })
    for (const member of roster) sim.execute(member.id, 'contribute')
    expect(sim.state.contributors).toHaveLength(50)
    expect(sim.state.closesAtTick).toBe(300)
    expect(sim.state.completed).toBe(false)
    expect(sim.state.players.every(({ supplies, rewards }) => supplies === 0 && rewards === 0)).toBe(true)
    for (let tick = 1; tick < 300; tick += 1) sim.tick()
    expect(sim.state.completed).toBe(false)
    const batch = sim.tick()
    expect(batch.filter((event) => event.eventType === 'MP_BEACON_COMPLETED')).toHaveLength(1)
    expect(batch.filter((event) => event.eventType === 'MP_REWARDED')).toHaveLength(50)
    expect(sim.state.completed).toBe(true)
    expect(sim.state.players.every(({ supplies, rewards }) => supplies === 0 && rewards === 1)).toBe(true)
    expect(new Set(sim.state.awardedPlayerIds)).toEqual(new Set(roster.map(({ id }) => id)))
    for (const member of roster) expect(() => sim.execute(member.id, 'contribute')).toThrow(DomainError)
    for (let tick = 0; tick < 5; tick += 1) sim.tick()
    expect(sim.events.filter((event) => event.eventType === 'MP_REWARDED')).toHaveLength(50)
    expect(projectEvents(sim.events)).toEqual(sim.state)
  })

  it('keeps gathering indefinitely below the minimum, then allows late arrivals until the deadline', () => {
    const roster = beaconRoster(5)
    const config = { ...DEFAULT_CONFIG, minParticipants: 3, participationWindowTicks: 4 }
    const sim = simulation({ roster, config })
    sim.execute(A, 'contribute')
    sim.execute(B, 'contribute')
    for (let tick = 0; tick < 350; tick += 1) sim.tick()
    expect(sim.state.closesAtTick).toBeNull()
    expect(sim.state.completed).toBe(false)
    expect(sim.state.players.every(({ rewards }) => rewards === 0)).toBe(true)
    sim.execute('player-3', 'contribute')
    expect(sim.state.closesAtTick).toBe(354)
    sim.tick()
    sim.execute('player-4', 'contribute')
    sim.tick()
    sim.tick()
    sim.execute('player-5', 'contribute')
    expect(sim.state.tick).toBe(353)
    expect(sim.state.closesAtTick).toBe(354)
    expect(sim.state.completed).toBe(false)
    sim.tick()
    expect(sim.state.players.every(({ rewards }) => rewards === 1)).toBe(true)
    expect(sim.state.config).toEqual(config)
    expect(projectEvents(sim.events).config).toEqual(config)
  })

  it('rejects an arrival on or after the closing tick without consuming that player’s supply', () => {
    const sim = simulation({ roster: beaconRoster(3), config: { ...DEFAULT_CONFIG, participationWindowTicks: 1 } })
    sim.execute(A, 'contribute')
    sim.execute(B, 'contribute')
    sim.tick()
    expect(sim.state.completed).toBe(true)
    expect(() => sim.execute('player-3', 'contribute')).toThrow(DomainError)
    expect(player(sim.state, 'player-3')).toMatchObject({ supplies: 1, rewards: 0 })
    expect(new Set(sim.state.awardedPlayerIds)).toEqual(new Set([A, B]))
  })

  it('deduplicates rewards by recipient even when a duplicate claim has a newer sequence', () => {
    const sim = simulation({ roster: beaconRoster(2), config: { ...DEFAULT_CONFIG, participationWindowTicks: 1 } })
    sim.execute(A, 'contribute')
    sim.execute(B, 'contribute')
    sim.tick()
    const reward = sim.events.find((event) => event.eventType === 'MP_REWARDED')!
    const duplicated = { ...reward, sequence: sim.state.sequence + 1 }
    const projected = applyEvents(sim.state, [duplicated])
    expect(projected.players.map(({ rewards }) => rewards)).toEqual([1, 1])
    expect(new Set(projected.awardedPlayerIds)).toEqual(new Set([A, B]))
  })

  it.each([
    { maxOnlinePlayers: 0 }, { maxOnlinePlayers: 1.5 }, { maxOnlinePlayers: 1001 },
    { maxOnlinePlayers: Infinity }, { minParticipants: 1 }, { minParticipants: 2.5 },
    { minParticipants: 3 }, { participationWindowTicks: 0 }, { participationWindowTicks: -1 },
    { participationWindowTicks: Number.NaN }, { participationWindowTicks: 1.5 },
    { maxOnlinePlayers: 1, minParticipants: 2 },
  ])('rejects invalid capacity, minimum and window configuration (%#)', (override) => {
    expect(() => simulation({ roster: pair, config: { ...DEFAULT_CONFIG, ...override } })).toThrow(DomainError)
  })

  it.each([
    [], [pair[0]], [pair[0], pair[0]],
    [pair[0], { ...pair[1], name: pair[0]!.name }],
    [pair[0], { ...pair[1], id: '' }], [pair[0], { ...pair[1], name: '   ' }],
    [pair[0], { ...pair[1], x: Infinity }], [pair[0], { ...pair[1], z: Number.NaN }],
    [pair[0], { ...pair[1], x: WORLD.maxX + 1 }], [pair[0], { ...pair[1], x: 7, z: 8 }],
    [pair[0], { ...pair[1], supplies: 100, rewards: 100 }],
  ].map((roster) => ({ roster })))('rejects invalid or resource-bearing fixture rosters without producing initial state (%#)', ({ roster }) => {
    expect(() => simulation({ roster: roster as RosterPlayer[] })).toThrow(DomainError)
  })

  it('replays legacy two-player initialization without adding people or refilling their resources', () => {
    const legacyPlayers = pair.map((member, index) => ({ ...member, supplies: index, rewards: index + 4 }))
    const legacy: Event = {
      eventId: 'legacy-initial', eventType: 'MP_INITIALIZED', sequence: 1, actorId: 'system',
      tick: 0, occurredAt: 0, deterministicKey: 'legacy-initial', version: 1,
      payload: { players: legacyPlayers },
    }
    const state = projectEvents([legacy])
    expect(state.players).toEqual(legacyPlayers)
    expect(state.players).toHaveLength(2)
    expect(state.config).toEqual(DEFAULT_CONFIG)
    expect(state.closesAtTick).toBeNull()
    const tick = evaluateSystemCommand(state, { type: 'tick', tick: 1 })
    const advanced = applyEvents(state, tick.map((event, index) => ({ ...event, sequence: index + 2 })))
    expect(advanced.players).toEqual(legacyPlayers)
    expect(advanced.tick).toBe(1)
  })

  it('preserves a completed legacy beacon and does not schedule new rewards after restart', () => {
    const legacy = [
      { eventType: 'MP_INITIALIZED', payload: { players: pair.map((member) => ({ ...member, supplies: 1, rewards: 0 })) } },
      { eventType: 'MP_CONTRIBUTED', payload: { playerId: A, beaconId: BEACON.id } },
      { eventType: 'MP_CONTRIBUTED', payload: { playerId: B, beaconId: BEACON.id } },
      { eventType: 'MP_BEACON_COMPLETED', payload: { beaconId: BEACON.id } },
      { eventType: 'MP_REWARDED', payload: { playerId: A, beaconId: BEACON.id } },
      { eventType: 'MP_REWARDED', payload: { playerId: B, beaconId: BEACON.id } },
    ].map((event, index): Event => ({
      ...event, eventId: `legacy-${index}`, sequence: index + 1, actorId: 'system', tick: index === 0 ? 0 : 10,
      occurredAt: 0, deterministicKey: `legacy-${index}`, version: 1,
    }))
    const state = projectEvents(legacy)
    expect(state.completed).toBe(true)
    expect(state.players).toHaveLength(2)
    expect(state.players.map(({ supplies, rewards }) => ({ supplies, rewards }))).toEqual([
      { supplies: 0, rewards: 1 }, { supplies: 0, rewards: 1 },
    ])
    expect(new Set(state.awardedPlayerIds)).toEqual(new Set([A, B]))
    const following = evaluateSystemCommand(state, { type: 'tick', tick: 11 })
    expect(following.map(({ eventType }) => eventType)).toEqual(['MP_TICK'])
    expect(applyEvents(state, legacy).players).toEqual(state.players)
  })

  it('opens a new window when an unfinished legacy room first reaches its minimum', () => {
    const legacy: Event[] = [
      {
        eventId: 'legacy-open-initial', eventType: 'MP_INITIALIZED', sequence: 1, actorId: 'system',
        tick: 0, occurredAt: 0, deterministicKey: 'legacy-open-initial', version: 1,
        payload: { players: beaconRoster(2).map((member) => ({ ...member, supplies: 1, rewards: 0 })) },
      },
      {
        eventId: 'legacy-first-contribution', eventType: 'MP_CONTRIBUTED', sequence: 2, actorId: A,
        tick: 10, occurredAt: 0, deterministicKey: 'legacy-first-contribution', version: 1,
        payload: { playerId: A, beaconId: BEACON.id },
      },
    ]
    const state = projectEvents(legacy)
    expect(state.closesAtTick).toBeNull()
    expect(player(state, A).supplies).toBe(0)
    const incoming = evaluateCommand(state, B, parseCommand({ commandId: 'join-legacy', type: 'contribute', payload: {} }))
    const collecting = applyEvents(state, incoming.map((draft, index) => ({ ...draft, sequence: index + 3 })))
    expect(collecting.closesAtTick).toBe(310)
    expect(collecting.completed).toBe(false)
    expect(collecting.players.every(({ supplies, rewards }) => supplies === 0 && rewards === 0)).toBe(true)
  })
})

import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import {
  COMMAND_SET_FACT,
  KernelRuleEngine,
  SqliteEventStore,
  commitEventBatch,
  commitEventBatchesInDeterministicOrder,
  createAiSnapshotInput,
  createInitialWorldState,
  createNarrationOutput,
  hashWorldState,
  processCommand,
  reduceEventLog,
  type Command,
  type EventDraft,
  type WorldState
} from '../index.js'

describe('simulation kernel', () => {
  it('keeps commands as intent until events are appended', () => {
    const { store } = createKernelHarness()
    const command = createSetFactCommand('cmd-intent-only', 'player-1', 'location', 'town')
    const before = reduceEventLog(store.readEvents())

    expect(command.commandType).toBe(COMMAND_SET_FACT)
    expect(reduceEventLog(store.readEvents())).toEqual(before)
  })

  it('appends accepted command events and keeps event log immutable', () => {
    const { db, engine, store } = createKernelHarness()
    const command = createSetFactCommand('cmd-accepted', 'player-1', 'location', 'forest')

    const result = processCommand(command, engine, store)

    expect(result.ruleResult.accepted).toBe(true)
    expect(result.committedEvents).toHaveLength(1)
    expect(store.readEvents()).toHaveLength(1)
    expect(reduceEventLog(store.readEvents()).facts).toEqual({ location: 'forest' })
    expect(() => db.prepare('UPDATE event_log SET actor_id = ? WHERE sequence = 1').run('intruder')).toThrow(
      /append-only/
    )
    expect(() => db.prepare('DELETE FROM event_log WHERE sequence = 1').run()).toThrow(/append-only/)
  })

  it('rejects invalid commands without appending world events', () => {
    const { engine, store } = createKernelHarness()
    const invalidCommand: Command = {
      commandId: 'cmd-rejected',
      commandType: COMMAND_SET_FACT,
      actorId: 'player-1',
      submittedAt: 1000,
      payload: { key: '', value: 'forest' }
    }

    const before = reduceEventLog(store.readEvents())
    const result = processCommand(invalidCommand, engine, store)
    const after = reduceEventLog(store.readEvents())

    expect(result.ruleResult.accepted).toBe(false)
    expect(result.committedEvents).toHaveLength(0)
    expect(store.countEvents()).toBe(0)
    expect(after).toEqual(before)
  })

  it('reports latest committed tick without full fact hydration', () => {
    const { store } = createKernelHarness()
    store.appendEvents([
      {
        eventId: 'event-tick-3',
        eventType: 'FACT_SET',
        occurredAt: 1,
        actorId: 'system',
        payload: { key: 'tick', value: 3 },
        deterministicKey: 'event-tick-3',
        version: 1,
        tick: 3
      },
      {
        eventId: 'event-tick-7',
        eventType: 'FACT_SET',
        occurredAt: 2,
        actorId: 'system',
        payload: { key: 'tick', value: 7 },
        deterministicKey: 'event-tick-7',
        version: 1,
        tick: 7
      }
    ])

    const snapshot = store.readLatestFactSnapshot()

    expect(snapshot.eventCount).toBe(2)
    expect(snapshot.latestTick).toBe(7)
  })

  it('reports the newest committed tick rather than the maximum historical tick', () => {
    const { store } = createKernelHarness()
    store.appendEvents([
      createEventDraft('event-tick-10', 'FACT_SET', 10, { key: 'tick', value: 10 }),
      createEventDraft('event-tick-8', 'FACT_SET', 8, { key: 'tick', value: 8 })
    ])

    expect(store.readLatestFactSnapshot().latestTick).toBe(8)
  })

  it('reads latest selected facts without full fact hydration', () => {
    const { store } = createKernelHarness()
    store.appendEvents([
      createEventDraft('event-life-old', 'FACT_SET', 1, { key: 'world.lifeExpansion', value: { unlockedTileIds: [] } }),
      createEventDraft('event-weather', 'FACT_SET', 2, { key: 'world.weather', value: '晴' }),
      createEventDraft('event-life-new', 'FACT_SET', 3, { key: 'world.lifeExpansion', value: { unlockedTileIds: ['t_salt_marsh'] } }),
      createEventDraft('event-unrelated', 'NPC_MOVE', 4, { npcId: 'npc-a' })
    ])

    expect(store.readLatestFactSnapshot().facts).toEqual({})
    expect(store.readLatestFactValues(['world.lifeExpansion', 'world.weather', 'missing'])).toEqual({
      'world.lifeExpansion': { unlockedTileIds: ['t_salt_marsh'] },
      'world.weather': '晴'
    })
  })

  it('reads a bounded tick window without hydrating the whole event log', () => {
    const { store } = createKernelHarness()
    store.appendEvents([
      createEventDraft('event-fact-1', 'FACT_SET', 1, { key: 'world.tick', value: 1 }),
      createEventDraft('event-move-2', 'NPC_MOVE', 2, { actorType: 'npc', data: { npcId: 'npc-a' } }),
      createEventDraft('event-interact-3', 'NPC_INTERACT', 3, {
        actorType: 'npc',
        data: { participants: ['npc-a', 'npc-b'] }
      }),
      createEventDraft('event-move-4', 'NPC_MOVE', 4, { actorType: 'npc', data: { npcId: 'npc-b' } })
    ])

    const window = store.readEventsByTickWindow({
      sinceTick: 1,
      untilTick: 4,
      eventTypes: ['NPC_MOVE', 'NPC_INTERACT'],
      limit: 2
    })

    expect(window.limited).toBe(true)
    expect(window.events.map((event) => event.eventId)).toEqual(['event-move-2', 'event-interact-3'])
  })

  it('preserves chronological order across interleaved event types', () => {
    const { store } = createKernelHarness()
    store.appendEvents([
      createEventDraft('event-move-1', 'NPC_MOVE', 1, { actorType: 'npc', data: { npcId: 'npc-a' } }),
      createEventDraft('event-pressure-2', 'AREA_PRESSURE', 2, {
        actorType: 'system',
        data: { tileId: 't_central' }
      }),
      createEventDraft('event-move-3', 'NPC_MOVE', 3, { actorType: 'npc', data: { npcId: 'npc-b' } }),
      createEventDraft('event-pressure-4', 'AREA_PRESSURE', 4, {
        actorType: 'system',
        data: { tileId: 't_dock' }
      })
    ])

    const window = store.readEventsByTickWindow({
      sinceTick: 0,
      untilTick: 4,
      eventTypes: ['AREA_PRESSURE', 'NPC_MOVE'],
      limit: 3
    })

    expect(window.limited).toBe(true)
    expect(window.events.map((event) => event.eventId)).toEqual([
      'event-move-1',
      'event-pressure-2',
      'event-move-3'
    ])
  })

  it('reports latest committed tick as zero when no tick exists', () => {
    const { store } = createKernelHarness()

    expect(store.readLatestFactSnapshot().latestTick).toBe(0)

    store.appendEvents([
      {
        eventId: 'event-no-tick',
        eventType: 'FACT_SET',
        occurredAt: 1,
        actorId: 'system',
        payload: { key: 'weather', value: '晴' },
        deterministicKey: 'event-no-tick',
        version: 1
      }
    ])

    expect(store.readLatestFactSnapshot().latestTick).toBe(0)
  })

  it('keeps rejected command audit outside world truth', () => {
    const { engine, store } = createKernelHarness()
    const invalidCommand: Command = {
      commandId: 'cmd-audit',
      commandType: 'UNKNOWN',
      actorId: 'player-1',
      submittedAt: 1000,
      payload: { requested: true }
    }

    processCommand(invalidCommand, engine, store)

    expect(store.readRejectedCommandAudit()).toHaveLength(1)
    expect(store.readEvents()).toHaveLength(0)
    expect(reduceEventLog(store.readEvents())).toEqual(createInitialWorldState())
  })

  it('replays identical event logs into identical world state', () => {
    const { engine, store } = createKernelHarness()

    processCommand(createSetFactCommand('cmd-1', 'player-1', 'location', 'town'), engine, store)
    processCommand(createSetFactCommand('cmd-2', 'player-1', 'health', 100), engine, store)

    const events = store.readEvents()
    const first = reduceEventLog(events)
    const second = reduceEventLog(events)

    expect(first).toEqual(second)
    expect(hashWorldState(first)).toEqual(hashWorldState(second))
  })

  it('ignores wall-clock timestamp fields during reduction', () => {
    const { engine, store } = createKernelHarness()

    processCommand(createSetFactCommand('cmd-time', 'player-1', 'weather', 'clear'), engine, store)

    const [event] = store.readEvents()
    if (event === undefined) {
      throw new Error('Expected committed event')
    }

    const replayA = reduceEventLog([{ ...event, occurredAt: 1 }])
    const replayB = reduceEventLog([{ ...event, occurredAt: 999999 }])

    expect(replayA).toEqual(replayB)
  })

  it('creates deterministic AI snapshot input without granting event authority', () => {
    const { engine, store } = createKernelHarness()

    processCommand(createSetFactCommand('cmd-ai', 'player-1', 'location', 'lake'), engine, store)
    const events = store.readEvents()
    const worldState = reduceEventLog(events)
    const beforeNarrationCount = store.countEvents()

    const firstSnapshot = createAiSnapshotInput(events, worldState)
    const secondSnapshot = createAiSnapshotInput(events, worldState)
    const narration = createNarrationOutput('你抵達湖邊。')

    expect(firstSnapshot).toEqual(secondSnapshot)
    expect(narration).toEqual({ text: '你抵達湖邊。' })
    expect(store.countEvents()).toBe(beforeNarrationCount)
  })

  it('uses a deterministic total order even for malformed duplicate sequence input', () => {
    const [draftA, draftB] = createAcceptedDrafts([
      createSetFactCommand('cmd-a', 'player-1', 'conflict', 'a'),
      createSetFactCommand('cmd-b', 'player-2', 'conflict', 'b')
    ])
    if (draftA === undefined || draftB === undefined) {
      throw new Error('Expected event drafts')
    }

    const eventA = { ...draftA, sequence: 1 }
    const eventB = { ...draftB, sequence: 1 }

    expect(reduceEventLog([eventA, eventB])).toEqual(reduceEventLog([eventB, eventA]))
  })

  it('assigns stable sequence order at the single-writer commit boundary', () => {
    const first = createKernelHarness()
    const second = createKernelHarness()
    const firstBatches = createAcceptedBatches([
      createSetFactCommand('cmd-b', 'player-2', 'b', 2),
      createSetFactCommand('cmd-a', 'player-1', 'a', 1)
    ])
    const secondBatches = createAcceptedBatches([
      createSetFactCommand('cmd-a', 'player-1', 'a', 1),
      createSetFactCommand('cmd-b', 'player-2', 'b', 2)
    ])

    const firstCommitted = commitEventBatchesInDeterministicOrder(first.store, firstBatches)
    const secondCommitted = commitEventBatchesInDeterministicOrder(second.store, secondBatches)

    expect(firstCommitted.map((event) => event.sequence)).toEqual([1, 2])
    expect(secondCommitted.map((event) => event.sequence)).toEqual([1, 2])
    expect(firstCommitted.map((event) => event.deterministicKey)).toEqual(
      secondCommitted.map((event) => event.deterministicKey)
    )
  })

  it('rejects duplicate commit-boundary sort keys', () => {
    const { store } = createKernelHarness()
    const batches = createAcceptedBatches([
      createSetFactCommand('cmd-duplicate', 'player-1', 'a', 1),
      createSetFactCommand('cmd-duplicate', 'player-2', 'b', 2)
    ])

    expect(() => commitEventBatchesInDeterministicOrder(store, batches)).toThrow(/Duplicate deterministic/)
    expect(store.countEvents()).toBe(0)
  })

  it('rolls back the whole event batch when any append fails', () => {
    const { store } = createKernelHarness()
    const [draft] = createAcceptedDrafts([createSetFactCommand('cmd-rollback', 'player-1', 'x', 1)])
    if (draft === undefined) {
      throw new Error('Expected event draft')
    }

    expect(() => store.appendEvents([draft, draft])).toThrow()
    expect(store.countEvents()).toBe(0)
  })
})

function createKernelHarness(): { db: Database.Database; store: SqliteEventStore; engine: KernelRuleEngine } {
  const db = new Database(':memory:')
  return { db, store: new SqliteEventStore(db), engine: new KernelRuleEngine() }
}

function createSetFactCommand(commandId: string, actorId: string, key: string, value: unknown): Command {
  return {
    commandId,
    commandType: COMMAND_SET_FACT,
    actorId,
    submittedAt: 1000,
    payload: { key, value }
  }
}

function createEventDraft(
  eventId: string,
  eventType: string,
  tick: number,
  payload: Record<string, unknown>
): EventDraft {
  return {
    eventId,
    eventType,
    occurredAt: tick,
    actorId: 'system',
    payload,
    deterministicKey: eventId,
    version: 1,
    tick
  }
}

function createAcceptedDrafts(commands: readonly Command[]): EventDraft[] {
  const engine = new KernelRuleEngine()
  const worldState: WorldState = createInitialWorldState()
  return commands.flatMap((command) => {
    const result = engine.evaluate(command, { worldState })
    if (!result.accepted) {
      throw new Error(`Expected accepted command: ${command.commandId}`)
    }
    return [...result.events]
  })
}

function createAcceptedBatches(commands: readonly Command[]): { sortKey: string; events: EventDraft[] }[] {
  const engine = new KernelRuleEngine()
  const worldState: WorldState = createInitialWorldState()
  return commands.map((command) => {
    const result = engine.evaluate(command, { worldState })
    if (!result.accepted) {
      throw new Error(`Expected accepted command: ${command.commandId}`)
    }
    return { sortKey: command.commandId, events: [...result.events] }
  })
}

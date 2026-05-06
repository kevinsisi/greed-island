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

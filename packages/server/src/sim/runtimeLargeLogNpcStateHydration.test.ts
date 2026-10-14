import Database from 'better-sqlite3'
import { describe, expect, it, vi } from 'vitest'
import type { EventDraft } from '../kernel/types.js'
import { SqliteEventStore } from '../kernel/eventStore.js'
import { loadCardCatalog } from '../cards/loader.js'
import { loadNpcProfiles } from '../npcs/loader.js'
import { SimulationRuntime } from './runtime.js'
import { NpcEngine, type NpcRuntimeState } from './npcEngine.js'

const LARGE_LOG_LIMIT = 20_000
const LARGE_FIXTURE_EVENTS = LARGE_LOG_LIMIT + 12

type RuntimeInternals = {
  npcEngine: {
    snapshotAll(): ReadonlyMap<string, NpcRuntimeState>
    hydrate(npcId: string, state: unknown): void
  }
  npcStateProjection: { getByNpcId(npcId: string): { state: NpcRuntimeState; recordedAtTick: number } | null }
}

type MeasuredEventStore = SqliteEventStore & {
  readEvents: () => ReturnType<SqliteEventStore['readEvents']>
  readLatestEventsPerActor: (eventTypes: readonly string[]) => ReturnType<SqliteEventStore['readLatestEventsPerActor']>
  readLatestFactEvents: (keys: readonly string[]) => ReturnType<SqliteEventStore['readLatestFactEvents']>
}

function snapshotDraft(npcId: string, state: NpcRuntimeState, tick: number): EventDraft {
  return {
    eventId: `npc-state-${npcId}-${tick}`,
    eventType: 'NPC_STATE_RECORDED',
    occurredAt: tick,
    actorId: npcId,
    tick,
    payload: { data: { npcId, state, narration: null } },
    deterministicKey: `npc-state-${npcId}-${tick}`,
    version: 1,
  }
}

function legacyStateDraft(npcId: string, state: NpcRuntimeState, tick: number): EventDraft {
  return {
    eventId: `legacy-npc-state-${npcId}-${tick}`,
    eventType: 'FACT_SET',
    occurredAt: tick,
    actorId: npcId,
    tick,
    payload: { key: `npc.state.${npcId}`, value: state },
    deterministicKey: `legacy-npc-state-${npcId}-${tick}`,
    version: 1,
  }
}

function fillerDraft(sequence: number): EventDraft {
  return {
    eventId: `fixture-filler-${sequence}`,
    eventType: 'NPC_TEST_FIXTURE_EVENT',
    occurredAt: sequence,
    actorId: 'fixture',
    tick: 1019,
    payload: { ordinal: sequence },
    deterministicKey: `fixture-filler-${sequence}`,
    version: 1,
  }
}

function setForCase(base: NpcRuntimeState, suffix: number): NpcRuntimeState {
  return {
    ...base,
    tile: 't_dock',
    mood: 43.25 + suffix / 100,
    health: 71.75 - suffix / 100,
    activity: 'move',
    faction: 'tide_hunters',
    targetTile: 't_forest',
    lastActedTick: 1000,
    subCol: 2 + (suffix % 10),
    subRow: 6,
    subZ: 1,
    personalityOverride: { targetTile: 't_mountain', expiresAtTick: 1020 + (suffix % 5), reason: `fixture-${suffix}` },
    intentOverride: {
      targetTile: 't_temple', expiresAtTick: 1025 + (suffix % 5), intentType: 'survival', urgency: 9, reason: `fixture-${suffix}`,
    },
    travelRoute: { fromTile: 't_dock', toTile: 't_forest', targetTile: 't_temple', startedAtTick: 980 + (suffix % 5) },
    agent: {
      ...base.agent,
      activeTask: {
        kind: 'travel', reason: `fixture-${suffix}`, targetTile: 't_temple', startedAtTick: 985 + (suffix % 5), expiresAtTick: 1030 + (suffix % 5),
      },
      lastDecision: { tick: 990 + (suffix % 5), source: 'agent', reason: `fixture-${suffix}` },
    },
    homeTileOverride: 't_dock',
    scheduledBuildingId: 'b_dock_market',
  }
}

function createFixture(logSize: number) {
  const db = new Database(':memory:')
  const store = new SqliteEventStore(db)
  const profiles = loadNpcProfiles()
  const beforeRuntime = new SimulationRuntime(store, profiles, loadCardCatalog())
  const engine = (beforeRuntime as unknown as RuntimeInternals).npcEngine
  const ids = profiles.slice(0, 4).map(profile => profile.id)
  const starting = engine.snapshotAll()
  const originalNpcCount = starting.size
  const desired = new Map(profiles.map((profile, index) => {
    const id = profile.id
    const value = setForCase(starting.get(id)!, index + 1)
    engine.hydrate(id, value)
    return [id, engine.snapshotAll().get(id)!] as const
  }))
  const expected = new Map(desired)

  const [, legacyOnlyId, newerLegacyId, newerTypedId] = ids as [string, string, string, string]
  const olderTyped = setForCase(starting.get(newerLegacyId)!, 81)
  const olderLegacy = setForCase(starting.get(newerTypedId)!, 82)
  const newerFact = desired.get(newerLegacyId)!
  const newerSnapshot = desired.get(newerTypedId)!
  beforeRuntime.stop()

  const initialSnapshots: EventDraft[] = []
  for (const profile of profiles) {
    const npcId = profile.id
    if (npcId === legacyOnlyId) initialSnapshots.push(legacyStateDraft(npcId, desired.get(npcId)!, 1002))
    else if (npcId === newerLegacyId) initialSnapshots.push(snapshotDraft(npcId, olderTyped, 1001))
    else if (npcId === newerTypedId) initialSnapshots.push(legacyStateDraft(npcId, olderLegacy, 1001))
    else initialSnapshots.push(snapshotDraft(npcId, desired.get(npcId)!, 1001))
  }
  store.appendEvents(initialSnapshots)
  const fillerCount = Math.max(0, logSize - profiles.length - 2)
  for (let start = 0; start < fillerCount; start += 1000) {
    const batch = Array.from({ length: Math.min(1000, fillerCount - start) }, (_unused, index) => fillerDraft(start + index))
    store.appendEvents(batch)
  }
  // Both orderings occur in the same fixture: the higher sequence wins.
  store.appendEvents([
    legacyStateDraft(newerLegacyId, newerFact, 1003),
    snapshotDraft(newerTypedId, newerSnapshot, 1004),
  ])
  store.appendEvents([fillerDraft(fillerCount + 2)])

  const reads = { fullLog: 0, latestTypedRows: 0, latestTypedCalls: 0, legacyRows: 0, legacyCalls: 0 }
  const measured = store as MeasuredEventStore
  const readEvents = measured.readEvents.bind(store)
  vi.spyOn(store, 'readEvents').mockImplementation(() => {
    reads.fullLog += 1
    return readEvents()
  })
  const readLatest = measured.readLatestEventsPerActor.bind(store)
  vi.spyOn(store, 'readLatestEventsPerActor').mockImplementation(eventTypes => {
    reads.latestTypedCalls += 1
    const rows = readLatest(eventTypes)
    reads.latestTypedRows += rows.length
    return rows
  })
  const readLatestFacts = measured.readLatestFactEvents.bind(store)
  vi.spyOn(store, 'readLatestFactEvents').mockImplementation(keys => {
    reads.legacyCalls += 1
    const rows = readLatestFacts(keys)
    reads.legacyRows += rows.length
    return rows
  })

  return { db, store, profiles, expected, originalNpcCount, reads, fixtureNpcIds: profiles.map(profile => profile.id) }
}

function restartAndRead(fixture: ReturnType<typeof createFixture>) {
  const runtime = new SimulationRuntime(fixture.store, fixture.profiles, loadCardCatalog())
  try {
    const internals = runtime as unknown as RuntimeInternals
    const state = internals.npcEngine.snapshotAll()
    const projectedRows = new Map([...fixture.expected.keys()].map(npcId => [npcId, internals.npcStateProjection.getByNpcId(npcId)]))
    const projected = new Map([...projectedRows].map(([npcId, row]) => [npcId, row?.state]))
    return { state: new Map(state), projected, projectedRows, npcCount: state.size, currentTick: runtime.getCurrentTick() }
  } finally {
    runtime.stop()
  }
}

describe('large-log NPC state hydration', () => {
  it('retains scheduledBuildingId when hydrating a complete runtime state', () => {
    const profile = loadNpcProfiles()[0]!
    const engine = new NpcEngine([profile])
    const initial = engine.getState(profile.id)!
    engine.hydrate(profile.id, { ...initial, scheduledBuildingId: 'b_dock_market' })
    expect(engine.getState(profile.id)?.scheduledBuildingId).toBe('b_dock_market')
  })

  it('restores complete typed-only and legacy NPC states and chooses the higher sequence without reading the full log', () => {
    const fixture = createFixture(LARGE_FIXTURE_EVENTS)
    try {
      expect(fixture.store.countEvents()).toBeGreaterThan(LARGE_LOG_LIMIT)
      const restarted = restartAndRead(fixture)

      expect(restarted.npcCount).toBe(fixture.originalNpcCount)
      for (const [npcId, expectedState] of fixture.expected) {
        expect(restarted.state.get(npcId), `complete state for ${npcId}`).toEqual(expectedState)
      }
      for (const npcId of fixture.fixtureNpcIds) {
        const expectedState = fixture.expected.get(npcId)!
        expect(restarted.projected.get(npcId), `projection state for ${npcId}`).toEqual(expectedState)
        const restartedState = restarted.state.get(npcId)!
        expect(restartedState.tile, `tile for ${npcId}`).toBe(expectedState.tile)
        expect(restartedState.activity, `activity for ${npcId}`).toBe(expectedState.activity)
        expect(restarted.currentTick - restarted.projectedRows.get(npcId)!.recordedAtTick,
          `snapshot age for ${npcId}`).toBeLessThanOrEqual(19)
      }
      expect(fixture.reads.fullLog).toBe(0)
      expect(fixture.reads.latestTypedCalls).toBeGreaterThan(0)
      expect(fixture.reads.latestTypedRows).toBeLessThanOrEqual(fixture.originalNpcCount)
      expect(fixture.reads.legacyCalls).toBe(1)
      expect(fixture.reads.legacyRows).toBeLessThanOrEqual(fixture.profiles.length)
    } finally {
      fixture.db.close()
    }
  })

  it('keeps the small-log replay path and chooses the higher sequence in both directions', () => {
    const fixture = createFixture(2_000)
    try {
      const restarted = restartAndRead(fixture)
      expect(restarted.npcCount).toBe(fixture.originalNpcCount)
      for (const [npcId, expectedState] of fixture.expected) {
        expect(restarted.state.get(npcId), `complete state for ${npcId}`).toEqual(expectedState)
      }
      for (const npcId of fixture.fixtureNpcIds) {
        expect(restarted.projected.get(npcId), `projection state for ${npcId}`).toEqual(fixture.expected.get(npcId))
      }
      expect(fixture.reads.fullLog).toBeGreaterThan(0)
    } finally {
      fixture.db.close()
    }
  })
})

import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { TICK_DURATION_MS } from '../config/world.js'
import type { Animal } from '../ecosystem/species.js'
import { initializeKernelSchema, SqliteEventStore } from '../kernel/eventStore.js'
import { LivingWorldRuleEngine, makeLivingWorldCommand } from '../kernel/livingWorldCommands.js'
import { hashCanonicalJson } from '../kernel/canonicalJson.js'
import type { Event, EventDraft } from '../kernel/types.js'
import { loadCardCatalog } from '../cards/loader.js'
import { loadNpcProfiles } from '../npcs/loader.js'
import { NpcStateProjection } from '../projections/npcState.js'
import { SimulationRuntime } from './runtime.js'
import { NPC_MINOR_SNAPSHOT_INTERVAL_TICKS, NpcStateSnapshotThrottle } from './npcStateSnapshotThrottle.js'
import type { NpcRuntimeState } from './npcEngine.js'

const NPC_ID = 'central.exchange.shen_ruo_yun'
const PREVIOUS_MINOR_SNAPSHOT_INTERVAL_TICKS = 5

function state(overrides: Partial<NpcRuntimeState> = {}): NpcRuntimeState {
  return {
    tile: 't_central', mood: 60, health: 80, activity: 'work', faction: 'civilian',
    targetTile: 't_central', lastActedTick: 0, subCol: 5, subRow: 4, subZ: 0,
    personalityOverride: null, intentOverride: null, travelRoute: null,
    agent: {
      profileId: NPC_ID, permissions: [],
      activeTask: { kind: 'scheduled-duty', reason: 'fixture', targetTile: 't_central', startedAtTick: 0, expiresAtTick: null },
      lastDecision: { tick: 0, source: 'schedule', reason: 'fixture' },
    },
    ...overrides,
  }
}

type RuntimeInternals = {
  npcEngine: { snapshotAll(): ReadonlyMap<string, NpcRuntimeState> }
  npcStateProjection: { getAll(): readonly { npcId: string; state: NpcRuntimeState }[] }
  shouldPersistTickFact(): boolean
}

function runTicks(
  throttleEnabled: boolean,
  ticks: number,
  intervalTicks?: number,
  keepLegacyTickFact = false,
  profiles = loadNpcProfiles(),
) {
  const db = new Database(':memory:')
  initializeKernelSchema(db)
  const store = new SqliteEventStore(db)
  seedRetaliatingBoar(store)
  const throttle = new NpcStateSnapshotThrottle({
    enabled: throttleEnabled,
    ...(intervalTicks === undefined ? {} : { intervalTicks }),
  })
  const runtime = new SimulationRuntime(
    store, profiles, loadCardCatalog(), TICK_DURATION_MS,
    throttle,
  )
  try {
    const internals = runtime as unknown as RuntimeInternals
    if (keepLegacyTickFact) internals.shouldPersistTickFact = () => true
    const projectionByTick: string[] = []
    const memoryByTick: string[] = []
    runtime.subscribeTick(() => {
      const projection = internals.npcStateProjection.getAll()
        .map(row => [row.npcId, comparableNonMinorState(row.state)] as const)
        .sort(([left], [right]) => left.localeCompare(right))
      const memoryProjection = [...internals.npcEngine.snapshotAll()]
        .map(([npcId, state]) => [npcId, comparableNonMinorState(state)] as const)
        .sort(([left], [right]) => left.localeCompare(right))
      projectionByTick.push(hashCanonicalJson(projection))
      memoryByTick.push(hashCanonicalJson(memoryProjection))
    })
    for (let tick = 0; tick < ticks; tick += 1) runtime.advanceTicks(1)
    const events = store.readEvents()
    const memory = [...internals.npcEngine.snapshotAll().entries()]
      .sort(([left], [right]) => left.localeCompare(right))
    return {
      events,
      memory,
      projectionByTick,
      memoryByTick,
      stateEventCount: events.filter(event => event.eventType === 'NPC_STATE_RECORDED').length,
      factSetCount: events.filter(event => event.eventType === 'FACT_SET').length,
      throttleDiagnostics: throttle.getDiagnostics(),
    }
  } finally {
    runtime.stop()
    db.close()
  }
}

function comparableNonMinorState(state: NpcRuntimeState) {
  const { subCol: _subCol, subRow: _subRow, subZ: _subZ, lastActedTick: _lastActedTick, mood, health, ...rest } = state
  return { ...rest, mood: Math.round(mood), health: Math.round(health) }
}

function seedRetaliatingBoar(store: SqliteEventStore): void {
  const animal: Animal = {
    id: 'fixture.moss-boar.1', speciesId: 'moss_boar', tileId: 't_forest', biomeRegion: 'forest',
    position: { subCol: 7, subRow: 5, subZ: 0 }, state: 'idle', hunger: 0, health: 100,
    fear: 20, aggression: 55, packId: null, migrationTarget: null, currentTarget: null,
    reproductionCooldown: 0, lifecycleStage: 'adult', ownerSettlementId: null, domesticatedBy: null,
  }
  const result = new LivingWorldRuleEngine().evaluate(makeLivingWorldCommand('ANIMAL_SPAWNED', 'system', 'system', 0, 0, {
    animal, spawnedAtTick: 0, narration: null,
  }))
  if (!result.accepted) throw new Error(result.rejection.reason)
  store.appendEvents(result.events)
}

function tickEventDraft(eventType: string, eventId: string, tick: number, payload: unknown): EventDraft {
  return {
    eventId, eventType, occurredAt: tick, actorId: 'system', tick, payload,
    deterministicKey: eventId, version: 1,
  }
}

function comparableNonStateEvents(events: readonly Event[]) {
  // Auto-increment sequence values compress when state rows are omitted; compare the remaining event order and durable content.
  return events.filter(event => event.eventType !== 'NPC_STATE_RECORDED'
    && !(event.eventType === 'FACT_SET' && (event.payload as { key?: string }).key === 'world.tick')).map(event => ({
    eventId: event.eventId,
    eventType: event.eventType,
    actorId: event.actorId,
    commandId: event.commandId,
    tick: event.tick,
    payload: event.payload,
    rulesetVersion: event.rulesetVersion,
    version: event.version,
    deterministicKey: event.deterministicKey,
  }))
}

const importantStateChanges: Array<[string, Partial<NpcRuntimeState>]> = [
  ['tile', { tile: 't_dock' }],
  ['activity', { activity: 'sleep' }],
  ['targetTile', { targetTile: 't_forest' }],
  ['travelRoute', { travelRoute: { fromTile: 't_central', toTile: 't_dock', targetTile: 't_dock', startedAtTick: 1 } }],
  ['personality override', { personalityOverride: { targetTile: 't_dock', expiresAtTick: 10, reason: 'fixture' } }],
  ['intent override', { intentOverride: { targetTile: 't_dock', expiresAtTick: 10, intentType: 'survival', urgency: 8, reason: 'fixture' } }],
  ['agent task', { agent: { ...state().agent, activeTask: { ...state().agent.activeTask, startedAtTick: 1 } } }],
  ['home tile override', { homeTileOverride: 't_dock' }],
  ['scheduled building', { scheduledBuildingId: 'building.dock-market' }],
  ['integer mood', { mood: 61 }],
  ['integer health', { health: 79 }],
  ['faction', { faction: 'tide_hunters' }],
]

describe('NPC_STATE_RECORDED minor snapshot throttle', () => {
  it('omits the tick fact only when an accepted WORLD_TICK draft is in the atomic commit batch', () => {
    const db = new Database(':memory:')
    initializeKernelSchema(db)
    const runtime = new SimulationRuntime(new SqliteEventStore(db), loadNpcProfiles(), loadCardCatalog())
    try {
      const internals = runtime as unknown as RuntimeInternals
      const decision = internals.shouldPersistTickFact as unknown as (drafts: readonly { eventType: string }[]) => boolean
      expect(decision([])).toBe(true)
      expect(decision([{ eventType: 'NPC_MOVE' }])).toBe(true)
      expect(decision([{ eventType: 'WORLD_TICK' }])).toBe(false)
    } finally {
      runtime.stop()
      db.close()
    }
  })

  it('restores the same currentTick from old logs with world.tick facts and new logs without them', () => {
    const profiles = loadNpcProfiles()
    const readTick = (includeLegacyFact: boolean) => {
      const db = new Database(':memory:')
      initializeKernelSchema(db)
      const store = new SqliteEventStore(db)
      const tick = 937
      store.appendEvents([
        ...(includeLegacyFact
          ? [tickEventDraft('FACT_SET', 'legacy-world-tick-fact', tick, { key: 'world.tick', value: tick })]
          : []),
        tickEventDraft('WORLD_TICK', 'typed-world-tick', tick, { data: { tick } }),
      ])
      const runtime = new SimulationRuntime(store, profiles, loadCardCatalog())
      try {
        return runtime.getCurrentTick()
      } finally {
        runtime.stop()
        db.close()
      }
    }

    const legacyTick = readTick(true)
    const currentTick = readTick(false)
    expect(legacyTick).toBe(937)
    expect(currentTick).toBe(legacyTick)
  })

  it('coalesces subcell-only changes for nineteen ticks and writes again on the twentieth tick', () => {
    expect(NPC_MINOR_SNAPSHOT_INTERVAL_TICKS).toBe(20)
    const throttle = new NpcStateSnapshotThrottle()
    let previous = state()
    throttle.recordPersisted(NPC_ID, 0)
    const writtenTicks: number[] = []

    for (let tick = 1; tick <= NPC_MINOR_SNAPSHOT_INTERVAL_TICKS * 2; tick += 1) {
      const next = state({
        ...previous,
        subCol: 5 + tick,
        subRow: 4 + (tick % 2),
        subZ: tick % 2,
      })
      if (throttle.shouldPersist({ npcId: NPC_ID, previousState: previous, state: next }, tick)) {
        writtenTicks.push(tick)
        throttle.recordPersisted(NPC_ID, tick)
      }
      previous = next
    }

    expect(writtenTicks).toEqual([20, 40])
  })

  it('resets its per-NPC throttle map on process restart', () => {
    const previous = state()
    const change = { npcId: NPC_ID, previousState: previous, state: { ...previous, subCol: previous.subCol + 1 } }
    const running = new NpcStateSnapshotThrottle()
    running.recordPersisted(NPC_ID, 100)
    expect(running.shouldPersist(change, 101)).toBe(false)
    const restarted = new NpcStateSnapshotThrottle()
    expect(restarted.lastPersistedTick(NPC_ID)).toBeUndefined()
    expect(restarted.shouldPersist(change, 101)).toBe(true)
  })

  it.each(importantStateChanges)('writes a %s change immediately, inside the subcell interval', (_name, delta) => {
    const throttle = new NpcStateSnapshotThrottle()
    const previous = state()
    throttle.recordPersisted(NPC_ID, 0)
    const next = state({ ...previous, subCol: previous.subCol + 1, ...delta })
    expect(throttle.shouldPersist({ npcId: NPC_ID, previousState: previous, state: next }, 1)).toBe(true)
  })

  it('throttles lastActedTick-only changes to one write per twenty ticks', () => {
    const throttle = new NpcStateSnapshotThrottle()
    let previous = state()
    throttle.recordPersisted(NPC_ID, 0)
    const writtenTicks: number[] = []
    for (let tick = 1; tick <= NPC_MINOR_SNAPSHOT_INTERVAL_TICKS * 2; tick += 1) {
      const next = { ...previous, lastActedTick: tick }
      if (throttle.shouldPersist({ npcId: NPC_ID, previousState: previous, state: next }, tick)) {
        writtenTicks.push(tick)
        throttle.recordPersisted(NPC_ID, tick)
      }
      previous = next
    }
    expect(writtenTicks).toEqual([20, 40])
  })

  it.each([
    ['mood', (base: NpcRuntimeState, amount: number) => ({ ...base, mood: base.mood + amount })],
    ['health', (base: NpcRuntimeState, amount: number) => ({ ...base, health: base.health + amount })],
  ])('throttles %s fractional-only changes and writes at the twenty-tick boundary', (_field, update) => {
    const throttle = new NpcStateSnapshotThrottle()
    let previous = state()
    throttle.recordPersisted(NPC_ID, 0)
    const writtenTicks: number[] = []
    for (let tick = 1; tick <= NPC_MINOR_SNAPSHOT_INTERVAL_TICKS; tick += 1) {
      const next = update(previous, 0.01)
      expect(Math.round(next.mood)).toBe(Math.round(previous.mood))
      expect(Math.round(next.health)).toBe(Math.round(previous.health))
      if (throttle.shouldPersist({ npcId: NPC_ID, previousState: previous, state: next }, tick)) {
        writtenTicks.push(tick)
        throttle.recordPersisted(NPC_ID, tick)
      }
      previous = next
    }
    expect(writtenTicks).toEqual([NPC_MINOR_SNAPSHOT_INTERVAL_TICKS])
  })

  it.each([
    ['mood', (base: NpcRuntimeState) => ({ ...base, mood: base.mood + 1 })],
    ['health', (base: NpcRuntimeState) => ({ ...base, health: base.health - 1 })],
  ])('writes an integer %s change immediately without another field changing', (_field, update) => {
    const throttle = new NpcStateSnapshotThrottle()
    const previous = state()
    throttle.recordPersisted(NPC_ID, 0)
    expect(throttle.shouldPersist({ npcId: NPC_ID, previousState: previous, state: update(previous) }, 1)).toBe(true)
  })

  it('keeps player-dialog state snapshots immediate while subcell writes are rate-limited', () => {
    const db = new Database(':memory:')
    initializeKernelSchema(db)
    const store = new SqliteEventStore(db)
    const throttle = new NpcStateSnapshotThrottle()
    const runtime = new SimulationRuntime(store, loadNpcProfiles(), loadCardCatalog(), TICK_DURATION_MS, throttle)
    try {
      throttle.recordPersisted(NPC_ID, 0)
      expect(runtime.holdNpcForPlayerDialog('fixture-player', NPC_ID)).not.toBeNull()
      const stateFact = store.readEvents().find(event => event.eventType === 'FACT_SET'
        && (event.payload as { key?: string }).key === `npc.state.${NPC_ID}`)
      expect(stateFact).toBeDefined()
      expect(throttle.lastPersistedTick(NPC_ID)).toBe(runtime.getCurrentTick())
    } finally {
      runtime.stop()
      db.close()
    }
  })

  it('preserves live non-minor NPC state tick-by-tick over 1,000 ticks while applying C + D(20)', () => {
    const baseline = runTicks(true, 1_000, PREVIOUS_MINOR_SNAPSHOT_INTERVAL_TICKS, true)
    const optimized = runTicks(true, 1_000, NPC_MINOR_SNAPSHOT_INTERVAL_TICKS)

    expect(optimized.memory).toEqual(baseline.memory)
    expect(optimized.memoryByTick).toEqual(baseline.memoryByTick)
    expect(comparableNonStateEvents(optimized.events)).toEqual(comparableNonStateEvents(baseline.events))
    expect(optimized.stateEventCount).toBeLessThan(baseline.stateEventCount)
    expect(baseline.factSetCount - optimized.factSetCount).toBe(1_000)
    expect(optimized.events.filter(event => event.eventType === 'WORLD_TICK')).toHaveLength(1_000)
    console.info('C + D(20) fixture event counts', {
      before: { NPC_STATE_RECORDED: baseline.stateEventCount, FACT_SET: baseline.factSetCount },
      after: { NPC_STATE_RECORDED: optimized.stateEventCount, FACT_SET: optimized.factSetCount },
    })

    const interactions = optimized.events.filter(event => event.eventType === 'NPC_INTERACT')
    expect(interactions.length).toBeGreaterThan(0)
    for (const interaction of interactions) {
      const data = (interaction.payload as { data?: { participants?: unknown } }).data
      expect(Array.isArray(data?.participants)).toBe(true)
      for (const npcId of data!.participants as string[]) {
        expect(optimized.events.some(event => event.eventType === 'NPC_STATE_RECORDED'
          && event.tick === interaction.tick && event.sequence > interaction.sequence
          && (event.payload as { data?: { npcId?: string } }).data?.npcId === npcId),
        `post-interaction snapshot exists for ${npcId} at tick ${interaction.tick}`).toBe(true)
      }
    }

    const retaliations = optimized.events.filter(event => event.eventType === 'ANIMAL_RETALIATED')
    expect(retaliations.length).toBeGreaterThan(0)
    for (const retaliation of retaliations) {
      const npcId = (retaliation.payload as { data?: { npcId?: string } }).data?.npcId
      if (!npcId) continue
      expect(optimized.events.some(event => event.eventType === 'NPC_STATE_RECORDED'
        && event.tick === retaliation.tick && event.sequence > retaliation.sequence
        && (event.payload as { data?: { npcId?: string } }).data?.npcId === npcId),
      `retaliation snapshot exists for ${npcId} at tick ${retaliation.tick}`).toBe(true)
    }

    const replayed = new NpcStateProjection()
    replayed.rebuildFromEvents(optimized.events)
    const latestWritten = new Map<string, unknown>()
    for (const event of optimized.events) {
      if (event.eventType !== 'NPC_STATE_RECORDED') continue
      const data = (event.payload as { data?: { npcId?: string; state?: unknown } }).data
      if (data?.npcId && data.state) latestWritten.set(data.npcId, data.state)
    }
    expect(replayed.getAll().map(row => [row.npcId, row.state])).toEqual(
      [...latestWritten.entries()].sort(([left], [right]) => left.localeCompare(right)),
    )
    const reduction = 1 - optimized.stateEventCount / baseline.stateEventCount
    console.log(`[npc-state-throttle] ticks=1000 before NPC_STATE_RECORDED=${baseline.stateEventCount} FACT_SET=${baseline.factSetCount}; after NPC_STATE_RECORDED=${optimized.stateEventCount} FACT_SET=${optimized.factSetCount}; NPC reduction=${(reduction * 100).toFixed(1)}%; minorCandidates=${optimized.throttleDiagnostics.minorOnlyCandidateCount} coalesced=${optimized.throttleDiagnostics.suppressedMinorSnapshotCount} interactions=${interactions.length} retaliations=${retaliations.length}`)
  })

  it('keeps all NPC projection state fields except minor fields identical per tick in a deterministic 1,000-tick fixture', () => {
    const profile = loadNpcProfiles().find(candidate => candidate.id === NPC_ID)!
    const before = runTicks(true, 1_000, PREVIOUS_MINOR_SNAPSHOT_INTERVAL_TICKS, true, [profile])
    const after = runTicks(true, 1_000, NPC_MINOR_SNAPSHOT_INTERVAL_TICKS, false, [profile])
    expect(after.projectionByTick).toEqual(before.projectionByTick)
  })
})

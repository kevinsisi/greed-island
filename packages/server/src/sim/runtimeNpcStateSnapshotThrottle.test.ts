import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { TICK_DURATION_MS } from '../config/world.js'
import type { Animal } from '../ecosystem/species.js'
import { initializeKernelSchema, SqliteEventStore } from '../kernel/eventStore.js'
import { LivingWorldRuleEngine, makeLivingWorldCommand } from '../kernel/livingWorldCommands.js'
import type { Event } from '../kernel/types.js'
import { loadCardCatalog } from '../cards/loader.js'
import { loadNpcProfiles } from '../npcs/loader.js'
import { NpcStateProjection } from '../projections/npcState.js'
import { SimulationRuntime } from './runtime.js'
import { NPC_SUBCELL_SNAPSHOT_INTERVAL_TICKS, NpcStateSnapshotThrottle } from './npcStateSnapshotThrottle.js'
import type { NpcRuntimeState } from './npcEngine.js'

const NPC_ID = 'central.exchange.shen_ruo_yun'

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

type RuntimeInternals = { npcEngine: { snapshotAll(): ReadonlyMap<string, NpcRuntimeState> } }

function runTicks(throttleEnabled: boolean, ticks: number) {
  const db = new Database(':memory:')
  initializeKernelSchema(db)
  const store = new SqliteEventStore(db)
  seedRetaliatingBoar(store)
  const throttle = new NpcStateSnapshotThrottle({ enabled: throttleEnabled })
  const runtime = new SimulationRuntime(
    store, loadNpcProfiles(), loadCardCatalog(), TICK_DURATION_MS,
    throttle,
  )
  try {
    for (let tick = 0; tick < ticks; tick += 1) runtime.advanceTicks(1)
    const events = store.readEvents()
    const memory = [...(runtime as unknown as RuntimeInternals).npcEngine.snapshotAll().entries()]
      .sort(([left], [right]) => left.localeCompare(right))
    return {
      events,
      memory,
      stateEventCount: events.filter(event => event.eventType === 'NPC_STATE_RECORDED').length,
      throttleDiagnostics: throttle.getDiagnostics(),
    }
  } finally {
    runtime.stop()
    db.close()
  }
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

function comparableNonStateEvents(events: readonly Event[]) {
  // Auto-increment sequence values compress when state rows are omitted; compare the remaining event order and durable content.
  return events.filter(event => event.eventType !== 'NPC_STATE_RECORDED').map(event => ({
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

describe('NPC_STATE_RECORDED subcell snapshot throttle', () => {
  it('coalesces subcell-only changes for four ticks and writes again on the fifth tick', () => {
    expect(NPC_SUBCELL_SNAPSHOT_INTERVAL_TICKS).toBe(5)
    const throttle = new NpcStateSnapshotThrottle()
    let previous = state()
    throttle.recordPersisted(NPC_ID, 0)
    const writtenTicks: number[] = []

    for (let tick = 1; tick <= 10; tick += 1) {
      const next = state({
        ...previous,
        subCol: 5 + tick,
        subRow: 4 + (tick % 2),
        subZ: tick % 2,
        mood: 60 + tick * 0.05,
        health: 80 + tick * 0.05,
      })
      if (throttle.shouldPersist({ npcId: NPC_ID, previousState: previous, state: next }, tick)) {
        writtenTicks.push(tick)
        throttle.recordPersisted(NPC_ID, tick)
      }
      previous = next
    }

    expect(writtenTicks).toEqual([5, 10])
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

  it('does not throttle a lastActedTick-only change', () => {
    const throttle = new NpcStateSnapshotThrottle()
    const previous = state()
    throttle.recordPersisted(NPC_ID, 0)
    expect(throttle.shouldPersist({ npcId: NPC_ID, previousState: previous, state: { ...previous, lastActedTick: 1 } }, 1)).toBe(true)
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

  it('keeps memory simulation and non-state event sequence identical over 1,000 ticks, and replay returns the latest written snapshots', () => {
    const baseline = runTicks(false, 1_000)
    const throttled = runTicks(true, 1_000)

    expect(throttled.memory).toEqual(baseline.memory)
    expect(comparableNonStateEvents(throttled.events)).toEqual(comparableNonStateEvents(baseline.events))
    expect(throttled.stateEventCount).toBeLessThan(baseline.stateEventCount)

    const interactions = throttled.events.filter(event => event.eventType === 'NPC_INTERACT')
    expect(interactions.length).toBeGreaterThan(0)
    for (const interaction of interactions) {
      const data = (interaction.payload as { data?: { participants?: unknown } }).data
      expect(Array.isArray(data?.participants)).toBe(true)
      for (const npcId of data!.participants as string[]) {
        expect(throttled.events.some(event => event.eventType === 'NPC_STATE_RECORDED'
          && event.tick === interaction.tick && event.sequence > interaction.sequence
          && (event.payload as { data?: { npcId?: string } }).data?.npcId === npcId),
        `post-interaction snapshot exists for ${npcId} at tick ${interaction.tick}`).toBe(true)
      }
    }

    const retaliations = throttled.events.filter(event => event.eventType === 'ANIMAL_RETALIATED')
    expect(retaliations.length).toBeGreaterThan(0)
    for (const retaliation of retaliations) {
      const npcId = (retaliation.payload as { data?: { npcId?: string } }).data?.npcId
      if (!npcId) continue
      expect(throttled.events.some(event => event.eventType === 'NPC_STATE_RECORDED'
        && event.tick === retaliation.tick && event.sequence > retaliation.sequence
        && (event.payload as { data?: { npcId?: string } }).data?.npcId === npcId),
      `retaliation snapshot exists for ${npcId} at tick ${retaliation.tick}`).toBe(true)
    }

    const replayed = new NpcStateProjection()
    replayed.rebuildFromEvents(throttled.events)
    const latestWritten = new Map<string, unknown>()
    for (const event of throttled.events) {
      if (event.eventType !== 'NPC_STATE_RECORDED') continue
      const data = (event.payload as { data?: { npcId?: string; state?: unknown } }).data
      if (data?.npcId && data.state) latestWritten.set(data.npcId, data.state)
    }
    expect(replayed.getAll().map(row => [row.npcId, row.state])).toEqual(
      [...latestWritten.entries()].sort(([left], [right]) => left.localeCompare(right)),
    )
    const reduction = 1 - throttled.stateEventCount / baseline.stateEventCount
    console.log(`[npc-state-throttle] ticks=1000 baseline=${baseline.stateEventCount} throttled=${throttled.stateEventCount} reduction=${(reduction * 100).toFixed(1)}% subcellCandidates=${throttled.throttleDiagnostics.subcellOnlyCandidateCount} coalesced=${throttled.throttleDiagnostics.suppressedSubcellSnapshotCount} interactions=${interactions.length} retaliations=${retaliations.length}`)
  })
})

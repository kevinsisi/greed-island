import Database from 'better-sqlite3'
import { describe, expect, it, vi } from 'vitest'
import { accountId } from '../identity/principal.js'
import { loadCardCatalog } from '../cards/loader.js'
import { SqliteEventStore } from '../kernel/eventStore.js'
import { LivingWorldRuleEngine, makeLivingWorldCommand } from '../kernel/livingWorldCommands.js'
import { loadNpcProfiles } from '../npcs/loader.js'
import { SimulationRuntime } from './runtime.js'

const alice = accountId(1)
const enter = { commandId: 'enter', type: 'enter', payload: {} }
describe('SimulationRuntime canonical player world', () => {
  it.each(['small', 'large'] as const)('restores accepted position independently of the %s-log boot branch', size => {
    const db = new Database(':memory:'), store = new SqliteEventStore(db)
    const first = new SimulationRuntime(store, loadNpcProfiles(), loadCardCatalog())
    try {
      first.executePlayerWorldCommand(alice, enter)
      first.advancePlayerMovementStep()
      first.executePlayerWorldCommand(alice, { commandId: 'move', type: 'move', payload: { dx: 1, dz: 0 } })
      const expected = first.getPlayerWorldPosition(alice)
      const read = store.readLatestFactSnapshot.bind(store)
      if (size === 'large') vi.spyOn(store, 'readLatestFactSnapshot').mockImplementation(() => ({ ...read(), eventCount: 1_000_001 }))
      const second = new SimulationRuntime(store, loadNpcProfiles(), loadCardCatalog())
      try {
        expect(second.getPlayerWorldPosition(alice)).toEqual(expected)
        expect(second.executePlayerWorldCommand(alice, { commandId: 'move', type: 'move', payload: { dx: 1, dz: 0 } }).duplicate).toBe(true)
        const map = second.getMap(); expect(map.edges.find(edge => edge.fromTileId === 't_central' && edge.toTileId === 't_dock')).toMatchObject({ crossingType: 'water-crossing', available: true })
        const snapshot = second.getPlayerWorldSnapshot(alice)
        expect(snapshot.version).toBe(1); expect(snapshot.worldId).toBe('canonical-world')
        expect(snapshot.npcs.every(npc => npc.location === 't_dock')).toBe(true)
      } finally { second.stop() }
    } finally { first.stop(); db.close() }
  })
  it('cannot bypass player intent rules through the generic living-world command path', () => {
    const db = new Database(':memory:'), store = new SqliteEventStore(db), runtime = new SimulationRuntime(store, loadNpcProfiles(), loadCardCatalog())
    try {
      const forged = makeLivingWorldCommand('PLAYER_WORLD_ENTERED', '1', 'player', 0, 0, { accountId: 1, tileId: 't_central',
        x: 99, z: 99, movementStep: -1, clientCommandId: 'forged', intentDigest: 'a'.repeat(64) })
      expect(runtime.submitLivingWorldCommand(forged)).toBeNull(); expect(runtime.getPlayerWorldPosition(alice)).toBeNull()
      expect(store.readEventsByActorCommand('1', forged.commandId, ['PLAYER_WORLD_ENTERED'])).toHaveLength(0)
    } finally { runtime.stop(); db.close() }
  })
})

describe('canonical player snapshot cadence', () => {
  it('publishes autonomous world changes without requiring another player movement and avoids narrative movement spam', () => {
    const db = new Database(':memory:'), store = new SqliteEventStore(db), runtime = new SimulationRuntime(store, loadNpcProfiles(), loadCardCatalog())
    try {
      const narrative = vi.fn(); runtime.subscribe(narrative); runtime.executePlayerWorldCommand(alice, enter)
      const snapshots = vi.fn(), unsubscribe = runtime.subscribePlayerWorld(alice, snapshots)
      runtime.advancePlayerMovementStep(); snapshots.mockClear()
      runtime.executePlayerWorldCommand(alice, { commandId: 'move', type: 'move', payload: { dx: 1, dz: 0 } })
      expect(narrative).not.toHaveBeenCalled(); expect(snapshots).not.toHaveBeenCalled()
      runtime.advancePlayerMovementStep(); expect(snapshots).toHaveBeenCalledOnce(); snapshots.mockClear()
      runtime.advanceTicks(1); expect(snapshots).not.toHaveBeenCalled()
      runtime.advancePlayerMovementStep(); expect(snapshots).toHaveBeenCalledOnce()
      expect(snapshots.mock.calls[0]![0].worldTick).toBe(1); unsubscribe()
    } finally { runtime.stop(); db.close() }
  })
})

describe('canonical world history with high-frequency player events', () => {
  it('keeps world evidence and narrative windows after movement fills the raw latest-event window', () => {
    const db = new Database(':memory:'), store = new SqliteEventStore(db)
    const evidence = makeLivingWorldCommand('ROAD_CONSTRUCTED', 'system', 'system', 1, 0, {
      roadId: 'synthetic-road', fromTileId: 't_forest', toTileId: 't_central', roadType: 'road',
      constructedAtTick: 1, narration: 'Synthetic world evidence',
    })
    const compiled = new LivingWorldRuleEngine().evaluate(evidence)
    if (!compiled.accepted) throw new Error(compiled.rejection.reason)
    const historyEvent = store.appendEvents(compiled.events)[0]!
    const runtime = new SimulationRuntime(store, loadNpcProfiles(), loadCardCatalog())
    try {
      runtime.executePlayerWorldCommand(alice, enter)
      for (let step = 0; step < 1001; step += 1) {
        runtime.advancePlayerMovementStep()
        runtime.executePlayerWorldCommand(alice, { commandId: `m-${step}`, type: 'move', payload: { dx: step % 2 ? -1 : 1, dz: 0 } })
      }
      expect(store.readRecentEvents(250).every(event => event.eventType === 'PLAYER_WORLD_MOVED')).toBe(true)
      expect(store.readRecentEventsExcludingTypes(250, ['PLAYER_WORLD_ENTERED','PLAYER_WORLD_MOVED','PLAYER_REGION_TRANSITIONED']).map(event => event.eventId)).toEqual([historyEvent.eventId])
      const collect = runtime as unknown as { collectWorldCivilizationEvidence(): Array<{ eventId: string }> }
      expect(collect.collectWorldCivilizationEvidence().map(event => event.eventId)).toContain(historyEvent.eventId)
      const restarted = new SimulationRuntime(store, loadNpcProfiles(), loadCardCatalog())
      try { expect(restarted.getRecentEvents().some(event => event.narration === 'Synthetic world evidence')).toBe(true) }
      finally { restarted.stop() }
    } finally { runtime.stop(); db.close() }
  })
})

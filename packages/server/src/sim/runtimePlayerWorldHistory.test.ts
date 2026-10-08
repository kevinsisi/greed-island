import { describe, expect, it, vi } from 'vitest'
import { SimulationRuntime } from './runtime.js'
import type { Event } from '../kernel/types.js'
import { PLAYER_WORLD_EVENT_TYPES } from '../playerWorld/types.js'

// Pure read-window fixture exercises the actual private collector functions, not native SQLite.
describe('canonical autonomous history excludes movement before limiting', () => {
  it('retains civilization evidence and NPC cooldown history after420 accepted position rows', () => {
    const events: Event[] = [
      { eventId: 'road', eventType: 'ROAD_CONSTRUCTED', actorId: 'system', sequence: 1, occurredAt: 0, version: 1,
        deterministicKey: 'road', tick: 1, payload: { data: { roadId: 'road', fromTileId: 't_forest', toTileId: 't_central' } } },
      { eventId: 'work', eventType: 'NPC_FREEFORM_ACTION_PROPOSED', actorId: 'npc-existing', sequence: 2, occurredAt: 0, version: 1,
        deterministicKey: 'work', tick: 1, payload: { data: { npcId: 'npc-existing', accepted: true, resolved: { kind: 'work' } } } },
    ]
    const read = vi.fn((limit: number, excluded: readonly string[]) => events.filter(event => !excluded.includes(event.eventType)).slice(-limit))
    const runtime = Object.create(SimulationRuntime.prototype) as { store: unknown;
      collectWorldCivilizationEvidence(limit: number): Array<{ eventId: string }>;
      collectRecentNpcFreeformActionKinds(limit: number): Map<string, string[]> }
    runtime.store = { readRecentEventsExcludingTypes: read }
    const originalEvidence = runtime.collectWorldCivilizationEvidence(250), originalCooldown = runtime.collectRecentNpcFreeformActionKinds(400)
    for (let row = 0; row < 420; row += 1) events.push({ eventId: `move-${row}`, eventType: 'PLAYER_WORLD_MOVED', actorId: '1',
      sequence: row + 3, occurredAt: 0, version: 1, deterministicKey: `move-${row}`, tick: 1, payload: {} })
    expect(runtime.collectWorldCivilizationEvidence(250)).toEqual(originalEvidence)
    expect(runtime.collectRecentNpcFreeformActionKinds(400)).toEqual(originalCooldown)
    expect(originalEvidence.map(event => event.eventId)).toEqual(['road']); expect(originalCooldown.get('npc-existing')).toEqual(['work'])
    expect(read.mock.calls.every(call => call[1] === PLAYER_WORLD_EVENT_TYPES)).toBe(true)
  })
})

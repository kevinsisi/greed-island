import { describe, expect, it } from 'vitest'
import { SettlementsProjection } from './settlements.js'
import { hashCanonicalJson } from '../kernel/canonicalJson.js'
import type { Event } from '../kernel/types.js'

function formedEvent(input: {
  sequence: number
  settlementId: string
  tileId: string
  formedAtTick: number
  founderNpcIds: readonly string[]
}): Event {
  return {
    sequence: input.sequence,
    eventId: `evt_${input.settlementId}`,
    eventType: 'SETTLEMENT_FORMED',
    occurredAt: 0,
    actorId: 'system',
    payload: {
      actorType: 'system',
      data: {
        settlementId: input.settlementId,
        tileId: input.tileId,
        formedAtTick: input.formedAtTick,
        founderNpcIds: input.founderNpcIds,
        narration: 'a settlement is born',
      },
      narration: 'a settlement is born',
    },
    deterministicKey: input.settlementId,
    version: 1,
    tick: input.formedAtTick,
  }
}

function settlementEvent(input: {
  sequence: number
  eventType: string
  tick: number
  data: Record<string, unknown>
}): Event {
  return {
    sequence: input.sequence,
    eventId: `evt_${input.sequence}`,
    eventType: input.eventType,
    occurredAt: 0,
    actorId: 'system',
    payload: {
      actorType: 'system',
      data: input.data,
      narration: 'settlement state changed',
    },
    deterministicKey: `k_${input.sequence}`,
    version: 1,
    tick: input.tick,
  }
}

describe('SettlementsProjection', () => {
  it('rebuilds from empty event log', () => {
    const proj = new SettlementsProjection()
    proj.rebuildFromEvents([])
    expect(proj.getAll()).toEqual([])
    expect(proj.count()).toBe(0)
  })

  it('ignores unrelated events', () => {
    const proj = new SettlementsProjection()
    proj.rebuildFromEvents([
      {
        sequence: 1,
        eventId: 'e1',
        eventType: 'NPC_MOVE',
        occurredAt: 0,
        actorId: 'npc1',
        payload: { actorType: 'npc', data: {}, narration: null },
        deterministicKey: 'k1',
        version: 1,
        tick: 1,
      },
    ])
    expect(proj.count()).toBe(0)
  })

  it('projects a SETTLEMENT_FORMED event into a row', () => {
    const proj = new SettlementsProjection()
    proj.rebuildFromEvents([
      formedEvent({
        sequence: 1,
        settlementId: 'settlement.t_X.abc',
        tileId: 't_X',
        formedAtTick: 100,
        founderNpcIds: ['n1', 'n2', 'n3'],
      }),
    ])
    const all = proj.getAll()
    expect(all).toHaveLength(1)
    expect(all[0]?.id).toBe('settlement.t_X.abc')
    expect(all[0]?.tileId).toBe('t_X')
    expect(all[0]?.formedAtTick).toBe(100)
    expect(all[0]?.founderNpcIds).toEqual(['n1', 'n2', 'n3'])
    expect(all[0]?.populationNpcIds).toEqual([])
    expect(all[0]?.storage).toEqual([])
    expect(all[0]?.pressure).toEqual({ food: 0, safety: 0, economy: 0, logistics: 0 })
    expect(all[0]?.stability).toBe(100)
    expect(all[0]?.status).toBe('stable')
    expect(all[0]?.updatedAtTick).toBe(100)
  })

  it('first-write-wins on duplicate id (replay safety)', () => {
    const proj = new SettlementsProjection()
    proj.rebuildFromEvents([
      formedEvent({
        sequence: 1,
        settlementId: 'S1',
        tileId: 't_X',
        formedAtTick: 100,
        founderNpcIds: ['a', 'b', 'c'],
      }),
      formedEvent({
        sequence: 2,
        settlementId: 'S1',
        tileId: 't_X',
        formedAtTick: 200,
        founderNpcIds: ['d', 'e', 'f'],
      }),
    ])
    expect(proj.count()).toBe(1)
    const row = proj.getById('S1')
    expect(row?.formedAtTick).toBe(100)
    expect(row?.founderNpcIds).toEqual(['a', 'b', 'c'])
  })

  it('canonical hash is identical across two independent rebuilds', () => {
    const events = [
      formedEvent({
        sequence: 1,
        settlementId: 'S1',
        tileId: 't_A',
        formedAtTick: 10,
        founderNpcIds: ['a', 'b', 'c'],
      }),
      formedEvent({
        sequence: 2,
        settlementId: 'S2',
        tileId: 't_B',
        formedAtTick: 20,
        founderNpcIds: ['d', 'e', 'f'],
      }),
    ]
    const a = new SettlementsProjection()
    a.rebuildFromEvents(events)
    const b = new SettlementsProjection()
    b.rebuildFromEvents(events)
    expect(hashCanonicalJson(a.getAll())).toBe(hashCanonicalJson(b.getAll()))
    expect(a.canonicalHash()).toBe(b.canonicalHash())
  })

  it('projects population, storage, pressure, stability, decline, and recovery events', () => {
    const proj = new SettlementsProjection()
    proj.rebuildFromEvents([
      formedEvent({ sequence: 1, settlementId: 'S1', tileId: 't_A', formedAtTick: 10, founderNpcIds: ['a', 'b', 'c'] }),
      settlementEvent({
        sequence: 2,
        eventType: 'SETTLEMENT_POPULATION_UPDATED',
        tick: 11,
        data: { settlementId: 'S1', tileId: 't_A', populationNpcIds: ['a', 'b', 'c', 'd'], updatedAtTick: 11 },
      }),
      settlementEvent({
        sequence: 3,
        eventType: 'SETTLEMENT_STORAGE_UPDATED',
        tick: 12,
        data: {
          settlementId: 'S1',
          tileId: 't_A',
          storage: [{ goodsId: 'fish', quantity: 12 }, { goodsId: 'refined_salt', quantity: 4 }],
          updatedAtTick: 12,
        },
      }),
      settlementEvent({
        sequence: 4,
        eventType: 'SETTLEMENT_PRESSURE_UPDATED',
        tick: 13,
        data: { settlementId: 'S1', tileId: 't_A', pressure: { food: 20, safety: 30, economy: 40, logistics: 50 }, updatedAtTick: 13 },
      }),
      settlementEvent({
        sequence: 5,
        eventType: 'SETTLEMENT_STABILITY_CHANGED',
        tick: 14,
        data: { settlementId: 'S1', tileId: 't_A', stability: 72, status: 'strained', changedAtTick: 14 },
      }),
      settlementEvent({
        sequence: 6,
        eventType: 'SETTLEMENT_DECLINED',
        tick: 15,
        data: { settlementId: 'S1', tileId: 't_A', stability: 24, declinedAtTick: 15 },
      }),
      settlementEvent({
        sequence: 7,
        eventType: 'SETTLEMENT_RECOVERED',
        tick: 16,
        data: { settlementId: 'S1', tileId: 't_A', stability: 68, status: 'recovering', recoveredAtTick: 16 },
      }),
    ])

    expect(proj.getById('S1')).toEqual({
      id: 'S1',
      tileId: 't_A',
      formedAtTick: 10,
      founderNpcIds: ['a', 'b', 'c'],
      populationNpcIds: ['a', 'b', 'c', 'd'],
      storage: [{ goodsId: 'fish', quantity: 12 }, { goodsId: 'refined_salt', quantity: 4 }],
      pressure: { food: 20, safety: 30, economy: 40, logistics: 50 },
      stability: 68,
      status: 'recovering',
      updatedAtTick: 16,
    })
  })

  it('ignores state updates for unknown settlements', () => {
    const proj = new SettlementsProjection()
    proj.rebuildFromEvents([
      settlementEvent({
        sequence: 1,
        eventType: 'SETTLEMENT_PRESSURE_UPDATED',
        tick: 13,
        data: { settlementId: 'missing', tileId: 't_A', pressure: { food: 20, safety: 30, economy: 40, logistics: 50 }, updatedAtTick: 13 },
      }),
    ])
    expect(proj.count()).toBe(0)
  })

  it('rebuild sorts by sequence before applying state updates', () => {
    const events = [
      settlementEvent({
        sequence: 3,
        eventType: 'SETTLEMENT_STABILITY_CHANGED',
        tick: 14,
        data: { settlementId: 'S1', tileId: 't_A', stability: 72, status: 'strained', changedAtTick: 14 },
      }),
      formedEvent({ sequence: 1, settlementId: 'S1', tileId: 't_A', formedAtTick: 10, founderNpcIds: ['a', 'b', 'c'] }),
      settlementEvent({
        sequence: 2,
        eventType: 'SETTLEMENT_STABILITY_CHANGED',
        tick: 13,
        data: { settlementId: 'S1', tileId: 't_A', stability: 90, status: 'stable', changedAtTick: 13 },
      }),
    ]
    const proj = new SettlementsProjection()
    proj.rebuildFromEvents(events)
    expect(proj.getById('S1')?.stability).toBe(72)
    expect(proj.getById('S1')?.status).toBe('strained')
  })

  it('getByTile filters correctly', () => {
    const proj = new SettlementsProjection()
    proj.rebuildFromEvents([
      formedEvent({
        sequence: 1,
        settlementId: 'S1',
        tileId: 't_A',
        formedAtTick: 10,
        founderNpcIds: ['a', 'b', 'c'],
      }),
      formedEvent({
        sequence: 2,
        settlementId: 'S2',
        tileId: 't_B',
        formedAtTick: 20,
        founderNpcIds: ['d', 'e', 'f'],
      }),
    ])
    expect(proj.getByTile('t_A').map((r) => r.id)).toEqual(['S1'])
    expect(proj.getByTile('t_C')).toEqual([])
  })

  it('getTilesWithSettlement returns deduplicated tile set', () => {
    const proj = new SettlementsProjection()
    proj.rebuildFromEvents([
      formedEvent({
        sequence: 1,
        settlementId: 'S1',
        tileId: 't_A',
        formedAtTick: 10,
        founderNpcIds: ['a', 'b', 'c'],
      }),
      formedEvent({
        sequence: 2,
        settlementId: 'S2',
        tileId: 't_B',
        formedAtTick: 20,
        founderNpcIds: ['d', 'e', 'f'],
      }),
    ])
    const tiles = proj.getTilesWithSettlement()
    expect(tiles.has('t_A')).toBe(true)
    expect(tiles.has('t_B')).toBe(true)
    expect(tiles.size).toBe(2)
  })

  it('getAll sorts by formedAtTick then id', () => {
    const proj = new SettlementsProjection()
    proj.rebuildFromEvents([
      formedEvent({ sequence: 1, settlementId: 'S_zeta', tileId: 't_A', formedAtTick: 20, founderNpcIds: ['a', 'b', 'c'] }),
      formedEvent({ sequence: 2, settlementId: 'S_alpha', tileId: 't_B', formedAtTick: 10, founderNpcIds: ['d', 'e', 'f'] }),
    ])
    const all = proj.getAll()
    expect(all.map((r) => r.id)).toEqual(['S_alpha', 'S_zeta'])
  })
})

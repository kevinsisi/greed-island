import { describe, expect, it } from 'vitest'
import { readSettlementRows, settlementStorageTotal } from './adminSettlementProjection'

describe('admin settlement projection', () => {
  it('reads only authoritative settlement rows from world facts', () => {
    const rows = readSettlementRows({
      settlements: [
        {
          id: 'settlement.t_central',
          tileId: 't_central',
          formedAtTick: 1,
          founderNpcIds: ['npc.a'],
          populationNpcIds: ['npc.a', 'npc.b'],
          storage: [{ goodsId: 'fish', quantity: 3 }],
          pressure: { food: 20, safety: 0, economy: 10, logistics: 5 },
          stability: 90,
          status: 'stable',
          updatedAtTick: 2,
        },
        { id: 'fake.settlement', status: 'stable' },
      ],
    })

    expect(rows).toHaveLength(1)
    expect(rows[0]?.id).toBe('settlement.t_central')
    expect(rows[0] ? settlementStorageTotal(rows[0]) : 0).toBe(3)
  })

  it('returns an empty list for missing or malformed facts', () => {
    expect(readSettlementRows({})).toEqual([])
    expect(readSettlementRows({ settlements: { id: 'not-array' } })).toEqual([])
  })

  it('keeps declining settlement pressure and stability available for display', () => {
    const rows = readSettlementRows({
      settlements: [{
        id: 'settlement.t_dock',
        tileId: 't_dock',
        formedAtTick: 1,
        founderNpcIds: ['npc.a'],
        populationNpcIds: ['npc.a'],
        storage: [],
        pressure: { food: 90, safety: 70, economy: 50, logistics: 80 },
        stability: 35,
        status: 'declining',
        updatedAtTick: 20,
      }],
    })

    expect(rows[0]).toEqual(expect.objectContaining({
      id: 'settlement.t_dock',
      stability: 35,
      status: 'declining',
      pressure: { food: 90, safety: 70, economy: 50, logistics: 80 },
    }))
  })
})

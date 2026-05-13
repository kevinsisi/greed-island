import { describe, expect, it } from 'vitest'
import {
  detectSettlementFormation,
  type CopresenceHistoryRow,
} from './settlementDetection.js'
import {
  SETTLEMENT_FORMATION_MIN_NPCS,
  SETTLEMENT_FORMATION_MIN_TICKS,
} from '../config/world.js'

describe('detectSettlementFormation', () => {
  it('under MIN_NPCS threshold: no detection, no history entry', () => {
    const result = detectSettlementFormation({
      npcsByTile: new Map([['t_central', ['a', 'b']]]),
      previousHistory: new Map(),
      existingSettlementTiles: new Set(),
      tick: 100,
    })
    expect(result.detections).toEqual([])
    expect(result.nextHistory.has('t_central')).toBe(false)
  })

  it('exactly MIN_NPCS but first tick: history starts, no detection yet', () => {
    const cohort = ['a', 'b', 'c']
    expect(cohort.length).toBe(SETTLEMENT_FORMATION_MIN_NPCS)
    const result = detectSettlementFormation({
      npcsByTile: new Map([['t_central', cohort]]),
      previousHistory: new Map(),
      existingSettlementTiles: new Set(),
      tick: 100,
    })
    expect(result.detections).toEqual([])
    const row = result.nextHistory.get('t_central')
    expect(row?.consecutiveTicks).toBe(1)
    expect(row?.cohort).toEqual(['a', 'b', 'c'])
  })

  it('reaches MIN_TICKS with stable cohort: emits formation', () => {
    let history: ReadonlyMap<string, CopresenceHistoryRow> = new Map()
    const cohort = ['npc_a', 'npc_b', 'npc_c']
    const npcsByTile = new Map([['t_X', cohort]])
    for (let tick = 0; tick < SETTLEMENT_FORMATION_MIN_TICKS - 1; tick += 1) {
      const r = detectSettlementFormation({
        npcsByTile,
        previousHistory: history,
        existingSettlementTiles: new Set(),
        tick,
      })
      expect(r.detections).toEqual([])
      history = r.nextHistory
    }
    const final = detectSettlementFormation({
      npcsByTile,
      previousHistory: history,
      existingSettlementTiles: new Set(),
      tick: SETTLEMENT_FORMATION_MIN_TICKS - 1,
    })
    expect(final.detections).toHaveLength(1)
    expect(final.detections[0]?.tileId).toBe('t_X')
    expect(final.detections[0]?.founderNpcIds).toEqual(['npc_a', 'npc_b', 'npc_c'])
    expect(final.detections[0]?.formedAtTick).toBe(SETTLEMENT_FORMATION_MIN_TICKS - 1)
  })

  it('cohort change resets the consecutive counter', () => {
    let history: ReadonlyMap<string, CopresenceHistoryRow> = new Map([
      ['t_X', { tileId: 't_X', cohort: ['a', 'b', 'c'], consecutiveTicks: 10 }],
    ])
    // Cohort changes to include d instead of c → reset.
    const r = detectSettlementFormation({
      npcsByTile: new Map([['t_X', ['a', 'b', 'd']]]),
      previousHistory: history,
      existingSettlementTiles: new Set(),
      tick: 50,
    })
    expect(r.detections).toEqual([])
    expect(r.nextHistory.get('t_X')?.consecutiveTicks).toBe(1)
  })

  it('already-formed tile is skipped even at threshold', () => {
    let history: ReadonlyMap<string, CopresenceHistoryRow> = new Map([
      [
        't_X',
        {
          tileId: 't_X',
          cohort: ['a', 'b', 'c'],
          consecutiveTicks: SETTLEMENT_FORMATION_MIN_TICKS - 1,
        },
      ],
    ])
    const r = detectSettlementFormation({
      npcsByTile: new Map([['t_X', ['a', 'b', 'c']]]),
      previousHistory: history,
      existingSettlementTiles: new Set(['t_X']),
      tick: 50,
    })
    expect(r.detections).toEqual([])
    // History still updates (so if settlement later disappears, counting resumes).
    expect(r.nextHistory.get('t_X')?.consecutiveTicks).toBe(
      SETTLEMENT_FORMATION_MIN_TICKS
    )
  })

  it('founderNpcIds sorted lex regardless of input order', () => {
    let history: ReadonlyMap<string, CopresenceHistoryRow> = new Map([
      [
        't_X',
        {
          tileId: 't_X',
          cohort: ['alpha', 'beta', 'gamma'],
          consecutiveTicks: SETTLEMENT_FORMATION_MIN_TICKS - 1,
        },
      ],
    ])
    const r = detectSettlementFormation({
      // Input order shuffled — sort happens inside the helper.
      npcsByTile: new Map([['t_X', ['gamma', 'alpha', 'beta']]]),
      previousHistory: history,
      existingSettlementTiles: new Set(),
      tick: 99,
    })
    expect(r.detections[0]?.founderNpcIds).toEqual(['alpha', 'beta', 'gamma'])
  })

  it('drop below MIN_NPCS clears history (cohort dissolves)', () => {
    const history = new Map([
      ['t_X', { tileId: 't_X', cohort: ['a', 'b', 'c'], consecutiveTicks: 11 }],
    ])
    const r = detectSettlementFormation({
      npcsByTile: new Map([['t_X', ['a', 'b']]]),
      previousHistory: history,
      existingSettlementTiles: new Set(),
      tick: 50,
    })
    expect(r.detections).toEqual([])
    expect(r.nextHistory.has('t_X')).toBe(false)
  })
})

// BuildingSvg pure-logic tests (no DOM — project uses vitest without jsdom).
// Covers: buildingNpcPosition placement invariants.

import { describe, expect, it } from 'vitest'
import { buildingNpcPosition } from './BuildingSvg'

describe('buildingNpcPosition — single NPC', () => {
  it('centres a lone NPC horizontally', () => {
    const [left] = buildingNpcPosition(0, 1)
    expect(left).toBe(50)
  })

  it('places lone NPC in upper half of room', () => {
    const [, top] = buildingNpcPosition(0, 1)
    expect(top).toBeLessThan(55)
    expect(top).toBeGreaterThan(10)
  })
})

describe('buildingNpcPosition — multiple NPCs', () => {
  it('produces distinct left positions for 2 NPCs', () => {
    const [l0] = buildingNpcPosition(0, 2)
    const [l1] = buildingNpcPosition(1, 2)
    expect(l0).not.toBe(l1)
  })

  it('keeps all positions within 5%–95% horizontal', () => {
    for (let total = 1; total <= 8; total++) {
      for (let idx = 0; idx < total; idx++) {
        const [left] = buildingNpcPosition(idx, total)
        expect(left).toBeGreaterThanOrEqual(5)
        expect(left).toBeLessThanOrEqual(95)
      }
    }
  })

  it('keeps all positions within 10%–80% vertical', () => {
    for (let total = 1; total <= 8; total++) {
      for (let idx = 0; idx < total; idx++) {
        const [, top] = buildingNpcPosition(idx, total)
        expect(top).toBeGreaterThanOrEqual(10)
        expect(top).toBeLessThanOrEqual(80)
      }
    }
  })

  it('first 4 NPCs share the same row (same top)', () => {
    const tops = [0, 1, 2, 3].map(idx => buildingNpcPosition(idx, 4)[1])
    expect(new Set(tops).size).toBe(1)
  })

  it('5th NPC starts a new row below the first row', () => {
    const [, top4] = buildingNpcPosition(3, 5) // last in row 0
    const [, top5] = buildingNpcPosition(4, 5) // first in row 1
    expect(top5).toBeGreaterThan(top4)
  })
})

describe('buildingNpcPosition — zero NPCs guard', () => {
  it('returns a valid fallback for zero total', () => {
    const [left, top] = buildingNpcPosition(0, 0)
    expect(left).toBeGreaterThan(0)
    expect(top).toBeGreaterThan(0)
  })
})

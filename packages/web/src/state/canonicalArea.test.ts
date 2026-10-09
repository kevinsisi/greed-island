import { describe, expect, it } from 'vitest'
import { canonicalAreaDestination, canonicalAreaPixel, canonicalAreaPoint } from './canonicalArea'
import { snapshotFixture } from '../multiplayer3d/testFixtures'

describe('canonical detailed-map projection', () => {
  it('maps the dock snapshot to NPC area coordinates and reverses without a local saved position', () => {
    const state = snapshotFixture(), point = canonicalAreaPoint(state, 't_dock')
    expect(point).not.toBeNull()
    const world = canonicalAreaDestination(state, point!.col, point!.row)
    expect(world?.x).toBeCloseTo(0); expect(world?.z).toBeCloseTo(-6)
    expect(canonicalAreaPixel(state, 't_dock')?.tileId).toBe('t_dock')
    expect(canonicalAreaPoint(state, 't_central')).toBeNull()
    expect(canonicalAreaPoint(null, 't_dock')).toBeNull()
  })
  it('uses canonical grid coordinates directly and rejects nonfinite/outside click intents', () => {
    const state = snapshotFixture()
    state.geometry.presentation = 'canonical-area-grid'
    expect(canonicalAreaPoint(state, 't_dock')).toEqual({ col: 0, row: -6 })
    expect(canonicalAreaDestination(state, 7, 5)).toEqual({ x: 7, z: 5 })
    expect(canonicalAreaDestination(state, Infinity, 5)).toBeNull()
    expect(canonicalAreaDestination(state, 15, 5)).toBeNull()
  })
})

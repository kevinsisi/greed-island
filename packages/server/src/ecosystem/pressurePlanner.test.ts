import { describe, expect, it } from 'vitest'
import { planEcosystemPressure } from './pressurePlanner.js'
import { ECOSYSTEM_PRESSURE_RECOVERY_TICKS, ECOSYSTEM_PRESSURE_WORK_THRESHOLD } from '../config/world.js'

const BASE = { tick: 1000, tileId: 't_forest', currentPressureLevel: 0, lastPressureRaisedTick: null }

describe('planEcosystemPressure', () => {
  it('returns raise when recentWorkActions meets threshold', () => {
    expect(planEcosystemPressure({ ...BASE, recentWorkActions: ECOSYSTEM_PRESSURE_WORK_THRESHOLD })).toBe('raise')
  })

  it('returns raise when recentWorkActions exceeds threshold', () => {
    expect(planEcosystemPressure({ ...BASE, recentWorkActions: ECOSYSTEM_PRESSURE_WORK_THRESHOLD + 3 })).toBe('raise')
  })

  it('returns null when below threshold and pressure is zero', () => {
    expect(planEcosystemPressure({ ...BASE, recentWorkActions: 2, currentPressureLevel: 0 })).toBeNull()
  })

  it('returns null when below threshold and pressure is non-zero but recently raised', () => {
    const recentTick = BASE.tick - Math.floor(ECOSYSTEM_PRESSURE_RECOVERY_TICKS / 2)
    expect(planEcosystemPressure({ ...BASE, recentWorkActions: 0, currentPressureLevel: 40, lastPressureRaisedTick: recentTick })).toBeNull()
  })

  it('returns recover when no work actions, pressure > 0, and sufficient idle ticks elapsed', () => {
    const oldTick = BASE.tick - ECOSYSTEM_PRESSURE_RECOVERY_TICKS
    expect(planEcosystemPressure({ ...BASE, recentWorkActions: 0, currentPressureLevel: 40, lastPressureRaisedTick: oldTick })).toBe('recover')
  })

  it('returns recover when pressure > 0, no work actions, and never raised before', () => {
    expect(planEcosystemPressure({ ...BASE, recentWorkActions: 0, currentPressureLevel: 20, lastPressureRaisedTick: null })).toBe('recover')
  })

  it('returns null when pressure is zero and no work actions', () => {
    expect(planEcosystemPressure({ ...BASE, recentWorkActions: 0, currentPressureLevel: 0 })).toBeNull()
  })

  it('returns raise even when pressure is already at max', () => {
    expect(planEcosystemPressure({ ...BASE, recentWorkActions: ECOSYSTEM_PRESSURE_WORK_THRESHOLD, currentPressureLevel: 100 })).toBe('raise')
  })
})

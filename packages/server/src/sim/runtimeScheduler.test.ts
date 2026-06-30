import { describe, expect, it } from 'vitest'
import { computeDueTickCount, computeNextTickDelayMs } from './runtime.js'

describe('SimulationRuntime tick scheduler', () => {
  it('keeps normal ticks on the configured cadence', () => {
    expect(computeDueTickCount({ tickDurationMs: 5_000, nowMs: 5_000, nextDueAtMs: 5_000 })).toBe(1)
    expect(computeNextTickDelayMs({ nowMs: 5_000, nextDueAtMs: 10_000 })).toBe(5_000)
  })

  it('uses a short yield instead of HTTP cooldown when the fixed clock is overdue', () => {
    expect(computeNextTickDelayMs({ nowMs: 18_000, nextDueAtMs: 10_000, overdueYieldMs: 2_000 })).toBe(2_000)
    expect(computeNextTickDelayMs({ nowMs: 29_000, nextDueAtMs: 15_000, overdueYieldMs: 2_000 })).toBe(2_000)
    expect(computeNextTickDelayMs({ nowMs: 95_000, nextDueAtMs: 20_000, overdueYieldMs: 2_000 })).toBe(2_000)
  })

  it('computes missed ticks from wall-clock time instead of browser/API refreshes', () => {
    expect(computeDueTickCount({ tickDurationMs: 5_000, nowMs: 60_000, nextDueAtMs: 5_000 })).toBe(12)
  })

  it('bounds each scheduler callback to one tick while preserving catch-up pressure for later turns', () => {
    expect(computeDueTickCount({ tickDurationMs: 5_000, nowMs: 65_000, nextDueAtMs: 5_000, maxCatchUpTicks: 1 })).toBe(1)
  })
})

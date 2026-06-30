import { describe, expect, it } from 'vitest'
import { computeDueTickCount, computeNextTickDelayMs } from './runtime.js'

describe('SimulationRuntime tick scheduler', () => {
  it('keeps normal ticks on the configured cadence', () => {
    expect(computeDueTickCount({ tickDurationMs: 5_000, nowMs: 5_000, nextDueAtMs: 5_000 })).toBe(1)
    expect(computeNextTickDelayMs({ nowMs: 5_000, nextDueAtMs: 10_000 })).toBe(5_000)
  })

  it('does not add HTTP cooldown that makes the autonomous world drift while nobody watches', () => {
    expect(computeNextTickDelayMs({ nowMs: 18_000, nextDueAtMs: 10_000 })).toBe(0)
    expect(computeNextTickDelayMs({ nowMs: 29_000, nextDueAtMs: 15_000 })).toBe(0)
    expect(computeNextTickDelayMs({ nowMs: 95_000, nextDueAtMs: 20_000 })).toBe(0)
  })

  it('computes missed ticks from wall-clock time instead of browser/API refreshes', () => {
    expect(computeDueTickCount({ tickDurationMs: 5_000, nowMs: 60_000, nextDueAtMs: 5_000 })).toBe(12)
  })

  it('bounds each scheduler callback to one tick while preserving catch-up pressure for later turns', () => {
    expect(computeDueTickCount({ tickDurationMs: 5_000, nowMs: 65_000, nextDueAtMs: 5_000, maxCatchUpTicks: 1 })).toBe(1)
  })
})

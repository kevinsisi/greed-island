import { describe, expect, it } from 'vitest'
import { computeNextTickDelayMs } from './runtime.js'

describe('SimulationRuntime tick scheduler', () => {
  it('keeps normal ticks on the configured cadence', () => {
    expect(computeNextTickDelayMs({ tickDurationMs: 5_000, elapsedMs: 4_000 })).toBe(5_000)
  })

  it('adds a long HTTP recovery window after slow ticks', () => {
    expect(computeNextTickDelayMs({ tickDurationMs: 5_000, elapsedMs: 13_000 })).toBe(120_000)
    expect(computeNextTickDelayMs({ tickDurationMs: 5_000, elapsedMs: 24_000 })).toBe(120_000)
  })

  it('caps slow-tick cooldown so simulation still eventually progresses', () => {
    expect(computeNextTickDelayMs({ tickDurationMs: 5_000, elapsedMs: 90_000 })).toBe(240_000)
  })
})

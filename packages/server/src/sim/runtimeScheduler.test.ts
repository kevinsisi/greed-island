import { describe, expect, it } from 'vitest'
import { computeNextTickDelayMs } from './runtime.js'

describe('SimulationRuntime tick scheduler', () => {
  it('keeps normal ticks on the configured cadence', () => {
    expect(computeNextTickDelayMs({ tickDurationMs: 5_000, elapsedMs: 4_000 })).toBe(5_000)
  })

  it('keeps slow-tick recovery short enough that the world keeps moving while nobody watches', () => {
    expect(computeNextTickDelayMs({ tickDurationMs: 5_000, elapsedMs: 13_000 })).toBe(30_000)
    expect(computeNextTickDelayMs({ tickDurationMs: 5_000, elapsedMs: 24_000 })).toBe(36_000)
  })

  it('caps slow-tick cooldown below one minute so simulation still feels alive', () => {
    expect(computeNextTickDelayMs({ tickDurationMs: 5_000, elapsedMs: 90_000 })).toBe(60_000)
  })
})

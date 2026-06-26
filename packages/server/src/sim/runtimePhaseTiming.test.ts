import { describe, expect, it } from 'vitest'
import { summarizeSlowTickPhaseTimings } from './runtime.js'

describe('summarizeSlowTickPhaseTimings', () => {
  it('returns the slowest phases in descending duration order', () => {
    expect(summarizeSlowTickPhaseTimings([
      { label: 'plan-commands', elapsedMs: 120 },
      { label: 'append-events', elapsedMs: 2_500 },
      { label: 'projection-fanout', elapsedMs: 9_250 },
      { label: 'rule-evaluation', elapsedMs: 4_100 },
    ], 1_000)).toBe('projection-fanout=9250ms rule-evaluation=4100ms append-events=2500ms')
  })

  it('returns empty string when no phase crosses the threshold', () => {
    expect(summarizeSlowTickPhaseTimings([
      { label: 'plan-commands', elapsedMs: 120 },
      { label: 'append-events', elapsedMs: 900 },
    ], 1_000)).toBe('')
  })
})

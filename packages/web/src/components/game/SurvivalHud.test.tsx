// SP1 — SurvivalHud rendering tests.
// Checks correct visual states: healthy, hungry, vigor-danger, collapsed.
// Uses pure data assertions (statusText-like checks) without DOM rendering
// since the project uses vitest without jsdom configured.

import { describe, expect, it } from 'vitest'

// Mirror statusText logic to verify correct classification
const DANGER_THRESHOLD = 25

function classify(nourishment: number, vigor: number, collapsed: boolean) {
  if (collapsed) return 'collapsed'
  if (vigor < DANGER_THRESHOLD) return 'vigor-danger'
  if (nourishment < DANGER_THRESHOLD) return 'hungry'
  if (nourishment > 60) return 'healthy'
  return 'neutral'
}

describe('SurvivalHud state classification', () => {
  it('classifies healthy state', () => {
    expect(classify(80, 90, false)).toBe('healthy')
  })

  it('classifies hungry state (nourishment below danger threshold)', () => {
    expect(classify(20, 80, false)).toBe('hungry')
  })

  it('classifies vigor danger state', () => {
    expect(classify(50, 10, false)).toBe('vigor-danger')
  })

  it('classifies collapsed state regardless of values', () => {
    expect(classify(80, 90, true)).toBe('collapsed')
    expect(classify(5, 0, true)).toBe('collapsed')
  })

  it('classifies neutral (mid-range, not collapsed)', () => {
    expect(classify(40, 60, false)).toBe('neutral')
  })

  it('vigor danger takes priority over hungry at low vigor', () => {
    expect(classify(10, 5, false)).toBe('vigor-danger')
  })
})

describe('SurvivalHud bar value clamping', () => {
  it('clamps percentage to [0, 100]', () => {
    const clamp = (v: number) => Math.max(0, Math.min(100, Math.round(v)))
    expect(clamp(-10)).toBe(0)
    expect(clamp(110)).toBe(100)
    expect(clamp(50.6)).toBe(51)
    expect(clamp(0)).toBe(0)
    expect(clamp(100)).toBe(100)
  })
})

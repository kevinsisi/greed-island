import { describe, expect, it } from 'vitest'
import { cardPerceivedSeconds } from './cardPerception'
describe('owned-card nullable perception', () => {
  it('keeps unknown perception unavailable instead of inventing a raw deadline countdown', () => {
    for (const value of [null, undefined, NaN, Infinity, -1]) expect(cardPerceivedSeconds(value, 2)).toBeNull()
  })
  it('smooths only real perceived seconds and clamps elapsed/reached deadlines', () => {
    expect(cardPerceivedSeconds(30, 2.4)).toBe(27)
    expect(cardPerceivedSeconds(30, -10)).toBe(30)
    expect(cardPerceivedSeconds(30, 40)).toBe(0)
    expect(cardPerceivedSeconds(30, Infinity)).toBeNull()
  })
})

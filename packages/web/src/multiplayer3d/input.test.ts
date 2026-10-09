import { describe, expect, it } from 'vitest'
import { isGameplayFocus } from './input'

describe('canonical gameplay focus boundary', () => {
  it('allows the scene/body and excludes focused rosters, inputs and other UI controls', () => {
    const canvas = new EventTarget(), body = new EventTarget()
    expect(isGameplayFocus(canvas, canvas, body)).toBe(true)
    expect(isGameplayFocus(body, canvas, body)).toBe(true)
    for (const target of [new EventTarget(), null]) expect(isGameplayFocus(target, canvas, body)).toBe(false)
  })
})

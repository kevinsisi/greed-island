import { describe, expect, it } from 'vitest'
import { createRefreshGenerationGuard } from './refreshGeneration'

describe('createRefreshGenerationGuard', () => {
  it('invalidates older refresh generations when a newer one starts', () => {
    const guard = createRefreshGenerationGuard()

    const older = guard.next()
    const newer = guard.next()

    expect(guard.isCurrent(older)).toBe(false)
    expect(guard.isCurrent(newer)).toBe(true)
  })
})

import { afterEach, describe, expect, it, vi } from 'vitest'
import { createFixtureRecoveryScheduler } from './fixtureRecoveryRetry'

describe('createFixtureRecoveryScheduler', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('retries while the UI still has only fixture world data', async () => {
    vi.useFakeTimers()
    let hasServerWorld = false
    const refresh = vi.fn()
    const scheduler = createFixtureRecoveryScheduler({
      hasServerWorld: () => hasServerWorld,
      refresh,
      windowTarget: globalThis,
      retryMs: 10
    })

    scheduler.schedule()
    await vi.advanceTimersByTimeAsync(10)

    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('does not retry after server world data arrives', async () => {
    vi.useFakeTimers()
    let hasServerWorld = false
    const refresh = vi.fn()
    const scheduler = createFixtureRecoveryScheduler({
      hasServerWorld: () => hasServerWorld,
      refresh,
      windowTarget: globalThis,
      retryMs: 10
    })

    scheduler.schedule()
    hasServerWorld = true
    await vi.advanceTimersByTimeAsync(10)

    expect(refresh).not.toHaveBeenCalled()
  })

  it('keeps only one pending retry and supports cancellation', async () => {
    vi.useFakeTimers()
    const refresh = vi.fn()
    const scheduler = createFixtureRecoveryScheduler({
      hasServerWorld: () => false,
      refresh,
      windowTarget: globalThis,
      retryMs: 10
    })

    scheduler.schedule()
    scheduler.schedule()
    scheduler.cancel()
    await vi.advanceTimersByTimeAsync(10)

    expect(refresh).not.toHaveBeenCalled()
  })
})

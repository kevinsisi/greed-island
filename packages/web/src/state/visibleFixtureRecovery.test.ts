import { afterEach, describe, expect, it, vi } from 'vitest'
import { startFixtureSourceRecovery, startVisibleFixtureRecovery } from './visibleFixtureRecovery'

describe('startVisibleFixtureRecovery', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('refreshes immediately and keeps retrying while active', async () => {
    vi.useFakeTimers()
    const refreshWorld = vi.fn().mockResolvedValue(undefined)

    const stop = startVisibleFixtureRecovery({
      refreshWorld,
      windowTarget: globalThis,
      retryMs: 10
    })

    expect(refreshWorld).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(10)
    expect(refreshWorld).toHaveBeenCalledTimes(2)

    stop()
    await vi.advanceTimersByTimeAsync(10)
    expect(refreshWorld).toHaveBeenCalledTimes(2)
  })

  it('continues retrying after a failed refresh', async () => {
    vi.useFakeTimers()
    const refreshWorld = vi.fn().mockRejectedValue(new Error('offline'))

    const stop = startVisibleFixtureRecovery({
      refreshWorld,
      windowTarget: globalThis,
      retryMs: 10
    })

    await vi.advanceTimersByTimeAsync(20)
    expect(refreshWorld).toHaveBeenCalledTimes(3)
    stop()
  })
})

describe('startFixtureSourceRecovery', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts recovery only while the visible source is fixture', () => {
    vi.useFakeTimers()
    const refreshWorld = vi.fn().mockResolvedValue(undefined)

    const serverStop = startFixtureSourceRecovery({
      source: 'server',
      refreshWorld,
      windowTarget: globalThis,
      retryMs: 10
    })
    expect(serverStop).toBeUndefined()
    expect(refreshWorld).not.toHaveBeenCalled()

    const fixtureStop = startFixtureSourceRecovery({
      source: 'fixture',
      refreshWorld,
      windowTarget: globalThis,
      retryMs: 10
    })
    expect(fixtureStop).toEqual(expect.any(Function))
    expect(refreshWorld).toHaveBeenCalledTimes(1)
    fixtureStop?.()
  })
})

import { afterEach, describe, expect, it, vi } from 'vitest'
import { MOBILE_LOAD_TIMEOUT_MS, resilientLoad, withTimeout } from './resilientLoad'

describe('resilientLoad', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('retries transient failures before returning a value', async () => {
    vi.useFakeTimers()
    const load = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce('ok')

    const pending = resilientLoad(load)
    const assertion = expect(pending).resolves.toBe('ok')
    await vi.advanceTimersByTimeAsync(700)

    await assertion
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('throws the final error after retries are exhausted', async () => {
    vi.useFakeTimers()
    const load = vi.fn<() => Promise<string>>().mockRejectedValue(new Error('still offline'))

    const pending = resilientLoad(load)
    const assertion = expect(pending).rejects.toThrow('still offline')
    await vi.runAllTimersAsync()

    await assertion
    expect(load).toHaveBeenCalledTimes(3)
  })

  it('times out a hung request', async () => {
    vi.useFakeTimers()
    const pending = withTimeout(new Promise<string>(() => undefined), 10)
    const assertion = expect(pending).rejects.toThrow('timed out')

    await vi.advanceTimersByTimeAsync(10)

    await assertion
  })

  it('keeps refresh loads longer than the live slow-tick window', () => {
    expect(MOBILE_LOAD_TIMEOUT_MS).toBeGreaterThanOrEqual(45_000)
  })
})

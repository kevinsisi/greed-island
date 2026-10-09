import { afterEach, describe, expect, it, vi } from 'vitest'
import { createLatestMoveIntentQueue } from './moveIntentQueue'

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

afterEach(() => vi.useRealTimers())

describe('latest movement intent queue', () => {
  it('keeps only the newest direction across a delayed acknowledgement', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    const first = deferred<boolean>()
    const sent: Array<{ at: number; dx: number; dz: number }> = []
    const queue = createLatestMoveIntentQueue(intent => {
      sent.push({ at: Date.now(), ...intent })
      return sent.length === 1 ? first.promise : Promise.resolve(true)
    })

    queue.offer(1, 0)
    await vi.advanceTimersByTimeAsync(217)
    queue.offer(0, 1)
    await vi.advanceTimersByTimeAsync(100)
    queue.offer(-1, 0)
    expect(sent).toEqual([{ at: 0, dx: 1, dz: 0 }])

    first.resolve(true)
    await vi.advanceTimersByTimeAsync(0)
    expect(sent).toEqual([
      { at: 0, dx: 1, dz: 0 },
      { at: 317, dx: -1, dz: 0 },
    ])

    queue.offer(0, 0)
    await vi.advanceTimersByTimeAsync(1_000)
    expect(sent).toHaveLength(2)
    queue.dispose()
  })

  it('sends sustained intent at the 100ms authority cadence without another render sample', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    const sent: Array<{ at: number; dx: number; dz: number }> = []
    let inFlight = 0
    let maximumInFlight = 0
    const queue = createLatestMoveIntentQueue(intent => {
      sent.push({ at: Date.now(), ...intent })
      inFlight += 1
      maximumInFlight = Math.max(maximumInFlight, inFlight)
      return new Promise<boolean>(resolve => setTimeout(() => { inFlight -= 1; resolve(true) }, 20))
    })

    queue.offer(1, 0)
    await vi.advanceTimersByTimeAsync(350)
    expect(sent).toEqual([
      { at: 0, dx: 1, dz: 0 },
      { at: 100, dx: 1, dz: 0 },
      { at: 200, dx: 1, dz: 0 },
      { at: 300, dx: 1, dz: 0 },
    ])
    expect(maximumInFlight).toBe(1)

    queue.offer(0, 0)
    await vi.advanceTimersByTimeAsync(1_000)
    expect(sent).toHaveLength(4)
    expect(inFlight).toBe(0)
    queue.dispose()
  })

  it('continues after a 269ms acknowledgement at its completion using the newest sampled vector', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    const sent: Array<{ at: number; dx: number; dz: number }> = []
    let inFlight = 0
    let maximumInFlight = 0
    const queue = createLatestMoveIntentQueue(intent => {
      sent.push({ at: Date.now(), ...intent })
      inFlight += 1
      maximumInFlight = Math.max(maximumInFlight, inFlight)
      return new Promise<boolean>(resolve => setTimeout(() => { inFlight -= 1; resolve(true) }, 269))
    })

    queue.offer(1, 0)
    await vi.advanceTimersByTimeAsync(217)
    queue.offer(1, 0) // Simulated Babylon sample at a 217ms frame interval.
    await vi.advanceTimersByTimeAsync(217)
    queue.offer(0, 1)
    await vi.advanceTimersByTimeAsync(104) // First ACK at269; second ACK at538.

    expect(sent).toEqual([
      { at: 0, dx: 1, dz: 0 },
      { at: 269, dx: 1, dz: 0 },
      { at: 538, dx: 0, dz: 1 },
    ])
    expect(maximumInFlight).toBe(1)

    queue.offer(0, 0)
    await vi.advanceTimersByTimeAsync(269)
    expect(sent).toHaveLength(3)
    queue.dispose()
  })

  it('a release cancels an in-flight direction and its pending replacement locally', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    const first = deferred<boolean>()
    const sent: Array<{ dx: number; dz: number }> = []
    const queue = createLatestMoveIntentQueue(intent => {
      sent.push(intent)
      return first.promise
    })

    queue.offer(1, 0)
    await vi.advanceTimersByTimeAsync(100)
    queue.offer(0, 1)
    queue.offer(0, 0)
    first.resolve(true)
    await vi.advanceTimersByTimeAsync(1_000)

    expect(sent).toEqual([{ dx: 1, dz: 0 }])
    queue.dispose()
  })

  it('a failed old request cannot clear a newer direction, while clear stops repeats', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    const first = deferred<boolean>()
    const sent: Array<{ at: number; dx: number; dz: number }> = []
    const queue = createLatestMoveIntentQueue(intent => {
      sent.push({ at: Date.now(), ...intent })
      return sent.length === 1 ? first.promise : Promise.resolve(true)
    })

    queue.offer(1, 0)
    await vi.advanceTimersByTimeAsync(217)
    queue.offer(0, 1)
    first.resolve(false)
    await vi.advanceTimersByTimeAsync(0)
    expect(sent).toEqual([{ at: 0, dx: 1, dz: 0 }, { at: 217, dx: 0, dz: 1 }])

    queue.clear()
    await vi.advanceTimersByTimeAsync(1_000)
    expect(sent).toHaveLength(2)
    queue.dispose()
  })

  it('disconnect clear cancels the held direction and late acknowledgement cannot revive it', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    const first = deferred<boolean>()
    const sent: Array<{ dx: number; dz: number }> = []
    const queue = createLatestMoveIntentQueue(intent => {
      sent.push(intent)
      return first.promise
    })

    queue.offer(1, 0)
    queue.clear()
    first.resolve(true)
    await vi.advanceTimersByTimeAsync(1_000)
    expect(sent).toEqual([{ dx: 1, dz: 0 }])
    queue.dispose()
  })
})

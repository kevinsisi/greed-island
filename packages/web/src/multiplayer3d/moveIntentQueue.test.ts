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
  it('serializes impulses, coalesces to the latest direction, and keeps the 100ms cap', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    const first = deferred<void>()
    const sent: Array<{ at: number; dx: number; dz: number }> = []
    const queue = createLatestMoveIntentQueue(intent => {
      sent.push({ at: Date.now(), ...intent })
      return sent.length === 1 ? first.promise : Promise.resolve()
    })

    queue.offer(1, 0)
    vi.setSystemTime(100)
    queue.offer(0, 1)
    vi.setSystemTime(200)
    queue.offer(-1, 0)
    expect(sent).toEqual([{ at: 0, dx: 1, dz: 0 }])

    vi.setSystemTime(350)
    first.resolve()
    await Promise.resolve()
    await vi.advanceTimersByTimeAsync(49)
    expect(sent).toHaveLength(1)

    // The next fresh scene sample replaces the queued direction before its
    // grace timer, so only the current direction is sent.
    vi.setSystemTime(400)
    queue.offer(-1, 0)
    expect(sent).toEqual([
      { at: 0, dx: 1, dz: 0 },
      { at: 400, dx: -1, dz: 0 },
    ])
    await vi.advanceTimersByTimeAsync(1000)
    expect(sent).toHaveLength(2)
    queue.dispose()
  })

  it('a release cancels queued impulses locally without posting a zero command', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    const first = deferred<void>()
    const sent: Array<{ dx: number; dz: number }> = []
    const queue = createLatestMoveIntentQueue(intent => {
      sent.push(intent)
      return first.promise
    })

    queue.offer(1, 0)
    vi.setSystemTime(100)
    queue.offer(-1, 0)
    vi.setSystemTime(150)
    queue.offer(0, 0)
    first.resolve()
    await vi.advanceTimersByTimeAsync(1000)

    expect(sent).toEqual([{ dx: 1, dz: 0 }])
    queue.dispose()
  })

  it('clearing on disconnect cancels a pending direction', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    const first = deferred<void>()
    const sent: Array<{ dx: number; dz: number }> = []
    const queue = createLatestMoveIntentQueue(intent => {
      sent.push(intent)
      return sent.length === 1 ? first.promise : Promise.resolve()
    })

    queue.offer(1, 0)
    queue.offer(0, 1)
    queue.clear()
    first.resolve()
    await vi.advanceTimersByTimeAsync(200)
    expect(sent).toEqual([{ dx: 1, dz: 0 }])

    expect(sent).toHaveLength(1)
    queue.dispose()
  })

  it('a failed request releases the queue and can send the newest later direction', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    const first = deferred<void>()
    const sent: Array<{ dx: number; dz: number }> = []
    const queue = createLatestMoveIntentQueue(intent => {
      sent.push(intent)
      return sent.length === 1 ? first.promise : Promise.resolve()
    })

    queue.offer(1, 0)
    vi.setSystemTime(100)
    queue.offer(0, -1)
    first.reject(new Error('test transport failure'))
    await vi.advanceTimersByTimeAsync(100)
    expect(sent).toEqual([{ dx: 1, dz: 0 }, { dx: 0, dz: -1 }])
    await vi.advanceTimersByTimeAsync(1000)
    expect(sent).toHaveLength(2)
    queue.dispose()
  })

  it('does not emit repeated stale intents when the input stream stops', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    const sent: Array<{ dx: number; dz: number }> = []
    const queue = createLatestMoveIntentQueue(intent => { sent.push(intent); return Promise.resolve() })
    queue.offer(1, 0)
    await vi.advanceTimersByTimeAsync(0)
    vi.setSystemTime(100)
    queue.offer(1, 0)
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(1000)
    expect(sent).toEqual([{ dx: 1, dz: 0 }, { dx: 1, dz: 0 }])
    queue.dispose()
  })
})

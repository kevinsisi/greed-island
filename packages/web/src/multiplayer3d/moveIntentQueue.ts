export interface MoveIntent { dx: number; dz: number }
type MoveSender = (intent: MoveIntent) => Promise<unknown>
type QueueOptions = { minimumIntervalMs?: number; now?: () => number }

/**
 * Serializes movement impulses and retains only the latest pending direction.
 * A zero vector is a local cancellation, never a server command. After an
 * acknowledgement, wait one input interval so the scene can publish a fresh
 * direction or cancel before a queued impulse is sent.
 */
export function createLatestMoveIntentQueue(
  send: MoveSender,
  options: QueueOptions = {},
) {
  const minimumIntervalMs = options.minimumIntervalMs ?? 100
  const now = options.now ?? Date.now
  let inFlight = false
  let queued: MoveIntent | null = null
  let timer: ReturnType<typeof setTimeout> | null = null
  let disposed = false
  let lastSentAt = Number.NEGATIVE_INFINITY

  function cancelTimer() {
    if (timer !== null) clearTimeout(timer)
    timer = null
  }

  function scheduleFlush(delayMs: number) {
    cancelTimer()
    timer = setTimeout(() => {
      timer = null
      flush()
    }, Math.max(0, delayMs))
  }

  function sendIntent(intent: MoveIntent) {
    if (disposed) return
    inFlight = true
    lastSentAt = now()
    let result: Promise<unknown>
    try { result = Promise.resolve(send(intent)) }
    catch (error) { result = Promise.reject(error) }
    void result.catch(() => undefined).finally(() => {
      inFlight = false
      if (queued && !disposed) scheduleFlush(minimumIntervalMs)
    })
  }

  function flush() {
    if (disposed || inFlight || !queued) return
    const remaining = minimumIntervalMs - (now() - lastSentAt)
    if (remaining > 0) {
      scheduleFlush(remaining)
      return
    }
    const next = queued
    queued = null
    sendIntent(next)
  }

  function offer(dx: number, dz: number) {
    if (disposed) return
    if (!Number.isFinite(dx) || !Number.isFinite(dz)) return
    if (dx === 0 && dz === 0) {
      queued = null
      cancelTimer()
      return
    }
    queued = { dx, dz }
    if (inFlight) return
    // A fresh scene sample supersedes the grace timer; the interval guard
    // still preserves the existing 10 Hz browser movement cadence.
    cancelTimer()
    flush()
  }

  function clear() {
    queued = null
    cancelTimer()
  }

  function dispose() {
    disposed = true
    clear()
  }

  return { offer, clear, dispose }
}

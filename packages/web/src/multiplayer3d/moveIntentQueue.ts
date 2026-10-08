export interface MoveIntent { dx: number; dz: number }
type MoveSender = (intent: MoveIntent) => Promise<unknown>
type QueueOptions = { minimumIntervalMs?: number; now?: () => number }

/**
 * Serializes movement impulses while retaining the latest active direction.
 * A zero vector is a synchronous local cancellation, never a server command.
 * Active directions continue at the server cadence between render samples.
 */
export function createLatestMoveIntentQueue(
  send: MoveSender,
  options: QueueOptions = {},
) {
  const minimumIntervalMs = options.minimumIntervalMs ?? 100
  const now = options.now ?? Date.now
  let inFlight = false
  let active: { intent: MoveIntent; generation: number } | null = null
  let generation = 0
  let timer: ReturnType<typeof setTimeout> | null = null
  let disposed = false
  let lastSentAt = Number.NEGATIVE_INFINITY

  function cancelTimer() {
    if (timer !== null) clearTimeout(timer)
    timer = null
  }

  function scheduleFlush(delayMs: number, ownerGeneration: number) {
    cancelTimer()
    timer = setTimeout(() => {
      timer = null
      if (active?.generation !== ownerGeneration) return
      flush()
    }, Math.max(0, delayMs))
  }

  function finishSend(ownerGeneration: number, accepted: boolean) {
    inFlight = false
    if (!accepted && active?.generation === ownerGeneration) {
      active = null
      generation += 1
      cancelTimer()
    }
    if (active && !disposed) flush()
  }

  function sendIntent(current: { intent: MoveIntent; generation: number }) {
    if (disposed) return
    inFlight = true
    lastSentAt = now()
    let result: Promise<unknown>
    try { result = Promise.resolve(send(current.intent)) }
    catch (error) { result = Promise.reject(error) }
    void result.then(
      accepted => finishSend(current.generation, accepted !== false),
      () => finishSend(current.generation, false),
    )
  }

  function flush() {
    if (disposed || inFlight || !active) return
    const remaining = minimumIntervalMs - (now() - lastSentAt)
    if (remaining > 0) {
      scheduleFlush(remaining, active.generation)
      return
    }
    cancelTimer()
    sendIntent(active)
  }

  function offer(dx: number, dz: number) {
    if (disposed) return
    if (!Number.isFinite(dx) || !Number.isFinite(dz)) return
    if (dx === 0 && dz === 0) {
      active = null
      generation += 1
      cancelTimer()
      return
    }
    active = { intent: { dx, dz }, generation: ++generation }
    if (inFlight) return
    cancelTimer()
    flush()
  }

  function clear() {
    active = null
    generation += 1
    cancelTimer()
  }

  function dispose() {
    disposed = true
    clear()
  }

  return { offer, clear, dispose }
}

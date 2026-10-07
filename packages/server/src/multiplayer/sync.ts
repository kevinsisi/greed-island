/** Coalesces ordinary broadcasts; reconnect's immediate snapshot is sent by the transport. */
export class TickFanout {
  private readonly listeners = new Map<symbol, () => void>()
  private dirty = false
  private flushing = false
  private lastFlushedTick = -1

  subscribe(listener: () => void): () => void {
    const subscription = Symbol('room-listener')
    this.listeners.set(subscription, listener)
    return () => { this.listeners.delete(subscription) }
  }

  markDirty(): void { this.dirty = true }

  /** A repeat or stale tick leaves new dirty work pending for the next simulation tick. */
  flush(tick: number): boolean {
    if (!Number.isSafeInteger(tick) || tick < 0) throw new RangeError('tick must be a non-negative safe integer')
    if (this.flushing || !this.dirty || tick <= this.lastFlushedTick) return false
    this.lastFlushedTick = tick
    this.dirty = false
    this.flushing = true
    try {
      for (const [subscription, listener] of [...this.listeners]) {
        // An earlier callback may dispose another connection before its turn.
        if (!this.listeners.has(subscription)) continue
        try { listener() } catch { /* A failing transport must not interrupt other streams. */ }
      }
    } finally {
      this.flushing = false
    }
    return true
  }
}

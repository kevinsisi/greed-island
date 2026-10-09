import { afterEach, describe, expect, it, vi } from 'vitest'
import { socialStreamUrl } from '../api/client'
import { subscribeSocialStream } from './socialStream'
class Stream {
  listeners = new Map<string, Array<(event: Event) => void>>()
  closed = false
  addEventListener(name: string, handler: EventListenerOrEventListenerObject) {
    const callback = typeof handler === 'function' ? handler : (event: Event) => handler.handleEvent(event)
    this.listeners.set(name, [...this.listeners.get(name) ?? [], callback])
  }
  close() { this.closed = true }
  emit(name: string) { for (const handler of this.listeners.get(name) ?? []) handler(new Event(name)) }
}
const cleanups: (() => void)[] = []
function setup() {
  const streams: Stream[] = [], sessionEvents = new EventTarget()
  const createStream = vi.fn((_url: string, _init: EventSourceInit) => { const s = new Stream(); streams.push(s); return s })
  const refresh = vi.fn(), clearPrivateState = vi.fn(), sessionInvalidated = vi.fn()
  const revalidateSession = vi.fn(async () => true)
  const stop = subscribeSocialStream({ accountId: 7, createStream, refresh, clearPrivateState, sessionInvalidated, revalidateSession, sessionEvents })
  cleanups.push(stop)
  return { streams, sessionEvents, createStream, refresh, clearPrivateState, sessionInvalidated, revalidateSession, stop }
}
afterEach(() => { cleanups.splice(0).forEach(stop => stop()); vi.useRealTimers() })
describe('canonical social cookie stream lifecycle', () => {
  it('uses cookies and an explicit numeric owner assertion, with no token query', () => {
    const s = setup()
    expect(s.createStream).toHaveBeenCalledWith('/api/social/stream?expectedAccountId=7', { withCredentials: true })
    expect(socialStreamUrl(1)).not.toContain('access_token')
    for (const id of [0, -1, 1.5, NaN]) expect(() => socialStreamUrl(id)).toThrow('account context')
  })
  it('refreshes on open and private-social hints, while treating their payload as a hint only', () => {
    const s = setup(); s.streams[0]!.emit('open'); s.streams[0]!.emit('message.new')
    expect(s.refresh).toHaveBeenCalledTimes(2)
  })
  it('clears private state on interruption and ignores messages from the old stream after reconnect', async () => {
    vi.useFakeTimers(); const s = setup(), old = s.streams[0]!
    old.emit('error')
    expect(old.closed).toBe(true); expect(s.clearPrivateState).toHaveBeenCalledTimes(1)
    old.emit('message.new'); expect(s.refresh).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(5000)
    expect(s.revalidateSession).toHaveBeenCalledOnce()
    s.streams[1]!.emit('open'); expect(s.refresh).toHaveBeenCalledTimes(1)
    old.emit('message.new'); expect(s.refresh).toHaveBeenCalledTimes(1)
  })
  it('closes and clears on server revocation without reconnecting the obsolete session', async () => {
    vi.useFakeTimers(); const s = setup()
    s.streams[0]!.emit('session.invalidated')
    expect(s.streams[0]!.closed).toBe(true); expect(s.clearPrivateState).toHaveBeenCalledTimes(1)
    expect(s.sessionInvalidated).toHaveBeenCalledOnce()
    await vi.advanceTimersByTimeAsync(15000); expect(s.createStream).toHaveBeenCalledOnce()
  })
  it('closes and clears on the sole provider account invalidation and cancels pending retry', async () => {
    vi.useFakeTimers(); const s = setup()
    s.streams[0]!.emit('error'); s.sessionEvents.dispatchEvent(new Event('greed-session-invalidated'))
    await vi.advanceTimersByTimeAsync(15000)
    expect(s.createStream).toHaveBeenCalledOnce(); expect(s.clearPrivateState).toHaveBeenCalledTimes(2)
    s.streams[0]!.emit('message.new'); expect(s.refresh).not.toHaveBeenCalled()
  })
  it('does not reconnect an interrupted stream when the owner cookie fails revalidation', async () => {
    vi.useFakeTimers(); const s = setup()
    s.revalidateSession.mockResolvedValueOnce(false)
    s.streams[0]!.emit('error'); await vi.advanceTimersByTimeAsync(5000)
    expect(s.revalidateSession).toHaveBeenCalledOnce(); expect(s.createStream).toHaveBeenCalledOnce()
    expect(s.sessionInvalidated).toHaveBeenCalledOnce()
    await vi.advanceTimersByTimeAsync(15000); expect(s.createStream).toHaveBeenCalledOnce()
  })
  it('ignores a pending owner revalidation after a replacement view unmounts', async () => {
    vi.useFakeTimers(); const s = setup()
    let resolve!: (value: boolean) => void
    s.revalidateSession.mockImplementationOnce(() => new Promise(done => { resolve = done }))
    s.streams[0]!.emit('error'); await vi.advanceTimersByTimeAsync(5000)
    s.stop(); resolve(true); await vi.advanceTimersByTimeAsync(0)
    expect(s.createStream).toHaveBeenCalledOnce(); expect(s.sessionInvalidated).not.toHaveBeenCalled()
  })
  it('bounds an inconclusive cookie revalidation and returns to the sole provider', async () => {
    vi.useFakeTimers(); const s = setup()
    s.revalidateSession.mockImplementationOnce(() => new Promise(() => {}))
    s.streams[0]!.emit('error'); await vi.advanceTimersByTimeAsync(11000)
    expect(s.createStream).toHaveBeenCalledOnce(); expect(s.sessionInvalidated).toHaveBeenCalledOnce()
  })
  it('stops all handlers and retries when an old account view unmounts', async () => {
    vi.useFakeTimers(); const s = setup(); s.stop()
    s.streams[0]!.emit('message.new'); s.streams[0]!.emit('error')
    await vi.advanceTimersByTimeAsync(15000)
    expect(s.streams[0]!.closed).toBe(true); expect(s.createStream).toHaveBeenCalledOnce()
    expect(s.refresh).not.toHaveBeenCalled(); expect(s.clearPrivateState).not.toHaveBeenCalled()
  })
})

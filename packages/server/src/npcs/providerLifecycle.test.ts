// Every network call is replaced by an inert synthetic fetch. No credentials or live AI.
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SettingsStore } from '../http/settings.js'
import { generateWithKeyPool } from './geminiClient.js'
import { generateWithOpenCode } from './openCodeClient.js'
import { generateWithProviders } from './aiProvider.js'
import { boundedSettlement, cancellableDelay, withAbortSignal } from './providerCancellation.js'
function deferred<T>() { let resolve!: (value: T) => void, reject!: (reason: unknown) => void; const promise = new Promise<T>((r, j) => { resolve = r; reject = j }); return { promise, resolve, reject } }
async function flush() { for (let i = 0; i < 50; i++) await Promise.resolve() }
function settings() {
  let closed = false, readsAfterClose = 0
  const read = () => { if (closed) { readsAfterClose++; throw new Error('synthetic closed settings') } }
  const markUsed = vi.fn(() => read()), markFailure = vi.fn(() => read())
  const store = { getSetting: (key: string) => { read(); return key === 'opencode_base_url' ? 'http://synthetic.invalid' : key === 'opencode_model' ? 'opencode/synthetic' : null }, countActive: () => { read(); return 2 }, listActiveKeys: () => { read(); return [{ id: 1, key: 'synthetic-key-1' }, { id: 2, key: 'synthetic-key-2' }] }, markUsed, markFailure } as unknown as SettingsStore
  return { store, markUsed, markFailure, close: () => { closed = true }, readsAfterClose: () => readsAfterClose }
}
const prompts = { systemPrompt: 'synthetic', userPrompt: 'synthetic' }
const geminiBody = { candidates: [{ content: { parts: [{ text: 'synthetic reply' }] } }] }
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); vi.restoreAllMocks() })
describe('provider cancellation and late ignored-abort results', () => {
  it('rejects an already aborted request before any settings read or fetch', async () => {
    const f = settings(), controller = new AbortController(); controller.abort(); f.close(); const fetch = vi.fn(); vi.stubGlobal('fetch', fetch)
    await expect(generateWithProviders(f.store, { ...prompts, signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' })
    expect(fetch).not.toHaveBeenCalled(); expect(f.readsAfterClose()).toBe(0)
  })
  it('aborts Gemini ignored-abort fetch without marking keys, falling through keys, or accessing a closed DB', async () => {
    vi.useFakeTimers(); const f = settings(), controller = new AbortController(), network = deferred<Response>(), fetch = vi.fn(() => network.promise); vi.stubGlobal('fetch', fetch)
    const operation = generateWithKeyPool(f.store, { ...prompts, signal: controller.signal }); const rejected = expect(operation).rejects.toMatchObject({ name: 'AbortError' })
    expect(vi.getTimerCount()).toBe(1); controller.abort(); await rejected; expect(vi.getTimerCount()).toBe(0); f.close(); network.resolve(new Response(JSON.stringify(geminiBody)))
    await flush(); expect(fetch).toHaveBeenCalledOnce(); expect(f.markUsed).not.toHaveBeenCalled(); expect(f.markFailure).not.toHaveBeenCalled(); expect(f.readsAfterClose()).toBe(0)
  })
  it('aborts Gemini during ignored-abort response JSON reading, without a late key write', async () => {
    vi.useFakeTimers(); const f = settings(), controller = new AbortController(), body = deferred<unknown>(), json = vi.fn(() => body.promise)
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json })))
    const operation = generateWithKeyPool(f.store, { ...prompts, signal: controller.signal }); const rejected = expect(operation).rejects.toMatchObject({ name: 'AbortError' }); await flush(); expect(json).toHaveBeenCalledOnce()
    controller.abort(); await rejected; f.close(); body.resolve(geminiBody); await flush()
    expect(f.markUsed).not.toHaveBeenCalled(); expect(f.markFailure).not.toHaveBeenCalled(); expect(f.readsAfterClose()).toBe(0); expect(vi.getTimerCount()).toBe(0)
  })
  it('never disables a key or retries after a late ignored-abort rejection', async () => {
    const f = settings(), controller = new AbortController(), network = deferred<Response>(), fetch = vi.fn(() => network.promise); vi.stubGlobal('fetch', fetch)
    const operation = generateWithKeyPool(f.store, { ...prompts, signal: controller.signal }); const rejected = expect(operation).rejects.toMatchObject({ name: 'AbortError' }); controller.abort(); await rejected; f.close()
    network.reject(new Error('late synthetic network failure')); await flush(); expect(fetch).toHaveBeenCalledOnce(); expect(f.markFailure).not.toHaveBeenCalled(); expect(f.readsAfterClose()).toBe(0)
  })
  it('preserves normal Gemini key fallback and writes successful/failed key metadata exactly once', async () => {
    const f = settings(), fetch = vi.fn().mockResolvedValueOnce(new Response('synthetic failure', { status: 500 })).mockResolvedValueOnce(new Response(JSON.stringify(geminiBody))); vi.stubGlobal('fetch', fetch)
    expect(await generateWithKeyPool(f.store, prompts)).toBe('synthetic reply'); expect(fetch).toHaveBeenCalledTimes(2); expect(f.markFailure).toHaveBeenCalledOnce(); expect(f.markUsed).toHaveBeenCalledWith(2)
  })
  it('cancels OpenCode create without issuing message or cleanup after a late session response', async () => {
    vi.useFakeTimers(); const controller = new AbortController(), create = deferred<Response>(), fetch = vi.fn(() => create.promise); vi.stubGlobal('fetch', fetch)
    const operation = generateWithOpenCode('http://synthetic.invalid', { ...prompts, signal: controller.signal }); const rejected = expect(operation).rejects.toMatchObject({ name: 'AbortError' }); controller.abort(); await rejected
    create.resolve(new Response('{"id":"synthetic-session"}')); await flush(); expect(fetch).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0)
  })
  it('cancels OpenCode message/body reads and never starts cleanup after cancellation', async () => {
    vi.useFakeTimers(); const controller = new AbortController(), body = deferred<unknown>(), fetch = vi.fn().mockResolvedValueOnce(new Response('{"id":"synthetic-session"}')).mockResolvedValueOnce({ ok: true, json: () => body.promise }); vi.stubGlobal('fetch', fetch)
    const operation = generateWithOpenCode('http://synthetic.invalid', { ...prompts, signal: controller.signal }); const rejected = expect(operation).rejects.toMatchObject({ name: 'AbortError' }); await flush(); expect(fetch).toHaveBeenCalledTimes(2)
    controller.abort(); await rejected; body.resolve({ parts: [{ type: 'text', text: 'late synthetic text' }] }); await flush(); expect(fetch).toHaveBeenCalledTimes(2); expect(vi.getTimerCount()).toBe(0)
  })
  it('preserves ordinary OpenCode message and bounded successful session cleanup', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response('{"id":"synthetic-session"}')).mockResolvedValueOnce(new Response('{"parts":[{"type":"text","text":"synthetic"}]}')).mockResolvedValueOnce(new Response(null, { status: 204 })); vi.stubGlobal('fetch', fetch)
    expect(await generateWithOpenCode('http://synthetic.invalid', prompts)).toBe('synthetic'); expect(fetch).toHaveBeenCalledTimes(3); expect(fetch.mock.calls[2]?.[1]).toMatchObject({ method: 'DELETE' })
  })
  it('bounds ignored-abort session cleanup and clears its timer', async () => {
    vi.useFakeTimers(); const cleanup = deferred<Response>(), fetch = vi.fn().mockResolvedValueOnce(new Response('{"id":"synthetic-session"}')).mockResolvedValueOnce(new Response('{"parts":[{"type":"text","text":"synthetic"}]}')).mockReturnValueOnce(cleanup.promise); vi.stubGlobal('fetch', fetch)
    const operation = generateWithOpenCode('http://synthetic.invalid', prompts); await flush(); expect(fetch).toHaveBeenCalledTimes(3); expect(vi.getTimerCount()).toBe(1)
    await vi.advanceTimersByTimeAsync(1000); expect(await operation).toBe('synthetic'); expect(vi.getTimerCount()).toBe(0); cleanup.resolve(new Response(null, { status: 204 })); await flush()
  })
  it('cancels during cleanup instead of returning a stale successful generation', async () => {
    const controller = new AbortController(), cleanup = deferred<Response>(), fetch = vi.fn().mockResolvedValueOnce(new Response('{"id":"synthetic-session"}')).mockResolvedValueOnce(new Response('{"parts":[{"type":"text","text":"synthetic"}]}')).mockReturnValueOnce(cleanup.promise); vi.stubGlobal('fetch', fetch)
    const operation = generateWithOpenCode('http://synthetic.invalid', { ...prompts, signal: controller.signal }); const rejected = expect(operation).rejects.toMatchObject({ name: 'AbortError' }); await flush(); controller.abort(); await rejected; cleanup.resolve(new Response(null, { status: 204 })); await flush(); expect(fetch).toHaveBeenCalledTimes(3)
  })
  it('does not fallback to Gemini or access settings when the OpenCode provider generation is cancelled', async () => {
    const f = settings(), controller = new AbortController(), create = deferred<Response>(), fetch = vi.fn(() => create.promise); vi.stubGlobal('fetch', fetch)
    const operation = generateWithProviders(f.store, { ...prompts, signal: controller.signal }); const rejected = expect(operation).rejects.toMatchObject({ name: 'AbortError' }); controller.abort(); await rejected; f.close(); create.reject(new Error('late ignored-abort failure')); await flush()
    expect(fetch).toHaveBeenCalledOnce(); expect(f.markUsed).not.toHaveBeenCalled(); expect(f.markFailure).not.toHaveBeenCalled(); expect(f.readsAfterClose()).toBe(0)
  })
  it('clears an aborted retry delay and bounds a genuinely unresolved drain without busy polling', async () => {
    vi.useFakeTimers(); const controller = new AbortController(), wait = cancellableDelay(1000, controller.signal), rejected = expect(wait).rejects.toMatchObject({ name: 'AbortError' }); controller.abort(); await rejected; expect(vi.getTimerCount()).toBe(0)
    const unresolved = deferred<void>(), drain = boundedSettlement([unresolved.promise], 50); await vi.advanceTimersByTimeAsync(50); expect(await drain).toBe(false); expect(vi.getTimerCount()).toBe(0)
    unresolved.resolve(); const ignored = deferred<void>(), guarded = withAbortSignal(ignored.promise, controller.signal); await expect(guarded).rejects.toMatchObject({ name: 'AbortError' }); ignored.resolve()
  })
})

it('retains the original signal even if a caller mutates the options object while an operation is pending', async () => {
  const f = settings(), controller = new AbortController(), network = deferred<Response>(), fetch = vi.fn(() => network.promise); vi.stubGlobal('fetch', fetch)
  const options: typeof prompts & { signal?: AbortSignal } = { ...prompts, signal: controller.signal }
  const operation = generateWithKeyPool(f.store, options), rejected = expect(operation).rejects.toMatchObject({ name: 'AbortError' })
  delete options.signal; controller.abort(); await rejected; f.close(); network.resolve(new Response(JSON.stringify(geminiBody))); await flush()
  expect(f.markUsed).not.toHaveBeenCalled(); expect(f.markFailure).not.toHaveBeenCalled(); expect(f.readsAfterClose()).toBe(0)
})
it('preserves provider fallback when no lifecycle cancellation occurred', async () => {
  const f = settings(), fetch = vi.fn().mockRejectedValueOnce(new Error('synthetic OpenCode failure')).mockResolvedValueOnce(new Response(JSON.stringify(geminiBody))); vi.stubGlobal('fetch', fetch)
  expect(await generateWithProviders(f.store, prompts)).toEqual({ text: 'synthetic reply', provider: 'gemini' }); expect(fetch).toHaveBeenCalledTimes(2); expect(f.markUsed).toHaveBeenCalledWith(1)
})
it('cancels an OpenCode ignored-abort session-body read before any message or cleanup is started', async () => {
  const controller = new AbortController(), body = deferred<unknown>(), fetch = vi.fn().mockResolvedValueOnce({ ok: true, json: () => body.promise }); vi.stubGlobal('fetch', fetch)
  const operation = generateWithOpenCode('http://synthetic.invalid', { ...prompts, signal: controller.signal }), rejected = expect(operation).rejects.toMatchObject({ name: 'AbortError' })
  await flush(); controller.abort(); await rejected; body.resolve({ id: 'late-synthetic-session' }); await flush(); expect(fetch).toHaveBeenCalledOnce()
})

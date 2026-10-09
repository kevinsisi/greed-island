// Independent-review reproductions retained as source-only regressions. All fetches are inert synthetic mocks.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { generateWithProviders } from './aiProvider.js'
import { generateWithKeyPool } from './geminiClient.js'
import { generateWithOpenCode } from './openCodeClient.js'
function deferred<T>() { let resolve!: (value: T) => void, reject!: (reason: unknown) => void; const promise = new Promise<T>((r, j) => { resolve = r; reject = j }); return { promise, resolve, reject } }
async function flush() { for (let i = 0; i < 50; i++) await Promise.resolve() }
function settings() {
  let closed = false, readsAfterClose = 0
  const read = () => { if (closed) { readsAfterClose++; throw new Error('synthetic closed settings') } }
  const markUsed = vi.fn(() => read()), markFailure = vi.fn(() => read())
  const store = { getSetting: (key: string) => { read(); return key === 'opencode_base_url' ? 'http://synthetic.invalid' : key === 'opencode_model' ? 'opencode/synthetic' : null }, countActive: () => { read(); return 2 }, listActiveKeys: () => { read(); return [{ id: 1, key: 'synthetic-key-1' }, { id: 2, key: 'synthetic-key-2' }] }, markUsed, markFailure }
  return { store: store as any, markUsed, markFailure, close: () => { closed = true }, readsAfterClose: () => readsAfterClose }
}
const prompts = { systemPrompt: 'synthetic', userPrompt: 'synthetic' }
const geminiBody = { candidates: [{ content: { parts: [{ text: 'synthetic reply' }] } }] }
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); vi.restoreAllMocks() })

describe('captured-signal contract review', () => {
  it('keeps the original cancellation signal through OpenCode-to-Gemini fallback despite caller mutation', async () => {
    vi.useFakeTimers()
    const f = settings(), controller = new AbortController(), create = deferred<Response>(), gemini = deferred<Response>()
    const fetch = vi.fn().mockReturnValueOnce(create.promise).mockReturnValueOnce(gemini.promise)
    vi.stubGlobal('fetch', fetch)
    const options: typeof prompts & { signal?: AbortSignal } = { ...prompts, signal: controller.signal }
    const operation = generateWithProviders(f.store, options)
    const rejected = expect(operation).rejects.toMatchObject({ name: 'AbortError' })
    delete options.signal
    create.reject(new Error('synthetic OpenCode failure'))
    await flush(); expect(fetch).toHaveBeenCalledTimes(2)
    controller.abort(); await rejected; f.close()
    gemini.resolve(new Response(JSON.stringify(geminiBody)))
    await flush()
    expect(f.readsAfterClose()).toBe(0)
    expect(f.markUsed).not.toHaveBeenCalled(); expect(f.markFailure).not.toHaveBeenCalled()
  })
  it('cancels the second Gemini key immediately when caller mutation occurs before fallback', async () => {
    vi.useFakeTimers()
    const f = settings(), controller = new AbortController(), first = deferred<Response>(), second = deferred<Response>()
    const fetch = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    vi.stubGlobal('fetch', fetch)
    const options: typeof prompts & { signal?: AbortSignal } = { ...prompts, signal: controller.signal }
    const operation = generateWithKeyPool(f.store, options)
    let settled = false
    const observed = operation.then(() => { settled = true }, () => { settled = true })
    delete options.signal
    first.resolve(new Response('synthetic failure', { status: 500 }))
    await flush(); expect(fetch).toHaveBeenCalledTimes(2)
    controller.abort(); await flush()
    const promptlySettled = settled, timersAfterAbort = vi.getTimerCount()
    await vi.advanceTimersByTimeAsync(15000); await observed
    second.resolve(new Response(JSON.stringify(geminiBody))); await flush()
    expect(promptlySettled).toBe(true); expect(timersAfterAbort).toBe(0)
  })
})

describe('independent cancellation and deadline edges', () => {
  it('preserves an ordinary ignored-abort Gemini timeout as transient fallback', async () => {
    vi.useFakeTimers(); const f = settings(), first = deferred<Response>()
    const fetch = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValueOnce(new Response(JSON.stringify(geminiBody))); vi.stubGlobal('fetch', fetch)
    const operation = generateWithKeyPool(f.store, prompts)
    await vi.advanceTimersByTimeAsync(15000)
    expect(await operation).toBe('synthetic reply'); expect(f.markFailure).toHaveBeenCalledWith(1, 'Gemini request timed out after 15000ms', false, undefined)
    expect(f.markUsed).toHaveBeenCalledWith(2); expect(vi.getTimerCount()).toBe(0)
    first.reject(new Error('late synthetic rejection')); await flush(); expect(f.markFailure).toHaveBeenCalledOnce()
  })
  it('times out ignored-abort OpenCode create body without starting message/cleanup or continuing late success', async () => {
    vi.useFakeTimers(); const body = deferred<unknown>(), fetch = vi.fn().mockResolvedValueOnce({ ok: true, json: () => body.promise }); vi.stubGlobal('fetch', fetch)
    const operation = generateWithOpenCode('http://synthetic.invalid', { ...prompts, timeoutMs: 50 })
    const rejected = expect(operation).rejects.toThrow('OpenCode create-session timeout after 50ms')
    await flush(); await vi.advanceTimersByTimeAsync(50); await rejected
    body.resolve({ id: 'late-synthetic-session' }); await flush(); expect(fetch).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0)
  })
  it('cancels an ignored-abort OpenCode non-OK error body and does not cleanup or fallback after cancellation', async () => {
    vi.useFakeTimers(); const f = settings(), controller = new AbortController(), body = deferred<string>()
    const fetch = vi.fn().mockResolvedValueOnce({ ok: false, status: 500, text: () => body.promise }); vi.stubGlobal('fetch', fetch)
    const operation = generateWithProviders(f.store, { ...prompts, signal: controller.signal })
    const rejected = expect(operation).rejects.toMatchObject({ name: 'AbortError' }); await flush()
    controller.abort(); await rejected; f.close(); body.resolve('late synthetic error body'); await flush()
    expect(fetch).toHaveBeenCalledOnce(); expect(f.readsAfterClose()).toBe(0); expect(vi.getTimerCount()).toBe(0)
  })
  it('never disables a Gemini auth/quota key after cancellation during its ignored-abort error body', async () => {
    vi.useFakeTimers(); const f = settings(), controller = new AbortController(), body = deferred<string>()
    const fetch = vi.fn().mockResolvedValueOnce({ ok: false, status: 429, text: () => body.promise }); vi.stubGlobal('fetch', fetch)
    const operation = generateWithKeyPool(f.store, { ...prompts, signal: controller.signal })
    const rejected = expect(operation).rejects.toMatchObject({ name: 'AbortError' }); await flush()
    controller.abort(); await rejected; f.close(); body.resolve('late synthetic quota'); await flush()
    expect(fetch).toHaveBeenCalledOnce(); expect(f.markFailure).not.toHaveBeenCalled(); expect(f.readsAfterClose()).toBe(0); expect(vi.getTimerCount()).toBe(0)
  })
})

it.each(['delete', 'replace'] as const)('pins the original signal across provider fallback after caller mutation: %s', async mutation => {
  vi.useFakeTimers(); const f = settings(), original = new AbortController(), replacement = new AbortController(), first = deferred<Response>(), second = deferred<Response>()
  const fetch = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise); vi.stubGlobal('fetch', fetch)
  const options: typeof prompts & { signal?: AbortSignal } = { ...prompts, signal: original.signal }
  const operation = generateWithProviders(f.store, options), rejected = expect(operation).rejects.toMatchObject({ name: 'AbortError' })
  if (mutation === 'delete') delete options.signal; else options.signal = replacement.signal
  first.reject(new Error('synthetic OpenCode failure')); await flush(); expect(fetch).toHaveBeenCalledTimes(2)
  original.abort(); await rejected; expect(vi.getTimerCount()).toBe(0); f.close(); second.resolve(new Response(JSON.stringify(geminiBody))); await flush()
  expect(f.readsAfterClose()).toBe(0); expect(f.markUsed).not.toHaveBeenCalled(); expect(f.markFailure).not.toHaveBeenCalled(); expect(replacement.signal.aborted).toBe(false)
})
it.each(['delete', 'replace'] as const)('pins the original signal across Gemini key fallback after caller mutation: %s', async mutation => {
  vi.useFakeTimers(); const f = settings(), original = new AbortController(), replacement = new AbortController(), first = deferred<Response>(), second = deferred<Response>()
  const fetch = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise); vi.stubGlobal('fetch', fetch)
  const options: typeof prompts & { signal?: AbortSignal } = { ...prompts, signal: original.signal }
  const operation = generateWithKeyPool(f.store, options), rejected = expect(operation).rejects.toMatchObject({ name: 'AbortError' })
  if (mutation === 'delete') delete options.signal; else options.signal = replacement.signal
  first.resolve(new Response('synthetic transient failure', { status: 500 })); await flush(); expect(fetch).toHaveBeenCalledTimes(2)
  original.abort(); await rejected; expect(vi.getTimerCount()).toBe(0); const failureCount = f.markFailure.mock.calls.length; f.close(); second.resolve(new Response(JSON.stringify(geminiBody))); await flush()
  expect(f.readsAfterClose()).toBe(0); expect(f.markUsed).not.toHaveBeenCalled(); expect(f.markFailure).toHaveBeenCalledTimes(failureCount); expect(replacement.signal.aborted).toBe(false)
})
it('snapshots Gemini prompt/model/options before awaiting a different provider', async () => {
  const f = settings(), first = deferred<Response>(), fetch = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValueOnce(new Response(JSON.stringify(geminiBody))); vi.stubGlobal('fetch', fetch)
  const options = { ...prompts, model: 'synthetic-original', temperature: 0.2 }
  const operation = generateWithProviders(f.store, options); options.systemPrompt = 'changed-system'; options.userPrompt = 'changed-user'; options.model = 'changed-model'; options.temperature = 0.9
  first.reject(new Error('synthetic OpenCode failure')); expect((await operation).provider).toBe('gemini')
  const request = fetch.mock.calls[1] as unknown as [string, RequestInit], body = JSON.parse(String(request[1].body))
  expect(request[0]).toContain('/models/synthetic-original:'); expect(body.systemInstruction.parts[0].text).toBe('synthetic'); expect(body.contents[0].parts[0].text).toBe('synthetic'); expect(body.generationConfig.temperature).toBe(0.2)
})
it('snapshots OpenCode prompt options before awaiting session creation', async () => {
  const create = deferred<Response>(), fetch = vi.fn().mockReturnValueOnce(create.promise).mockResolvedValueOnce(new Response('{"parts":[{"type":"text","text":"synthetic reply"}]}')).mockResolvedValueOnce(new Response(null, { status: 204 })); vi.stubGlobal('fetch', fetch)
  const options = { ...prompts, model: 'synthetic/original' }, operation = generateWithOpenCode('http://synthetic.invalid', options)
  options.systemPrompt = 'changed-system'; options.userPrompt = 'changed-user'; options.model = 'changed/model'; create.resolve(new Response('{"id":"synthetic-session"}'))
  expect(await operation).toBe('synthetic reply'); const request = fetch.mock.calls[1] as unknown as [string, RequestInit], body = JSON.parse(String(request[1].body))
  expect(body.system).toBe('synthetic'); expect(body.parts[0].text).toBe('synthetic'); expect(body.model).toEqual({ providerID: 'synthetic', modelID: 'original' })
})
it('captures a non-enumerable original signal and forwards it through provider fallback', async () => {
  vi.useFakeTimers(); const f = settings(), original = new AbortController(), first = deferred<Response>(), second = deferred<Response>(), fetch = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise); vi.stubGlobal('fetch', fetch)
  const options: typeof prompts & { signal?: AbortSignal } = { ...prompts }; Object.defineProperty(options, 'signal', { value: original.signal, configurable: true, enumerable: false })
  const operation = generateWithProviders(f.store, options), rejected = expect(operation).rejects.toMatchObject({ name: 'AbortError' }); delete options.signal; first.reject(new Error('synthetic OpenCode failure')); await flush()
  original.abort(); await rejected; expect(vi.getTimerCount()).toBe(0); f.close(); second.resolve(new Response(JSON.stringify(geminiBody))); await flush(); expect(f.readsAfterClose()).toBe(0)
})

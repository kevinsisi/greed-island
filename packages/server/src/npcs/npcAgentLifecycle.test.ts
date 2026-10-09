import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NpcAgentRunner, type NpcAgentDeps } from './npcAgentRunner.js'
import { generateWithProviders } from './aiProvider.js'
import type { SettingsStore } from '../http/settings.js'
import type { NpcProfile } from './types.js'
vi.mock('./aiProvider.js', () => ({ generateWithProviders: vi.fn(), AiUnavailableError: class extends Error {} }))
const generate = vi.mocked(generateWithProviders)
const profile: NpcProfile = { id: 'synthetic-npc', name: { zh: '測試居民', en: 'Synthetic resident' }, role: { zh: '旅人', en: 'Traveler' }, defaultLocation: 't_central', routine: [], triggers: [], memory: { consultsEventTypes: [], decayFn: 'none', decayParam: 0 }, personality: {} }
const reply = { provider: 'opencode' as const, text: JSON.stringify({ action: 'custom_social_scene', target: { tileId: null, npcId: null, cardId: null }, reason: 'synthetic', risk: 'synthetic', expectedOutcome: 'synthetic', utterance: 'synthetic' }) }
function deferred<T>() { let resolve!: (value: T) => void, reject!: (reason: unknown) => void; const promise = new Promise<T>((r, j) => { resolve = r; reject = j }); return { promise, resolve, reject } }
function setup(backoff = '0') {
  let closed = false, readsAfterClose = 0
  const read = () => { if (closed) { readsAfterClose++; throw new Error('synthetic closed database') } }
  const settings = { getSetting: (key: string) => { read(); return key === 'npc_agent_retry_base_ms' ? backoff : key === 'npc_agent_max_retries' ? '2' : key === 'opencode_base_url' ? 'http://synthetic.invalid' : null }, countActive: () => { read(); return 1 } } as unknown as SettingsStore
  const submit = vi.fn(), deps: NpcAgentDeps = { listAgentNpcs: () => [profile], getNpcTile: () => 't_central', computeIntentEntries: () => [], getNeedsLine: () => '', getLifeGoalContext: () => '', getBeliefContext: () => '', getReflectionContext: () => '', submitDecision: submit }
  const runner = new NpcAgentRunner(settings, deps)
  return { runner, submit, closeDb: () => { closed = true }, readsAfterClose: () => readsAfterClose }
}
beforeEach(() => { generate.mockReset() })
afterEach(() => { vi.useRealTimers() })
describe('NPC agent reusable pause and ignored-abort lifecycle', () => {
  it('cancels an already-running ignored-abort provider, drains, and prevents late commit/settings reads after DB close', async () => {
    const f = setup(), old = deferred<typeof reply>(); generate.mockReturnValueOnce(old.promise)
    f.runner.tick(0); expect(generate).toHaveBeenCalledOnce()
    f.runner.stop(); expect(generate.mock.calls[0]?.[1].signal?.aborted).toBe(true)
    expect(await f.runner.waitForIdle()).toBe(true); f.closeDb(); old.resolve(reply); await Promise.resolve(); await Promise.resolve()
    f.runner.tick(10); expect(f.runner.getDiagnostics()).toMatchObject({ enabled: false, configured: true, inFlight: 0, submitCount: 0 })
    expect(f.submit).not.toHaveBeenCalled(); expect(f.readsAfterClose()).toBe(0); expect(generate).toHaveBeenCalledOnce()
  })
  it('clears a retry backoff timer on stop and never starts another provider attempt', async () => {
    vi.useFakeTimers(); const f = setup('5000'); generate.mockRejectedValue(new Error('synthetic provider failure'))
    f.runner.tick(0); await vi.advanceTimersByTimeAsync(0); expect(vi.getTimerCount()).toBe(1)
    f.runner.stop(); expect(vi.getTimerCount()).toBe(0); expect(await f.runner.waitForIdle()).toBe(true)
    await vi.advanceTimersByTimeAsync(20_000); expect(generate).toHaveBeenCalledOnce(); expect(f.submit).not.toHaveBeenCalled()
  })
  it('preserves a fresh restart attempt when an old generation resolves and runs its finally cleanup', async () => {
    const f = setup(), old = deferred<typeof reply>(), fresh = deferred<typeof reply>()
    generate.mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise)
    f.runner.tick(0); f.runner.stop(); f.runner.start(); f.runner.tick(0)
    old.resolve(reply); await Promise.resolve(); await Promise.resolve(); expect(f.runner.getDiagnostics().inFlight).toBe(1)
    expect(f.submit).not.toHaveBeenCalled(); fresh.resolve(reply); expect(await f.runner.waitForIdle()).toBe(true)
    expect(f.submit).toHaveBeenCalledOnce(); expect(generate.mock.calls[1]?.[1].signal?.aborted).toBe(false)
    f.runner.stop(); f.runner.stop(); expect(await f.runner.waitForIdle()).toBe(true)
  })
  it('does not retry or record a late ignored-abort rejection as a new failure after restart', async () => {
    const f = setup(), old = deferred<typeof reply>(); generate.mockReturnValueOnce(old.promise).mockResolvedValueOnce(reply)
    f.runner.tick(0); f.runner.stop(); await f.runner.waitForIdle(); f.runner.start(); f.runner.tick(0); await f.runner.waitForIdle()
    old.reject(new Error('late ignored-abort failure')); await Promise.resolve(); await Promise.resolve()
    expect(f.runner.getDiagnostics()).toMatchObject({ submitCount: 1, errorCount: 0 }); expect(generate).toHaveBeenCalledTimes(2); f.runner.stop()
  })
})

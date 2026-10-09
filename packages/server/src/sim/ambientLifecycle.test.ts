import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AmbientNarrator, type AmbientContext } from './ambientNarrator.js'
import { generateWithProviders } from '../npcs/aiProvider.js'
import type { SettingsStore } from '../http/settings.js'
vi.mock('../npcs/aiProvider.js', () => ({ generateWithProviders: vi.fn(), AiUnavailableError: class extends Error {} }))
const generate = vi.mocked(generateWithProviders)
const ctx: AmbientContext = { tileId: 't_central', weather: '晴', season: 'synthetic', presentNpcNames: [], presentBuildingNames: [], recentNarrations: [], areaState: null, worldEvents: [] }
const reply = { provider: 'opencode' as const, text: 'synthetic narration' }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r }); return { promise, resolve } }
beforeEach(() => { generate.mockReset(); vi.spyOn(console, 'log').mockImplementation(() => {}) })
afterEach(() => { vi.restoreAllMocks() })
function setup() {
  let closed = false, readsAfterClose = 0
  const read = () => { if (closed) { readsAfterClose++; throw new Error('synthetic closed DB') } }
  const narrator = new AmbientNarrator({ listActiveKeys: () => { read(); return [{}] }, getSetting: () => { read(); return null } } as unknown as SettingsStore)
  return { narrator, closeDb: () => { closed = true }, readsAfterClose: () => readsAfterClose }
}
describe('ambient background lifecycle', () => {
  it('drains cancellation and blocks late cache/provider/settings access after DB close', async () => {
    const f = setup(), old = deferred<typeof reply>(); generate.mockReturnValueOnce(old.promise)
    const operation = f.narrator.refresh(ctx, 0); f.narrator.stop(); expect(await f.narrator.waitForIdle()).toBe(true); f.closeDb()
    expect((await operation).aiError).toBe('cancelled'); old.resolve(reply); await Promise.resolve(); await Promise.resolve()
    f.narrator.tickRefresh(100, () => ctx); f.narrator.backgroundRefresh(102, ['t_central'], () => ctx); f.narrator.getOrSchedule(ctx, 100); await f.narrator.refresh(ctx, 100)
    expect(f.narrator.peek(ctx.tileId)).toBeNull(); expect(f.readsAfterClose()).toBe(0); expect(generate).toHaveBeenCalledOnce()
  })
  it('keeps a fresh generation tile request intact when old generation completes', async () => {
    const f = setup(), old = deferred<typeof reply>(), fresh = deferred<typeof reply>(); generate.mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise)
    const cancelled = f.narrator.refresh(ctx, 0); f.narrator.stop(); f.narrator.start(); const current = f.narrator.refresh(ctx, 30)
    old.resolve(reply); await cancelled; expect(f.narrator.peek(ctx.tileId)).toBeNull()
    fresh.resolve({ ...reply, text: 'fresh generation' }); expect((await current).text).toBe('fresh generation'); expect(f.narrator.peek(ctx.tileId)?.generatedAtTick).toBe(30)
    f.narrator.stop(); expect(await f.narrator.waitForIdle()).toBe(true)
  })
  it('returns a non-AI world-event result after cancellation so runtime cannot publish late enhanced narration', async () => {
    const f = setup(), old = deferred<typeof reply>(); generate.mockReturnValueOnce(old.promise)
    const event = { id: 'synthetic-event', type: 'synthetic', text: { zh: 'fallback', en: 'fallback' } }
    const operation = f.narrator.narrateWorldEvent(event as never); f.narrator.stop(); await f.narrator.waitForIdle(); f.closeDb(); old.resolve(reply)
    expect(await operation).toMatchObject({ source: 'fallback', text: 'fallback', aiError: 'cancelled' }); expect(f.readsAfterClose()).toBe(0)
  })
})

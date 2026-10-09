// Source/runtime lifecycle evidence. No native SQLite or live-provider acceptance claim.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SimulationRuntime } from './runtime.js'
import { loadCardCatalog } from '../cards/loader.js'
import { loadNpcProfiles } from '../npcs/loader.js'
import { generateWithProviders } from '../npcs/aiProvider.js'
vi.mock('../npcs/aiProvider.js', () => ({ generateWithProviders: vi.fn(), AiUnavailableError: class extends Error {} }))
const generate = vi.mocked(generateWithProviders), runtimes: SimulationRuntime[] = []
afterEach(async () => { for (const runtime of runtimes.splice(0)) { runtime.stop(); await runtime.waitForBackgroundWork() } vi.restoreAllMocks(); vi.useRealTimers() })
function fixture() {
  let closed = false, readsAfterClose = 0
  const read = () => { if (closed) { readsAfterClose++; throw new Error('synthetic closed store') } }
  const store = { readLatestFactSnapshot: () => ({ eventCount: 25000, lastSequence: 0, latestTick: 0, facts: {} }), readLatestFactValues: () => ({}), readEvents: () => [], readRecentEvents: () => [], readRecentEventsExcludingTypes: () => [], readRecentEventsByTypes: () => [], readLatestEventsPerActor: () => [], readEventsByActorCommand: () => [], readEventsByTickWindow: () => ({ events: [], limited: false }), countEvents: () => 25000, readEventsByTypes: () => { read(); return [] } }
  const profiles = loadNpcProfiles(), runtime = new SimulationRuntime(store as never, profiles, loadCardCatalog()); runtimes.push(runtime)
  const settings = { getSetting: (key: string) => { read(); return key === 'npc_agent_max_retries' ? '2' : key === 'npc_agent_retry_base_ms' ? '5000' : key === 'opencode_base_url' ? 'http://synthetic.invalid' : null }, countActive: () => { read(); return 1 }, listActiveKeys: () => { read(); return [{}] } }
  const runner = runtime.attachNpcAgent(settings as never)
  const commit = vi.spyOn(runtime, 'submitLivingWorldCommand').mockImplementation(() => null)
  return { profiles, runtime, runner, settings, commit, closeStore: () => { closed = true }, readsAfterClose: () => readsAfterClose }
}
const reply = { provider: 'opencode' as const, text: JSON.stringify({ action: 'custom_social_scene', target: { tileId: null, npcId: null, cardId: null }, reason: 'synthetic', risk: 'synthetic', expectedOutcome: 'synthetic', utterance: 'synthetic' }) }
describe('runtime stop/start NPC background integration', () => {
  it('corrects the independent late-provider-after-stop reproduction and leaves no timer or DB access after closure', async () => {
    const f = fixture(); let respond!: (value: typeof reply) => void; generate.mockImplementationOnce(() => new Promise(resolve => { respond = resolve }))
    const operation = (f.runner as unknown as { deliberate: (profile: typeof f.profiles[number], tick: number) => Promise<void> }).deliberate(f.profiles[0]!, 0)
    f.runtime.stop(); expect(await f.runtime.waitForBackgroundWork()).toBe(true); f.closeStore(); respond(reply); await operation; await Promise.resolve()
    expect(f.commit).not.toHaveBeenCalled(); expect(f.readsAfterClose()).toBe(0)
    const internal = f.runtime as unknown as { playerMovementTimer: unknown; timer: unknown; combatRuntime: { getActiveCombatIds: () => readonly string[] } }
    expect(internal.playerMovementTimer).toBeNull(); expect(internal.timer).toBeNull(); expect(internal.combatRuntime.getActiveCombatIds()).toEqual([])
  })
  it('supports reusable stop/start and does not let an old result reenter a fresh generation', async () => {
    vi.useFakeTimers(); const f = fixture(); let old!: (value: typeof reply) => void
    generate.mockImplementationOnce(() => new Promise(resolve => { old = resolve })).mockResolvedValueOnce(reply)
    const internalRunner = f.runner as unknown as { deliberate: (profile: typeof f.profiles[number], tick: number) => Promise<void> }
    const first = internalRunner.deliberate(f.profiles[0]!, 0); f.runtime.stop(); await f.runtime.waitForBackgroundWork(); f.runtime.start()
    const second = internalRunner.deliberate(f.profiles[0]!, 0); await second; expect(f.commit).toHaveBeenCalledOnce()
    old(reply); await first; expect(f.commit).toHaveBeenCalledOnce(); f.runtime.stop(); await f.runtime.waitForBackgroundWork(); expect(vi.getTimerCount()).toBe(0)
  })
  it('stops attached ambient work and refuses to read closed settings on paused tick refreshes', async () => {
    const f = fixture(), ambient = f.runtime.attachAmbientNarrator(f.settings as never); let respond!: (value: typeof reply) => void
    generate.mockImplementationOnce(() => new Promise(resolve => { respond = resolve }))
    const context = f.runtime.buildAmbientContext('t_central')!, operation = ambient.refresh(context, 0)
    f.runtime.stop(); await f.runtime.waitForBackgroundWork(); f.closeStore(); respond(reply); expect((await operation).source).toBe('fallback')
    ambient.tickRefresh(100, () => context); ambient.backgroundRefresh(102, ['t_central'], () => context); expect(f.readsAfterClose()).toBe(0); expect(ambient.peek('t_central')).toBeNull()
  })
})

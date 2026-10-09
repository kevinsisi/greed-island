import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadCardCatalog } from '../cards/loader.js'
import { loadNpcProfiles } from '../npcs/loader.js'
import type { SqliteEventStore } from '../kernel/eventStore.js'
import type { Event } from '../kernel/types.js'
import type { CombatRuntime } from '../combat/runtime.js'
import { SimulationRuntime } from './runtime.js'

type Internals = {
  yieldToEventLoop: () => Promise<void>
  combatRuntime: CombatRuntime
  tickLoopActive: boolean
  playerMovementTimer: NodeJS.Timeout | null
  timer: NodeJS.Timeout | null
}
const runtimes: SimulationRuntime[] = []
afterEach(() => { for (const runtime of runtimes.splice(0)) runtime.stop(); vi.restoreAllMocks() })

// This unit fixture exercises the real runtime against a synthetic event-store
// contract. Native SQLite and normal-factory coverage remain separate suites.
function fixture() {
  let closed = false, reads = 0
  const combat = { eventType: 'COMBAT_INITIATE', sequence: 1, tick: 0,
    payload: { data: { combatId: 'synthetic-hydration-combat' } } } as unknown as Event
  const store = {
    readLatestFactSnapshot: () => ({ eventCount: 25_000, lastSequence: 0, latestTick: 0, facts: {} }),
    readLatestFactValues: () => ({}), readEvents: () => [], readRecentEvents: () => [],
    readRecentEventsExcludingTypes: () => [], readRecentEventsByTypes: () => [],
    readLatestEventsPerActor: () => [], readEventsByActorCommand: () => [],
    readEventsByTickWindow: () => ({ events: [], limited: false }), countEvents: () => 25_000,
    readEventsByTypes: (types: readonly string[]) => {
      if (closed) throw new Error('Synthetic store is closed')
      reads++
      return types.includes('COMBAT_INITIATE') ? [combat] : []
    },
  }
  const runtime = new SimulationRuntime(store as unknown as SqliteEventStore, loadNpcProfiles(), loadCardCatalog())
  const internal = runtime as unknown as Internals
  runtimes.push(runtime)
  return { runtime, internal, store, closeStore: () => { closed = true }, reads: () => reads }
}

describe('deferred hydration cancellation and reusable runtime stop', () => {
  it('does not read the store after stop at the initial yield and simulated DB closure', async () => {
    const { runtime, internal, closeStore, reads } = fixture(), before = reads()
    const pending = runtime.startDeferredHydration()
    runtime.stop(); closeStore()
    await pending; await runtime.waitForDeferredHydration()
    expect(reads()).toBe(before)
    expect(runtime.getDeferredHydrationState()).toBe('pending')
    expect(runtime.getDeferredHydrationError()).toBeNull()
    expect(internal.combatRuntime.getActiveCombatIds()).toEqual([])
  })

  it('does not respawn a combat interval after stop while deferred replay is running', async () => {
    const { runtime, internal } = fixture()
    const pending = runtime.startDeferredHydration()
    runtime.stop()
    await pending
    expect(internal.combatRuntime.getActiveCombatIds()).toEqual([])
  })

  it.each(Array.from({ length: 11 }, (_, index) => index + 1))('cancels safely at yield %i, including before/after combat and final completion', async boundary => {
    const { runtime, internal, closeStore, reads } = fixture()
    let yielded = 0, resume!: () => void, reached!: () => void
    const paused = new Promise<void>(resolve => { reached = resolve })
    vi.spyOn(internal, 'yieldToEventLoop').mockImplementation(async () => {
      yielded++
      if (yielded === boundary) await new Promise<void>(resolve => { resume = resolve; reached() })
    })
    const pending = runtime.startDeferredHydration()
    await paused
    const before = reads()
    runtime.stop(); runtime.stop(); closeStore(); resume()
    await pending
    expect(reads()).toBe(before)
    expect(internal.combatRuntime.getActiveCombatIds()).toEqual([])
    expect(runtime.getDeferredHydrationState()).toBe('pending')
    expect(runtime.getDeferredHydrationError()).toBeNull()
  })

  it('keeps concurrent pre-stop callers cancelled without implicitly restarting replay', async () => {
    const { runtime, reads } = fixture(), before = reads()
    const first = runtime.startDeferredHydration(), second = runtime.startDeferredHydration()
    runtime.stop()
    await Promise.all([first, second])
    expect(reads()).toBe(before)
    expect(runtime.needsDeferredHydration()).toBe(true)
  })

  it('supports explicit immediate stop/start and hydration without a sticky closed flag', async () => {
    const { runtime, internal } = fixture()
    runtime.start()
    const cancelled = runtime.startDeferredHydration()
    runtime.stop(); runtime.start()
    const restarted = runtime.startDeferredHydration()
    await Promise.all([cancelled, restarted])
    expect(internal.tickLoopActive).toBe(true)
    expect(internal.playerMovementTimer).not.toBeNull()
    expect(runtime.getDeferredHydrationState()).toBe('complete')
    expect(runtime.getDeferredHydrationError()).toBeNull()
    expect(internal.combatRuntime.getActiveCombatIds()).toEqual(['synthetic-hydration-combat'])
    runtime.stop()
    expect(internal.playerMovementTimer).toBeNull(); expect(internal.timer).toBeNull()
    expect(internal.combatRuntime.getActiveCombatIds()).toEqual([])
  })

  it('single-flights a new generation and leaves the completed promise cleared', async () => {
    const { runtime, internal, reads } = fixture()
    runtime.stop()
    vi.spyOn(internal, 'yieldToEventLoop').mockResolvedValue()
    const before = reads()
    const first = runtime.startDeferredHydration(), second = runtime.startDeferredHydration()
    await Promise.all([first, second])
    const count = reads()
    await runtime.startDeferredHydration(); await runtime.waitForDeferredHydration()
    expect(reads()).toBe(count)
    expect(count - before).toBe(10)
    expect(runtime.getDeferredHydrationState()).toBe('complete')
  })

  it('single-flights multiple post-stop callers joining the still-cancelling old generation', async () => {
    const { runtime, internal, reads } = fixture(), before = reads()
    vi.spyOn(internal, 'yieldToEventLoop').mockResolvedValue()
    const first = runtime.startDeferredHydration(), oldJoiner = runtime.startDeferredHydration()
    runtime.stop(); runtime.start()
    const newJoiners = [runtime.startDeferredHydration(), runtime.startDeferredHydration(), runtime.startDeferredHydration()]
    await Promise.all([first, oldJoiner, ...newJoiners])
    expect(reads() - before).toBe(10)
    expect(runtime.getDeferredHydrationState()).toBe('complete')
    expect(internal.combatRuntime.getActiveCombatIds()).toEqual(['synthetic-hydration-combat'])
  })

  it('retains genuine replay failure diagnostics and permits an explicit retry after settlement', async () => {
    const { runtime, internal, store } = fixture()
    vi.spyOn(internal, 'yieldToEventLoop').mockResolvedValue()
    vi.spyOn(store, 'readEventsByTypes').mockImplementationOnce(() => { throw new Error('Synthetic replay failure') })
    await expect(runtime.startDeferredHydration()).rejects.toThrow('Synthetic replay failure')
    expect(runtime.getDeferredHydrationState()).toBe('failed')
    expect(runtime.getDeferredHydrationError()).toBe('Synthetic replay failure')
    await runtime.waitForDeferredHydration()
    await runtime.startDeferredHydration()
    expect(runtime.getDeferredHydrationState()).toBe('complete')
    expect(runtime.getDeferredHydrationError()).toBeNull()
  })
})

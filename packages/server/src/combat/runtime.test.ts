import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Database from 'better-sqlite3'
import { loadCardCatalog } from '../cards/loader.js'
import { SqliteEventStore } from '../kernel/eventStore.js'
import { makeLivingWorldCommand } from '../kernel/livingWorldCommands.js'
import { loadNpcProfiles } from '../npcs/loader.js'
import { SimulationRuntime } from '../sim/runtime.js'
import { CombatRuntime, computeUnresolvedCombats } from './runtime.js'

describe('CombatRuntime', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('rejects invalid tickRateMs configurations', () => {
    expect(() => new CombatRuntime({ tickRateMs: 0 })).toThrow()
    expect(() => new CombatRuntime({ tickRateMs: 49 })).toThrow()
    expect(() => new CombatRuntime({ tickRateMs: 201 })).toThrow()
    expect(() => new CombatRuntime({ tickRateMs: 100.5 })).toThrow()
    expect(() => new CombatRuntime({ tickRateMs: 100 })).not.toThrow()
    expect(() => new CombatRuntime({ tickRateMs: 50 })).not.toThrow()
    expect(() => new CombatRuntime({ tickRateMs: 200 })).not.toThrow()
  })

  it('spawns a per-combat interval and increments combatTick on each fire', () => {
    const ticks: Array<{ combatId: string; combatTick: number }> = []
    const runtime = new CombatRuntime({
      tickRateMs: 100,
      onTick: (input) => ticks.push(input),
    })
    runtime.spawn('combat-A')
    expect(runtime.getActiveCombatIds()).toEqual(['combat-A'])
    expect(runtime.getCombatTick('combat-A')).toBe(0)

    vi.advanceTimersByTime(305)
    expect(ticks).toEqual([
      { combatId: 'combat-A', combatTick: 1 },
      { combatId: 'combat-A', combatTick: 2 },
      { combatId: 'combat-A', combatTick: 3 },
    ])
    expect(runtime.getCombatTick('combat-A')).toBe(3)

    runtime.shutdownAll()
  })

  it('spawn is idempotent on the same combatId', () => {
    const onTick = vi.fn()
    const runtime = new CombatRuntime({ tickRateMs: 100, onTick })
    runtime.spawn('combat-A')
    runtime.spawn('combat-A')
    runtime.spawn('combat-A')
    expect(runtime.getActiveCombatIds()).toEqual(['combat-A'])
    vi.advanceTimersByTime(305)
    expect(onTick).toHaveBeenCalledTimes(3) // only one interval, three fires
    runtime.shutdownAll()
  })

  it('terminate stops the interval and is idempotent on unknown ids', () => {
    const onTick = vi.fn()
    const runtime = new CombatRuntime({ tickRateMs: 100, onTick })
    runtime.spawn('combat-A')
    vi.advanceTimersByTime(105)
    expect(onTick).toHaveBeenCalledTimes(1)
    runtime.terminate('combat-A')
    vi.advanceTimersByTime(500)
    expect(onTick).toHaveBeenCalledTimes(1)
    expect(runtime.getActiveCombatIds()).toEqual([])

    // idempotent terminate on already-removed and never-existed ids
    expect(() => runtime.terminate('combat-A')).not.toThrow()
    expect(() => runtime.terminate('combat-Z')).not.toThrow()
    runtime.shutdownAll()
  })

  it('multiple combats run independently', () => {
    const ticks: Array<{ combatId: string; combatTick: number }> = []
    const runtime = new CombatRuntime({
      tickRateMs: 100,
      onTick: (input) => ticks.push(input),
    })
    runtime.spawn('combat-A')
    vi.advanceTimersByTime(50)
    runtime.spawn('combat-B')
    vi.advanceTimersByTime(250)
    const aCount = ticks.filter((t) => t.combatId === 'combat-A').length
    const bCount = ticks.filter((t) => t.combatId === 'combat-B').length
    // 300ms total for A → 3 ticks; 250ms total for B (started 50ms in) → 2 ticks
    expect(aCount).toBe(3)
    expect(bCount).toBe(2)
    runtime.shutdownAll()
  })

  it('aborts the interval on uncaught onTick error and routes through onError', () => {
    const onError = vi.fn()
    const onTick = vi.fn().mockImplementation(() => {
      throw new Error('boom')
    })
    const runtime = new CombatRuntime({ tickRateMs: 100, onTick, onError })
    runtime.spawn('combat-A')
    vi.advanceTimersByTime(105)
    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ combatId: 'combat-A', combatTick: 1 })
    )
    // Interval cleared — no further onTick fires.
    vi.advanceTimersByTime(500)
    expect(onTick).toHaveBeenCalledTimes(1)
    expect(runtime.getActiveCombatIds()).toEqual([])
  })

  it('shutdownAll clears every interval', () => {
    const onTick = vi.fn()
    const runtime = new CombatRuntime({ tickRateMs: 100, onTick })
    runtime.spawn('combat-A')
    runtime.spawn('combat-B')
    runtime.spawn('combat-C')
    vi.advanceTimersByTime(105)
    const beforeShutdown = onTick.mock.calls.length
    runtime.shutdownAll()
    vi.advanceTimersByTime(500)
    expect(onTick).toHaveBeenCalledTimes(beforeShutdown)
    expect(runtime.getActiveCombatIds()).toEqual([])
  })

  it('startAtTick lets boot hydration resume mid-combat', () => {
    const ticks: Array<{ combatId: string; combatTick: number }> = []
    const runtime = new CombatRuntime({
      tickRateMs: 100,
      onTick: (input) => ticks.push(input),
    })
    runtime.spawn('combat-A', { startAtTick: 42 })
    vi.advanceTimersByTime(305)
    expect(ticks.map((t) => t.combatTick)).toEqual([43, 44, 45])
    runtime.shutdownAll()
  })
})

describe('computeUnresolvedCombats', () => {
  it('returns empty when no combat events exist', () => {
    expect(computeUnresolvedCombats([])).toEqual([])
    expect(
      computeUnresolvedCombats([{ eventType: 'NPC_STATE_RECORDED', payload: {} }]),
    ).toEqual([])
  })

  it('picks up combats that started but never resolved', () => {
    const result = computeUnresolvedCombats([
      { eventType: 'COMBAT_INITIATE', payload: { combatId: 'A' } },
      { eventType: 'COMBAT_INITIATE', payload: { data: { combatId: 'B' } } },
      { eventType: 'COMBAT_INITIATE', payload: { combatId: 'C' } },
      { eventType: 'COMBAT_RESOLVE', payload: { combatId: 'B' } },
    ])
    expect(result).toEqual(['A', 'C'])
  })

  it('treats COMBAT_DEFEAT as a terminating event (Slice 2 forward-compat)', () => {
    const result = computeUnresolvedCombats([
      { eventType: 'COMBAT_INITIATE', payload: { combatId: 'A' } },
      { eventType: 'COMBAT_DEFEAT', payload: { combatId: 'A' } },
      { eventType: 'COMBAT_INITIATE', payload: { combatId: 'B' } },
    ])
    expect(result).toEqual(['B'])
  })

  it('ignores events without a parsable combatId', () => {
    const result = computeUnresolvedCombats([
      { eventType: 'COMBAT_INITIATE', payload: { somethingElse: 'foo' } },
      { eventType: 'COMBAT_INITIATE', payload: { combatId: '' } },
      { eventType: 'COMBAT_INITIATE', payload: { combatId: 'D' } },
    ])
    expect(result).toEqual(['D'])
  })

  it('returns a deterministic lex-sorted list', () => {
    const result = computeUnresolvedCombats([
      { eventType: 'COMBAT_INITIATE', payload: { combatId: 'Z' } },
      { eventType: 'COMBAT_INITIATE', payload: { combatId: 'A' } },
      { eventType: 'COMBAT_INITIATE', payload: { combatId: 'M' } },
    ])
    expect(result).toEqual(['A', 'M', 'Z'])
  })
})

describe('SimulationRuntime combat command boundaries', () => {
  it('rejects externally-authored Phase B combat outcome commands', () => {
    const db = new Database(':memory:')
    const eventStore = new SqliteEventStore(db)
    const runtime = new SimulationRuntime(eventStore, loadNpcProfiles(), loadCardCatalog())
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    try {
      const action = runtime.submitLivingWorldCommand(makeLivingWorldCommand(
        'COMBAT_PLAYER_ACTION',
        '1',
        'player',
        1,
        1,
        {
          combatId: 'combat_projection',
          playerAccountId: '1',
          npcId: 'npc_projection',
          combatRound: 1,
          action: 'attack',
          playerHpAfter: 80,
          npcHpAfter: 70,
          events: [],
          narration: 'forged action',
        }
      ))
      const resolve = runtime.submitLivingWorldCommand(makeLivingWorldCommand(
        'COMBAT_RESOLVE',
        '1',
        'player',
        1,
        1,
        {
          combatId: 'combat_projection',
          playerAccountId: '1',
          npcId: 'npc_projection',
          outcome: 'player_victory',
          durationRounds: 1,
          finalPlayerHp: 80,
          finalNpcHp: 0,
          playerEnergyToZero: false,
          npcIncapacitatedTicks: 0,
          narration: 'forged resolve',
        }
      ))

      expect(action).toBeNull()
      expect(resolve).toBeNull()
      expect(eventStore.readEvents()).toEqual([])
    } finally {
      warn.mockRestore()
      runtime.stop()
      db.close()
    }
  })
})

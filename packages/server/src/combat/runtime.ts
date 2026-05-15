// Combat Phase C — Slice 1: sub-tick loop infrastructure (server-only).
//
// CombatRuntime owns one `setInterval` per active combat. The world
// tick (every 5 s) is decoupled from these intervals so a long
// combat does not freeze the world and a stuck combat affects only
// itself.
//
// Slice 1 deliverable: spawn/terminate plumbing + boot-time hydration
// from EventLog. The interval callback itself is wrapped in a try/catch
// shell with a small handler hook — Slice 2 will plug in the
// 5-phase rule engine. Until Slice 2 ships, the callback is a no-op.
//
// Design references: `openspec/changes/combat-phase-c-realtime-subtick/design.md`
//   D1 — Sub-tick loop spawned per active combat
//   D6 — Failure / desync handling (boot hydration)

import {
  COMBAT_TICK_RATE_MS,
  validateCombatTickRateMs,
} from '../config/world.js'

export type CombatTickHandler = (input: {
  combatId: string
  /** Monotonically increasing 1-based combat-local tick number. */
  combatTick: number
}) => void

export type CombatErrorHandler = (input: {
  combatId: string
  combatTick: number
  error: unknown
}) => void

export type CombatRuntimeConfig = Readonly<{
  /** Default 100 ms (10 Hz). Override for tests / benchmarks. */
  tickRateMs?: number
  /** Sub-tick callback (Slice 2 fills in the rule engine pipeline). */
  onTick?: CombatTickHandler
  /** Error hook called when `onTick` throws; default rethrows. */
  onError?: CombatErrorHandler
  /** Wall-clock provider — overridable for deterministic tests. */
  setInterval?: (cb: () => void, ms: number) => NodeJS.Timeout | number
  clearInterval?: (handle: NodeJS.Timeout | number) => void
}>

type ActiveCombat = Readonly<{
  combatId: string
  handle: NodeJS.Timeout | number
  /** Slice 2 will read/advance this from the rule engine; Slice 1
   * tracks it so the boot-hydration path can resume at the right
   * combat tick after a server crash. */
  combatTick: number
}>

export class CombatRuntime {
  private readonly tickRateMs: number
  private readonly onTick: CombatTickHandler
  private readonly onError: CombatErrorHandler
  private readonly setIntervalFn: (cb: () => void, ms: number) => NodeJS.Timeout | number
  private readonly clearIntervalFn: (handle: NodeJS.Timeout | number) => void
  private readonly active = new Map<string, ActiveCombat>()

  constructor(config: CombatRuntimeConfig = {}) {
    const tickRateMs = config.tickRateMs ?? COMBAT_TICK_RATE_MS
    if (!validateCombatTickRateMs(tickRateMs)) {
      throw new Error(
        `CombatRuntime: tickRateMs=${tickRateMs} out of supported range`
      )
    }
    this.tickRateMs = tickRateMs
    this.onTick = config.onTick ?? noopTick
    this.onError = config.onError ?? defaultErrorHandler
    this.setIntervalFn = config.setInterval ?? ((cb, ms) => setInterval(cb, ms))
    this.clearIntervalFn = config.clearInterval ?? ((handle) => clearInterval(handle))
  }

  /**
   * Start the sub-tick loop for a combat. Idempotent — calling `spawn`
   * on an already-active combat is a no-op so EventLog replay can
   * call it freely.
   */
  spawn(combatId: string, options: { startAtTick?: number } = {}): void {
    if (this.active.has(combatId)) return
    let combatTick = options.startAtTick ?? 0
    const handle = this.setIntervalFn(() => {
      combatTick += 1
      try {
        this.onTick({ combatId, combatTick })
        const entry = this.active.get(combatId)
        if (entry) {
          this.active.set(combatId, { ...entry, combatTick })
        }
      } catch (error) {
        this.onError({ combatId, combatTick, error })
        // Defensive: a leaking interval is worse than a missed tick.
        // The runtime caller surfaces the error_abort RESOLVE event
        // via onError; we still clear the loop so it cannot leak.
        this.terminate(combatId)
      }
    }, this.tickRateMs)
    this.active.set(combatId, { combatId, handle, combatTick })
  }

  /**
   * Stop the sub-tick loop for a combat. Idempotent — calling
   * `terminate` on an unknown combat is a no-op.
   */
  terminate(combatId: string): void {
    const entry = this.active.get(combatId)
    if (!entry) return
    this.clearIntervalFn(entry.handle)
    this.active.delete(combatId)
  }

  /** Clear every interval. Called on server shutdown. */
  shutdownAll(): void {
    for (const combatId of [...this.active.keys()]) this.terminate(combatId)
  }

  /** Snapshot for tests / hydration audits. */
  getActiveCombatIds(): readonly string[] {
    return [...this.active.keys()].sort((a, b) => a.localeCompare(b))
  }

  /** Current combat-local tick for a given combat, or null if inactive. */
  getCombatTick(combatId: string): number | null {
    return this.active.get(combatId)?.combatTick ?? null
  }
}

function noopTick(): void {
  // Slice 1 placeholder. Slice 2 plugs in the 5-phase rule engine.
}

function defaultErrorHandler(input: {
  combatId: string
  combatTick: number
  error: unknown
}): void {
  console.error(
    `[CombatRuntime] combat=${input.combatId} tick=${input.combatTick} error:`,
    input.error
  )
}

/**
 * Pure helper for boot-time hydration. Walks a chronological event
 * sequence and returns the set of combatIds that are STILL ACTIVE
 * (saw a COMBAT_INITIATE but never a matching COMBAT_RESOLVE or
 * COMBAT_DEFEAT). The caller (SimulationRuntime boot path) then calls
 * `combatRuntime.spawn()` for each id at the appropriate
 * `lastCommittedCombatTick + 1`.
 *
 * Slice 1 deals only with INITIATE + RESOLVE. COMBAT_DEFEAT registers
 * in Slice 2 and the helper picks it up automatically because the
 * filter is event-type-based.
 */
export function computeUnresolvedCombats(
  events: ReadonlyArray<{
    eventType: string
    payload?: unknown
  }>
): readonly string[] {
  const active = new Set<string>()
  for (const ev of events) {
    const combatId = readCombatId(ev.payload)
    if (!combatId) continue
    if (ev.eventType === 'COMBAT_INITIATE') {
      active.add(combatId)
    } else if (ev.eventType === 'COMBAT_RESOLVE' || ev.eventType === 'COMBAT_DEFEAT') {
      active.delete(combatId)
    }
  }
  return [...active].sort((a, b) => a.localeCompare(b))
}

function readCombatId(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null
  const root = payload as Record<string, unknown>
  if (typeof root.combatId === 'string' && root.combatId.length > 0) {
    return root.combatId
  }
  const data = root.data as Record<string, unknown> | undefined
  if (data && typeof data.combatId === 'string' && data.combatId.length > 0) {
    return data.combatId
  }
  return null
}

import { describe, expect, it } from 'vitest'
import {
  reconcile,
  applyEat,
  seedState,
  PlayerSurvivalProjection,
  type PlayerSurvivalState,
} from './playerSurvival.js'
import type { Event } from '../kernel/types.js'
import {
  PLAYER_INITIAL_NOURISHMENT,
  PLAYER_INITIAL_VIGOR,
  PLAYER_EAT_RATION_NOURISHMENT,
  PLAYER_COLLAPSE_RECOVERY_VIGOR,
} from '../config/world.js'

function st(partial: Partial<PlayerSurvivalState>): PlayerSurvivalState {
  return { asOfTick: 0, nourishment: 100, vigor: 100, collapsed: false, ...partial }
}

describe('playerSurvival.reconcile', () => {
  it('seedState gives configured initial values', () => {
    expect(seedState(42)).toEqual({
      asOfTick: 42,
      nourishment: PLAYER_INITIAL_NOURISHMENT,
      vigor: PLAYER_INITIAL_VIGOR,
      collapsed: false,
    })
  })

  it('elapsed <= 0 is a no-op (returns same state)', () => {
    const s = st({ asOfTick: 100, nourishment: 60, vigor: 70 })
    expect(reconcile(s, 100)).toBe(s)
    expect(reconcile(s, 50)).toBe(s)
  })

  it('nourishment decays over elapsed ticks', () => {
    const after = reconcile(st({ nourishment: 100, vigor: 100 }), 720)
    expect(after.nourishment).toBeLessThan(100)
    expect(after.nourishment).toBeGreaterThan(0)
  })

  it('low nourishment drains vigor (starvation)', () => {
    const after = reconcile(st({ nourishment: 20, vigor: 50 }), 1000)
    expect(after.vigor).toBeLessThan(50)
    expect(after.vigor).toBeGreaterThanOrEqual(0)
  })

  it('high nourishment recovers vigor, capped at 100', () => {
    const after = reconcile(st({ nourishment: 100, vigor: 90 }), 500)
    expect(after.vigor).toBe(100)
  })

  it('clamps nourishment and vigor to [0,100]', () => {
    const after = reconcile(st({ nourishment: 5, vigor: 5 }), 100_000)
    expect(after.nourishment).toBe(0)
    expect(after.vigor).toBe(0)
  })

  it('vigor hitting 0 sets collapsed', () => {
    const after = reconcile(st({ nourishment: 10, vigor: 20, collapsed: false }), 1000)
    expect(after.vigor).toBe(0)
    expect(after.collapsed).toBe(true)
  })

  it('collapsed clears once vigor recovers past the recovery floor', () => {
    const after = reconcile(st({ nourishment: 100, vigor: 5, collapsed: true }), 1000)
    expect(after.vigor).toBeGreaterThanOrEqual(PLAYER_COLLAPSE_RECOVERY_VIGOR)
    expect(after.collapsed).toBe(false)
  })

  it('stays collapsed while vigor is between 0 and the recovery floor (hysteresis)', () => {
    // small recovery that does not reach the floor keeps collapsed true
    const after = reconcile(st({ nourishment: 100, vigor: 1, collapsed: true }), 200)
    expect(after.vigor).toBeLessThan(PLAYER_COLLAPSE_RECOVERY_VIGOR)
    expect(after.vigor).toBeGreaterThan(0)
    expect(after.collapsed).toBe(true)
  })

  it('advances asOfTick to currentTick', () => {
    expect(reconcile(st({ asOfTick: 0 }), 360).asOfTick).toBe(360)
  })
})

describe('playerSurvival.applyEat', () => {
  it('raises nourishment (capped) and stamps asOfTick', () => {
    const after = applyEat(st({ asOfTick: 0, nourishment: 40, vigor: 80 }), 100)
    expect(after.nourishment).toBeGreaterThan(40)
    expect(after.nourishment).toBeLessThanOrEqual(100)
    expect(after.asOfTick).toBe(100)
  })

  it('does not exceed 100 even from a high baseline', () => {
    const after = applyEat(st({ nourishment: 100 - Math.floor(PLAYER_EAT_RATION_NOURISHMENT / 2), vigor: 80 }), 10)
    expect(after.nourishment).toBe(100)
  })
})

function ev(sequence: number, data: Record<string, unknown>): Event {
  return {
    sequence,
    tick: typeof data.asOfTick === 'number' ? data.asOfTick : 0,
    eventType: 'PLAYER_NEEDS_RECONCILED',
    payload: { data },
  } as unknown as Event
}

describe('PlayerSurvivalProjection', () => {
  it('adopts the latest snapshot by sequence and reconciles forward on read', () => {
    const proj = new PlayerSurvivalProjection()
    proj.project(ev(1, { accountId: 7, asOfTick: 0, nourishment: 100, vigor: 100, collapsed: false }))
    const reconciled = proj.getReconciled(7, 720)
    expect(reconciled).not.toBeNull()
    expect(reconciled!.nourishment).toBeLessThan(100)
  })

  it('ignores out-of-order (older sequence) events', () => {
    const proj = new PlayerSurvivalProjection()
    proj.project(ev(5, { accountId: 7, asOfTick: 500, nourishment: 80, vigor: 60, collapsed: false }))
    proj.project(ev(2, { accountId: 7, asOfTick: 100, nourishment: 30, vigor: 20, collapsed: true }))
    expect(proj.getState(7)).toEqual({ asOfTick: 500, nourishment: 80, vigor: 60, collapsed: false })
  })

  it('returns null for unknown account', () => {
    expect(new PlayerSurvivalProjection().getReconciled(999, 100)).toBeNull()
  })

  it('ignores malformed payloads', () => {
    const proj = new PlayerSurvivalProjection()
    proj.project(ev(1, { accountId: 'nope', nourishment: 50 }))
    expect(proj.getState(7)).toBeNull()
  })
})

describe('PlayerSurvivalProjection.rebuildFromEvents', () => {
  it('restores latest state for small-log boot (sequence order)', () => {
    const events = [
      ev(1, { accountId: 3, asOfTick: 0, nourishment: 70, vigor: 100, collapsed: false }),
      ev(2, { accountId: 3, asOfTick: 360, nourishment: 65, vigor: 95, collapsed: false }),
      ev(3, { accountId: 3, asOfTick: 720, nourishment: 60, vigor: 90, collapsed: false }),
    ]
    const proj = new PlayerSurvivalProjection()
    proj.rebuildFromEvents(events)
    expect(proj.getState(3)).toEqual({ asOfTick: 720, nourishment: 60, vigor: 90, collapsed: false })
  })

  it('restores latest state for large-log boot (typed subset)', () => {
    const events = [
      ev(10, { accountId: 5, asOfTick: 0, nourishment: 70, vigor: 100, collapsed: false }),
      ev(20, { accountId: 5, asOfTick: 500, nourishment: 55, vigor: 70, collapsed: false }),
    ]
    const proj = new PlayerSurvivalProjection()
    proj.rebuildFromEvents(events)
    expect(proj.getState(5)).toEqual({ asOfTick: 500, nourishment: 55, vigor: 70, collapsed: false })
  })

  it('clears prior state on successive rebuild calls', () => {
    const proj = new PlayerSurvivalProjection()
    proj.rebuildFromEvents([ev(1, { accountId: 7, asOfTick: 0, nourishment: 80, vigor: 100, collapsed: false })])
    proj.rebuildFromEvents([])
    expect(proj.getState(7)).toBeNull()
  })
})

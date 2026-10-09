import { describe, expect, it, vi } from 'vitest'
import type { SqliteEventStore } from '../kernel/eventStore.js'
import { makeLivingWorldCommand } from '../kernel/livingWorldCommands.js'
import { EventFixture } from '../playerWorld/service.testSupport.js'
import { commitAuthorizedPlayerCommand } from './playerCommandCommit.js'
const command = () => makeLivingWorldCommand('PLAYER_ATE', '1', 'player', 20, 0, { accountId: 1, asOfTick: 20, nourishment: 100, vigor: 100, collapsed: false, goldCost: 5 })
describe('same-EventLog authorized player transaction seam, pure fixture only', () => {
  it('checks authorization inside transaction before any cost/history and skips deterministic duplicate side effects', () => {
    const fixture = new EventFixture(), cost = vi.fn(), order: string[] = []
    const store = fixture as unknown as SqliteEventStore
    const first = commitAuthorizedPlayerCommand(store, command(), { authorize: () => { expect(fixture.transactions).toBe(1); order.push('authorize') }, beforeCommit: () => { order.push('cost'); cost() } })
    expect(order).toEqual(['authorize', 'cost']); expect(first?.duplicate).toBe(false)
    const retry = commitAuthorizedPlayerCommand(store, command(), { authorize: () => {}, beforeCommit: cost })
    expect(retry?.duplicate).toBe(true); expect(retry?.event.eventId).toBe(first?.event.eventId); expect(cost).toHaveBeenCalledOnce(); expect(fixture.events).toHaveLength(1)
  })
  it('does not charge or write personal state for revoked authorization or a rejected typed command', () => {
    const fixture = new EventFixture(), effect = vi.fn(), store = fixture as unknown as SqliteEventStore
    expect(() => commitAuthorizedPlayerCommand(store, command(), { authorize: () => { throw new Error('revoked') }, beforeCommit: effect })).toThrow('revoked')
    const bad = { ...command(), payload: { invalid: true } }
    expect(commitAuthorizedPlayerCommand(store, bad as never, { authorize: () => {}, beforeCommit: effect })).toBeNull()
    expect(effect).not.toHaveBeenCalled(); expect(fixture.events).toHaveLength(0)
  })
  it('rolls back a failed wallet/personal-state mutation before appending the fact', () => {
    const fixture = new EventFixture(), store = fixture as unknown as SqliteEventStore
    expect(() => commitAuthorizedPlayerCommand(store, command(), { authorize: () => {}, beforeCommit: () => { throw new Error('personal write failed') } })).toThrow('personal write failed')
    expect(fixture.events).toHaveLength(0)
    expect(commitAuthorizedPlayerCommand(store, command(), { authorize: () => {} })?.duplicate).toBe(false)
  })
  it('permits only the typed server intervention receipt result to differ while the exact original intent stays the same', () => {
    const fixture = new EventFixture(), store = fixture as unknown as SqliteEventStore, effect = vi.fn(), authorize = vi.fn()
    const intent = { playerAccountId: '1', npcA: 'a', npcB: 'b', tile: 't_central', intentClass: 'mediate' as const, message: '', narration: 'mediate' }
    const base = makeLivingWorldCommand('PLAYER_INTERVENE', '1', 'player', 20, 0, intent)
    const receipt = (trust: number) => ({ npcA: { npcId: 'a', trust, trustDelta: 2, moodDelta: 2 }, npcB: { npcId: 'b', trust, trustDelta: 2, moodDelta: 2 } })
    const first = { ...base, payload: { ...intent, effects: receipt(52) } }
    expect(commitAuthorizedPlayerCommand(store, first, { authorize, beforeCommit: effect })?.duplicate).toBe(false)
    expect(commitAuthorizedPlayerCommand(store, { ...first, payload: { ...intent, effects: receipt(54) } }, { authorize, beforeCommit: effect })?.duplicate).toBe(true)
    for (const change of [{ message: 'different' }, { npcA: 'other' }, { intentClass: 'threaten' }, { narration: 'different' }, { arbitraryOutput: true }]) {
      const changed = { ...intent, ...change }, changedEffects = receipt(54)
      changedEffects.npcA.npcId = changed.npcA
      expect(() => commitAuthorizedPlayerCommand(store, { ...first, payload: { ...changed, effects: changedEffects } } as never, { authorize, beforeCommit: effect })).toThrow('different content')
    }
    expect(effect).toHaveBeenCalledOnce(); expect(authorize).toHaveBeenCalledTimes(7); expect(fixture.events).toHaveLength(1)
  })
  it('does not relax deterministic duplicate comparisons for other commands with output-like client fields', () => {
    const fixture = new EventFixture(), store = fixture as unknown as SqliteEventStore, effect = vi.fn(), original = command()
    commitAuthorizedPlayerCommand(store, original, { authorize: () => {}, beforeCommit: effect })
    expect(() => commitAuthorizedPlayerCommand(store, { ...original, payload: { ...original.payload, effects: { trust: 100 } } } as never, { authorize: () => {}, beforeCommit: effect })).toThrow('different content')
    expect(effect).toHaveBeenCalledOnce(); expect(fixture.events).toHaveLength(1)
  })
})

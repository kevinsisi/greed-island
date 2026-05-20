import { describe, expect, it } from 'vitest'
import { AreaStateProjection } from './areaState.js'
import type { Event } from '../kernel/types.js'
import type { AreaState } from '../sim/areaStateEngine.js'

function makeAreaState(tileId: string, tick: number): AreaState {
  return {
    tileId,
    factionControl: { tide_hunters: 50, free_runners: 20, guild: 20, civilian: 10 },
    dominantFaction: null,
    resources: { food: 50, safety: 50, economy: 50 },
    lastUpdatedTick: tick,
    recentEvents: [],
  }
}

function makeEvent(state: AreaState, sequence: number): Event {
  return {
    id: `ev-${sequence}`,
    eventType: 'AREA_STATE_RECORDED',
    actorId: 'system',
    sequence,
    tick: state.lastUpdatedTick,
    timestamp: new Date().toISOString(),
    payload: { data: { tileId: state.tileId, state, narration: 'test' } },
  } as unknown as Event
}

describe('AreaStateProjection', () => {
  it('reduces AREA_STATE_RECORDED events into per-tile snapshots', () => {
    const proj = new AreaStateProjection()
    proj.project(makeEvent(makeAreaState('t_central', 10), 1))
    proj.project(makeEvent(makeAreaState('t_north', 20), 2))
    expect(proj.getAll()).toHaveLength(2)
    expect(proj.getByTileId('t_central')?.recordedAtTick).toBe(10)
    expect(proj.getByTileId('t_north')?.recordedAtTick).toBe(20)
  })

  it('keeps the latest snapshot per tile by sequence', () => {
    const proj = new AreaStateProjection()
    proj.project(makeEvent(makeAreaState('t_central', 10), 1))
    proj.project(makeEvent(makeAreaState('t_central', 50), 5))
    proj.project(makeEvent(makeAreaState('t_central', 30), 3))
    expect(proj.getByTileId('t_central')?.recordedAtTick).toBe(50)
    expect(proj.getByTileId('t_central')?.sequence).toBe(5)
  })

  it('ignores non-AREA_STATE_RECORDED events', () => {
    const proj = new AreaStateProjection()
    const wrong: Event = {
      id: 'x',
      eventType: 'NPC_MOVE',
      actorId: 's',
      sequence: 1,
      tick: 1,
      timestamp: new Date().toISOString(),
      payload: { data: { tileId: 't_central', state: makeAreaState('t_central', 1) } },
    } as unknown as Event
    proj.project(wrong)
    expect(proj.getAll()).toHaveLength(0)
  })

  it('rebuildFromEvents replays sequence-ordered', () => {
    const events: Event[] = [
      makeEvent(makeAreaState('t_a', 100), 5),
      makeEvent(makeAreaState('t_a', 10), 1),
      makeEvent(makeAreaState('t_b', 50), 3),
    ]
    const proj = new AreaStateProjection()
    proj.rebuildFromEvents(events)
    expect(proj.getByTileId('t_a')?.recordedAtTick).toBe(100)
    expect(proj.getByTileId('t_b')?.recordedAtTick).toBe(50)
  })

  it('canonicalHash is deterministic and order-independent', () => {
    const a = new AreaStateProjection()
    a.project(makeEvent(makeAreaState('t_a', 1), 1))
    a.project(makeEvent(makeAreaState('t_b', 2), 2))
    const b = new AreaStateProjection()
    b.project(makeEvent(makeAreaState('t_b', 2), 2))
    b.project(makeEvent(makeAreaState('t_a', 1), 1))
    expect(a.canonicalHash()).toBe(b.canonicalHash())
  })

  it('returns null for unknown tile', () => {
    const proj = new AreaStateProjection()
    expect(proj.getByTileId('t_unknown')).toBeNull()
  })
})

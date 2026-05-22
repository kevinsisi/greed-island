import { describe, it, expect } from 'vitest'
import { BuildingStateProjection } from './buildingState.js'
import type { Event } from '../kernel/types.js'

function ev(tick: number, eventType: string, data: unknown): Event {
  return {
    id: `ev-${tick}-${eventType}`,
    eventType,
    actorId: 'system',
    sequence: tick,
    tick,
    timestamp: new Date().toISOString(),
    payload: { data },
  } as unknown as Event
}

describe('BuildingStateProjection', () => {
  it('returns operational/100 by default for unknown building', () => {
    const proj = new BuildingStateProjection()
    const row = proj.getState('b_unknown')
    expect(row).toEqual({ buildingId: 'b_unknown', tileId: '', state: 'operational', health: 100, lastActivityTick: 0 })
  })

  it('BUILDING_CONSTRUCTED → operational, health 100', () => {
    const proj = new BuildingStateProjection()
    proj.project(ev(1, 'BUILDING_CONSTRUCTED', { buildingId: 'b_x', tileId: 't_forest', projectId: 'p1' }))
    const row = proj.getState('b_x')
    expect(row.state).toBe('operational')
    expect(row.health).toBe(100)
  })

  it('BUILDING_DAMAGED → damaged, health set', () => {
    const proj = new BuildingStateProjection()
    proj.project(ev(1, 'BUILDING_CONSTRUCTED', { buildingId: 'b_x', tileId: 't_forest', projectId: 'p1' }))
    proj.project(ev(2, 'BUILDING_DAMAGED', { buildingId: 'b_x', tileId: 't_forest', health: 40, cause: 'combat' }))
    const row = proj.getState('b_x')
    expect(row.state).toBe('damaged')
    expect(row.health).toBe(40)
  })

  it('BUILDING_REPAIRED → operational, health set', () => {
    const proj = new BuildingStateProjection()
    proj.project(ev(1, 'BUILDING_CONSTRUCTED', { buildingId: 'b_x', tileId: 't_forest', projectId: 'p1' }))
    proj.project(ev(2, 'BUILDING_DAMAGED', { buildingId: 'b_x', tileId: 't_forest', health: 40, cause: 'combat' }))
    proj.project(ev(3, 'BUILDING_REPAIRED', { buildingId: 'b_x', tileId: 't_forest', health: 85, repairedByNpcId: 'npc-a' }))
    const row = proj.getState('b_x')
    expect(row.state).toBe('operational')
    expect(row.health).toBe(85)
  })

  it('BUILDING_ABANDONED → abandoned', () => {
    const proj = new BuildingStateProjection()
    proj.project(ev(1, 'BUILDING_CONSTRUCTED', { buildingId: 'b_x', tileId: 't_forest', projectId: 'p1' }))
    proj.project(ev(5, 'BUILDING_ABANDONED', { buildingId: 'b_x', tileId: 't_forest', lastActivityTick: 4 }))
    const row = proj.getState('b_x')
    expect(row.state).toBe('abandoned')
  })

  it('list() returns all known buildings', () => {
    const proj = new BuildingStateProjection()
    proj.project(ev(1, 'BUILDING_CONSTRUCTED', { buildingId: 'b_a', tileId: 't_forest', projectId: 'p1' }))
    proj.project(ev(2, 'BUILDING_CONSTRUCTED', { buildingId: 'b_b', tileId: 't_ruin', projectId: 'p2' }))
    expect(proj.list().length).toBe(2)
  })

  it('getByTile() returns buildings on tile', () => {
    const proj = new BuildingStateProjection()
    proj.project(ev(1, 'BUILDING_CONSTRUCTED', { buildingId: 'b_a', tileId: 't_forest', projectId: 'p1' }))
    proj.project(ev(2, 'BUILDING_CONSTRUCTED', { buildingId: 'b_b', tileId: 't_ruin', projectId: 'p2' }))
    expect(proj.getByTile('t_forest').length).toBe(1)
    expect(proj.getByTile('t_ruin').length).toBe(1)
    expect(proj.getByTile('t_mountain').length).toBe(0)
  })
})

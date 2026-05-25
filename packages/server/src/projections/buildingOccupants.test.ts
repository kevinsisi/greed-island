import { describe, expect, it } from 'vitest'
import { BuildingOccupantsProjection } from './buildingOccupants.js'
import type { Event } from '../kernel/types.js'

function makeEvent(
  eventType: string,
  data: Record<string, unknown>,
  sequence = 1,
): Event {
  return {
    id: `ev-${sequence}`,
    eventType,
    actorId: 'system',
    sequence,
    tick: 10,
    timestamp: new Date().toISOString(),
    payload: { data },
  } as unknown as Event
}

describe('BuildingOccupantsProjection', () => {
  it('starts unhydrated with empty state', () => {
    const proj = new BuildingOccupantsProjection()
    expect(proj.isHydrated()).toBe(false)
    expect(proj.toJSON()).toEqual({})
  })

  it('records BUILDING_ENTER', () => {
    const proj = new BuildingOccupantsProjection()
    proj.project(makeEvent('BUILDING_ENTER', { npcId: 'npc.baker', buildingId: 'bldg.bakery', tileId: 't1' }))
    expect(proj.isHydrated()).toBe(true)
    expect(proj.toJSON()).toEqual({ 'npc.baker': 'bldg.bakery' })
  })

  it('records BUILDING_LEAVE as null', () => {
    const proj = new BuildingOccupantsProjection()
    proj.project(makeEvent('BUILDING_ENTER', { npcId: 'npc.baker', buildingId: 'bldg.bakery', tileId: 't1' }, 1))
    proj.project(makeEvent('BUILDING_LEAVE', { npcId: 'npc.baker', buildingId: 'bldg.bakery', tileId: 't1' }, 2))
    expect(proj.toJSON()).toEqual({ 'npc.baker': null })
    expect(proj.isHydrated()).toBe(true)
  })

  it('tracks multiple NPCs independently', () => {
    const proj = new BuildingOccupantsProjection()
    proj.project(makeEvent('BUILDING_ENTER', { npcId: 'npc.baker', buildingId: 'bldg.bakery', tileId: 't1' }, 1))
    proj.project(makeEvent('BUILDING_ENTER', { npcId: 'npc.smith', buildingId: 'bldg.forge', tileId: 't2' }, 2))
    expect(proj.toJSON()).toEqual({ 'npc.baker': 'bldg.bakery', 'npc.smith': 'bldg.forge' })
  })

  it('ignores BUILDING_ENTER with empty buildingId', () => {
    const proj = new BuildingOccupantsProjection()
    proj.project(makeEvent('BUILDING_ENTER', { npcId: 'npc.baker', buildingId: '', tileId: 't1' }))
    expect(proj.isHydrated()).toBe(false)
    expect(proj.toJSON()).toEqual({})
  })

  it('ignores events with empty npcId', () => {
    const proj = new BuildingOccupantsProjection()
    proj.project(makeEvent('BUILDING_ENTER', { npcId: '', buildingId: 'bldg.bakery', tileId: 't1' }))
    expect(proj.isHydrated()).toBe(false)
  })

  it('ignores unrelated events', () => {
    const proj = new BuildingOccupantsProjection()
    proj.project(makeEvent('WEATHER_CHANGE', { from: 'clear', to: 'rain', narration: '...' }))
    expect(proj.isHydrated()).toBe(false)
    expect(proj.toJSON()).toEqual({})
  })

  it('rebuildFromEvents resets state', () => {
    const proj = new BuildingOccupantsProjection()
    proj.project(makeEvent('BUILDING_ENTER', { npcId: 'npc.baker', buildingId: 'bldg.bakery', tileId: 't1' }))
    proj.rebuildFromEvents([])
    expect(proj.isHydrated()).toBe(false)
    expect(proj.toJSON()).toEqual({})
  })

  it('rebuildFromEvents replays in sequence order', () => {
    const events: Event[] = [
      makeEvent('BUILDING_LEAVE', { npcId: 'npc.baker', buildingId: 'bldg.bakery', tileId: 't1' }, 2),
      makeEvent('BUILDING_ENTER', { npcId: 'npc.baker', buildingId: 'bldg.bakery', tileId: 't1' }, 1),
    ]
    const proj = new BuildingOccupantsProjection()
    proj.rebuildFromEvents(events)
    // sequence 1 ENTER then sequence 2 LEAVE → final state is null
    expect(proj.toJSON()).toEqual({ 'npc.baker': null })
  })

  it('BUILDING_ENTER then ENTER again updates to new building', () => {
    const proj = new BuildingOccupantsProjection()
    proj.project(makeEvent('BUILDING_ENTER', { npcId: 'npc.baker', buildingId: 'bldg.bakery', tileId: 't1' }, 1))
    proj.project(makeEvent('BUILDING_ENTER', { npcId: 'npc.baker', buildingId: 'bldg.market', tileId: 't2' }, 2))
    expect(proj.toJSON()).toEqual({ 'npc.baker': 'bldg.market' })
  })
})

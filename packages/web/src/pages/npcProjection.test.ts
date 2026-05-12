import { describe, expect, it } from 'vitest'
import { areaOutdoorNpcs, hubMapNpcs } from './npcProjection'
import type { NpcSummary } from '../state/types'

function npc(input: Partial<NpcSummary> & Pick<NpcSummary, 'id'>): NpcSummary {
  return {
    name: input.name ?? input.id,
    role: input.role ?? 'NPC',
    location: input.location ?? 't_central',
    relationshipScore: input.relationshipScore ?? 50,
    lastActedTick: input.lastActedTick ?? 0,
    internalState: input.internalState ?? {},
    ...input,
    id: input.id
  }
}

describe('NPC scene projections', () => {
  it('excludes travelling NPCs from area outdoor occupants', () => {
    const people = [
      npc({ id: 'local', activity: 'idle', buildingId: null, intentLine: { zh: '在中央待命', en: 'Standing by' } }),
      npc({
        id: 'traveller',
        activity: 'move',
        buildingId: null,
        travelRoute: {
          fromTile: 't_central',
          toTile: 't_dock',
          targetTile: 't_dock',
          startedAtTick: 12
        }
      }),
      npc({ id: 'inside', activity: 'work', buildingId: 'b_central_exchange' })
    ]

    expect(areaOutdoorNpcs(people, 't_central').map((p) => p.id)).toEqual(['local'])
  })

  it('maps outdoor NPCs to the hub overview', () => {
    const people = [
      npc({ id: 'local', activity: 'idle', buildingId: null, intentLine: { zh: '在中央待命', en: 'Standing by' } }),
      npc({
        id: 'traveller',
        activity: 'move',
        buildingId: null,
        travelRoute: {
          fromTile: 't_central',
          toTile: 't_dock',
          targetTile: 't_dock',
          startedAtTick: 12
        }
      }),
      npc({ id: 'inside-moving', activity: 'move', buildingId: 'b_central_exchange' })
    ]

    const hub = hubMapNpcs(people)

    expect(hub.map((p) => p.id)).toEqual(['local', 'traveller'])
    expect(hubMapNpcs(people, 'en').map((p) => p.id)).toEqual(['local', 'traveller'])
    expect(hub.find((p) => p.id === 'traveller')?.travelRoute).toEqual({
      fromDistrictId: 't_central',
      toDistrictId: 't_dock',
      targetDistrictId: 't_dock'
    })
  })

  it('keeps expansion-district travellers visible on the hub overview', () => {
    const people = [
      npc({
        id: 'builder',
        activity: 'move',
        buildingId: null,
        location: 't_salt_marsh',
        travelRoute: {
          fromTile: 't_dock',
          toTile: 't_salt_marsh',
          targetTile: 't_salt_marsh',
          startedAtTick: 24
        }
      })
    ]

    expect(hubMapNpcs(people).map((p) => p.id)).toEqual(['builder'])
    expect(hubMapNpcs(people)[0]?.travelRoute?.targetDistrictId).toBe('t_salt_marsh')
  })

  it('keeps arrived expansion-district NPCs visible on the hub overview', () => {
    const people = [
      npc({ id: 'builder', activity: 'work', buildingId: null, location: 't_salt_marsh' })
    ]

    expect(hubMapNpcs(people).map((p) => p.id)).toEqual(['builder'])
    expect(areaOutdoorNpcs(people, 't_salt_marsh').map((p) => p.id)).toEqual(['builder'])
  })

  it('keeps local outdoor NPCs visible on the hub and area maps', () => {
    const people = [
      npc({ id: 'local', activity: 'trade', buildingId: null, location: 't_central' })
    ]

    expect(areaOutdoorNpcs(people, 't_central').map((p) => p.id)).toEqual(['local'])
    expect(hubMapNpcs(people).map((p) => p.id)).toEqual(['local'])
  })
})

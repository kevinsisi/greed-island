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
      npc({ id: 'local', activity: 'idle', buildingId: null }),
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

  it('maps surface NPCs to hub overview sprites and keeps travel routes', () => {
    const people = [
      npc({ id: 'local', activity: 'idle', buildingId: null }),
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
    expect(hub[1]?.travelRoute).toEqual({
      fromDistrictId: 't_central',
      toDistrictId: 't_dock',
      targetDistrictId: 't_dock'
    })
  })
})

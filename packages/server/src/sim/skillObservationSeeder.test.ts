import { describe, expect, it } from 'vitest'
import { planSkillObservations } from './skillObservationSeeder.js'

const TICK = 100

function makeEvent(eventType: string, npcId?: string) {
  return {
    eventType,
    payload: { npcId: npcId ?? 'actor_npc', tileId: 'tile_1' },
    tick: TICK,
  }
}

describe('planSkillObservations', () => {
  it('maps ANIMAL_HUNT_RESOLVED to hunting skill', () => {
    const result = planSkillObservations(
      makeEvent('ANIMAL_HUNT_RESOLVED', 'actor'),
      'actor',
      ['obs_a', 'obs_b'],
      TICK,
    )
    expect(result).toHaveLength(2)
    for (const cmd of result) {
      const data = (cmd.payload as Record<string, unknown>)
      expect(data.skillId).toBe('hunting')
    }
  })

  it('maps FISHERY_HARVESTED to fishing skill', () => {
    const result = planSkillObservations(
      makeEvent('FISHERY_HARVESTED', 'actor'),
      'actor',
      ['obs_a'],
      TICK,
    )
    expect(result[0]?.payload).toMatchObject({ skillId: 'fishing' } as object)
  })

  it('maps BUILDING_CONSTRUCTED to construction skill', () => {
    const result = planSkillObservations(
      makeEvent('BUILDING_CONSTRUCTED', 'actor'),
      'actor',
      ['obs_a'],
      TICK,
    )
    expect(result[0]?.payload).toMatchObject({ skillId: 'construction' } as object)
  })

  it('excludes actor NPC from observers', () => {
    const result = planSkillObservations(
      makeEvent('ANIMAL_HUNT_RESOLVED', 'actor'),
      'actor',
      ['actor', 'obs_a', 'obs_b'],
      TICK,
    )
    const npcIds = result.map((cmd) => (cmd.payload as Record<string, unknown>).npcId)
    expect(npcIds).not.toContain('actor')
    expect(npcIds).toContain('obs_a')
    expect(npcIds).toContain('obs_b')
  })

  it('caps at 3 observers', () => {
    const result = planSkillObservations(
      makeEvent('ANIMAL_HUNT_RESOLVED', 'actor'),
      'actor',
      ['obs_1', 'obs_2', 'obs_3', 'obs_4', 'obs_5'],
      TICK,
    )
    expect(result).toHaveLength(3)
  })

  it('returns empty for unrecognised event type', () => {
    const result = planSkillObservations(
      makeEvent('WORLD_TICK'),
      null,
      ['obs_a'],
      TICK,
    )
    expect(result).toHaveLength(0)
  })

  it('returns empty when no observers after excluding actor', () => {
    const result = planSkillObservations(
      makeEvent('ANIMAL_HUNT_RESOLVED', 'actor'),
      'actor',
      ['actor'],
      TICK,
    )
    expect(result).toHaveLength(0)
  })
})

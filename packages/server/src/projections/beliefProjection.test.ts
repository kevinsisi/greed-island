import { describe, it, expect } from 'vitest'
import { BeliefProjection } from './beliefProjection.js'
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

describe('BeliefProjection', () => {
  it('getBeliefs returns empty array for unknown npc', () => {
    const proj = new BeliefProjection()
    expect(proj.getBeliefs('npc-x')).toEqual([])
  })

  it('FACTION_TILE_SEIZED on NPC tile → tile_safety dangerous, confidence 90, fear', () => {
    const proj = new BeliefProjection()
    const locs = new Map([['npc-a', 't_dock']])
    proj.apply(ev(10, 'FACTION_TILE_SEIZED', {
      tileId: 't_dock', factionId: 'guild', previousFactionId: null, seizedAtTick: 10, narration: 'x'
    }), locs)
    const beliefs = proj.getBeliefs('npc-a')
    expect(beliefs).toHaveLength(2) // tile_safety + faction_control
    const safety = beliefs.find(b => b.subject === 'tile_safety')!
    expect(safety.value).toBe('dangerous')
    expect(safety.confidence).toBe(90)
    expect(safety.emotionalTag).toBe('fear')
    expect(safety.qualifier).toBe('t_dock')
  })

  it('FACTION_TILE_SEIZED → faction_control belief', () => {
    const proj = new BeliefProjection()
    const locs = new Map([['npc-a', 't_dock']])
    proj.apply(ev(10, 'FACTION_TILE_SEIZED', {
      tileId: 't_dock', factionId: 'militia', previousFactionId: null, seizedAtTick: 10, narration: 'x'
    }), locs)
    const ctrl = proj.getBeliefs('npc-a').find(b => b.subject === 'faction_control')!
    expect(ctrl.value).toBe('controlled')
    expect(ctrl.qualifier).toBe('t_dock')
    expect(ctrl.confidence).toBe(90)
  })

  it('FACTION_TILE_SEIZED on adjacent tile → confidence 40', () => {
    const proj = new BeliefProjection()
    // npc-a is on t_central; t_dock is adjacent to t_central
    const locs = new Map([['npc-a', 't_central']])
    proj.apply(ev(10, 'FACTION_TILE_SEIZED', {
      tileId: 't_dock', factionId: 'guild', previousFactionId: null, seizedAtTick: 10, narration: 'x'
    }), locs)
    const safety = proj.getBeliefs('npc-a').find(b => b.subject === 'tile_safety')!
    expect(safety.confidence).toBe(40)
  })

  it('FACTION_TILE_SEIZED on non-adjacent tile → no belief written', () => {
    const proj = new BeliefProjection()
    // npc-a is on t_mountain; t_dock is NOT adjacent to t_mountain
    const locs = new Map([['npc-a', 't_mountain']])
    proj.apply(ev(10, 'FACTION_TILE_SEIZED', {
      tileId: 't_dock', factionId: 'guild', previousFactionId: null, seizedAtTick: 10, narration: 'x'
    }), locs)
    expect(proj.getBeliefs('npc-a')).toHaveLength(0)
  })

  it('FACTION_TILE_SEIZED with NPC not in locations map → no belief', () => {
    const proj = new BeliefProjection()
    const locs = new Map<string, string>() // empty
    proj.apply(ev(10, 'FACTION_TILE_SEIZED', {
      tileId: 't_dock', factionId: 'guild', previousFactionId: null, seizedAtTick: 10, narration: 'x'
    }), locs)
    expect(proj.getBeliefs('npc-any')).toHaveLength(0)
  })

  it('ANIMAL_ATTACKED_NPC on NPC tile → tile_safety dangerous, confidence 90', () => {
    const proj = new BeliefProjection()
    const locs = new Map([['npc-b', 't_forest']])
    proj.apply(ev(20, 'ANIMAL_ATTACKED_NPC', {
      attackId: 'atk-1', animalId: 'wolf-1', speciesId: 'fog_wolf',
      npcId: 'npc-b', tileId: 't_forest', attackedAtTick: 20,
      damage: { mood: -10, health: -15 }, narration: 'attacked'
    }), locs)
    const safety = proj.getBeliefs('npc-b').find(b => b.subject === 'tile_safety')!
    expect(safety).toBeDefined()
    expect(safety.value).toBe('dangerous')
    expect(safety.confidence).toBe(90)
    expect(safety.emotionalTag).toBe('fear')
  })

  it('ANIMAL_ATTACKED_NPC: bystander NPC on same tile also gets belief', () => {
    const proj = new BeliefProjection()
    // npc-b is the victim; npc-c is also on t_forest
    const locs = new Map([['npc-b', 't_forest'], ['npc-c', 't_forest']])
    proj.apply(ev(20, 'ANIMAL_ATTACKED_NPC', {
      attackId: 'atk-1', animalId: 'wolf-1', speciesId: 'fog_wolf',
      npcId: 'npc-b', tileId: 't_forest', attackedAtTick: 20,
      damage: { mood: -10, health: -15 }, narration: 'attacked'
    }), locs)
    expect(proj.getBeliefs('npc-c').find(b => b.subject === 'tile_safety')).toBeDefined()
  })

  it('ANIMAL_ATTACKED_NPC: NPC on adjacent tile gets confidence 40', () => {
    const proj = new BeliefProjection()
    // npc-d is on t_central; t_forest is adjacent to t_central
    const locs = new Map([['npc-d', 't_central']])
    proj.apply(ev(20, 'ANIMAL_ATTACKED_NPC', {
      attackId: 'atk-1', animalId: 'wolf-1', speciesId: 'fog_wolf',
      npcId: 'npc-x', tileId: 't_forest', attackedAtTick: 20,
      damage: { mood: -10, health: -15 }, narration: 'attacked'
    }), locs)
    const safety = proj.getBeliefs('npc-d').find(b => b.subject === 'tile_safety')!
    expect(safety.confidence).toBe(40)
  })
})

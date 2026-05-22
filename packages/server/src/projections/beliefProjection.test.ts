import { describe, it, expect } from 'vitest'
import { BeliefProjection, formatBeliefContext } from './beliefProjection.js'
import type { BeliefRow } from './beliefProjection.js'
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

  it('GOODS_CONSUMED fish on NPC tile → goods_scarcity scarce, confidence 80', () => {
    const proj = new BeliefProjection()
    const locs = new Map([['npc-e', 't_dock']])
    proj.apply(ev(30, 'GOODS_CONSUMED', {
      goodsId: 'fish', quantity: 10,
      holderType: 'settlement', holderId: 'settlement-dock', tileId: 't_dock',
      consumedAtTick: 30, narration: 'consumed'
    }), locs)
    const scarcity = proj.getBeliefs('npc-e').find(b => b.subject === 'goods_scarcity')!
    expect(scarcity).toBeDefined()
    expect(scarcity.value).toBe('scarce')
    expect(scarcity.qualifier).toBe('fish')
    expect(scarcity.confidence).toBe(80)
    expect(scarcity.emotionalTag).toBe('worry')
  })

  it('GOODS_CONSUMED non-food goods → no belief', () => {
    const proj = new BeliefProjection()
    const locs = new Map([['npc-f', 't_dock']])
    proj.apply(ev(30, 'GOODS_CONSUMED', {
      goodsId: 'refined_salt', quantity: 5,
      holderType: 'settlement', holderId: 'settlement-dock', tileId: 't_dock',
      consumedAtTick: 30, narration: 'consumed'
    }), locs)
    expect(proj.getBeliefs('npc-f')).toHaveLength(0)
  })

  it('GOODS_CONSUMED on adjacent tile → confidence 35', () => {
    const proj = new BeliefProjection()
    // npc-g on t_central; t_dock is adjacent to t_central
    const locs = new Map([['npc-g', 't_central']])
    proj.apply(ev(30, 'GOODS_CONSUMED', {
      goodsId: 'meat', quantity: 3,
      holderType: 'npc', holderId: 'npc-x', tileId: 't_dock',
      consumedAtTick: 30, narration: 'consumed'
    }), locs)
    const scarcity = proj.getBeliefs('npc-g').find(b => b.subject === 'goods_scarcity')!
    expect(scarcity.confidence).toBe(35)
  })

  it('tick() decays confidence by decayRatePerDay per 24 ticks', () => {
    const proj = new BeliefProjection()
    const locs = new Map([['npc-a', 't_dock']])
    proj.apply(ev(100, 'FACTION_TILE_SEIZED', {
      tileId: 't_dock', factionId: 'guild', previousFactionId: null,
      seizedAtTick: 100, narration: 'x'
    }), locs)
    // tile_safety: decayRatePerDay=2 → after 1 day (24 ticks) confidence drops by 2
    proj.tick(124) // 24 ticks later (observedAtTick=100, so daysPassed=1)
    const safety = proj.getBeliefs('npc-a').find(b => b.subject === 'tile_safety')!
    expect(safety.confidence).toBe(88) // 90 - 2
  })

  it('tick() removes rows when confidence reaches 0', () => {
    const proj = new BeliefProjection()
    const locs = new Map([['npc-a', 't_dock']])
    proj.apply(ev(0, 'FACTION_TILE_SEIZED', {
      tileId: 't_dock', factionId: 'guild', previousFactionId: null,
      seizedAtTick: 0, narration: 'x'
    }), locs)
    // tile_safety: confidence=90, decayRatePerDay=2 → 45 days × 2 = 90 → hits 0
    proj.tick(45 * 24)
    expect(proj.getBeliefs('npc-a').find(b => b.subject === 'tile_safety')).toBeUndefined()
  })

  it('second event on same subject replaces row (latest wins)', () => {
    const proj = new BeliefProjection()
    const locs = new Map([['npc-a', 't_dock']])
    proj.apply(ev(10, 'FACTION_TILE_SEIZED', {
      tileId: 't_dock', factionId: 'guild', previousFactionId: null,
      seizedAtTick: 10, narration: 'x'
    }), locs)
    proj.apply(ev(50, 'FACTION_TILE_SEIZED', {
      tileId: 't_dock', factionId: 'militia', previousFactionId: 'guild',
      seizedAtTick: 50, narration: 'x'
    }), locs)
    const allSafety = proj.getBeliefs('npc-a').filter(b => b.subject === 'tile_safety')
    // still just one row (not two)
    expect(allSafety).toHaveLength(1)
    expect(allSafety[0]!.observedAtTick).toBe(50)
  })

  it('updateEcosystemBeliefs: densityPct < 0.20 on NPC tile → ecosystem_health depleted', () => {
    const proj = new BeliefProjection()
    const locs = new Map([['npc-h', 't_forest']])
    proj.updateEcosystemBeliefs('t_forest', 0.15, 500, locs)
    const eco = proj.getBeliefs('npc-h').find(b => b.subject === 'ecosystem_health')!
    expect(eco).toBeDefined()
    expect(eco.value).toBe('depleted')
    expect(eco.qualifier).toBe('t_forest')
    expect(eco.confidence).toBe(70)
    expect(eco.emotionalTag).toBe('anger')
  })

  it('updateEcosystemBeliefs: densityPct >= 0.20 → no belief', () => {
    const proj = new BeliefProjection()
    const locs = new Map([['npc-h', 't_forest']])
    proj.updateEcosystemBeliefs('t_forest', 0.50, 500, locs)
    expect(proj.getBeliefs('npc-h').find(b => b.subject === 'ecosystem_health')).toBeUndefined()
  })

  it('formatBeliefContext: empty rows → empty string', () => {
    expect(formatBeliefContext([], 0)).toBe('')
  })

  it('formatBeliefContext: confidence ≥70 → direct statement (no hedge)', () => {
    const rows: BeliefRow[] = [{
      npcId: 'npc-x', subject: 'tile_safety', qualifier: 't_dock',
      value: 'dangerous', confidence: 85, observedAtTick: 0,
      decayRatePerDay: 2, emotionalTag: 'fear'
    }]
    const out = formatBeliefContext(rows, 0)
    expect(out).toContain('危險')
    expect(out).not.toContain('聽說')
    expect(out).not.toContain('也許')
  })

  it('formatBeliefContext: confidence 40–69 → 「我聽說」hedge', () => {
    const rows: BeliefRow[] = [{
      npcId: 'npc-x', subject: 'tile_safety', qualifier: 't_dock',
      value: 'dangerous', confidence: 50, observedAtTick: 0,
      decayRatePerDay: 2,
    }]
    const out = formatBeliefContext(rows, 0)
    expect(out).toContain('聽說')
  })

  it('formatBeliefContext: confidence <40 → 「也許」hedge', () => {
    const rows: BeliefRow[] = [{
      npcId: 'npc-x', subject: 'goods_scarcity', qualifier: 'fish',
      value: 'scarce', confidence: 20, observedAtTick: 0,
      decayRatePerDay: 4,
    }]
    const out = formatBeliefContext(rows, 0)
    expect(out).toContain('也許')
  })
})

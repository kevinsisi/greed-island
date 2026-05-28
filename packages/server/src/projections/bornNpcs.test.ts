import { describe, expect, it } from 'vitest'
import { BornNpcsProjection, deriveProfile } from './bornNpcs.js'
import type { Event } from '../kernel/types.js'

function bornEvent(childId: string, householdId: string, tick: number, nameZh = 'X', nameEn = 'Y'): Event {
  return {
    sequence: tick,
    eventId: `e_${tick}_${childId}`,
    eventType: 'NPC_CHILD_BORN',
    actorId: childId,
    commandId: `cmd_${tick}`,
    occurredAt: 0,
    tick,
    rulesetVersion: 'test',
    version: 1,
    deterministicKey: '',
    payload: {
      data: { childId, householdId, nameZh, nameEn, narration: '' },
      actorType: 'system',
      narration: '',
    },
  } as unknown as Event
}

function maturedEvent(
  npcId: string,
  householdId: string,
  parentNpcIds: readonly string[],
  homeTileId: string,
  tick: number,
  bornAtTick: number,
  nameZh = 'X',
  nameEn = 'Y'
): Event {
  return {
    sequence: tick,
    eventId: `e_${tick}_${npcId}`,
    eventType: 'NPC_MATURED',
    actorId: npcId,
    commandId: `cmd_${tick}`,
    occurredAt: 0,
    tick,
    rulesetVersion: 'test',
    version: 1,
    deterministicKey: '',
    payload: {
      data: {
        npcId,
        maturedAtTick: tick,
        bornAtTick,
        householdId,
        parentNpcIds,
        homeTileId,
        nameZh,
        nameEn,
        narration: '',
      },
      actorType: 'system',
      narration: '',
    },
  } as unknown as Event
}

describe('BornNpcsProjection', () => {
  it('records born candidate but does not expose profile until matured', () => {
    const p = new BornNpcsProjection(new Set())
    p.project(bornEvent('household.a.b.child.1', 'household.a.b', 100))
    expect(p.listMaturedProfiles()).toHaveLength(0)
    expect(p.isMatured('household.a.b.child.1')).toBe(false)
    expect(p.listCandidates()).toHaveLength(1)
  })

  it('NPC_MATURED produces a derived profile', () => {
    const p = new BornNpcsProjection(new Set())
    p.project(bornEvent('household.a.b.child.1', 'household.a.b', 100, '潮安', 'Tideanne'))
    p.project(maturedEvent('household.a.b.child.1', 'household.a.b', ['a', 'b'], 't_central', 17_380, 100, '潮安', 'Tideanne'))
    expect(p.isMatured('household.a.b.child.1')).toBe(true)
    const profiles = p.listMaturedProfiles()
    expect(profiles).toHaveLength(1)
    expect(profiles[0]!.id).toBe('household.a.b.child.1')
    expect(profiles[0]!.name.zh).toBe('潮安')
    expect(profiles[0]!.name.en).toBe('Tideanne')
    expect(profiles[0]!.defaultLocation).toBe('t_central')
  })

  it('listCandidates excludes already-matured', () => {
    const p = new BornNpcsProjection(new Set())
    p.project(bornEvent('c1', 'h1', 100))
    p.project(bornEvent('c2', 'h2', 110))
    p.project(maturedEvent('c1', 'h1', ['a', 'b'], 't_central', 200, 100))
    const cand = p.listCandidates()
    expect(cand.map((c) => c.childId)).toEqual(['c2'])
  })

  it('rebuildFromEvents reconstructs identical state', () => {
    const evs: Event[] = [
      bornEvent('household.a.b.child.1', 'household.a.b', 100),
      bornEvent('household.x.y.child.1', 'household.x.y', 110),
      maturedEvent('household.a.b.child.1', 'household.a.b', ['a', 'b'], 't_central', 200, 100),
    ]
    const p = new BornNpcsProjection(new Set())
    p.rebuildFromEvents(evs)
    expect(p.maturedCount()).toBe(1)
    expect(p.isMatured('household.a.b.child.1')).toBe(true)
    expect(p.isMatured('household.x.y.child.1')).toBe(false)
  })

  it('collision with config profile id throws', () => {
    const p = new BornNpcsProjection(new Set(['config_npc_x']))
    expect(() => p.project(maturedEvent('config_npc_x', 'h', ['a', 'b'], 't_central', 200, 100))).toThrow()
  })

  it('NPC_MATURED is idempotent (second event for same id ignored)', () => {
    const p = new BornNpcsProjection(new Set())
    p.project(bornEvent('c', 'h', 100))
    p.project(maturedEvent('c', 'h', ['a', 'b'], 't_central', 200, 100, 'First', 'First'))
    p.project(maturedEvent('c', 'h', ['a', 'b'], 't_central', 300, 100, 'Second', 'Second'))
    expect(p.getProfile('c')?.name.zh).toBe('First')
  })

  it('parent ids are recorded and queryable', () => {
    const p = new BornNpcsProjection(new Set())
    p.project(maturedEvent('c', 'h', ['alice', 'bob'], 't_central', 200, 100))
    expect(p.getParentNpcIds('c')).toEqual(['alice', 'bob'])
    expect(p.getParentNpcIds('unknown')).toEqual([])
  })
})

describe('deriveProfile', () => {
  it('is deterministic across calls', () => {
    const a = deriveProfile({ npcId: 'household.alice.bob.child.1', householdId: 'household.alice.bob', homeTileId: 't_dock', nameZh: 'X', nameEn: 'Y' })
    const b = deriveProfile({ npcId: 'household.alice.bob.child.1', householdId: 'household.alice.bob', homeTileId: 't_dock', nameZh: 'X', nameEn: 'Y' })
    expect(a).toEqual(b)
  })

  it('different npcIds usually produce different archetypes', () => {
    const archetypes = new Set<unknown>()
    for (let i = 0; i < 20; i++) {
      const prof = deriveProfile({ npcId: `c_${i}`, householdId: 'h', homeTileId: 't_central', nameZh: 'X', nameEn: 'Y' })
      archetypes.add(prof.personality.archetype)
    }
    expect(archetypes.size).toBeGreaterThanOrEqual(2)
  })

  it('defaultLocation matches homeTileId', () => {
    const prof = deriveProfile({ npcId: 'c', householdId: 'h', homeTileId: 't_dock', nameZh: 'X', nameEn: 'Y' })
    expect(prof.defaultLocation).toBe('t_dock')
  })

  it('routine has at least 3 slots covering tick-of-day range', () => {
    const prof = deriveProfile({ npcId: 'c', householdId: 'h', homeTileId: 't_central', nameZh: 'X', nameEn: 'Y' })
    expect(prof.routine.length).toBeGreaterThanOrEqual(3)
  })
})

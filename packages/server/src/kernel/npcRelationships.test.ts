import { describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import {
  SqliteNpcRelationshipsStore,
  resolveRelationshipType,
  DEFAULT_DIMENSIONS,
} from './npcRelationships.js'
import type { Event } from './types.js'

function makeEvent(eventType: string, data: Record<string, unknown>, tick: number, actorId = 'actor'): Event {
  return {
    sequence: tick,
    eventId: `e_${tick}`,
    eventType,
    actorId,
    commandId: `cmd_${tick}`,
    occurredAt: 0,
    tick,
    rulesetVersion: 'test',
    version: 1,
    deterministicKey: '',
    payload: { data, actorType: 'system', narration: '' },
  } as unknown as Event
}

describe('SqliteNpcRelationshipsStore — multi-dim', () => {
  function setup() {
    const db = new Database(':memory:')
    const store = new SqliteNpcRelationshipsStore(db)
    return { db, store }
  }

  it('NPC_INTERACT chat: trust +1, familiarity +1, resentment -1 (both directions)', () => {
    const { store } = setup()
    store.project(makeEvent('NPC_INTERACT', {
      participants: ['alice', 'bob'],
      mode: 'chat',
      tile: 't_central',
    }, 100))
    const row = store.read('alice', 'bob')
    expect(row).not.toBeNull()
    expect(row!.dimensions.aToB.trust).toBe(51)
    expect(row!.dimensions.bToA.trust).toBe(51)
    expect(row!.dimensions.aToB.familiarity).toBe(1)
    expect(row!.dimensions.aToB.resentment).toBe(49)
    expect(row!.trust).toBe(51) // backcompat field equals aToB.trust
  })

  it('NPC_INTERACT argue: trust -2, resentment +2', () => {
    const { store } = setup()
    store.project(makeEvent('NPC_INTERACT', {
      participants: ['alice', 'bob'],
      mode: 'argue',
      tile: 't_central',
    }, 100))
    const row = store.read('alice', 'bob')!
    expect(row.dimensions.aToB.trust).toBe(48)
    expect(row.dimensions.aToB.resentment).toBe(52)
  })

  it('NPC_HOUSEHOLD_FORMED boosts attraction/dependency/familiarity/trust symmetrically', () => {
    const { store } = setup()
    store.project(makeEvent('NPC_HOUSEHOLD_FORMED', {
      partnerNpcIds: ['alice', 'bob'],
      householdId: 'h1',
      homeTileId: 't_central',
    }, 100))
    const row = store.read('alice', 'bob')!
    expect(row.dimensions.aToB.attraction).toBe(80)
    expect(row.dimensions.aToB.dependency).toBe(70)
    expect(row.dimensions.aToB.familiarity).toBe(20)
    expect(row.dimensions.aToB.trust).toBe(55)
    expect(row.dimensions.bToA.attraction).toBe(80)
  })

  it('NPC_MENTORSHIP_COMPLETED is asymmetric: apprentice→mentor respect/loyalty; mentor→apprentice attraction/respect', () => {
    const { store } = setup()
    // mentor = 'bob', apprentice = 'alice' → canonical pair = (alice, bob)
    // a→b is alice→bob (apprentice→mentor)
    store.project(makeEvent('NPC_MENTORSHIP_COMPLETED', {
      mentorNpcId: 'bob',
      apprenticeNpcId: 'alice',
      skillKey: 'fishing',
      narration: 'x',
    }, 100))
    const row = store.read('alice', 'bob')!
    // alice (apprentice) → bob (mentor) — should get respect+20 loyalty+15
    expect(row.dimensions.aToB.respect).toBe(70)
    expect(row.dimensions.aToB.loyalty).toBe(65)
    // bob (mentor) → alice (apprentice) — should get attraction+10 respect+5
    expect(row.dimensions.bToA.attraction).toBe(60)
    expect(row.dimensions.bToA.respect).toBe(55)
  })

  it('NPC_DECEASED: respect+10 fear-20 for survivors who already respected victim', () => {
    const { store } = setup()
    // First set up: alice respects bob (alice→bob.respect = 70 via direct adjust)
    store.project(makeEvent('NPC_RELATIONSHIP_DIMENSION_ADJUSTED', {
      from: 'alice', to: 'bob', dimension: 'respect', delta: 20, reason: 'history', narration: '',
    }, 50))
    const before = store.readDirectional('alice', 'bob')!
    expect(before.respect).toBe(70)
    // Now bob dies
    store.project(makeEvent('NPC_DECEASED', {
      npcId: 'bob', tileId: 't_central', householdId: 'h1', deceasedAtTick: 100,
    }, 100))
    const after = store.readDirectional('alice', 'bob')!
    expect(after.respect).toBe(80)
    expect(after.fear).toBe(30)
  })

  it('NPC_DECEASED ignores survivors who did NOT respect victim (< 60)', () => {
    const { store } = setup()
    store.project(makeEvent('NPC_INTERACT', {
      participants: ['alice', 'bob'], mode: 'chat', tile: 't_central',
    }, 50))
    // respect stays at 50 (no event raised it)
    store.project(makeEvent('NPC_DECEASED', {
      npcId: 'bob', tileId: 't_central', householdId: 'h1', deceasedAtTick: 100,
    }, 100))
    const after = store.readDirectional('alice', 'bob')!
    expect(after.respect).toBe(50) // unchanged
  })

  it('NPC_RELATIONSHIP_DIMENSION_ADJUSTED applies single-dim delta with clamp', () => {
    const { store } = setup()
    store.project(makeEvent('NPC_RELATIONSHIP_DIMENSION_ADJUSTED', {
      from: 'alice', to: 'bob', dimension: 'fear', delta: 60, reason: 'test', narration: '',
    }, 100))
    expect(store.readDirectional('alice', 'bob')!.fear).toBe(100) // 50 + 60 clamped to 100
    expect(store.readDirectional('bob', 'alice')!.fear).toBe(50)  // unchanged
  })

  it('rebuildFromEvents reconstructs identical state', () => {
    const events = [
      makeEvent('NPC_INTERACT', { participants: ['alice', 'bob'], mode: 'chat', tile: 't_central' }, 100),
      makeEvent('NPC_HOUSEHOLD_FORMED', { partnerNpcIds: ['alice', 'bob'], householdId: 'h1', homeTileId: 't_central' }, 110),
      makeEvent('NPC_INTERACT', { participants: ['alice', 'bob'], mode: 'argue', tile: 't_dock' }, 120),
    ]
    const { store: s1 } = setup()
    for (const e of events) s1.project(e)
    const hashA = s1.canonicalHash()
    const { store: s2 } = setup()
    s2.rebuildFromEvents(events)
    expect(s2.canonicalHash()).toBe(hashA)
  })

  it('top-level trust column tracks dimensions.aToB.trust', () => {
    const { db, store } = setup()
    store.project(makeEvent('NPC_INTERACT', {
      participants: ['alice', 'bob'], mode: 'chat', tile: 't_central',
    }, 100))
    const raw = db.prepare(`SELECT trust FROM npc_relationships`).get() as { trust: number }
    expect(raw.trust).toBe(51)
  })
})

describe('resolveRelationshipType', () => {
  it('high attraction + high trust → lover', () => {
    const t = resolveRelationshipType({
      dims: { ...DEFAULT_DIMENSIONS, attraction: 75, trust: 65 },
      isApprenticeOf: false,
      isMentorOf: false,
    })
    expect(t).toBe('lover')
  })

  it('high fear → feared (even with high trust)', () => {
    const t = resolveRelationshipType({
      dims: { ...DEFAULT_DIMENSIONS, fear: 80, trust: 80 },
      isApprenticeOf: false,
      isMentorOf: false,
    })
    expect(t).toBe('feared')
  })

  it('apprentice link + high respect → apprentice', () => {
    const t = resolveRelationshipType({
      dims: { ...DEFAULT_DIMENSIONS, respect: 80, loyalty: 70, fear: 20 },
      isApprenticeOf: true,
      isMentorOf: false,
    })
    expect(t).toBe('apprentice')
  })

  it('high resentment → rival', () => {
    const t = resolveRelationshipType({
      dims: { ...DEFAULT_DIMENSIONS, resentment: 70 },
      isApprenticeOf: false,
      isMentorOf: false,
    })
    expect(t).toBe('rival')
  })

  it('defaults → neutral', () => {
    const t = resolveRelationshipType({
      dims: DEFAULT_DIMENSIONS,
      isApprenticeOf: false,
      isMentorOf: false,
    })
    expect(t).toBe('neutral')
  })

  it('high trust + respect (no extreme emotion) → friend', () => {
    const t = resolveRelationshipType({
      dims: { ...DEFAULT_DIMENSIONS, trust: 75, respect: 55 },
      isApprenticeOf: false,
      isMentorOf: false,
    })
    expect(t).toBe('friend')
  })
})

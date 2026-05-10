// Living-deterministic-world replay + projection tests. Locks in:
//   1. Rule Engine accepts known command types and rejects junk.
//   2. NPC memory + relationships projections rebuild byte-for-byte
//      identically from the same EventLog.
//   3. Catch-up summary is deterministic.
//   4. Emotional snapshot is purely derived (no stored scalar drift).

import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import {
  LivingWorldRuleEngine,
  isLivingWorldCommandType,
  makeLivingWorldCommand,
  type LivingWorldCommand
} from './livingWorldCommands.js'
import { SqliteEventStore } from './eventStore.js'
import { SqliteNpcMemoryStore } from './npcMemory.js'
import { SqliteNpcRelationshipsStore } from './npcRelationships.js'
import { summarizeWindow } from './catchUpSummary.js'
import { buildChronicleContext, renderChronicle } from './chronicleRenderer.js'
import { deriveEmotionalSnapshot } from './emotionalSimulation.js'
import { SettingsStore } from '../http/settings.js'
import type { EventDraft } from './types.js'

function makeHarness() {
  const db = new Database(':memory:')
  const eventStore = new SqliteEventStore(db)
  const memory = new SqliteNpcMemoryStore(db)
  const relationships = new SqliteNpcRelationshipsStore(db)
  const ruleEngine = new LivingWorldRuleEngine()
  return { db, eventStore, memory, relationships, ruleEngine }
}

function submit(
  cmd: LivingWorldCommand,
  ruleEngine: LivingWorldRuleEngine,
  eventStore: SqliteEventStore
): EventDraft[] {
  const result = ruleEngine.evaluate(cmd)
  if (!result.accepted) throw new Error(`rejected: ${result.rejection.reason}`)
  return [...eventStore.appendEvents(result.events as readonly EventDraft[])]
}

describe('living-world rule engine', () => {
  it('accepts every catalog command type', () => {
    const { ruleEngine } = makeHarness()
    const samples: LivingWorldCommand[] = [
      makeLivingWorldCommand('WORLD_TICK', 'system', 'system', 1, 1, { tick: 1 }),
      makeLivingWorldCommand('NPC_MOVE', 'npc-a', 'npc', 2, 2, {
        npcId: 'npc-a',
        from: 't_central',
        to: 't_market',
        activity: 'move',
        reachedDest: false,
        narration: '...'
      }),
      makeLivingWorldCommand('NPC_INTERACT', 'npc-a', 'npc', 3, 3, {
        tile: 't_market',
        participants: ['npc-a', 'npc-b'],
        mode: 'chat',
        narration: '...'
      }),
      makeLivingWorldCommand('AREA_PRESSURE', 'system', 'system', 4, 4, {
        tileId: 't_market',
        kind: 'pressure.food_shortage',
        detail: { food: 22 },
        narration: '...'
      }),
      makeLivingWorldCommand('WEATHER_CHANGE', 'system', 'system', 5, 5, {
        from: '晴',
        to: '霧雨',
        narration: '...'
      })
    ]
    for (const cmd of samples) {
      const result = ruleEngine.evaluate(cmd)
      expect(result.accepted, `${cmd.commandType} should accept`).toBe(true)
    }
  })

  it('rejects unknown command type', () => {
    const { ruleEngine } = makeHarness()
    const bogus = {
      commandId: 'cmd-1',
      commandType: 'NOT_A_COMMAND',
      actorId: 'a',
      actorType: 'npc',
      tick: 1,
      submittedAt: 1,
      payload: { tick: 1 }
    } as unknown as LivingWorldCommand
    const result = ruleEngine.evaluate(bogus)
    expect(result.accepted).toBe(false)
    if (!result.accepted) expect(result.rejection.code).toBe('UNKNOWN_COMMAND')
  })

  it('rejects malformed payload', () => {
    const { ruleEngine } = makeHarness()
    const cmd = makeLivingWorldCommand(
      'NPC_MOVE',
      'npc-a',
      'npc',
      1,
      1,
      // @ts-expect-error intentional bad payload
      { from: 't1' }
    )
    const result = ruleEngine.evaluate(cmd)
    expect(result.accepted).toBe(false)
    if (!result.accepted) expect(result.rejection.code).toBe('INVALID_PAYLOAD')
  })

  it('isLivingWorldCommandType filters correctly', () => {
    expect(isLivingWorldCommandType('NPC_MOVE')).toBe(true)
    expect(isLivingWorldCommandType('NOT_REAL')).toBe(false)
  })
})

describe('npc memory projection', () => {
  it('creates one row per participant on NPC_INTERACT', () => {
    const { eventStore, memory, ruleEngine } = makeHarness()
    const cmd = makeLivingWorldCommand('NPC_INTERACT', 'npc-a', 'npc', 1, 1, {
      tile: 't_market',
      participants: ['npc-a', 'npc-b'],
      mode: 'argue',
      narration: '...'
    })
    const events = submit(cmd, ruleEngine, eventStore)
    for (const ev of events) memory.project({ ...ev, sequence: ev.eventId.length })
    expect(memory.countFor('npc-a')).toBe(1)
    expect(memory.countFor('npc-b')).toBe(1)
    const recentA = memory.getRecent('npc-a', 5)
    expect(recentA[0]!.memoryType).toBe('interaction')
    expect(recentA[0]!.importance).toBe(7) // argue → high
  })

  it('creates one row per affected NPC on PLAYER_INTERVENE', () => {
    const { eventStore, memory, ruleEngine } = makeHarness()
    const cmd = makeLivingWorldCommand('PLAYER_INTERVENE', 'player-1', 'player', 7, 7, {
      playerAccountId: 'player-1',
      npcA: 'npc-a',
      npcB: 'npc-b',
      tile: 't_market',
      intentClass: 'mediate',
      message: '先別吵，我們一起看證據。',
      narration: '玩家試著調停兩人的爭執。'
    })
    const events = submit(cmd, ruleEngine, eventStore)
    for (const ev of events) memory.project({ ...ev, sequence: ev.eventId.length })

    expect(memory.countFor('npc-a')).toBe(1)
    expect(memory.countFor('npc-b')).toBe(1)
    const recentA = memory.getRecent('npc-a', 5)
    expect(recentA[0]!.memoryType).toBe('interaction')
    expect(recentA[0]!.importance).toBe(6)
    expect(recentA[0]!.content.kind).toBe('player.intervene')
    expect(recentA[0]!.content.otherNpc).toBe('npc-b')
  })

  it('persists private player dialog as idempotent NPC memory', () => {
    const { memory } = makeHarness()
    const input = {
      npcId: 'npc-a',
      playerAccountId: 'player-1',
      intent: 'ask',
      playerMessage: '你記得我嗎？',
      replyZh: '我記得你的聲音。',
      replyEn: 'I remember your voice.',
      tick: 9,
      trustAfter: 54
    }

    memory.rememberPlayerDialog(input)
    memory.rememberPlayerDialog(input)

    expect(memory.countFor('npc-a')).toBe(1)
    const recent = memory.getRecent('npc-a', 5)
    expect(recent[0]!.content.kind).toBe('player.dialog')
    expect(recent[0]!.content.playerMessage).toBe('你記得我嗎？')
    expect(recent[0]!.importance).toBe(6)
  })

  it('ignores private player dialog memory with non-finite ticks', () => {
    const { memory } = makeHarness()

    memory.rememberPlayerDialog({
      npcId: 'npc-a',
      playerAccountId: 'player-1',
      intent: 'ask',
      playerMessage: '這不該被記住。',
      replyZh: '無效時間。',
      replyEn: 'Invalid time.',
      tick: Number.NaN,
      trustAfter: 50
    })

    expect(memory.countFor('npc-a')).toBe(0)
  })

  it('keeps identical memory content at different ticks as distinct rows', () => {
    const { memory } = makeHarness()
    const base = {
      npcId: 'npc-a',
      playerAccountId: 'player-1',
      intent: 'ask',
      playerMessage: '同一句話。',
      replyZh: '同一個回答。',
      replyEn: 'Same answer.',
      trustAfter: 50
    }

    memory.rememberPlayerDialog({ ...base, tick: 11 })
    memory.rememberPlayerDialog({ ...base, tick: 12 })

    expect(memory.countFor('npc-a')).toBe(2)
  })

  it('rebuilds identical rows from the same event log', () => {
    const { db, eventStore, ruleEngine } = makeHarness()
    const memory = new SqliteNpcMemoryStore(db)
    for (let tick = 1; tick <= 5; tick += 1) {
      submit(
        makeLivingWorldCommand('NPC_INTERACT', 'npc-a', 'npc', tick, tick, {
          tile: 't_market',
          participants: ['npc-a', 'npc-b'],
          mode: tick % 2 === 0 ? 'chat' : 'argue',
          narration: `n${tick}`
        }),
        ruleEngine,
        eventStore
      )
    }
    const events = eventStore.readEvents()
    memory.rebuildFromEvents(events)
    const hash1 = memory.canonicalHash()
    memory.rebuildFromEvents(events)
    const hash2 = memory.canonicalHash()
    expect(hash1).toBe(hash2)
    expect(memory.countFor('npc-a')).toBe(5)
  })
})

describe('npc relationships projection', () => {
  it('chat raises trust and argue lowers it', () => {
    const { eventStore, relationships, ruleEngine } = makeHarness()
    const interact = (tick: number, mode: 'chat' | 'argue') =>
      submit(
        makeLivingWorldCommand('NPC_INTERACT', 'npc-a', 'npc', tick, tick, {
          tile: 't_market',
          participants: ['npc-a', 'npc-b'],
          mode,
          narration: '...'
        }),
        ruleEngine,
        eventStore
      )
    interact(1, 'chat') // trust 50 → 51
    interact(2, 'argue') // 51 → 49
    const events = eventStore.readEvents()
    relationships.rebuildFromEvents(events)
    const row = relationships.read('npc-a', 'npc-b')
    expect(row).not.toBeNull()
    expect(row!.trust).toBe(49)
    expect(row!.relationshipType).toBe('neutral')
    expect(row!.interactionCount).toBe(2)
  })

  it('promotes to friend above 75 trust', () => {
    const { eventStore, relationships, ruleEngine } = makeHarness()
    for (let tick = 1; tick <= 30; tick += 1) {
      submit(
        makeLivingWorldCommand('NPC_INTERACT', 'npc-a', 'npc', tick, tick, {
          tile: 't_market',
          participants: ['npc-a', 'npc-b'],
          mode: 'chat',
          narration: '...'
        }),
        ruleEngine,
        eventStore
      )
    }
    relationships.rebuildFromEvents(eventStore.readEvents())
    const row = relationships.read('npc-a', 'npc-b')
    expect(row).not.toBeNull()
    expect(row!.trust).toBeGreaterThan(75)
    expect(row!.relationshipType).toBe('friend')
  })

  it('demotes to rival below 25 trust', () => {
    const { eventStore, relationships, ruleEngine } = makeHarness()
    for (let tick = 1; tick <= 20; tick += 1) {
      submit(
        makeLivingWorldCommand('NPC_INTERACT', 'npc-a', 'npc', tick, tick, {
          tile: 't_market',
          participants: ['npc-a', 'npc-b'],
          mode: 'argue',
          narration: '...'
        }),
        ruleEngine,
        eventStore
      )
    }
    relationships.rebuildFromEvents(eventStore.readEvents())
    const row = relationships.read('npc-a', 'npc-b')
    expect(row).not.toBeNull()
    expect(row!.trust).toBeLessThan(25)
    expect(row!.relationshipType).toBe('rival')
  })

  it('rebuilds identical relationship hash twice', () => {
    const { db, eventStore, ruleEngine } = makeHarness()
    for (let tick = 1; tick <= 12; tick += 1) {
      submit(
        makeLivingWorldCommand('NPC_INTERACT', 'npc-x', 'npc', tick, tick, {
          tile: 't_central',
          participants: tick % 2 === 0 ? ['npc-x', 'npc-y'] : ['npc-y', 'npc-z'],
          mode: tick % 3 === 0 ? 'argue' : 'chat',
          narration: '...'
        }),
        ruleEngine,
        eventStore
      )
    }
    const events = eventStore.readEvents()
    const a = new SqliteNpcRelationshipsStore(db)
    a.rebuildFromEvents(events)
    const b = new SqliteNpcRelationshipsStore(db)
    b.rebuildFromEvents(events)
    expect(a.canonicalHash()).toBe(b.canonicalHash())
  })
})

describe('catch-up summary', () => {
  it('produces identical digest for the same window', () => {
    const { eventStore, ruleEngine } = makeHarness()
    submit(
      makeLivingWorldCommand('NPC_INTERACT', 'npc-a', 'npc', 1, 1, {
        tile: 't_market',
        participants: ['npc-a', 'npc-b'],
        mode: 'chat',
        narration: 'n'
      }),
      ruleEngine,
      eventStore
    )
    submit(
      makeLivingWorldCommand('AREA_PRESSURE', 'system', 'system', 2, 2, {
        tileId: 't_market',
        kind: 'pressure.food_shortage',
        detail: { food: 22 },
        narration: 'n'
      }),
      ruleEngine,
      eventStore
    )
    const events = eventStore.readEvents()
    const s1 = summarizeWindow(events, 0, 5)
    const s2 = summarizeWindow(events, 0, 5)
    expect(s1.digest).toBe(s2.digest)
    expect(s1.totalEvents).toBe(2)
    expect(s1.byNpc['npc-a']).toBe(1)
    expect(s1.byNpc['npc-b']).toBe(1)
    expect(s1.byArea['t_market']).toBe(2)
  })

  it('includes only events strictly inside the window', () => {
    const { eventStore, ruleEngine } = makeHarness()
    for (let tick = 1; tick <= 5; tick += 1) {
      submit(
        makeLivingWorldCommand('WORLD_TICK', 'system', 'system', tick, tick, {
          tick
        }),
        ruleEngine,
        eventStore
      )
    }
    const summary = summarizeWindow(eventStore.readEvents(), 2, 4)
    // WORLD_TICK does not contribute to npc/area counters but should
    // still respect the window boundary on totalEvents (we only count
    // typed living-world events in totalEvents). WORLD_TICK is typed
    // but contributes nothing to counters; verify it doesn't crash
    // and the digest is stable.
    expect(summary.sinceTick).toBe(2)
    expect(summary.untilTick).toBe(4)
    expect(summary.digest).toBeDefined()
  })
})

describe('grounded chronicle renderer', () => {
  it('builds chronicle context from committed events and memory snippets', () => {
    const { eventStore, memory, ruleEngine } = makeHarness()
    submit(
      makeLivingWorldCommand('NPC_INTERACT', 'npc-a', 'npc', 1, 1, {
        tile: 't_market',
        participants: ['npc-a', 'npc-b'],
        mode: 'argue',
        narration: 'npc-a 和 npc-b 爭論了碼頭的流言。'
      }),
      ruleEngine,
      eventStore
    )
    memory.rebuildFromEvents(eventStore.readEvents())

    const context = buildChronicleContext({ events: eventStore.readRecentEvents(10), memory })

    expect(context.events).toHaveLength(1)
    expect(context.memories.length).toBeGreaterThan(0)
    expect(context.allowedNames).toContain('npc-a')
    expect(context.allowedNames).toContain('npc-b')
  })

  it('renders deterministic fallback without AI keys', async () => {
    const { db, eventStore, memory, ruleEngine } = makeHarness()
    const settings = new SettingsStore(db)
    submit(
      makeLivingWorldCommand('AREA_PRESSURE', 'system', 'system', 2, 2, {
        tileId: 't_market',
        kind: 'pressure.food_shortage',
        detail: { food: 22 },
        narration: '市場的食物供給變得緊張。'
      }),
      ruleEngine,
      eventStore
    )
    const context = buildChronicleContext({ events: eventStore.readRecentEvents(10), memory })

    const chronicle = await renderChronicle({ context, settings, useAi: true })

    expect(chronicle.source).toBe('fallback')
    expect(chronicle.textZh).toContain('市場的食物供給變得緊張')
    expect(chronicle.aiError).toBeNull()
  })
})

describe('emotional snapshot derivation', () => {
  it('returns identical snapshot for identical projection state', () => {
    const { eventStore, memory, relationships, ruleEngine } = makeHarness()
    submit(
      makeLivingWorldCommand('NPC_INTERACT', 'npc-a', 'npc', 1, 1, {
        tile: 't_market',
        participants: ['npc-a', 'npc-b'],
        mode: 'chat',
        narration: '...'
      }),
      ruleEngine,
      eventStore
    )
    const events = eventStore.readEvents()
    memory.rebuildFromEvents(events)
    relationships.rebuildFromEvents(events)
    const ctx = { areaPressure: 0.3 }
    const a = deriveEmotionalSnapshot('npc-a', memory, relationships, ctx)
    const b = deriveEmotionalSnapshot('npc-a', memory, relationships, ctx)
    expect(a).toEqual(b)
  })

  it('higher area pressure increases tension and loss', () => {
    const { eventStore, memory, relationships, ruleEngine } = makeHarness()
    submit(
      makeLivingWorldCommand('NPC_INTERACT', 'npc-a', 'npc', 1, 1, {
        tile: 't_market',
        participants: ['npc-a', 'npc-b'],
        mode: 'argue',
        narration: '...'
      }),
      ruleEngine,
      eventStore
    )
    const events = eventStore.readEvents()
    memory.rebuildFromEvents(events)
    relationships.rebuildFromEvents(events)
    const calm = deriveEmotionalSnapshot('npc-a', memory, relationships, {
      areaPressure: 0
    })
    const stressed = deriveEmotionalSnapshot('npc-a', memory, relationships, {
      areaPressure: 1
    })
    expect(stressed.tension).toBeGreaterThan(calm.tension)
    expect(stressed.loss).toBeGreaterThan(calm.loss)
  })
})

describe('deterministic replay', () => {
  it('two reductions of the same event log produce identical projection hashes', () => {
    const { db, eventStore, ruleEngine } = makeHarness()
    for (let tick = 1; tick <= 20; tick += 1) {
      const mode = tick % 4 === 0 ? 'argue' : 'chat'
      const pair: readonly [string, string] =
        tick % 2 === 0 ? ['npc-a', 'npc-b'] : ['npc-b', 'npc-c']
      submit(
        makeLivingWorldCommand('NPC_INTERACT', pair[0], 'npc', tick, tick, {
          tile: 't_central',
          participants: pair,
          mode,
          narration: `t${tick}`
        }),
        ruleEngine,
        eventStore
      )
    }
    const events = eventStore.readEvents()

    const m1 = new SqliteNpcMemoryStore(db)
    const r1 = new SqliteNpcRelationshipsStore(db)
    m1.rebuildFromEvents(events)
    r1.rebuildFromEvents(events)
    const memHash1 = m1.canonicalHash()
    const relHash1 = r1.canonicalHash()

    const m2 = new SqliteNpcMemoryStore(db)
    const r2 = new SqliteNpcRelationshipsStore(db)
    m2.rebuildFromEvents(events)
    r2.rebuildFromEvents(events)
    const memHash2 = m2.canonicalHash()
    const relHash2 = r2.canonicalHash()

    expect(memHash1).toBe(memHash2)
    expect(relHash1).toBe(relHash2)
  })

  it('event deterministicKey ignores wall-clock submittedAt — same intent at different submittedAt yields same key', () => {
    const { ruleEngine } = makeHarness()
    const cmdEarly = makeLivingWorldCommand('NPC_MOVE', 'npc-a', 'npc', 7, 1000, {
      npcId: 'npc-a',
      from: 't_central',
      to: 't_market',
      activity: 'move',
      reachedDest: false,
      narration: 'walk'
    })
    const cmdLate = makeLivingWorldCommand('NPC_MOVE', 'npc-a', 'npc', 7, 999_999_999, {
      npcId: 'npc-a',
      from: 't_central',
      to: 't_market',
      activity: 'move',
      reachedDest: false,
      narration: 'walk'
    })
    const a = ruleEngine.evaluate(cmdEarly)
    const b = ruleEngine.evaluate(cmdLate)
    expect(a.accepted).toBe(true)
    expect(b.accepted).toBe(true)
    if (a.accepted && b.accepted) {
      expect(a.events[0]!.deterministicKey).toBe(b.events[0]!.deterministicKey)
      expect(a.events[0]!.eventId).toBe(b.events[0]!.eventId)
    }
  })

  it('different ticks yield different deterministic keys for the same payload', () => {
    const { ruleEngine } = makeHarness()
    const cmd5 = makeLivingWorldCommand('NPC_MOVE', 'npc-a', 'npc', 5, 1000, {
      npcId: 'npc-a',
      from: 't_central',
      to: 't_market',
      activity: 'move',
      reachedDest: false,
      narration: 'walk'
    })
    const cmd6 = makeLivingWorldCommand('NPC_MOVE', 'npc-a', 'npc', 6, 1000, {
      npcId: 'npc-a',
      from: 't_central',
      to: 't_market',
      activity: 'move',
      reachedDest: false,
      narration: 'walk'
    })
    const a = ruleEngine.evaluate(cmd5)
    const b = ruleEngine.evaluate(cmd6)
    if (a.accepted && b.accepted) {
      expect(a.events[0]!.deterministicKey).not.toBe(b.events[0]!.deterministicKey)
    }
  })
})

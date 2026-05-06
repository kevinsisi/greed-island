import { describe, expect, it } from 'vitest'
import { WorldEventEngine } from './engine.js'
import { listEventTemplates } from './templates.js'
import { TICKS_PER_MINUTE } from '../config/world.js'

const SPAWN_CADENCE = TICKS_PER_MINUTE * 3
const FACTS = { weather: '晴', season: '潮之月' } as const

describe('WorldEventEngine', () => {
  it('exposes at least 30 templates spanning all four event types', () => {
    const templates = listEventTemplates()
    expect(templates.length).toBeGreaterThanOrEqual(30)
    const types = new Set(templates.map((t) => t.type))
    expect(types).toEqual(new Set(['weather', 'npc', 'card', 'city']))
  })

  it('does not spawn anything before the first cadence boundary', () => {
    const engine = new WorldEventEngine()
    for (let tick = 1; tick < SPAWN_CADENCE; tick += 1) {
      const delta = engine.tick(tick, FACTS)
      expect(delta.spawned).toHaveLength(0)
    }
  })

  it('spawns deterministically when the cadence ticks line up', () => {
    const a = new WorldEventEngine()
    const b = new WorldEventEngine()
    const targetTick = SPAWN_CADENCE
    const deltaA = a.tick(targetTick, FACTS)
    const deltaB = b.tick(targetTick, FACTS)
    expect(deltaA.spawned).toHaveLength(1)
    expect(deltaB.spawned).toHaveLength(1)
    expect(deltaA.spawned[0]!.templateId).toBe(deltaB.spawned[0]!.templateId)
    expect(deltaA.spawned[0]!.id).toBe(deltaB.spawned[0]!.id)
    expect(deltaA.spawned[0]!.text.zh).toBe(deltaB.spawned[0]!.text.zh)
  })

  it('expires events whose duration has elapsed', () => {
    const engine = new WorldEventEngine()
    const spawnTick = SPAWN_CADENCE
    const spawned = engine.tick(spawnTick, FACTS).spawned
    expect(spawned).toHaveLength(1)
    const event = spawned[0]!
    const tickAtEnd = event.endsAtTick
    const delta = engine.tick(tickAtEnd, FACTS)
    expect(delta.expired.map((e) => e.id)).toContain(event.id)
    expect(delta.active.map((e) => e.id)).not.toContain(event.id)
  })

  it('caps active events at the configured maximum', () => {
    const engine = new WorldEventEngine()
    let lastDelta = engine.tick(SPAWN_CADENCE, FACTS)
    for (let i = 1; i < 50; i += 1) {
      lastDelta = engine.tick(SPAWN_CADENCE * (i + 1), FACTS)
    }
    expect(lastDelta.active.length).toBeLessThanOrEqual(6)
  })
})

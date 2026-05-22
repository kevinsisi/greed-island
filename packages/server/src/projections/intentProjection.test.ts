import { describe, it, expect } from 'vitest'
import { IntentProjection, formatReflectionContext } from './intentProjection.js'
import type { Event } from '../kernel/types.js'
import { REFLECTION_DURATION_TICKS, MAX_REFLECTIONS_PER_NPC, MAX_REFLECTION_CONTEXT_BULLETS } from '../config/world.js'

function ev(eventId: string, eventType: string, data: unknown): Event {
  return {
    eventId,
    eventType,
    actorId: 'system',
    sequence: 0,
    tick: 0,
    occurredAt: 0,
    deterministicKey: eventId,
    version: 1,
    timestamp: new Date().toISOString(),
    payload: { data },
  } as unknown as Event
}

describe('IntentProjection', () => {
  it('project stores a Reflection on success', () => {
    const proj = new IntentProjection()
    proj.project(ev('evt-1', 'NPC_INTENT_RESOLVED', {
      npcId: 'npc-a', intentType: 'survival', targetTile: 't_forest',
      outcome: 'success', urgencyAtDispatch: 0.8, resolvedAtTick: 100,
    }))
    const reflections = proj.getReflections('npc-a')
    expect(reflections.length).toBe(1)
    expect(reflections[0]!.emotionalImpact).toBe(10)
    expect(reflections[0]!.urgencyDelta).toBe(0.1)
    expect(reflections[0]!.startTick).toBe(100)
    expect(reflections[0]!.intentType).toBe('survival')
    expect(reflections[0]!.triggeringEventId).toBe('evt-1')
  })

  it('project stores a Reflection on failure', () => {
    const proj = new IntentProjection()
    proj.project(ev('evt-2', 'NPC_INTENT_RESOLVED', {
      npcId: 'npc-b', intentType: 'survival', targetTile: 't_forest',
      outcome: 'failure', urgencyAtDispatch: 0.8, resolvedAtTick: 200,
    }))
    const reflections = proj.getReflections('npc-b')
    expect(reflections.length).toBe(1)
    expect(reflections[0]!.emotionalImpact).toBe(-10)
    expect(reflections[0]!.urgencyDelta).toBe(-0.1)
  })

  it('getLearningWeights returns multiplier > 1.0 after success', () => {
    const proj = new IntentProjection()
    proj.project(ev('evt-3', 'NPC_INTENT_RESOLVED', {
      npcId: 'npc-c', intentType: 'survival', targetTile: 't_forest',
      outcome: 'success', urgencyAtDispatch: 0.8, resolvedAtTick: 100,
    }))
    const weights = proj.getLearningWeights('npc-c', 101)
    expect(weights.survival).toBeDefined()
    expect(weights.survival!).toBeGreaterThan(1.0)
    expect(weights.survival!).toBeCloseTo(1.1)
  })

  it('getLearningWeights returns multiplier < 1.0 after failure', () => {
    const proj = new IntentProjection()
    proj.project(ev('evt-4', 'NPC_INTENT_RESOLVED', {
      npcId: 'npc-d', intentType: 'survival', targetTile: 't_forest',
      outcome: 'failure', urgencyAtDispatch: 0.8, resolvedAtTick: 100,
    }))
    const weights = proj.getLearningWeights('npc-d', 101)
    expect(weights.survival).toBeDefined()
    expect(weights.survival!).toBeLessThan(1.0)
    expect(weights.survival!).toBeCloseTo(0.9)
  })

  it('getLearningWeights returns empty object with no reflections', () => {
    const proj = new IntentProjection()
    const weights = proj.getLearningWeights('unknown-npc', 0)
    expect(Object.keys(weights)).toHaveLength(0)
  })

  it('getLearningWeights omits expired reflections', () => {
    const proj = new IntentProjection()
    proj.project(ev('evt-5', 'NPC_INTENT_RESOLVED', {
      npcId: 'npc-e', intentType: 'survival', targetTile: 't_forest',
      outcome: 'success', urgencyAtDispatch: 0.8, resolvedAtTick: 0,
    }))
    // currentTick = REFLECTION_DURATION_TICKS + 1 → age >= durationTicks → expired
    const weights = proj.getLearningWeights('npc-e', REFLECTION_DURATION_TICKS + 1)
    expect(weights.survival).toBeUndefined()
    expect(Object.keys(weights)).toHaveLength(0)
  })

  it('getLearningWeights clamps at 1.5 (upper)', () => {
    const proj = new IntentProjection()
    // 8 successes for 'economic' → 8 × 0.1 = 0.8 → 1.0 + 0.8 = 1.8 → clamped to 1.5
    for (let i = 0; i < 8; i++) {
      proj.project(ev(`evt-upper-${i}`, 'NPC_INTENT_RESOLVED', {
        npcId: 'npc-f', intentType: 'economic', targetTile: 't_central',
        outcome: 'success', urgencyAtDispatch: 0.5, resolvedAtTick: i * 10,
      }))
    }
    const weights = proj.getLearningWeights('npc-f', 1)
    expect(weights.economic).toBe(1.5)
  })

  it('getLearningWeights clamps at 0.5 (lower)', () => {
    const proj = new IntentProjection()
    // 8 failures for 'social' → 8 × -0.1 = -0.8 → 1.0 - 0.8 = 0.2 → clamped to 0.5
    for (let i = 0; i < 8; i++) {
      proj.project(ev(`evt-lower-${i}`, 'NPC_INTENT_RESOLVED', {
        npcId: 'npc-g', intentType: 'social', targetTile: 't_central',
        outcome: 'failure', urgencyAtDispatch: 0.5, resolvedAtTick: i * 10,
      }))
    }
    const weights = proj.getLearningWeights('npc-g', 1)
    expect(weights.social).toBe(0.5)
  })

  it('MAX_REFLECTIONS_PER_NPC cap removes oldest', () => {
    const proj = new IntentProjection()
    const total = MAX_REFLECTIONS_PER_NPC + 1
    for (let i = 0; i < total; i++) {
      proj.project(ev(`evt-cap-${i}`, 'NPC_INTENT_RESOLVED', {
        npcId: 'npc-h', intentType: 'survival', targetTile: 't_forest',
        outcome: 'success', urgencyAtDispatch: 0.5, resolvedAtTick: i * 10,
      }))
    }
    const reflections = proj.getReflections('npc-h')
    expect(reflections.length).toBe(MAX_REFLECTIONS_PER_NPC)
    // The oldest (evt-cap-0) was removed; first remaining is evt-cap-1
    expect(reflections[0]!.triggeringEventId).toBe('evt-cap-1')
    expect(reflections[reflections.length - 1]!.triggeringEventId).toBe(`evt-cap-${total - 1}`)
  })

  it('multiple NPCs have independent reflection sets', () => {
    const proj = new IntentProjection()
    proj.project(ev('evt-npc1', 'NPC_INTENT_RESOLVED', {
      npcId: 'npc-1', intentType: 'survival', targetTile: 't_forest',
      outcome: 'success', urgencyAtDispatch: 0.5, resolvedAtTick: 100,
    }))
    proj.project(ev('evt-npc2', 'NPC_INTENT_RESOLVED', {
      npcId: 'npc-2', intentType: 'survival', targetTile: 't_forest',
      outcome: 'failure', urgencyAtDispatch: 0.5, resolvedAtTick: 100,
    }))
    const w1 = proj.getLearningWeights('npc-1', 101)
    const w2 = proj.getLearningWeights('npc-2', 101)
    expect(w1.survival!).toBeGreaterThan(1.0)
    expect(w2.survival!).toBeLessThan(1.0)
  })

  it('project ignores non-NPC_INTENT_RESOLVED events', () => {
    const proj = new IntentProjection()
    proj.project(ev('evt-x', 'GOODS_CONSUMED', {
      npcId: 'npc-i', goodsId: 'fish', quantity: 10,
      holderType: 'npc', holderId: 'npc-i', tileId: 't_dock',
      consumedAtTick: 50, narration: 'ate fish',
    }))
    expect(proj.getReflections('npc-i')).toHaveLength(0)
  })

  it('getLearningWeights handles multiple intent types independently', () => {
    const proj = new IntentProjection()
    proj.project(ev('evt-multi-1', 'NPC_INTENT_RESOLVED', {
      npcId: 'npc-j', intentType: 'survival', targetTile: 't_forest',
      outcome: 'success', urgencyAtDispatch: 0.5, resolvedAtTick: 100,
    }))
    proj.project(ev('evt-multi-2', 'NPC_INTENT_RESOLVED', {
      npcId: 'npc-j', intentType: 'economic', targetTile: 't_central',
      outcome: 'failure', urgencyAtDispatch: 0.5, resolvedAtTick: 110,
    }))
    const weights = proj.getLearningWeights('npc-j', 120)
    expect(weights.survival!).toBeGreaterThan(1.0)
    expect(weights.economic!).toBeLessThan(1.0)
  })
})

// ─── formatReflectionContext ──────────────────────────────────────────────────

describe('formatReflectionContext', () => {
  it('returns empty string for empty reflections', () => {
    const proj = new IntentProjection()
    expect(formatReflectionContext(proj.getReflections('npc-x'), 0)).toBe('')
  })

  it('returns empty string when all reflections are expired', () => {
    const proj = new IntentProjection()
    proj.project(ev('e1', 'NPC_INTENT_RESOLVED', {
      npcId: 'npc-x', intentType: 'survival', targetTile: 't_forest',
      outcome: 'success', urgencyAtDispatch: 0.5, resolvedAtTick: 0,
    }))
    // age = REFLECTION_DURATION_TICKS + 1 ≥ durationTicks → expired
    expect(formatReflectionContext(proj.getReflections('npc-x'), REFLECTION_DURATION_TICKS + 1)).toBe('')
  })

  it('contains header when at least one active reflection exists', () => {
    const proj = new IntentProjection()
    proj.project(ev('e1', 'NPC_INTENT_RESOLVED', {
      npcId: 'npc-x', intentType: 'survival', targetTile: 't_forest',
      outcome: 'success', urgencyAtDispatch: 0.5, resolvedAtTick: 0,
    }))
    const result = formatReflectionContext(proj.getReflections('npc-x'), 1)
    expect(result).toContain('你的近期行動記憶')
  })

  it('maps survival → 【生存】嘗試逃離危險地區', () => {
    const proj = new IntentProjection()
    proj.project(ev('e1', 'NPC_INTENT_RESOLVED', {
      npcId: 'npc-x', intentType: 'survival', targetTile: 't_forest',
      outcome: 'success', urgencyAtDispatch: 0.5, resolvedAtTick: 0,
    }))
    expect(formatReflectionContext(proj.getReflections('npc-x'), 1)).toContain('【生存】嘗試逃離危險地區')
  })

  it('maps economic → 【經濟】尋找物資', () => {
    const proj = new IntentProjection()
    proj.project(ev('e1', 'NPC_INTENT_RESOLVED', {
      npcId: 'npc-x', intentType: 'economic', targetTile: 't_central',
      outcome: 'failure', urgencyAtDispatch: 0.5, resolvedAtTick: 0,
    }))
    expect(formatReflectionContext(proj.getReflections('npc-x'), 1)).toContain('【經濟】尋找物資')
  })

  it('maps social → 【社交】回避敵對勢力', () => {
    const proj = new IntentProjection()
    proj.project(ev('e1', 'NPC_INTENT_RESOLVED', {
      npcId: 'npc-x', intentType: 'social', targetTile: 't_central',
      outcome: 'success', urgencyAtDispatch: 0.5, resolvedAtTick: 0,
    }))
    expect(formatReflectionContext(proj.getReflections('npc-x'), 1)).toContain('【社交】回避敵對勢力')
  })

  it('maps ecosystem → 【生態】遠離環境惡化地區', () => {
    const proj = new IntentProjection()
    proj.project(ev('e1', 'NPC_INTENT_RESOLVED', {
      npcId: 'npc-x', intentType: 'ecosystem', targetTile: 't_central',
      outcome: 'failure', urgencyAtDispatch: 0.5, resolvedAtTick: 0,
    }))
    expect(formatReflectionContext(proj.getReflections('npc-x'), 1)).toContain('【生態】遠離環境惡化地區')
  })

  it('success shows → 成功（你對自身判斷更有信心）', () => {
    const proj = new IntentProjection()
    proj.project(ev('e1', 'NPC_INTENT_RESOLVED', {
      npcId: 'npc-x', intentType: 'survival', targetTile: 't_forest',
      outcome: 'success', urgencyAtDispatch: 0.5, resolvedAtTick: 0,
    }))
    expect(formatReflectionContext(proj.getReflections('npc-x'), 1))
      .toContain('→ 成功（你對自身判斷更有信心）')
  })

  it('failure shows → 失敗（你仍感到不安，下次更謹慎）', () => {
    const proj = new IntentProjection()
    proj.project(ev('e1', 'NPC_INTENT_RESOLVED', {
      npcId: 'npc-x', intentType: 'survival', targetTile: 't_forest',
      outcome: 'failure', urgencyAtDispatch: 0.5, resolvedAtTick: 0,
    }))
    expect(formatReflectionContext(proj.getReflections('npc-x'), 1))
      .toContain('→ 失敗（你仍感到不安，下次更謹慎）')
  })

  it('caps output at 5 most recent active reflections', () => {
    const proj = new IntentProjection()
    // MAX_REFLECTION_CONTEXT_BULLETS + 2 reflections: oldest 2 should be excluded (only last MAX_REFLECTION_CONTEXT_BULLETS shown)
    for (let i = 0; i < MAX_REFLECTION_CONTEXT_BULLETS + 2; i++) {
      proj.project(ev(`e${i}`, 'NPC_INTENT_RESOLVED', {
        npcId: 'npc-x',
        intentType: i % 2 === 0 ? 'survival' : 'economic',
        targetTile: 't_forest',
        outcome: 'success',
        urgencyAtDispatch: 0.5,
        resolvedAtTick: i * 10,
      }))
    }
    const result = formatReflectionContext(proj.getReflections('npc-x'), 1)
    const bulletCount = (result.match(/  · /g) ?? []).length
    expect(bulletCount).toBe(MAX_REFLECTION_CONTEXT_BULLETS)
  })
})

import { describe, expect, it } from 'vitest'
import {
  deriveNpcCognitiveEvolutionSummary,
  proposeDeterministicNpcReflection,
  validateNpcReflectionProposal,
  commitNpcCognitiveUpdate,
  type NpcReflectionProposal,
} from './npcCognitiveEvolution.js'

const baseContext = {
  npcId: 'npc.mini.hermes',
  npcNameZh: '潮心',
  currentTick: 240,
  cognitive: {
    survivalBias: 1.2,
    economicBias: 0.9,
    socialBias: 1.1,
    ecosystemBias: 0.8,
    patienceBias: 1.0,
    dominantTrait: 'survival' as const,
    thoughtZh: '潮心記得最近發生的事，先把安全與退路排在第一位。',
    thoughtEn: 'Tideheart remembers recent events and puts safety first.',
  },
  lifeGoal: { kind: 'seek_safety', pressure: 82, narration: '尋找更安全的生活節奏' },
  needs: { food: 30, rest: 45, money: 20, housing: 35, safety: 88 },
  memoryContext: '- [importance:9] 潮心在森林遭遇野獸襲擊，決定以後先確保退路。',
  reflectionContext: '### 你的近期行動記憶\n  · 【生存】嘗試逃離危險地區 → 成功',
  relationships: [
    { npcId: 'npc.guard', nameZh: '守潮', trust: 68, type: 'friend' as const, dimensions: { trust: 68, fear: 20, respect: 72, attraction: 40, loyalty: 66, resentment: 10, dependency: 45, familiarity: 80 } },
  ],
}

describe('npc cognitive evolution proposal validation', () => {
  it('rejects ungrounded AI proposals before they can become committed personality updates', () => {
    const proposal: NpcReflectionProposal = {
      npcId: 'npc.mini.hermes',
      proposedAtTick: 240,
      source: 'ai_reflection',
      evidenceMemoryFragments: [],
      personalityDeltas: { greed: 1.2, safetyWeight: -2 },
      lifeGoal: { kind: 'rule_the_world', pressure: 200, narration: '' },
      relationshipDeltas: [{ targetNpcId: 'npc.guard', dimension: 'trust', delta: 500, reason: '' }],
      summaryZh: '我要直接改世界。',
      summaryEn: 'I will directly change the world.',
    }

    const result = validateNpcReflectionProposal(proposal, baseContext)

    expect(result.accepted).toBe(false)
    expect(result.reasons).toContain('proposal requires at least one memory evidence fragment')
    expect(result.reasons).toContain('personality delta safetyWeight must be within -0.25..0.25')
    expect(result.reasons).toContain('lifeGoal.kind is not allowed')
    expect(result.reasons).toContain('relationship delta trust must be within -15..15')
  })

  it('commits a validated reflection into bounded personality, life goal, relationship, and UI summary data', () => {
    const proposal = proposeDeterministicNpcReflection(baseContext)
    const validation = validateNpcReflectionProposal(proposal, baseContext)

    expect(validation.accepted).toBe(true)

    const committed = commitNpcCognitiveUpdate(proposal, validation, baseContext)

    expect(committed.npcId).toBe('npc.mini.hermes')
    expect(committed.personalityUpdate.deltas.safetyWeight).toBeGreaterThan(0)
    expect(committed.lifeGoal?.kind).toBe('seek_safety')
    expect(committed.relationshipUpdates[0]?.targetNpcId).toBe('npc.guard')
    expect(committed.relationshipUpdates[0]?.dimension).toBe('loyalty')
    expect(committed.summary.zh).toContain('反省')
    expect(committed.summary.zh).toContain('記憶依據')
  })

  it('formats a fine-grained mini-Hermes memory summary for the NPC UI', () => {
    const proposal = proposeDeterministicNpcReflection(baseContext)
    const validation = validateNpcReflectionProposal(proposal, baseContext)
    const committed = commitNpcCognitiveUpdate(proposal, validation, baseContext)

    const summary = deriveNpcCognitiveEvolutionSummary({
      currentTick: 260,
      committedUpdates: [committed],
      currentThoughtZh: baseContext.cognitive.thoughtZh,
    })

    expect(summary.reflectionCount).toBe(1)
    expect(summary.lastReflectionZh).toContain('潮心')
    expect(summary.personalityTraceZh).toContain('安全權重')
    expect(summary.lifeGoalTraceZh).toContain('尋找更安全的生活節奏')
    expect(summary.relationshipTraceZh).toContain('守潮')
  })
})

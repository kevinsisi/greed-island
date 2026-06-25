import { describe, expect, it } from 'vitest'
import { deriveNpcCognitiveProfile, type NpcCognitiveRuntimeInput } from './npcCognitiveRuntime.js'

function input(overrides: Partial<NpcCognitiveRuntimeInput> = {}): NpcCognitiveRuntimeInput {
  return {
    npcId: 'npc.cognitive.test',
    npcNameZh: '潮思',
    personality: { greed: 0.2, safetyWeight: 0.5, economyWeight: 0.5, patience: 0.6, talkativeness: 0.5, archetype: 'civic' },
    needs: { food: 20, rest: 20, money: 20, housing: 20, safety: 20 },
    lifeGoal: { kind: 'earn_money', pressure: 20, narration: '賺到穩定收入' },
    beliefCount: 0,
    fearBeliefCount: 0,
    memoryUrgencyBoost: 0,
    memoryContext: '',
    currentTick: 42,
    ...overrides,
  }
}

describe('deriveNpcCognitiveProfile', () => {
  it('is deterministic for identical inputs', () => {
    const args = input({ personality: { greed: 0.85, economyWeight: 0.9, patience: 0.2, archetype: 'shopkeeper' } })

    expect(deriveNpcCognitiveProfile(args)).toEqual(deriveNpcCognitiveProfile(args))
  })

  it('turns greed and economy weight into an economic dominant trait', () => {
    const cognitive = deriveNpcCognitiveProfile(input({
      npcNameZh: '貪潮',
      personality: { greed: 0.95, economyWeight: 0.9, safetyWeight: 0.1, patience: 0.2, archetype: 'shopkeeper' },
      needs: { food: 20, rest: 20, money: 70, housing: 20, safety: 70 },
    }))

    expect(cognitive.dominantTrait).toBe('economic')
    expect(cognitive.economicBias).toBeGreaterThan(cognitive.survivalBias)
    expect(cognitive.thoughtZh).toContain('貪潮')
    expect(cognitive.thoughtZh).toContain('生計')
  })

  it('turns fear memory and safety weight into a survival dominant trait', () => {
    const cognitive = deriveNpcCognitiveProfile(input({
      npcNameZh: '慎潮',
      personality: { greed: 0.1, economyWeight: 0.1, safetyWeight: 0.95, patience: 0.8, archetype: 'guard' },
      needs: { food: 20, rest: 20, money: 70, housing: 20, safety: 70 },
      beliefCount: 2,
      fearBeliefCount: 2,
      memoryUrgencyBoost: 1.5,
      memoryContext: '- [importance:8] 曾在森林遭遇野獸襲擊',
    }))

    expect(cognitive.dominantTrait).toBe('survival')
    expect(cognitive.survivalBias).toBeGreaterThan(cognitive.economicBias)
    expect(cognitive.thoughtZh).toContain('記得')
  })
})

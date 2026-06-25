import { describe, expect, it } from 'vitest'
import { LivingWorldRuleEngine, makeLivingWorldCommand } from '../kernel/livingWorldCommands.js'
import { rebuildNpcCognitiveProjection } from './npcCognitiveProjection.js'

const reflectionPayload = {
  npcId: 'npc.mini.hermes',
  committedAtTick: 320,
  sourceProposalTick: 300,
  source: 'deterministic_reflection',
  evidenceMemoryFragments: ['潮心在森林遭遇野獸襲擊，決定以後先確保退路。'],
  personalityDeltas: { safetyWeight: 0.08, patience: 0.03 },
  lifeGoal: { kind: 'seek_safety', pressure: 86, narration: '先確保安全與退路' },
  relationshipDeltas: [
    { targetNpcId: 'npc.guard', dimension: 'loyalty', delta: 4, reason: '反省後更重視與守潮的互相支援。' },
  ],
  summaryZh: '潮心反省最近的記憶，把安全與退路放進長期目標。',
  summaryEn: 'Tideheart reflects on recent memory and keeps safety as a long-term goal.',
  narration: '潮心把一次危險記憶寫進自己的長期反省。',
} as const

describe('event-sourced npc cognitive projection', () => {
  it('accepts bounded NPC_REFLECTION_COMMITTED commands as replayable world facts', () => {
    const command = makeLivingWorldCommand(
      'NPC_REFLECTION_COMMITTED',
      'npc.mini.hermes',
      'npc',
      320,
      320,
      reflectionPayload
    )

    const result = new LivingWorldRuleEngine().evaluate(command)

    expect(result.accepted).toBe(true)
    if (!result.accepted) return
    expect(result.events[0]?.eventType).toBe('NPC_REFLECTION_COMMITTED')
    expect(result.events[0]?.payload.data).toMatchObject({ npcId: 'npc.mini.hermes', committedAtTick: 320 })
  })

  it('rejects reflection commands that do not cite committed memory evidence', () => {
    const command = makeLivingWorldCommand(
      'NPC_REFLECTION_COMMITTED',
      'npc.mini.hermes',
      'npc',
      320,
      320,
      { ...reflectionPayload, evidenceMemoryFragments: [] }
    )

    const result = new LivingWorldRuleEngine().evaluate(command)

    expect(result.accepted).toBe(false)
    if (result.accepted) return
    expect(result.rejection.reason).toBe('evidenceMemoryFragments required')
  })

  it('rebuilds durable per-NPC reflection state from EventLog events', () => {
    const command = makeLivingWorldCommand(
      'NPC_REFLECTION_COMMITTED',
      'npc.mini.hermes',
      'npc',
      320,
      320,
      reflectionPayload
    )
    const result = new LivingWorldRuleEngine().evaluate(command)
    if (!result.accepted) throw new Error('fixture command rejected')

    const projection = rebuildNpcCognitiveProjection(
      result.events.map((event, index) => ({ ...event, sequence: index + 1 }))
    )
    const state = projection.get('npc.mini.hermes')

    expect(state).toMatchObject({
      npcId: 'npc.mini.hermes',
      reflectionCount: 1,
      lastReflectionTick: 320,
      currentLifeGoalOverride: { kind: 'seek_safety', pressure: 86, narration: '先確保安全與退路' },
      personalityDeltas: { safetyWeight: 0.08, patience: 0.03 },
      lastReflectionSummaryZh: '潮心反省最近的記憶，把安全與退路放進長期目標。',
    })
    expect(state?.relationshipReflectionTrace).toEqual([
      { targetNpcId: 'npc.guard', dimension: 'loyalty', delta: 4, reason: '反省後更重視與守潮的互相支援。', tick: 320 },
    ])
  })
})

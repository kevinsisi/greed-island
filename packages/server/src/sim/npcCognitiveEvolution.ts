import type { NpcCognitiveProfile } from './npcCognitiveRuntime.js'
import type { RelationshipDimensions, RelationshipType } from '../kernel/npcRelationships.js'

export type NpcPersonalityDeltaKey = 'greed' | 'safetyWeight' | 'economyWeight' | 'factionLoyalty' | 'talkativeness' | 'patience'
export type NpcRelationshipEvolutionDimension = keyof RelationshipDimensions
export type NpcEvolutionLifeGoalKind = 'eat' | 'rest' | 'earn_money' | 'secure_home' | 'seek_safety' | 'form_family' | 'build_city' | 'learn_skill'

export type NpcEvolutionRelationshipContext = Readonly<{
  npcId: string
  nameZh: string
  trust: number
  type: RelationshipType
  dimensions: RelationshipDimensions
}>

export type NpcReflectionContext = Readonly<{
  npcId: string
  npcNameZh: string
  currentTick: number
  cognitive: NpcCognitiveProfile
  lifeGoal: Readonly<{ kind: string; pressure: number; narration: string }>
  needs: Readonly<Record<'food' | 'rest' | 'money' | 'housing' | 'safety', number>>
  memoryContext: string
  reflectionContext: string
  relationships: readonly NpcEvolutionRelationshipContext[]
}>

export type NpcReflectionProposal = Readonly<{
  npcId: string
  proposedAtTick: number
  source: 'ai_reflection' | 'deterministic_reflection'
  evidenceMemoryFragments: readonly string[]
  personalityDeltas: Readonly<Partial<Record<NpcPersonalityDeltaKey, number>>>
  lifeGoal: Readonly<{ kind: string; pressure: number; narration: string }> | null
  relationshipDeltas: readonly Readonly<{
    targetNpcId: string
    dimension: NpcRelationshipEvolutionDimension
    delta: number
    reason: string
  }>[]
  summaryZh: string
  summaryEn: string
}>

export type NpcReflectionValidation = Readonly<{
  accepted: boolean
  reasons: readonly string[]
  sanitized: NpcReflectionProposal | null
}>

export type NpcCommittedCognitiveUpdate = Readonly<{
  npcId: string
  committedAtTick: number
  sourceProposalTick: number
  personalityUpdate: Readonly<{
    deltas: Readonly<Partial<Record<NpcPersonalityDeltaKey, number>>>
    reasonZh: string
  }>
  lifeGoal: Readonly<{ kind: NpcEvolutionLifeGoalKind; pressure: number; narration: string }> | null
  relationshipUpdates: readonly Readonly<{
    targetNpcId: string
    targetNameZh: string
    dimension: NpcRelationshipEvolutionDimension
    delta: number
    reason: string
  }>[]
  summary: Readonly<{ zh: string; en: string }>
  evidenceMemoryFragments: readonly string[]
}>

export type NpcCognitiveEvolutionSummary = Readonly<{
  reflectionCount: number
  currentThoughtZh: string
  lastReflectionZh: string | null
  personalityTraceZh: string | null
  lifeGoalTraceZh: string | null
  relationshipTraceZh: string | null
}>

const ALLOWED_PERSONALITY_KEYS: readonly NpcPersonalityDeltaKey[] = ['greed', 'safetyWeight', 'economyWeight', 'factionLoyalty', 'talkativeness', 'patience']
const ALLOWED_LIFE_GOAL_KINDS: readonly NpcEvolutionLifeGoalKind[] = ['eat', 'rest', 'earn_money', 'secure_home', 'seek_safety', 'form_family', 'build_city', 'learn_skill']
const ALLOWED_RELATIONSHIP_DIMENSIONS: readonly NpcRelationshipEvolutionDimension[] = ['trust', 'fear', 'respect', 'attraction', 'loyalty', 'resentment', 'dependency', 'familiarity']

export function proposeDeterministicNpcReflection(context: NpcReflectionContext): NpcReflectionProposal {
  const evidence = extractEvidence(context)
  const personalityDeltas: Partial<Record<NpcPersonalityDeltaKey, number>> = {}
  let lifeGoal: NpcReflectionProposal['lifeGoal'] = null
  const relationshipDeltas: Array<NpcReflectionProposal['relationshipDeltas'][number]> = []

  if (context.cognitive.dominantTrait === 'survival' || context.needs.safety >= 70) {
    personalityDeltas.safetyWeight = 0.08
    personalityDeltas.patience = 0.03
    lifeGoal = { kind: 'seek_safety', pressure: clampNumber(Math.max(55, context.lifeGoal.pressure, context.needs.safety), 0, 100), narration: context.lifeGoal.narration || '先確保安全與退路' }
  } else if (context.cognitive.dominantTrait === 'economic' || context.needs.money >= 70) {
    personalityDeltas.economyWeight = 0.08
    lifeGoal = { kind: 'earn_money', pressure: clampNumber(Math.max(55, context.lifeGoal.pressure, context.needs.money), 0, 100), narration: context.lifeGoal.narration || '建立穩定收入' }
  } else if (context.cognitive.dominantTrait === 'social') {
    personalityDeltas.talkativeness = 0.06
    personalityDeltas.factionLoyalty = 0.04
    lifeGoal = { kind: 'form_family', pressure: clampNumber(Math.max(50, context.lifeGoal.pressure), 0, 100), narration: context.lifeGoal.narration || '維持重要的人際連結' }
  }

  const closest = [...context.relationships].sort((a, b) => b.dimensions.respect + b.dimensions.loyalty + b.trust - (a.dimensions.respect + a.dimensions.loyalty + a.trust) || a.npcId.localeCompare(b.npcId))[0]
  if (closest) {
    relationshipDeltas.push({
      targetNpcId: closest.npcId,
      dimension: context.cognitive.dominantTrait === 'survival' ? 'loyalty' : 'trust',
      delta: context.cognitive.dominantTrait === 'survival' ? 4 : 3,
      reason: '反省後更重視與' + closest.nameZh + '的互相支援。',
    })
  }

  return {
    npcId: context.npcId,
    proposedAtTick: context.currentTick,
    source: 'deterministic_reflection',
    evidenceMemoryFragments: evidence,
    personalityDeltas,
    lifeGoal,
    relationshipDeltas,
    summaryZh: context.npcNameZh + '反省最近的記憶，決定把' + traitLabelZh(context.cognitive.dominantTrait) + '放進更長期的性格與目標。',
    summaryEn: context.npcNameZh + ' reflects on recent memory and folds ' + context.cognitive.dominantTrait + ' into longer-term personality and goals.',
  }
}

export function validateNpcReflectionProposal(proposal: NpcReflectionProposal, context: NpcReflectionContext): NpcReflectionValidation {
  const reasons: string[] = []
  if (proposal.npcId !== context.npcId) reasons.push('proposal npcId does not match context')
  if (!Number.isInteger(proposal.proposedAtTick) || proposal.proposedAtTick < 0) reasons.push('proposedAtTick must be a non-negative integer')
  if (proposal.evidenceMemoryFragments.length === 0) reasons.push('proposal requires at least one memory evidence fragment')
  for (const fragment of proposal.evidenceMemoryFragments) {
    if (typeof fragment !== 'string' || fragment.trim().length === 0) reasons.push('memory evidence fragment must be non-empty')
  }
  for (const [key, value] of Object.entries(proposal.personalityDeltas) as Array<[NpcPersonalityDeltaKey, number]>) {
    if (!ALLOWED_PERSONALITY_KEYS.includes(key)) reasons.push('personality delta ' + key + ' is not allowed')
    if (typeof value !== 'number' || !Number.isFinite(value) || value < -0.25 || value > 0.25) reasons.push('personality delta ' + key + ' must be within -0.25..0.25')
  }
  if (proposal.lifeGoal) {
    if (!ALLOWED_LIFE_GOAL_KINDS.includes(proposal.lifeGoal.kind as NpcEvolutionLifeGoalKind)) reasons.push('lifeGoal.kind is not allowed')
    if (typeof proposal.lifeGoal.pressure !== 'number' || !Number.isFinite(proposal.lifeGoal.pressure) || proposal.lifeGoal.pressure < 0 || proposal.lifeGoal.pressure > 100) reasons.push('lifeGoal.pressure must be 0..100')
    if (typeof proposal.lifeGoal.narration !== 'string' || proposal.lifeGoal.narration.trim().length === 0) reasons.push('lifeGoal.narration required')
  }
  for (const delta of proposal.relationshipDeltas) {
    if (!context.relationships.some((row) => row.npcId === delta.targetNpcId)) reasons.push('relationship target ' + delta.targetNpcId + ' is not known to this NPC')
    if (!ALLOWED_RELATIONSHIP_DIMENSIONS.includes(delta.dimension)) reasons.push('relationship dimension ' + delta.dimension + ' is not allowed')
    if (typeof delta.delta !== 'number' || !Number.isFinite(delta.delta) || delta.delta < -15 || delta.delta > 15) reasons.push('relationship delta ' + delta.dimension + ' must be within -15..15')
    if (typeof delta.reason !== 'string' || delta.reason.trim().length === 0) reasons.push('relationship delta reason required')
  }
  if (proposal.summaryZh.trim().length === 0 || proposal.summaryEn.trim().length === 0) reasons.push('summary required')
  return { accepted: reasons.length === 0, reasons, sanitized: reasons.length === 0 ? proposal : null }
}

export function commitNpcCognitiveUpdate(proposal: NpcReflectionProposal, validation: NpcReflectionValidation, context: NpcReflectionContext): NpcCommittedCognitiveUpdate {
  if (!validation.accepted || !validation.sanitized) throw new Error('cannot commit rejected npc reflection proposal')
  const sanitized = validation.sanitized
  const relationshipUpdates = sanitized.relationshipDeltas.map((delta) => {
    const rel = context.relationships.find((row) => row.npcId === delta.targetNpcId)
    return { targetNpcId: delta.targetNpcId, targetNameZh: rel?.nameZh ?? delta.targetNpcId, dimension: delta.dimension, delta: round2(delta.delta), reason: delta.reason }
  })
  const personalityDeltas = Object.fromEntries(Object.entries(sanitized.personalityDeltas).map(([key, value]) => [key, round2(value as number)])) as Partial<Record<NpcPersonalityDeltaKey, number>>
  return {
    npcId: context.npcId,
    committedAtTick: context.currentTick,
    sourceProposalTick: sanitized.proposedAtTick,
    personalityUpdate: { deltas: personalityDeltas, reasonZh: context.npcNameZh + '的反省通過 validator，只提交有記憶依據且幅度受限的人格微調。' },
    lifeGoal: sanitized.lifeGoal ? { kind: sanitized.lifeGoal.kind as NpcEvolutionLifeGoalKind, pressure: clampNumber(sanitized.lifeGoal.pressure, 0, 100), narration: sanitized.lifeGoal.narration } : null,
    relationshipUpdates,
    summary: { zh: sanitized.summaryZh + ' 記憶依據：' + sanitized.evidenceMemoryFragments.slice(0, 2).join(' / '), en: sanitized.summaryEn },
    evidenceMemoryFragments: sanitized.evidenceMemoryFragments,
  }
}

export function deriveNpcCognitiveEvolutionSummary(input: Readonly<{ currentTick: number; committedUpdates: readonly NpcCommittedCognitiveUpdate[]; currentThoughtZh: string }>): NpcCognitiveEvolutionSummary {
  const updates = [...input.committedUpdates].sort((a, b) => b.committedAtTick - a.committedAtTick || b.sourceProposalTick - a.sourceProposalTick)
  const latest = updates[0] ?? null
  if (!latest) return { reflectionCount: 0, currentThoughtZh: input.currentThoughtZh, lastReflectionZh: null, personalityTraceZh: null, lifeGoalTraceZh: null, relationshipTraceZh: null }
  return {
    reflectionCount: updates.length,
    currentThoughtZh: input.currentThoughtZh,
    lastReflectionZh: latest.summary.zh,
    personalityTraceZh: formatPersonalityTrace(latest.personalityUpdate.deltas),
    lifeGoalTraceZh: latest.lifeGoal ? '人生目標：' + latest.lifeGoal.narration + '（壓力 ' + Math.round(latest.lifeGoal.pressure) + '）' : null,
    relationshipTraceZh: latest.relationshipUpdates.length > 0 ? latest.relationshipUpdates.map((row) => row.targetNameZh + '：' + dimensionLabelZh(row.dimension) + ' ' + signed(row.delta) + '，' + row.reason).join('；') : null,
  }
}

function extractEvidence(context: NpcReflectionContext): string[] {
  const source = [context.memoryContext, context.reflectionContext].filter(Boolean).join('\n')
  return source.split('\n').map((line) => line.trim()).filter(Boolean).slice(0, 3)
}

function traitLabelZh(trait: NpcCognitiveProfile['dominantTrait']): string {
  switch (trait) {
    case 'survival': return '安全與退路'
    case 'economic': return '生計與資源'
    case 'social': return '信任與人際'
    case 'ecosystem': return '環境與棲地'
    case 'steady': return '穩定節奏'
  }
}

function formatPersonalityTrace(deltas: Readonly<Partial<Record<NpcPersonalityDeltaKey, number>>>): string | null {
  const parts = Object.entries(deltas).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => personalityLabelZh(key as NpcPersonalityDeltaKey) + ' ' + signed(value as number))
  return parts.length > 0 ? '人格演化：' + parts.join('、') : null
}

function personalityLabelZh(key: NpcPersonalityDeltaKey): string {
  switch (key) {
    case 'greed': return '貪婪'
    case 'safetyWeight': return '安全權重'
    case 'economyWeight': return '經濟權重'
    case 'factionLoyalty': return '派系忠誠'
    case 'talkativeness': return '社交表達'
    case 'patience': return '耐心'
  }
}

function dimensionLabelZh(key: NpcRelationshipEvolutionDimension): string {
  switch (key) {
    case 'trust': return '信任'
    case 'fear': return '恐懼'
    case 'respect': return '尊重'
    case 'attraction': return '吸引'
    case 'loyalty': return '忠誠'
    case 'resentment': return '怨懟'
    case 'dependency': return '依賴'
    case 'familiarity': return '熟悉'
  }
}

function signed(value: number): string {
  const rounded = round2(value)
  return rounded >= 0 ? '+' + rounded : String(rounded)
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}

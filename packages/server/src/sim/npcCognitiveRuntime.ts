import type { IntentKind } from '../kernel/livingWorldCommands.js'
import type { NpcProfile } from '../npcs/types.js'
import type { BeliefRow } from '../projections/beliefProjection.js'
import type { NpcLifeView } from './cityLife.js'

export type NpcCognitiveDominantTrait = 'survival' | 'economic' | 'social' | 'ecosystem' | 'steady'

export type NpcCognitiveProfile = Readonly<{
  survivalBias: number
  economicBias: number
  socialBias: number
  ecosystemBias: number
  patienceBias: number
  dominantTrait: NpcCognitiveDominantTrait
  thoughtZh: string
  thoughtEn: string
}>

export type NpcCognitiveRuntimeInput = Readonly<{
  npcId: string
  npcNameZh: string
  personality: NpcProfile['personality']
  needs: NpcLifeView['needs']
  lifeGoal: NpcLifeView['goal']
  beliefCount: number
  fearBeliefCount: number
  memoryUrgencyBoost: number
  memoryContext: string
  currentTick: number
}>

const INTENT_TO_BIAS_KEY: Readonly<Record<IntentKind, keyof Pick<NpcCognitiveProfile, 'survivalBias' | 'economicBias' | 'socialBias' | 'ecosystemBias'>>> = {
  survival: 'survivalBias',
  economic: 'economicBias',
  social: 'socialBias',
  ecosystem: 'ecosystemBias',
}

export function deriveNpcCognitiveProfile(input: NpcCognitiveRuntimeInput): NpcCognitiveProfile {
  const greed = readNumber(input.personality.greed, 0.35)
  const safetyWeight = readNumber(input.personality.safetyWeight, 0.5)
  const economyWeight = readNumber(input.personality.economyWeight, 0.5)
  const factionLoyalty = readNumber(input.personality.factionLoyalty, 0.5)
  const talkativeness = readNumber(input.personality.talkativeness, 0.4)
  const patience = readNumber(input.personality.patience, 0.5)
  const archetype = typeof input.personality.archetype === 'string' ? input.personality.archetype : ''

  const fearPressure = clamp01(input.fearBeliefCount * 0.18 + input.memoryUrgencyBoost * 0.14 + input.needs.safety / 200)
  const economyPressure = clamp01(greed * 0.5 + economyWeight * 0.35 + input.needs.money / 250 + (input.lifeGoal.kind === 'earn_money' ? input.lifeGoal.pressure / 250 : 0))
  const socialPressure = clamp01(talkativeness * 0.45 + factionLoyalty * 0.25 + (input.lifeGoal.kind === 'form_family' ? input.lifeGoal.pressure / 180 : 0))
  const ecosystemPressure = clamp01(input.beliefCount * 0.06 + (archetype.includes('ranger') || archetype.includes('guardian') ? 0.22 : 0))

  const survivalBias = clampBias(0.78 + safetyWeight * 0.46 + fearPressure * 0.42 - greed * 0.12)
  const economicBias = clampBias(0.76 + economyWeight * 0.48 + greed * 0.36 + economyPressure * 0.24 - safetyWeight * 0.1)
  const socialBias = clampBias(0.78 + talkativeness * 0.36 + factionLoyalty * 0.22 + socialPressure * 0.2)
  const ecosystemBias = clampBias(0.72 + ecosystemPressure * 0.42 + (input.memoryContext.includes('生態') ? 0.12 : 0))
  const patienceBias = clampBias(0.72 + patience * 0.56)

  const dominantTrait = chooseDominantTrait({ survivalBias, economicBias, socialBias, ecosystemBias })
  const memoryAware = input.memoryContext.trim().length > 0 || input.fearBeliefCount > 0
  return {
    survivalBias,
    economicBias,
    socialBias,
    ecosystemBias,
    patienceBias,
    dominantTrait,
    thoughtZh: buildThoughtZh(input.npcNameZh, dominantTrait, memoryAware),
    thoughtEn: buildThoughtEn(input.npcNameZh, dominantTrait, memoryAware),
  }
}

export function deriveNpcCognitiveProfileFromRuntime(input: Readonly<{
  profile: NpcProfile
  needs: NpcLifeView['needs']
  lifeGoal: NpcLifeView['goal']
  beliefs: readonly BeliefRow[]
  memoryUrgencyBoost: number
  memoryContext: string
  currentTick: number
}>): NpcCognitiveProfile {
  return deriveNpcCognitiveProfile({
    npcId: input.profile.id,
    npcNameZh: input.profile.name.zh,
    personality: input.profile.personality,
    needs: input.needs,
    lifeGoal: input.lifeGoal,
    beliefCount: input.beliefs.length,
    fearBeliefCount: input.beliefs.filter((belief) => belief.emotionalTag === 'fear' || belief.value === 'dangerous').length,
    memoryUrgencyBoost: input.memoryUrgencyBoost,
    memoryContext: input.memoryContext,
    currentTick: input.currentTick,
  })
}

export function cognitiveBiasForIntent(profile: NpcCognitiveProfile | null | undefined, intent: IntentKind): number {
  if (!profile) return 1
  return profile[INTENT_TO_BIAS_KEY[intent]]
}

function chooseDominantTrait(input: Pick<NpcCognitiveProfile, 'survivalBias' | 'economicBias' | 'socialBias' | 'ecosystemBias'>): NpcCognitiveDominantTrait {
  const ranked: Array<readonly [NpcCognitiveDominantTrait, number]> = ([
    ['survival', input.survivalBias],
    ['economic', input.economicBias],
    ['social', input.socialBias],
    ['ecosystem', input.ecosystemBias],
  ] as Array<readonly [NpcCognitiveDominantTrait, number]>).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  const best = ranked[0]
  if (!best || best[1] < 1.03) return 'steady'
  return best[0]
}

function buildThoughtZh(name: string, trait: NpcCognitiveDominantTrait, memoryAware: boolean): string {
  const prefix = memoryAware ? name + '記得最近發生的事，' : name + '觀察眼前局勢，'
  switch (trait) {
    case 'survival': return prefix + '先把安全與退路排在第一位。'
    case 'economic': return prefix + '正在盤算生計、資源與下一個機會。'
    case 'social': return prefix + '更在意人際關係、信任與群體位置。'
    case 'ecosystem': return prefix + '留意環境變化與棲地壓力。'
    case 'steady': return prefix + '暫時維持節奏，不急著偏離日程。'
  }
}

function buildThoughtEn(name: string, trait: NpcCognitiveDominantTrait, memoryAware: boolean): string {
  const prefix = memoryAware ? name + ' remembers recent events and ' : name + ' reads the situation and '
  switch (trait) {
    case 'survival': return prefix + 'puts safety and escape routes first.'
    case 'economic': return prefix + 'is weighing livelihood, resources, and opportunity.'
    case 'social': return prefix + 'cares most about trust, relationships, and standing.'
    case 'ecosystem': return prefix + 'is watching environmental and habitat pressure.'
    case 'steady': return prefix + 'keeps a steady routine for now.'
  }
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function clamp01(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0
  if (value > 1) return 1
  return value
}

function clampBias(value: number): number {
  if (!Number.isFinite(value)) return 1
  if (value < 0.65) return 0.65
  if (value > 1.55) return 1.55
  return Math.round(value * 100) / 100
}

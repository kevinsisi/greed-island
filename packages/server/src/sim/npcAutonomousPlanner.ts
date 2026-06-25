import type { IntentKind, NpcAgentDecisionCmd } from '../kernel/livingWorldCommands.js'
import type { NpcLifeNeedKey, NpcLifeView } from './cityLife.js'
import type { IntentEntry } from './intentPlanner.js'
import type { NpcRuntimeState } from './npcEngine.js'
import { cognitiveBiasForIntent, type NpcCognitiveProfile } from './npcCognitiveRuntime.js'

export type NpcAutonomousPlannerTileScore = Readonly<{
  safety: number
  economy: number
}>

export type NpcAutonomousPlannerInput = Readonly<{
  npcId: string
  npcNameZh: string
  currentTile: string
  defaultTile: string
  currentTick: number
  threshold: number
  needs: NpcLifeView['needs']
  lifeGoal: NpcLifeView['goal']
  intentEntries: readonly IntentEntry[]
  currentOverride: NpcRuntimeState['intentOverride']
  adjacentTiles: readonly string[]
  tileScores: Readonly<Record<string, NpcAutonomousPlannerTileScore>>
  tileNames: Readonly<Record<string, string | undefined>>
  cognitive?: NpcCognitiveProfile | null
}>

type Candidate = Readonly<{
  chosenIntent: IntentKind
  targetTile: string
  urgency: number
  reason: string
  source: 'belief' | 'need' | 'life-goal' | 'continue'
}>

const NEED_TO_INTENT: Readonly<Record<NpcLifeNeedKey, IntentKind>> = {
  food: 'economic',
  rest: 'survival',
  money: 'economic',
  housing: 'economic',
  safety: 'survival',
}

const LIFE_GOAL_TO_INTENT: Readonly<Record<NpcLifeView['goal']['kind'], IntentKind>> = {
  eat: 'economic',
  rest: 'survival',
  earn_money: 'economic',
  secure_home: 'economic',
  seek_safety: 'survival',
  form_family: 'social',
  build_city: 'economic',
  learn_skill: 'economic',
}

export function planNpcAutonomousDecision(input: NpcAutonomousPlannerInput): NpcAgentDecisionCmd {
  const candidate = chooseCandidate(input)
  if (!candidate) return followScheduleDecision(input)
  return {
    npcId: input.npcId,
    tile: input.currentTile,
    chosenIntent: candidate.chosenIntent,
    targetTile: candidate.targetTile,
    urgency: clampUrgency(candidate.urgency),
    reason: candidate.reason,
    utterance: buildUtterance(input, candidate),
    decidedAtTick: input.currentTick,
    narration: buildNarration(input, candidate),
  }
}

function chooseCandidate(input: NpcAutonomousPlannerInput): Candidate | null {
  const topIntent = input.intentEntries[0]
  const beliefCandidate = topIntent && topIntent.urgency > input.threshold
    ? fromIntentEntry(input, topIntent)
    : null
  const needCandidate = fromNeeds(input)
  const goalCandidate = fromLifeGoal(input)
  const ranked = [beliefCandidate, needCandidate, goalCandidate]
    .filter((c): c is Candidate => c !== null)
    .sort((a, b) => b.urgency - a.urgency || compareId(a.targetTile, b.targetTile))
  const best = ranked[0] ?? null
  if (input.currentOverride && input.currentOverride.targetTile !== input.currentTile) {
    if (!best || best.urgency <= input.currentOverride.urgency * 1.2) {
      return {
        chosenIntent: input.currentOverride.intentType,
        targetTile: input.currentOverride.targetTile,
        urgency: input.currentOverride.urgency,
        reason: `autonomous-planner:延續尚未完成的${intentLabel(input.currentOverride.intentType)}計畫，目標是${tileName(input, input.currentOverride.targetTile)}。`,
        source: 'continue',
      }
    }
  }
  if (!best || best.urgency <= input.threshold) return null
  return best
}

function fromIntentEntry(input: NpcAutonomousPlannerInput, entry: IntentEntry): Candidate {
  return {
    chosenIntent: entry.kind,
    targetTile: entry.targetTile,
    urgency: applyCognitiveBias(input, entry.kind, entry.urgency),
    reason: withCognitiveReason(input, `autonomous-planner:根據記憶與信念判斷，${intentLabel(entry.kind)}優先，前往${tileName(input, entry.targetTile)}。`),
    source: 'belief',
  }
}

function fromNeeds(input: NpcAutonomousPlannerInput): Candidate | null {
  const candidates: Candidate[] = []
  for (const key of ['safety', 'food', 'rest', 'money', 'housing'] as const) {
      const value = input.needs[key]
      if (value <= input.threshold) continue
      const chosenIntent = NEED_TO_INTENT[key]
      const targetTile = targetForIntent(input, chosenIntent, key)
      candidates.push({
        chosenIntent,
        targetTile,
        urgency: applyCognitiveBias(input, chosenIntent, value),
        reason: withCognitiveReason(input, `autonomous-planner:${needLabel(key)}壓力 ${Math.round(value)}，因此把下一步排向${tileName(input, targetTile)}。`),
        source: 'need',
      })
  }
  candidates.sort((a, b) => b.urgency - a.urgency || compareId(a.targetTile, b.targetTile))
  return candidates[0] ?? null
}

function fromLifeGoal(input: NpcAutonomousPlannerInput): Candidate | null {
  if (input.lifeGoal.pressure <= input.threshold) return null
  const chosenIntent = LIFE_GOAL_TO_INTENT[input.lifeGoal.kind]
  const targetTile = targetForIntent(input, chosenIntent, input.lifeGoal.kind === 'rest' ? 'rest' : null)
  return {
    chosenIntent,
    targetTile,
    urgency: applyCognitiveBias(input, chosenIntent, Math.max(input.threshold + 1, input.lifeGoal.pressure)),
    reason: withCognitiveReason(input, `autonomous-planner:人生目標「${input.lifeGoal.narration}」壓力 ${Math.round(input.lifeGoal.pressure)}，先朝${tileName(input, targetTile)}行動。`),
    source: 'life-goal',
  }
}

function targetForIntent(
  input: NpcAutonomousPlannerInput,
  intent: IntentKind,
  needOrGoal: NpcLifeNeedKey | 'rest' | null,
): string {
  if (needOrGoal === 'rest') return input.defaultTile || input.currentTile
  if (intent === 'survival') return bestTile(input, 'safety')
  if (intent === 'economic') return bestTile(input, 'economy')
  if (intent === 'social') return bestTile(input, 'economy')
  if (intent === 'ecosystem') return bestTile(input, 'safety')
  return input.currentTile
}

function bestTile(input: NpcAutonomousPlannerInput, key: keyof NpcAutonomousPlannerTileScore): string {
  const candidates = unique([input.currentTile, ...input.adjacentTiles, input.defaultTile].filter(Boolean))
  return candidates
    .sort((a, b) => score(input, b, key) - score(input, a, key) || compareId(a, b))[0] ?? input.currentTile
}

function strongestNeed(needs: NpcLifeView['needs']): { key: NpcLifeNeedKey; value: number } | null {
  let best: { key: NpcLifeNeedKey; value: number } | null = null
  for (const key of ['safety', 'food', 'rest', 'money', 'housing'] as const) {
    const value = needs[key]
    if (!best || value > best.value) best = { key, value }
  }
  return best
}

function followScheduleDecision(input: NpcAutonomousPlannerInput): NpcAgentDecisionCmd {
  return {
    npcId: input.npcId,
    tile: input.currentTile,
    chosenIntent: 'follow_schedule',
    targetTile: null,
    urgency: 0,
    reason: 'autonomous-planner:沒有更高優先級的壓力，先照既有日程與職責行動。',
    utterance: null,
    decidedAtTick: input.currentTick,
    narration: input.cognitive
      ? `${input.npcNameZh}檢視眼前狀況後，決定先照原本日程行動。${input.cognitive.thoughtZh}`
      : `${input.npcNameZh}檢視眼前狀況後，決定先照原本日程行動。`,
  }
}

function buildUtterance(input: NpcAutonomousPlannerInput, candidate: Candidate): string {
  switch (candidate.source) {
    case 'belief':
      return `先去${tileName(input, candidate.targetTile)}確認。`
    case 'need':
      return `現在得先處理${intentLabel(candidate.chosenIntent)}。`
    case 'life-goal':
      return '這件事不能再拖。'
    case 'continue':
      return '先把這趟走完。'
  }
}

function buildNarration(input: NpcAutonomousPlannerInput, candidate: Candidate): string {
  const base = `${input.npcNameZh}決定前往${tileName(input, candidate.targetTile)}，優先處理${intentLabel(candidate.chosenIntent)}。`
  return input.cognitive ? `${base}${input.cognitive.thoughtZh}` : base
}

function applyCognitiveBias(input: NpcAutonomousPlannerInput, intent: IntentKind, urgency: number): number {
  const biased = urgency * cognitiveBiasForIntent(input.cognitive, intent)
  return Math.min(100, biased)
}

function withCognitiveReason(input: NpcAutonomousPlannerInput, reason: string): string {
  return input.cognitive ? `${reason} cognitive:${input.cognitive.dominantTrait}:${input.cognitive.thoughtZh}` : reason
}

function score(input: NpcAutonomousPlannerInput, tileId: string, key: keyof NpcAutonomousPlannerTileScore): number {
  const row = input.tileScores[tileId]
  return typeof row?.[key] === 'number' && Number.isFinite(row[key]) ? row[key] : 50
}

function tileName(input: NpcAutonomousPlannerInput, tileId: string): string {
  return input.tileNames[tileId] ?? tileId
}

function intentLabel(intent: IntentKind): string {
  switch (intent) {
    case 'survival': return '安全與生存'
    case 'economic': return '生計與資源'
    case 'social': return '關係與社群'
    case 'ecosystem': return '環境與棲地'
  }
}

function needLabel(key: NpcLifeNeedKey): string {
  switch (key) {
    case 'food': return '食物'
    case 'rest': return '休息'
    case 'money': return '金錢'
    case 'housing': return '住房'
    case 'safety': return '安全'
  }
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)]
}

function compareId(a: string, b: string): number {
  if (a < b) return -1
  if (a > b) return 1
  return 0
}

function clampUrgency(value: number): number {
  if (!Number.isFinite(value)) return 0
  if (value < 0) return 0
  if (value > 100) return 100
  return Math.round(value * 10) / 10
}

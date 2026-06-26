import type { NpcFreeformActionProposedCmd, NpcFreeformActionKind } from '../kernel/livingWorldCommands.js'
import type { NpcLifeNeedKey, NpcLifeView } from './cityLife.js'
import type { NpcRuntimeState } from './npcEngine.js'
import type { NpcAutonomousPlannerTileScore } from './npcAutonomousPlanner.js'
import type { NpcCognitiveProfile } from './npcCognitiveRuntime.js'

export type NpcWorldLawActionPlannerInput = Readonly<{
  npcId: string
  npcNameZh: string
  roleZh: string
  currentTile: string
  defaultTile: string
  currentTick: number
  threshold: number
  needs: NpcLifeView['needs']
  lifeGoal: NpcLifeView['goal']
  currentOverride: NpcRuntimeState['intentOverride']
  adjacentTiles: readonly string[]
  tileScores: Readonly<Record<string, NpcAutonomousPlannerTileScore>>
  tileNames: Readonly<Record<string, string | undefined>>
  cognitive?: NpcCognitiveProfile | null
  memoryContext: string
}>

type WorldLawCandidate = Readonly<{
  kind: NpcFreeformActionKind
  targetTile: string | null
  pressure: number
  need: NpcLifeNeedKey | 'life_goal' | 'memory'
  actionZh: string
  riskZh: string
  expectedOutcomeZh: string
  utteranceZh: string
}>

export function planNpcWorldLawAction(input: NpcWorldLawActionPlannerInput): NpcFreeformActionProposedCmd | null {
  const candidate = chooseWorldLawCandidate(input)
  if (!candidate || candidate.pressure <= input.threshold) return null
  const targetName = candidate.targetTile ? tileName(input, candidate.targetTile) : tileName(input, input.currentTile)
  const reason = buildReason(input, candidate, targetName)
  const summary = `${input.npcNameZh}${candidate.actionZh}（${targetName}；${reason}）`
  return {
    npcId: input.npcId,
    tile: input.currentTile,
    proposal: {
      action: `${input.roleZh}${candidate.actionZh}`,
      target: { tileId: candidate.targetTile, npcId: null, cardId: null },
      reason,
      risk: candidate.riskZh,
      expectedOutcome: candidate.expectedOutcomeZh,
      utterance: candidate.utteranceZh,
    },
    resolved: {
      kind: candidate.kind,
      targetTile: candidate.targetTile,
      targetNpcId: null,
      cardId: null,
      summary,
    },
    accepted: true,
    rejectionReason: null,
    decidedAtTick: input.currentTick,
    narration: `${input.npcNameZh}${candidate.actionZh}，不是被排程推著走，而是在世界限制內選擇回應${targetName}的壓力。`,
  }
}

function chooseWorldLawCandidate(input: NpcWorldLawActionPlannerInput): WorldLawCandidate | null {
  if (input.currentOverride && input.currentOverride.targetTile !== input.currentTile) {
    return {
      kind: 'travel',
      targetTile: input.currentOverride.targetTile,
      pressure: input.currentOverride.urgency,
      need: 'memory',
      actionZh: `延續原本未完成的行動，前往${tileName(input, input.currentOverride.targetTile)}`,
      riskZh: '途中可能錯過目前街區的工作與消息。',
      expectedOutcomeZh: '先把已經承諾或已經起頭的事走完。',
      utteranceZh: '先把這趟走完。',
    }
  }

  const primary = strongestNeed(input.needs)
  const cognitiveTrait = input.cognitive?.dominantTrait ?? 'steady'
  const lifeGoalPressure = input.lifeGoal.pressure
  const pressure = Math.max(primary.value, lifeGoalPressure, input.memoryContext.trim().length > 0 ? input.threshold + 8 : 0)
  if (pressure <= input.threshold) return null

  if (cognitiveTrait === 'survival' || primary.key === 'safety') {
    const targetTile = bestTile(input, 'safety')
    return {
      kind: 'travel',
      targetTile,
      pressure: Math.max(primary.value, input.cognitive ? input.cognitive.survivalBias * primary.value : primary.value),
      need: primary.key,
      actionZh: `避開${tileName(input, input.currentTile)}的風險，先轉往${tileName(input, targetTile)}觀察退路`,
      riskZh: '離開原地會讓原本的工作延後，也可能錯過熟人的求助。',
      expectedOutcomeZh: '取得安全位置與下一步情報，而不是在壓力最高處硬撐。',
      utteranceZh: '先找條退路。',
    }
  }

  if (input.lifeGoal.kind === 'build_city' || primary.key === 'housing') {
    const targetTile = bestTile(input, 'economy')
    return {
      kind: 'build',
      targetTile,
      pressure: Math.max(primary.value, lifeGoalPressure),
      need: primary.key === 'housing' ? 'housing' : 'life_goal',
      actionZh: `主動查看${tileName(input, targetTile)}能不能整理出可用的公共空間`,
      riskZh: '材料與人手可能不足，開口號召也可能被居民質疑。',
      expectedOutcomeZh: '把住房或公共設施壓力轉成可驗證的建設提案。',
      utteranceZh: '得先量出空地。',
    }
  }

  if (cognitiveTrait === 'social' || input.lifeGoal.kind === 'form_family') {
    return {
      kind: 'custom_social_scene',
      targetTile: input.currentTile,
      pressure: Math.max(primary.value, lifeGoalPressure),
      need: 'life_goal',
      actionZh: `留在${tileName(input, input.currentTile)}找人交換近況與人情`,
      riskZh: '談話可能暴露自己的缺口，也可能被誤會是在打探消息。',
      expectedOutcomeZh: '累積信任、消息與下一個可合作的人。',
      utteranceZh: '先聽聽大家怎麼說。',
    }
  }

  if (cognitiveTrait === 'ecosystem') {
    const targetTile = bestTile(input, 'safety')
    return {
      kind: 'work',
      targetTile,
      pressure: Math.max(primary.value, lifeGoalPressure),
      need: 'memory',
      actionZh: `前往${tileName(input, targetTile)}巡看水源、棲地與可採集的邊界`,
      riskZh: '如果判斷錯誤，可能浪費一整段可工作的時間。',
      expectedOutcomeZh: '確認環境壓力是否已經影響居民的日常資源。',
      utteranceZh: '得看水邊變化。',
    }
  }

  const targetTile = bestTile(input, 'economy')
  return {
    kind: 'work',
    targetTile,
    pressure: Math.max(primary.value, lifeGoalPressure),
    need: primary.key === 'money' || primary.key === 'food' ? primary.key : 'life_goal',
    actionZh: `前往${tileName(input, targetTile)}接一件符合${input.roleZh}身分的實際工作`,
    riskZh: '報酬、工具或委託人都不一定可靠，做錯選擇會消耗體力與名聲。',
    expectedOutcomeZh: '用職業能力換取收入、食物或下一個交易機會。',
    utteranceZh: '先找能做的活。',
  }
}

function buildReason(input: NpcWorldLawActionPlannerInput, candidate: WorldLawCandidate, targetName: string): string {
  const primary = strongestNeed(input.needs)
  const memory = input.memoryContext.trim()
  const memoryLine = memory ? `記憶線索「${truncate(memory, 42)}」也指向${targetName}。` : ''
  const thought = input.cognitive?.thoughtZh ? ` ${input.cognitive.thoughtZh}` : ''
  const needText = candidate.need === 'life_goal'
    ? `人生目標「${input.lifeGoal.narration}」壓力 ${Math.round(input.lifeGoal.pressure)}`
    : candidate.need === 'memory'
      ? `最近記憶與世界壓力高於 ${input.threshold}`
      : `${needLabel(candidate.need)}壓力 ${Math.round(input.needs[candidate.need])}`
  const lifeGoalLine = candidate.need !== 'life_goal' && input.lifeGoal.pressure > input.threshold
    ? `人生目標「${input.lifeGoal.narration}」也在推動這個選擇。`
    : ''
  return `${needText}；目前最高需求是${needLabel(primary.key)} ${Math.round(primary.value)}。${lifeGoalLine}${memoryLine}${thought}`.trim()
}

function strongestNeed(needs: NpcLifeView['needs']): { key: NpcLifeNeedKey; value: number } {
  let best: { key: NpcLifeNeedKey; value: number } = { key: 'food', value: needs.food }
  for (const key of ['rest', 'money', 'housing', 'safety'] as const) {
    const value = needs[key]
    if (value > best.value) best = { key, value }
  }
  return best
}

function bestTile(input: NpcWorldLawActionPlannerInput, key: keyof NpcAutonomousPlannerTileScore): string {
  const candidates = [...new Set([input.currentTile, ...input.adjacentTiles, input.defaultTile].filter(Boolean))]
  return candidates.sort((a, b) => score(input, b, key) - score(input, a, key) || a.localeCompare(b))[0] ?? input.currentTile
}

function score(input: NpcWorldLawActionPlannerInput, tileId: string, key: keyof NpcAutonomousPlannerTileScore): number {
  const row = input.tileScores[tileId]
  return typeof row?.[key] === 'number' && Number.isFinite(row[key]) ? row[key] : 50
}

function tileName(input: NpcWorldLawActionPlannerInput, tileId: string): string {
  return input.tileNames[tileId] ?? tileId
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

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`
}

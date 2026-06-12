// NPC AI Agent — 每個 NPC 的自主意志層（v0.89.0）。
//
// 憲法邊界（ARCHITECTURE.md §9）：AI 是 read-only 旁白 + 意圖分類器。
// 這層因此設計成「選擇題」：server 先用確定性 intent stack 算出此刻所有
// 合法選項（含 follow_schedule），AI 讀 NPC 的認知脈絡後**只能選一個選項**
// 並給一句理由 + 一句自言自語。urgency / targetTile 一律取 server 算好的
// 值，AI 的數字不被採信。AI 掛掉 → 不做任何事（確定性 planner 照常運作）。

import type { NpcProfile } from './types.js'
import type { IntentEntry } from '../sim/intentPlanner.js'
import type { IntentKind } from '../kernel/livingWorldCommands.js'
import { NPC_AGENT_UTTERANCE_MAX_CHARS } from '../config/world.js'
import { MAP_ADJACENCY } from '../sim/mapGraph.js'

export type AgentOption = Readonly<{
  /** 'follow_schedule' 或 intent stack entry。 */
  kind: 'follow_schedule' | IntentKind
  targetTile: string | null
  urgency: number
  /** 給 AI 看的選項描述。 */
  description: string
}>

export type AgentDecision = Readonly<{
  optionIndex: number
  reason: string
  utterance: string | null
}>

export const FREEFORM_AGENT_ACTIONS = [
  'travel',
  'work',
  'rest',
  'socialize',
  'buy_card',
  'challenge_combat',
  'spread_rumor',
  'custom_social_scene',
] as const

export type FreeformAgentActionKind = (typeof FREEFORM_AGENT_ACTIONS)[number]

export type FreeformAgentProposal = Readonly<{
  action: string
  target: Readonly<{ tileId: string | null; npcId: string | null; cardId: string | null }>
  reason: string
  risk: string
  expectedOutcome: string
  utterance: string | null
}>

export type ResolvedFreeformAgentAction = Readonly<{
  kind: FreeformAgentActionKind
  targetTile: string | null
  targetNpcId: string | null
  cardId: string | null
  summary: string
}>

export type FreeformAgentResolution = Readonly<{
  proposal: FreeformAgentProposal
  resolved: ResolvedFreeformAgentAction
  accepted: boolean
  rejectionReason: string | null
}>

export type FreeformAgentResolveContext = Readonly<{
  currentTile: string
  defaultTile: string
  livingNpcIds: ReadonlySet<string>
  getNpcTile: (npcId: string) => string | null
}>

const INTENT_LABEL_ZH: Readonly<Record<IntentKind, string>> = {
  survival: '生存（離開危險）',
  economic: '經濟（追物資/收入）',
  social: '社交（迴避敵對勢力/靠近同伴）',
  ecosystem: '生態（離開枯竭地）',
}

/** 從 intent stack 組合法選項清單。index 0 永遠是 follow_schedule。 */
export function buildAgentOptions(entries: readonly IntentEntry[]): AgentOption[] {
  const options: AgentOption[] = [
    {
      kind: 'follow_schedule',
      targetTile: null,
      urgency: 0,
      description: '照常生活：跟著今天的日程走（工作、吃飯、休息）。',
    },
  ]
  for (const entry of entries) {
    options.push({
      kind: entry.kind,
      targetTile: entry.targetTile,
      urgency: Math.min(100, Math.max(0, entry.urgency)),
      description: `${INTENT_LABEL_ZH[entry.kind]}：前往 ${entry.targetTile}（理由：${entry.reason}；迫切度 ${Math.round(entry.urgency)}/100）`,
    })
  }
  return options
}

export function buildAgentPrompt(input: {
  profile: NpcProfile
  currentTile: string
  needsLine: string
  lifeGoalContext: string
  beliefContext: string
  reflectionContext: string
  options: readonly AgentOption[]
  worldTick: number
}): { systemPrompt: string; userPrompt: string } {
  const { profile, options } = input
  const optionLines = options.map((opt, i) => `  ${i}. ${opt.description}`).join('\n')
  const systemPrompt = [
    `你是《貪婪之島 / Tideway》世界裡的 NPC「${profile.name.zh}」（${profile.role.zh}），駐地 ${profile.defaultLocation}，現在在 ${input.currentTile}。`,
    '你要替「自己」做這個時辰的生活決定。你不是 AI，你是這個世界裡活著的人。',
    '',
    input.needsLine ? `### 你當下的身體與生活狀態\n${input.needsLine}` : '',
    input.lifeGoalContext,
    input.beliefContext,
    input.reflectionContext,
    '',
    '### 你現在合法的選項（只能選一個，用編號回答）',
    optionLines,
    '',
    '### 回應規則',
    '- 回傳嚴格 JSON（不要 markdown fence）：',
    '  { "choice": 選項編號(整數), "reason": "一句中文理由（以第一人稱）", "utterance": "一句你此刻會說出口的自言自語（中文、口語、≤30字）" }',
    '- choice 必須是上面列出的編號之一。',
    '- reason 與 utterance 不可虛構選項以外的地名或人名。',
  ].filter((line) => line !== '').join('\n')
  const userPrompt = `世界刻度 ${input.worldTick}。請以 ${profile.name.zh} 的身分做出這個時辰的決定，回傳 JSON。`
  return { systemPrompt, userPrompt }
}

export function buildFreeformAgentPrompt(input: {
  profile: NpcProfile
  currentTile: string
  needsLine: string
  lifeGoalContext: string
  beliefContext: string
  reflectionContext: string
  worldTick: number
}): { systemPrompt: string; userPrompt: string } {
  const { profile } = input
  const personality = profile.personality ?? {}
  const personaLines = [
    `姓名：${profile.name.zh} / ${profile.name.en}`,
    `職業：${profile.role.zh} / ${profile.role.en}`,
    `駐地：${profile.defaultLocation}`,
    `人格權重：安全 ${fmtPersonality(personality.safetyWeight)}、經濟 ${fmtPersonality(personality.economyWeight)}、忠誠 ${fmtPersonality(personality.factionLoyalty)}、貪婪 ${fmtPersonality(personality.greed)}、耐心 ${fmtPersonality(personality.patience)}`,
  ].join('\n')
  const systemPrompt = [
    `你是《貪婪之島 / Tideway》世界裡活著的 NPC。你不是旁白，也不是玩家助手。`,
    '你可以替自己自由創造任意生活行為，但你不能直接改變世界；伺服器會驗證你的提案是否合法。',
    '',
    `### 你的身份\n${personaLines}`,
    `### 目前位置\n${input.currentTile}`,
    input.needsLine ? `### 你當下的身體與生活狀態\n${input.needsLine}` : '',
    input.lifeGoalContext,
    input.beliefContext,
    input.reflectionContext,
    '',
    '### 你可以自由提出的行為方向',
    '- travel: 去某個地區',
    '- work: 做工作、服務、建設、打獵、採集、巡邏',
    '- rest: 休息、躲避、恢復',
    '- socialize: 找某個人、拜訪、求助、告白、道歉、結盟',
    '- buy_card: 想去買卡、換卡、追求某張卡',
    '- challenge_combat: 挑戰、威嚇、追捕或準備戰鬥',
    '- spread_rumor: 傳聞、警告、放話',
    '- custom_social_scene: 其他不直接改變物品/金錢/HP/關係數值的生活場景',
    '',
    '### 回應規則',
    '- 回傳嚴格 JSON（不要 markdown fence）。',
    '- 不要宣稱你已經拿到卡、改變金錢、殺死誰、治癒誰或瞬間移動；你只能提出想做的事。',
    '- target 裡不知道的欄位填 null。tileId 必須像 t_central；npcId 必須是你知道的 NPC id；cardId 可以是想追求的卡。',
    '- JSON 格式：',
    '{ "action": "travel|work|rest|socialize|buy_card|challenge_combat|spread_rumor|custom_social_scene", "target": { "tileId": string|null, "npcId": string|null, "cardId": string|null }, "reason": "第一人稱中文理由", "risk": "願意承擔的風險", "expectedOutcome": "希望發生什麼", "utterance": "一句≤30字自言自語" }',
  ].filter((line) => line !== '').join('\n')
  const userPrompt = `世界刻度 ${input.worldTick}。請以 ${profile.name.zh} 的身分，自由提出你此刻真正想做的一件事。`
  return { systemPrompt, userPrompt }
}

export function parseFreeformAgentProposal(raw: string): FreeformAgentProposal | null {
  const jsonText = extractJsonObject(raw)
  if (!jsonText) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(jsonText)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
  const obj = parsed as Record<string, unknown>
  const action = stringField(obj.action, 40)
  const reason = stringField(obj.reason, 180)
  if (!action || !reason) return null
  const target = normalizeTarget(obj.target)
  return {
    action,
    target,
    reason,
    risk: stringField(obj.risk, 120) || '未說明',
    expectedOutcome: stringField(obj.expectedOutcome, 160) || '未說明',
    utterance: obj.utterance === null ? null : sanitizeOptionalUtterance(obj.utterance),
  }
}

export function resolveFreeformAgentProposal(
  proposal: FreeformAgentProposal,
  context: FreeformAgentResolveContext,
): FreeformAgentResolution {
  const kind = normalizeActionKind(proposal.action)
  const fallbackResolved: ResolvedFreeformAgentAction = {
    kind: kind ?? 'custom_social_scene',
    targetTile: null,
    targetNpcId: null,
    cardId: proposal.target.cardId,
    summary: summarizeProposal(proposal),
  }
  if (!kind) {
    return rejectProposal(proposal, fallbackResolved, `unsupported action: ${proposal.action}`)
  }
  const targetNpcId = proposal.target.npcId
  if (targetNpcId && !context.livingNpcIds.has(targetNpcId)) {
    return rejectProposal(proposal, { ...fallbackResolved, kind, targetNpcId }, `unknown or deceased npc target: ${targetNpcId}`)
  }
  const npcTile = targetNpcId ? context.getNpcTile(targetNpcId) : null
  const requestedTile = proposal.target.tileId ?? npcTile ?? defaultTileFor(kind, context)
  if (requestedTile !== null && !isKnownTile(requestedTile)) {
    return rejectProposal(proposal, { ...fallbackResolved, kind, targetNpcId, targetTile: requestedTile }, `unknown tile target: ${requestedTile}`)
  }
  const targetTile = requiresTile(kind) ? requestedTile : requestedTile ?? null
  if (requiresTile(kind) && !targetTile) {
    return rejectProposal(proposal, { ...fallbackResolved, kind, targetNpcId }, `${kind} requires a tile target`)
  }
  return {
    proposal,
    resolved: {
      kind,
      targetTile,
      targetNpcId,
      cardId: proposal.target.cardId,
      summary: summarizeProposal(proposal),
    },
    accepted: true,
    rejectionReason: null,
  }
}

/** 寬容解析 AI 回覆；解析失敗回 null（呼叫端靜默放棄本輪）。 */
export function parseAgentDecision(raw: string, optionCount: number): AgentDecision | null {
  const jsonText = extractJsonObject(raw)
  if (!jsonText) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(jsonText)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
  const obj = parsed as Record<string, unknown>
  const choiceRaw = obj.choice
  const choice = typeof choiceRaw === 'number' ? Math.trunc(choiceRaw) : Number.parseInt(String(choiceRaw), 10)
  if (!Number.isInteger(choice) || choice < 0 || choice >= optionCount) return null
  const reason = typeof obj.reason === 'string' && obj.reason.trim().length > 0
    ? obj.reason.trim().slice(0, 120)
    : '（未說明理由）'
  const utteranceRaw = typeof obj.utterance === 'string' ? obj.utterance.trim() : ''
  const utterance = utteranceRaw.length > 0
    ? sanitizeUtterance(utteranceRaw)
    : null
  return { optionIndex: choice, reason, utterance }
}

function sanitizeUtterance(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').slice(0, NPC_AGENT_UTTERANCE_MAX_CHARS)
}

function sanitizeOptionalUtterance(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? sanitizeUtterance(trimmed) : null
}

function stringField(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function normalizeTarget(value: unknown): FreeformAgentProposal['target'] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { tileId: null, npcId: null, cardId: null }
  }
  const target = value as Record<string, unknown>
  return {
    tileId: stringField(target.tileId, 80) || null,
    npcId: stringField(target.npcId, 160) || null,
    cardId: stringField(target.cardId, 80) || null,
  }
}

function normalizeActionKind(value: string): FreeformAgentActionKind | null {
  const normalized = value.trim().toLowerCase().replace(/[ -]+/g, '_')
  return (FREEFORM_AGENT_ACTIONS as readonly string[]).includes(normalized)
    ? normalized as FreeformAgentActionKind
    : null
}

function isKnownTile(tileId: string): boolean {
  return Object.prototype.hasOwnProperty.call(MAP_ADJACENCY, tileId)
}

function requiresTile(kind: FreeformAgentActionKind): boolean {
  return kind === 'travel' || kind === 'work' || kind === 'rest' || kind === 'buy_card' || kind === 'challenge_combat'
}

function defaultTileFor(kind: FreeformAgentActionKind, context: FreeformAgentResolveContext): string | null {
  if (kind === 'buy_card') return 't_dock'
  if (kind === 'rest') return context.defaultTile || context.currentTile
  if (kind === 'work' || kind === 'travel' || kind === 'challenge_combat') return context.currentTile
  return null
}

function summarizeProposal(proposal: FreeformAgentProposal): string {
  return `${proposal.action}: ${proposal.reason}`.slice(0, 220)
}

function rejectProposal(
  proposal: FreeformAgentProposal,
  resolved: ResolvedFreeformAgentAction,
  rejectionReason: string,
): FreeformAgentResolution {
  return { proposal, resolved, accepted: false, rejectionReason }
}

function fmtPersonality(value: unknown): string {
  return typeof value === 'number' && Number.isFinite(value) ? String(Math.round(value * 100) / 100) : '未定'
}

function extractJsonObject(raw: string): string | null {
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  return raw.slice(start, end + 1)
}

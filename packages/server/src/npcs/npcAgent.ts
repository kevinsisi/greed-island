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

function extractJsonObject(raw: string): string | null {
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  return raw.slice(start, end + 1)
}

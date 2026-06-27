import type { AnimalGroupRow } from '../api/client'
import type { EventSummary, NpcActivity, NpcSummary } from '../state/types'

export type BehaviorTone = 'idle' | 'active' | 'food' | 'conflict' | 'rest' | 'trade' | 'danger' | 'migration'

export type BehaviorBadge = Readonly<{
  primary: string
  detail: string
  tone: BehaviorTone
}>

type RelationshipActionKind = 'caution' | 'affinity' | 'reciprocity'

const NPC_ACTIVITY_BADGES: Readonly<Record<NpcActivity, BehaviorBadge>> = {
  idle: { primary: '待機中', detail: '暫時沒有明確行動', tone: 'idle' },
  move: { primary: '👣 正在移動', detail: '位置正在改變', tone: 'active' },
  work: { primary: '🛠️ 正在工作', detail: '執行工作或建設任務', tone: 'active' },
  eat: { primary: '🍚 正在吃飯', detail: '補充食物需求，不是泛用待機', tone: 'food' },
  sleep: { primary: '💤 正在睡覺', detail: '恢復休息需求', tone: 'rest' },
  trade: { primary: '💰 正在交易', detail: '處理買賣或交換', tone: 'trade' },
  patrol: { primary: '👁️ 正在巡邏', detail: '維持區域安全或監視', tone: 'active' },
  read: { primary: '📖 正在閱讀', detail: '吸收資訊或研究文本', tone: 'active' },
  perform: { primary: '🎵 正在表演', detail: '進行表演或儀式活動', tone: 'active' },
  craft: { primary: '⚒️ 正在製作', detail: '製作物品或工具', tone: 'active' },
  study: { primary: '🔬 正在研究', detail: '累積知識或技術', tone: 'active' },
  pray: { primary: '🙏 正在祈禱', detail: '進行信仰或精神活動', tone: 'active' },
  write: { primary: '✍️ 正在書寫', detail: '記錄資訊或整理想法', tone: 'active' },
  guard: { primary: '🛡️ 正在守衛', detail: '保護地點或人員', tone: 'active' },
}

export function npcBehaviorBadge(npc: NpcSummary, recentEvents: readonly EventSummary[]): BehaviorBadge {
  if (isNpcArguing(npc.id, recentEvents)) {
    return { primary: '💢 正在爭執', detail: '近期 NPC_INTERACT 記錄為 argue，場景應顯示衝突', tone: 'conflict' }
  }
  const relationshipBadge = npcRelationshipActionBadge(npc.id, recentEvents)
  if (relationshipBadge) return relationshipBadge
  return NPC_ACTIVITY_BADGES[npc.activity ?? 'idle'] ?? NPC_ACTIVITY_BADGES.idle
}

export function isNpcArguing(npcId: string, recentEvents: readonly EventSummary[]): boolean {
  return recentEvents.some((event) => {
    if (event.eventType !== 'NPC_INTERACT') return false
    if (event.payload?.mode !== 'argue') return false
    const participants = event.payload?.participants
    return Array.isArray(participants) && participants.includes(npcId)
  })
}

function npcRelationshipActionBadge(npcId: string, recentEvents: readonly EventSummary[]): BehaviorBadge | null {
  const event = [...recentEvents]
    .reverse()
    .find((candidate) => candidate.eventType === 'NPC_FREEFORM_ACTION_PROPOSED' && payloadNpcId(candidate) === npcId)
  if (!event) return null
  const kind = relationshipActionKind(event)
  const detail = relationshipActionDetail(event)
  switch (kind) {
    case 'caution':
      return { primary: '⚠️ 戒備玩家', detail: detail || '正在提醒附近人提高警覺。', tone: 'danger' }
    case 'affinity':
      return { primary: '🤝 想找玩家聊天', detail: detail || '正在主動維持玩家關係。', tone: 'active' }
    case 'reciprocity':
      return { primary: '💰 保留交易機會', detail: detail || '正在為熟客保留交易或工作機會。', tone: 'trade' }
    default:
      return null
  }
}

function relationshipActionKind(event: EventSummary): RelationshipActionKind | null {
  const proposal = proposalRecord(event)
  const reason = typeof proposal?.reason === 'string' ? proposal.reason : ''
  const action = typeof proposal?.action === 'string' ? proposal.action : ''
  const haystack = `${reason}\n${action}`
  if (haystack.includes('戒備') || haystack.includes('別太靠近')) return 'caution'
  if (haystack.includes('親近') || haystack.includes('信任的玩家') || haystack.includes('找信任')) return 'affinity'
  if (haystack.includes('交易互惠') || haystack.includes('熟客') || haystack.includes('留一手')) return 'reciprocity'
  return null
}

function relationshipActionDetail(event: EventSummary): string {
  const proposal = proposalRecord(event)
  const reason = typeof proposal?.reason === 'string' ? proposal.reason.trim() : ''
  const action = typeof proposal?.action === 'string' ? proposal.action.trim() : ''
  return reason || action
}

function payloadNpcId(event: EventSummary): string | null {
  const payload = event.payload
  const data = isRecord(payload.data) ? payload.data : payload
  return typeof data.npcId === 'string' ? data.npcId : null
}

function proposalRecord(event: EventSummary): Record<string, unknown> | null {
  const payload = event.payload
  const data = isRecord(payload.data) ? payload.data : payload
  return isRecord(data.proposal) ? data.proposal : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function animalBehaviorLabel(row: AnimalGroupRow): BehaviorBadge {
  switch (row.intent) {
    case 'foraging':
      return { primary: '覓食中', detail: row.thoughtZh || '正在找食物', tone: 'food' }
    case 'herding':
      return { primary: '成群移動', detail: row.thoughtZh || '群體保持距離與方向', tone: 'active' }
    case 'migrating':
      return { primary: '遷徙中', detail: row.thoughtZh || '正在離開或抵達區域', tone: 'migration' }
    case 'hunting':
      return { primary: '狩獵中', detail: row.thoughtZh || '正在尋找獵物', tone: 'danger' }
  }
}

export function behaviorToneClass(tone: BehaviorTone): string {
  switch (tone) {
    case 'food': return 'border-lime-700/60 text-lime-200 bg-lime-950/20'
    case 'conflict': return 'border-rust-600/80 text-rust-100 bg-rust-950/40'
    case 'trade': return 'border-yellow-600/70 text-yellow-100 bg-yellow-950/25'
    case 'rest': return 'border-indigo-600/60 text-indigo-100 bg-indigo-950/25'
    case 'danger': return 'border-red-600/70 text-red-100 bg-red-950/35'
    case 'migration': return 'border-cyan-600/70 text-cyan-100 bg-cyan-950/25'
    case 'active': return 'border-ember-700/60 text-ember-100 bg-ember-950/20'
    case 'idle':
    default:
      return 'border-ground-700 text-ground-300 bg-ground-950/25'
  }
}

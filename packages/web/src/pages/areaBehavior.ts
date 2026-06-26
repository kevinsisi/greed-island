import type { AnimalGroupRow } from '../api/client'
import type { EventSummary, NpcActivity, NpcSummary } from '../state/types'

export type BehaviorTone = 'idle' | 'active' | 'food' | 'conflict' | 'rest' | 'trade' | 'danger' | 'migration'

export type BehaviorBadge = Readonly<{
  primary: string
  detail: string
  tone: BehaviorTone
}>

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

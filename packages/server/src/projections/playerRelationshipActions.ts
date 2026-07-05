import type { Event } from '../kernel/types.js'

export type PlayerRelationshipActionKind = 'caution' | 'affinity' | 'reciprocity'

export type PlayerRelationshipActionView = Readonly<{
  kind: PlayerRelationshipActionKind
  labelZh: string
  detailZh: string
  utteranceZh: string | null
  tick: number
  sequence: number
}>

export const PLAYER_RELATIONSHIP_ACTION_EVENT_TYPES = ['NPC_FREEFORM_ACTION_PROPOSED'] as const

export class PlayerRelationshipActionProjection {
  private readonly byNpc = new Map<string, PlayerRelationshipActionView>()

  rebuildFromEvents(events: readonly Event[]): void {
    this.byNpc.clear()
    for (const event of events) this.project(event)
  }

  project(event: Event): void {
    const row = relationshipActionFromEvent(event)
    if (!row) return
    const current = this.byNpc.get(row.npcId)
    if (current && current.sequence > row.view.sequence) return
    this.byNpc.set(row.npcId, row.view)
  }

  getForNpc(npcId: string): PlayerRelationshipActionView | null {
    return this.byNpc.get(npcId) ?? null
  }
}

function relationshipActionFromEvent(event: Event): { npcId: string; view: PlayerRelationshipActionView } | null {
  if (event.eventType !== 'NPC_FREEFORM_ACTION_PROPOSED') return null
  const data = livingWorldData(event.payload)
  if (!data || data.accepted !== true) return null
  const npcId = typeof data.npcId === 'string' ? data.npcId : null
  if (!npcId) return null
  const proposal = isRecord(data.proposal) ? data.proposal : null
  const reason = typeof proposal?.reason === 'string' ? proposal.reason.trim() : ''
  const action = typeof proposal?.action === 'string' ? proposal.action.trim() : ''
  const utterance = typeof proposal?.utterance === 'string' && proposal.utterance.trim().length > 0
    ? proposal.utterance.trim()
    : null
  const kind = classifyRelationshipAction(reason, action)
  if (!kind) return null
  return {
    npcId,
    view: {
      kind,
      labelZh: labelFor(kind),
      detailZh: reason || action,
      utteranceZh: utterance,
      tick: event.tick ?? 0,
      sequence: event.sequence,
    },
  }
}

function classifyRelationshipAction(reason: string, action: string): PlayerRelationshipActionKind | null {
  const haystack = `${reason}\n${action}`
  if (haystack.includes('戒備') || haystack.includes('別太靠近')) return 'caution'
  if (haystack.includes('親近') || haystack.includes('信任的玩家') || haystack.includes('找信任')) return 'affinity'
  if (haystack.includes('交易互惠') || haystack.includes('熟客') || haystack.includes('留一手')) return 'reciprocity'
  return null
}

function labelFor(kind: PlayerRelationshipActionKind): string {
  switch (kind) {
    case 'caution': return '⚠️ 戒備玩家'
    case 'affinity': return '🤝 想找玩家聊天'
    case 'reciprocity': return '💰 保留交易機會'
  }
}

function livingWorldData(payload: unknown): Record<string, unknown> | null {
  if (!isRecord(payload)) return null
  return isRecord(payload.data) ? payload.data : payload
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

import type { EventSummary } from '../state/types'

export type AreaSubtitleTone = 'npc' | 'player' | 'system'

export type AreaSubtitleLine = Readonly<{
  id: string
  tick: number
  speaker: string
  text: string
  tone: AreaSubtitleTone
  npcId?: string
}>

export function areaSubtitleLines(input: {
  events: readonly EventSummary[]
  npcNameById: ReadonlyMap<string, string>
  nearbyNpcIds: ReadonlySet<string>
  playerAccountId: string | null
  limit?: number
}): AreaSubtitleLine[] {
  const limit = input.limit ?? 8
  const lines: AreaSubtitleLine[] = []
  for (const event of input.events.slice().reverse()) {
    if (event.eventType === 'NPC_INTERACT') {
      const participants = stringArray(payloadData(event.payload).participants)
      if (!participants.some((id) => input.nearbyNpcIds.has(id))) continue
      const text = formatNpcInteractionSubtitle(event, input.npcNameById)
      if (text) {
        lines.push({
          id: `${event.sequence}:npc-interact`,
          tick: event.tick,
          speaker: '附近',
          text,
          tone: 'system',
        })
      }
    }

    if (event.eventType === 'PLAYER_NPC_DIALOGUE') {
      const data = payloadData(event.payload)
      const npcId = typeof data.npcId === 'string' ? data.npcId : null
      if (!npcId || !input.nearbyNpcIds.has(npcId)) continue
      const playerMessage = typeof data.playerMessage === 'string' ? data.playerMessage.trim() : ''
      const npcReply = typeof data.npcReplyZh === 'string' ? data.npcReplyZh.trim() : ''
      const npcName = input.npcNameById.get(npcId) ?? npcId
      if (playerMessage) {
        lines.push({
          id: `${event.sequence}:player`,
          tick: event.tick,
          speaker: event.actorId === input.playerAccountId ? '你' : '玩家',
          text: playerMessage,
          tone: 'player',
          npcId,
        })
      }
      if (npcReply) {
        lines.push({
          id: `${event.sequence}:npc`,
          tick: event.tick,
          speaker: npcName,
          text: npcReply,
          tone: 'npc',
          npcId,
        })
      }
    }
  }
  return lines.slice(-limit)
}

export function nearestSpeakTarget(nearbyNpcIds: readonly string[], outdoorNpcIds: readonly string[]): string | null {
  for (const id of nearbyNpcIds) {
    if (outdoorNpcIds.includes(id)) return id
  }
  return outdoorNpcIds[0] ?? null
}

function payloadData(payload: Record<string, unknown>): Record<string, unknown> {
  const data = payload.data
  return isRecord(data) ? data : payload
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []
}

function formatNpcInteractionSubtitle(event: EventSummary, npcNameById: ReadonlyMap<string, string>): string | null {
  const narration = typeof event.narration === 'string' ? event.narration.trim() : ''
  if (narration) return narration
  const data = payloadData(event.payload)
  const [aRaw, bRaw] = stringArray(data.participants)
  const a = aRaw ? npcNameById.get(aRaw) ?? aRaw : '某位 NPC'
  const b = bRaw ? npcNameById.get(bRaw) ?? bRaw : '另一位 NPC'
  return data.mode === 'argue'
    ? `${a}和${b}正在爭執。`
    : `${a}和${b}正在交談。`
}

import type { EventSummary, NpcSummary } from '../state/types'
import { isAreaSociallyAvailableNpc } from './npcProjection'

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

    if (event.eventType === 'NPC_FREEFORM_ACTION_PROPOSED') {
      const data = payloadData(event.payload)
      const npcId = typeof data.npcId === 'string' ? data.npcId : null
      if (!npcId || !input.nearbyNpcIds.has(npcId)) continue
      const proposal = isRecord(data.proposal) ? data.proposal : null
      const utterance = typeof proposal?.utterance === 'string' ? proposal.utterance.trim() : ''
      if (!utterance) continue
      lines.push({
        id: `${event.sequence}:freeform-utterance`,
        tick: event.tick,
        speaker: input.npcNameById.get(npcId) ?? npcId,
        text: utterance,
        tone: 'npc',
        npcId,
      })
    }
  }
  return lines.slice(-limit)
}

export function nearestSpeakTarget(nearbyNpcIds: readonly string[], outdoorNpcIds: readonly string[]): string | null {
  return nearbySpeechRecipients(nearbyNpcIds, outdoorNpcIds, 1)[0] ?? null
}

export function nearbySpeechRecipients(
  nearbyNpcIds: readonly string[],
  outdoorNpcIds: readonly string[],
  limit = 3
): string[] {
  const outdoor = new Set(outdoorNpcIds)
  const nearby = nearbyNpcIds.filter((id) => outdoor.has(id))
  const recipients = nearby.length > 0 ? nearby : outdoorNpcIds.slice(0, 1)
  return recipients.slice(0, limit)
}

export function ambientNpcChatterLines(input: {
  npcs: readonly NpcSummary[]
  nearbyNpcIds: ReadonlySet<string>
  tick: number
  limit?: number
}): AreaSubtitleLine[] {
  const limit = input.limit ?? 3
  const seenText = new Set<string>()
  const nearby = input.npcs.filter((npc) => input.nearbyNpcIds.has(npc.id) && isAreaSociallyAvailableNpc(npc))
  const lines: AreaSubtitleLine[] = []
  for (const npc of nearby) {
    const text = npc.recentUtterance?.text?.trim()
    if (!text || seenText.has(text)) continue
    seenText.add(text)
    lines.push({
      id: `ambient:${npc.id}`,
      tick: input.tick,
      speaker: npc.name,
      text,
      tone: 'npc',
      npcId: npc.id,
    })
    if (lines.length >= limit) break
  }
  return lines
}

export function optimisticLocalShoutLines(input: {
  baseId: string
  tick: number
  playerMessage: string
  recipients: readonly { id: string; name: string; replyZh: string | null }[]
}): AreaSubtitleLine[] {
  const playerLine: AreaSubtitleLine = {
    id: `${input.baseId}:player`,
    tick: input.tick,
    speaker: '你',
    text: input.playerMessage,
    tone: 'player',
  }
  const respondent = input.recipients[0] ?? null
  const npcLines = respondent
    ? [{
      id: `${input.baseId}:npc:${respondent.id}`,
      tick: input.tick,
      speaker: respondent.name,
      text: respondent.replyZh?.trim() || '……',
      tone: 'npc' as const,
      npcId: respondent.id,
    }]
    : []
  return [playerLine, ...npcLines]
}

export function dedupeSubtitleLines(lines: readonly AreaSubtitleLine[], limit = 8): AreaSubtitleLine[] {
  const seen = new Set<string>()
  const deduped: AreaSubtitleLine[] = []
  for (const line of lines) {
    const key = `${line.speaker}\u0000${line.text}`
    if (seen.has(key)) continue
    seen.add(key)
    deduped.push(line)
  }
  return deduped.slice(-limit)
}

export function optimisticSpeechLines(input: {
  baseId: string
  tick: number
  playerMessage: string
  npcId: string
  npcName: string
  npcReplyZh: string | null
}): AreaSubtitleLine[] {
  const playerLine: AreaSubtitleLine = {
    id: `${input.baseId}:player`,
    tick: input.tick,
    speaker: '你',
    text: input.playerMessage,
    tone: 'player',
    npcId: input.npcId,
  }
  const npcLine: AreaSubtitleLine = {
    id: `${input.baseId}:npc`,
    tick: input.tick,
    speaker: input.npcName,
    text: input.npcReplyZh?.trim() || '……',
    tone: 'npc',
    npcId: input.npcId,
  }
  return [playerLine, npcLine]
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

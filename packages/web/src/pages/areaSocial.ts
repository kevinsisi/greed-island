import type { EventSummary } from '../state/types'

export function isNpcInteractionEvent(event: EventSummary): boolean {
  if (event.eventType !== 'NPC_INTERACT') return false
  const participants = event.payload?.participants
  return Array.isArray(participants) && participants.length >= 2 && participants.every((id) => typeof id === 'string')
}

export function formatNpcInteractionEvent(event: EventSummary, npcNameById: ReadonlyMap<string, string>): string {
  const narration = typeof event.narration === 'string' ? event.narration.trim() : ''
  if (narration.length > 0) return narration
  const participants = event.payload?.participants
  const [aRaw, bRaw] = Array.isArray(participants) ? participants : []
  const a = typeof aRaw === 'string' ? npcNameById.get(aRaw) ?? aRaw : '某位 NPC'
  const b = typeof bRaw === 'string' ? npcNameById.get(bRaw) ?? bRaw : '另一位 NPC'
  const mode = event.payload?.mode
  if (mode === 'argue') return `${a}和${b}正在爭執，情緒、派系或資源壓力浮上檯面。`
  return `${a}和${b}正在交談，交換情報或協調下一步。`
}

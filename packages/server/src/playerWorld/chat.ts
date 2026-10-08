import { accountId } from '../identity/principal.js'
import type { AccountId } from '../identity/principal.js'
import type { Event } from '../kernel/types.js'

export const WORLD_CHAT_EVENT_TYPE = 'PLAYER_WORLD_CHAT_POSTED' as const
export const WORLD_CHAT_HISTORY_LIMIT = 100
export const WORLD_CHAT_RATE_STEPS = 5
export type WorldChatEventData = Readonly<{
  accountId: number; tileId: string; text: string; displayName?: string
  postedAtMovementStep: number; clientCommandId: string; intentDigest: string
}>
export type WorldChatMessage = Readonly<{
  id: string; accountId: AccountId; tileId: string; text: string; displayName?: string
  sequence: number; worldTick: number; postedAtMovementStep: number
}>
export function validateWorldChatEventData(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return 'payload must be object'
  const p = payload as Record<string, unknown>
  if (!Number.isSafeInteger(p.accountId) || (p.accountId as number) <= 0) return 'positive numeric accountId required'
  if (typeof p.tileId !== 'string' || !p.tileId) return 'tileId required'
  if (!validWorldChatText(p.text)) return 'chat text must be1–240 printable characters'
  if (p.displayName !== undefined && (typeof p.displayName !== 'string' || !p.displayName.trim() || p.displayName.length > 80)) return 'public displayName invalid'
  if (!Number.isSafeInteger(p.postedAtMovementStep) || (p.postedAtMovementStep as number) < 0) return 'server chat sub-step required'
  if (typeof p.clientCommandId !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(p.clientCommandId)) return 'clientCommandId required'
  if (typeof p.intentDigest !== 'string' || !/^[a-f0-9]{64}$/.test(p.intentDigest)) return 'intentDigest required'
  return null
}
export function validWorldChatText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length >= 1 && value.trim().length <= 240
    && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)
}
/** Public world-channel history only. Private NPC dialogue is never read or projected here. */
export class PlayerWorldChatProjection {
  private messages: WorldChatMessage[] = []
  private readonly lastPosted = new Map<AccountId, number>()
  private lastSequence = 0
  getLastPostedStep(id: AccountId): number | undefined { return this.lastPosted.get(id) }
  getMaximumPostedStep(): number { return [...this.lastPosted.values()].reduce((maximum, step) => Math.max(maximum, step), -1) }
  list(): WorldChatMessage[] { return this.messages.map(message => ({ ...message })) }
  clone(): PlayerWorldChatProjection {
    const copy = new PlayerWorldChatProjection(); copy.messages = this.list(); copy.lastSequence = this.lastSequence
    for (const [id, step] of this.lastPosted) copy.lastPosted.set(id, step)
    return copy
  }
  project(event: Event): void {
    if (event.eventType !== WORLD_CHAT_EVENT_TYPE || event.sequence <= this.lastSequence) return
    const data = (event.payload as { data?: WorldChatEventData } | null)?.data
    const error = validateWorldChatEventData(data)
    if (error || !data || event.actorId !== String(data.accountId)) throw new Error(`Invalid canonical chat event ${event.eventId}`)
    const id = accountId(data.accountId)
    this.lastPosted.set(id, data.postedAtMovementStep)
    this.messages.push({ id: event.eventId, accountId: id, tileId: data.tileId, text: data.text,
      ...(data.displayName ? { displayName: data.displayName } : {}), sequence: event.sequence, worldTick: event.tick ?? 0,
      postedAtMovementStep: data.postedAtMovementStep })
    this.messages = this.messages.slice(-WORLD_CHAT_HISTORY_LIMIT); this.lastSequence = event.sequence
  }
  rebuildFromEvents(recent: readonly Event[], latestByAccount: readonly Event[]): void {
    this.messages = []; this.lastPosted.clear(); this.lastSequence = 0
    // Recent100 controls visible history; latest-per-actor restores cooldown/clock even outside that window.
    for (const event of [...recent].sort((a, b) => a.sequence - b.sequence)) this.project(event)
    for (const event of latestByAccount) {
      const data = (event.payload as { data?: WorldChatEventData } | null)?.data
      if (event.eventType !== WORLD_CHAT_EVENT_TYPE || validateWorldChatEventData(data) || !data || event.actorId !== String(data.accountId)) {
        throw new Error(`Invalid canonical chat receipt ${event.eventId}`)
      }
      this.lastPosted.set(accountId(data.accountId), data.postedAtMovementStep)
      this.lastSequence = Math.max(this.lastSequence, event.sequence)
    }
  }
}

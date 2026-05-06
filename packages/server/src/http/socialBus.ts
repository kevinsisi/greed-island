// In-memory pub/sub for per-user social events (friend requests,
// new private messages, presence updates). The HTTP social router
// publishes; the social SSE router (createSocialSseRouter) subscribes.
//
// The bus is intentionally non-persistent: clients reconnecting fetch
// canonical state via REST endpoints (friends, messages, conversations)
// and treat the SSE stream as a real-time hint, not a source of truth.

export type SocialEvent =
  | Readonly<{
      type: 'friend.request'
      to: number
      from: number
      requestId: number
      occurredAt: string
    }>
  | Readonly<{
      type: 'friend.accepted'
      to: number
      from: number
      requestId: number
      occurredAt: string
    }>
  | Readonly<{
      type: 'friend.rejected'
      to: number
      from: number
      requestId: number
      occurredAt: string
    }>
  | Readonly<{
      type: 'friend.removed'
      to: number
      from: number
      occurredAt: string
    }>
  | Readonly<{
      type: 'message.new'
      to: number
      from: number
      messageId: number
      preview: string
      occurredAt: string
    }>
  | Readonly<{
      type: 'presence.enter'
      to: number
      userId: number
      tileId: string
      occurredAt: string
    }>
  | Readonly<{
      type: 'presence.leave'
      to: number
      userId: number
      tileId: string
      occurredAt: string
    }>
  | Readonly<{
      type: 'alliance.invited'
      to: number
      from: number
      allianceId: number
      occurredAt: string
    }>

type Listener = (event: SocialEvent) => void

export class SocialBus {
  private readonly listeners = new Map<number, Set<Listener>>()

  subscribe(userId: number, listener: Listener): () => void {
    let set = this.listeners.get(userId)
    if (!set) {
      set = new Set()
      this.listeners.set(userId, set)
    }
    set.add(listener)
    return () => {
      const s = this.listeners.get(userId)
      if (!s) return
      s.delete(listener)
      if (s.size === 0) this.listeners.delete(userId)
    }
  }

  publish(event: SocialEvent): void {
    const set = this.listeners.get(event.to)
    if (!set) return
    for (const listener of set) {
      try {
        listener(event)
      } catch (err) {
        console.error('[social-bus] listener error', err)
      }
    }
  }

  publishToMany(events: readonly SocialEvent[]): void {
    for (const event of events) this.publish(event)
  }

  hasSubscribers(userId: number): boolean {
    return (this.listeners.get(userId)?.size ?? 0) > 0
  }
}

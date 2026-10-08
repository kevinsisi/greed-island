import type { Event, EventDraft } from '../kernel/types.js'

// Pure event fixture for service unit tests. This is NOT a SQLite adapter or runtime durability proof.
export class EventFixture {
  events: Event[] = []
  transactions = 0
  beforeCommit?: () => void
  failCommit = false
  runInTransaction<T>(operation: () => T): T {
    this.transactions += 1
    const before = [...this.events]
    try {
      const result = operation(); this.beforeCommit?.()
      if (this.failCommit) throw new Error('synthetic transaction failure')
      return result
    } catch (error) { this.events = before; throw error }
  }
  appendEvents(drafts: readonly EventDraft[]): Event[] {
    const committed = drafts.map(draft => ({ ...draft, sequence: this.events.length + 1 + drafts.indexOf(draft) }))
    this.events.push(...committed); return committed
  }
  readRecentEventsByTypes(limit: number, types: readonly string[]) { return this.events.filter(event => types.includes(event.eventType)).slice(-limit) }
  readEventsByActorCommand(actor: string, command: string, types: readonly string[]) {
    return this.events.filter(event => event.actorId === actor && event.commandId === command && types.includes(event.eventType))
  }
  readLatestEventsPerActor(types: readonly string[]) {
    const latest = new Map<string, Event>()
    for (const event of this.events) if (types.includes(event.eventType)) latest.set(event.actorId, event)
    return [...latest.values()]
  }
}

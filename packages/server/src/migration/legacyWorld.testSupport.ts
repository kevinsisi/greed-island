import { applyEvents, emptyState, evaluateCommand, evaluateSystemCommand } from '../multiplayer/domain.js'
import { toCanonicalJson } from '../kernel/canonicalJson.js'
import type { Event, EventDraft } from '../kernel/types.js'
import type { LegacyEventRow } from './legacyWorldSource.js'

export const SYNTHETIC_LEGACY_HASH = `${'1'.repeat(32)}:${'2'.repeat(64)}`
export function syntheticLegacySourceFixture(completed = true) {
  const accounts = [
    { id: 'legacy-owner', name: 'Source Owner', username: 'kevin950805', passwordHash: SYNTHETIC_LEGACY_HASH, role: 'admin' },
    { id: 'legacy-player', name: 'Source Player', username: 'retained-user', passwordHash: SYNTHETIC_LEGACY_HASH, role: 'player' },
  ]
  let state = emptyState(); const events: Event[] = []
  const append = (drafts: readonly EventDraft[]) => { const next = drafts.map((draft, index) => ({ ...draft, sequence: events.length + index + 1 })); events.push(...next); state = applyEvents(state, next) }
  append(evaluateSystemCommand(state, { type: 'initialize', roster: accounts.map(account => ({ id: account.id, name: account.name, x: 0, z: 6 })) }))
  if (completed) {
    append(evaluateCommand(state, 'legacy-owner', { commandId: 'contribute-owner', type: 'contribute', payload: {} }))
    append(evaluateCommand(state, 'legacy-player', { commandId: 'contribute-player', type: 'contribute', payload: {} }))
    for (let tick = 1; tick <= 300; tick += 1) append(evaluateSystemCommand(state, { type: 'tick', tick }))
  }
  const rows: LegacyEventRow[] = events.map(event => ({ sequence: event.sequence, event_id: event.eventId, event_type: event.eventType,
    occurred_at: event.occurredAt, actor_id: event.actorId, command_id: event.commandId ?? null, tick: event.tick ?? null,
    ruleset_version: event.rulesetVersion ?? null, payload_json: toCanonicalJson(event.payload), version: event.version, deterministic_key: event.deterministicKey }))
  return { rawAccountsJson: JSON.stringify(accounts, null, 2), rows, state }
}

import Database from 'better-sqlite3'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { toCanonicalJson } from '../kernel/canonicalJson.js'
import type { Event } from '../kernel/types.js'
import { validateStoredAccounts, type StoredAccount } from '../multiplayer/accounts.js'
import { applyEvents, emptyState } from '../multiplayer/domain.js'
import type { RoomState } from '../multiplayer/types.js'
import { canStand, getRegionGeometry } from '../playerWorld/geometry.js'

export type LegacyEventRow = Readonly<{
  sequence: number; event_id: string; event_type: string; occurred_at: number; actor_id: string
  command_id: string | null; tick: number | null; ruleset_version: string | null
  payload_json: string; version: number; deterministic_key: string
}>
export type LegacySourceManifest = Readonly<{
  version: 1; namespace: string; accountsSha256: string; eventRowsSha256: string; sourceDigest: string
  accountCount: number; eventCount: number; firstSequence: number | null; lastSequence: number | null
  projectedStateSha256: string; unmappedRosterIds: readonly string[]; acceptedSourceEventTypes: readonly string[]
}>
export type LegacyWorldSource = Readonly<{
  rawAccountsJson: string; accounts: readonly StoredAccount[]; manifest: LegacySourceManifest
  roomState: RoomState; rows: () => Iterable<LegacyEventRow>; close?: () => void
}>
const SOURCE_EVENT_TYPES = new Set(['MP_INITIALIZED','MP_PLAYER_JOINED','MP_TICK','MP_MOVED','MP_CHAT','MP_CONTRIBUTED','MP_COLLECTION_OPENED','MP_BEACON_COMPLETED','MP_REWARDED'])
const SOURCE_PAGE_ROWS = 256
export function digest(value: string): string { return createHash('sha256').update(value).digest('hex') }
export function rowEvent(row: LegacyEventRow): Event {
  return { sequence: row.sequence, eventId: row.event_id, eventType: row.event_type, actorId: row.actor_id,
    occurredAt: row.occurred_at, payload: JSON.parse(row.payload_json), version: row.version, deterministicKey: row.deterministic_key,
    ...(row.command_id === null ? {} : { commandId: row.command_id }), ...(row.tick === null ? {} : { tick: row.tick }),
    ...(row.ruleset_version === null ? {} : { rulesetVersion: row.ruleset_version }) }
}
/** Pure scan, or streaming read-only SQLite iterator. No initialization/refill or source writes. */
export function inspectLegacyWorldSource(rawAccountsJson: string, namespace: string, rows: () => Iterable<LegacyEventRow>): LegacyWorldSource {
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(namespace)) throw new Error('Invalid legacy source namespace.')
  const accounts = validateStoredAccounts(JSON.parse(rawAccountsJson)), hasher = createHash('sha256')
  let state = emptyState(), batch: Event[] = [], count = 0, first: number | null = null, last: number | null = null
  const eventIds = new Set<string>(), types = new Set<string>()
  for (const row of rows()) {
    if (!Number.isSafeInteger(row.sequence) || row.sequence <= 0 || last !== null && row.sequence <= last
      || typeof row.event_id !== 'string' || !row.event_id || eventIds.has(row.event_id)
      || !SOURCE_EVENT_TYPES.has(row.event_type) || !Number.isSafeInteger(row.occurred_at) || row.occurred_at < 0
      || typeof row.actor_id !== 'string' || !row.actor_id || typeof row.payload_json !== 'string'
      || row.command_id !== null && (typeof row.command_id !== 'string' || !row.command_id)
      || row.tick !== null && (!Number.isSafeInteger(row.tick) || row.tick < 0)
      || row.ruleset_version !== null && (typeof row.ruleset_version !== 'string' || !row.ruleset_version)
      || !Number.isSafeInteger(row.version) || row.version < 1 || typeof row.deterministic_key !== 'string' || !row.deterministic_key) throw new Error('Invalid or unsupported legacy event row; source must be reviewed, never repaired implicitly.')
    eventIds.add(row.event_id); types.add(row.event_type); hasher.update(toCanonicalJson(row) + '\n')
    batch.push(rowEvent(row)); count += 1; first ??= row.sequence; last = row.sequence
    if (batch.length === SOURCE_PAGE_ROWS) { state = applyEvents(state, batch); batch = [] }
  }
  if (batch.length) state = applyEvents(state, batch)
  if (!count || state.players.length === 0 || !Number.isSafeInteger(state.tick) || state.tick < 0) throw new Error('Legacy room lacks an existing recorded world; refusing to initialize/refill.')
  const geometry = getRegionGeometry('t_dock')!, ids = new Set<string>()
  for (const player of state.players) {
    if (ids.has(player.id) || !canStand(player, geometry) || !Number.isSafeInteger(player.supplies) || player.supplies < 0
      || !Number.isSafeInteger(player.rewards) || player.rewards < 0) throw new Error('Invalid legacy player progress; preserve source and request review.')
    ids.add(player.id)
  }
  if (state.contributors.some(id => !ids.has(id)) || state.awardedPlayerIds.some(id => !ids.has(id))) throw new Error('Legacy participation references unknown actors.')
  const accountsSha256 = digest(rawAccountsJson), eventRowsSha256 = hasher.digest('hex'), projectedStateSha256 = digest(toCanonicalJson(state))
  const summary = { version: 1 as const, namespace, accountsSha256, eventRowsSha256, accountCount: accounts.length, eventCount: count,
    firstSequence: first, lastSequence: last, projectedStateSha256, unmappedRosterIds: state.players.filter(player => !accounts.some(account => account.id === player.id)).map(player => player.id).sort(), acceptedSourceEventTypes: [...types].sort() }
  return { rawAccountsJson, accounts: accounts.map(account => ({ ...account })), manifest: { ...summary, sourceDigest: digest(toCanonicalJson(summary)) },
    roomState: structuredClone(state), rows }
}
/** Explicit paths only. This function is used solely with synthetic staging fixtures in this task. */
export function readLegacyWorldSourceFiles(input: { accountsPath: string; roomPath: string; namespace: string }): LegacyWorldSource {
  const rawAccountsJson = readFileSync(input.accountsPath, 'utf8'), db = new Database(input.roomPath, { readonly: true, fileMustExist: true })
  try {
    db.exec('BEGIN')
    const statement = db.prepare('SELECT sequence,event_id,event_type,occurred_at,actor_id,command_id,tick,ruleset_version,payload_json,version,deterministic_key FROM event_log ORDER BY sequence')
    const rows = () => statement.iterate() as Iterable<LegacyEventRow>
    const source = inspectLegacyWorldSource(rawAccountsJson, input.namespace, rows)
    return { ...source, close: () => { if (db.open) { db.exec('ROLLBACK'); db.close() } } }
  } catch (error) { if (db.open) db.close(); throw error }
}

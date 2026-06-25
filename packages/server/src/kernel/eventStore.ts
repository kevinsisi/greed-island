import Database from 'better-sqlite3'
import { toCanonicalJson } from './canonicalJson.js'
import type { Command, Event, EventDraft, RuleRejection } from './types.js'

type DatabaseConnection = Database.Database

type EventRow = Readonly<{
  sequence: number
  event_id: string
  event_type: string
  occurred_at: number
  actor_id: string
  command_id: string | null
  tick: number | null
  ruleset_version: string | null
  payload_json: string
  version: number
  deterministic_key: string
}>

type EventDraftRow = Omit<EventRow, 'sequence'>

type EventRowCompareOptions = Readonly<{
  ignoreOccurredAt?: boolean
}>

type RejectionRow = Readonly<{
  rejection_id: number
  command_id: string
  command_type: string
  actor_id: string
  submitted_at: number
  rejected_at: number
  rejection_code: string
  reason: string
  details_json: string | null
  payload_json: string
}>

const MAX_TICK_WINDOW_MERGE_ROWS = 50_000

export type RejectedCommandAuditRecord = Readonly<{
  rejectionId: number
  commandId: string
  commandType: string
  actorId: string
  submittedAt: number
  rejectedAt: number
  rejectionCode: string
  reason: string
  details?: unknown
  payload: unknown
}>

export type EventTickWindowRead = Readonly<{
  sinceTick: number
  untilTick: number
  eventTypes: readonly string[]
  limit: number
}>

export type EventTickWindowResult = Readonly<{
  events: Event[]
  limited: boolean
}>

export class SqliteEventStore {
  constructor(private readonly db: DatabaseConnection) {
    initializeKernelSchema(db)
  }

  appendEvents(drafts: readonly EventDraft[]): Event[] {
    if (drafts.length === 0) {
      return []
    }

    const selectExistingEvent = this.db.prepare(`
      SELECT
        sequence,
        event_id,
        event_type,
        occurred_at,
        actor_id,
        command_id,
        tick,
        ruleset_version,
        payload_json,
        version,
        deterministic_key
      FROM event_log
      WHERE event_id = ?
    `)
    const insertEvent = this.db.prepare(`
      INSERT OR IGNORE INTO event_log (
        event_id,
        event_type,
        occurred_at,
        actor_id,
        command_id,
        tick,
        ruleset_version,
        payload_json,
        version,
        deterministic_key
      ) VALUES (
        @eventId,
        @eventType,
        @occurredAt,
        @actorId,
        @commandId,
        @tick,
        @rulesetVersion,
        @payloadJson,
        @version,
        @deterministicKey
      )
    `)

    const transaction = this.db.transaction((eventDrafts: readonly EventDraft[]) => {
      const committed: Event[] = []
      const batchEventIds = new Map<string, EventDraftRow>()
      for (const draft of eventDrafts) {
        const row = draftToEventDraftRow(draft)
        const batchDuplicate = batchEventIds.get(draft.eventId)
        if (batchDuplicate) {
          if (!eventDraftRowsMatch(batchDuplicate, row, { ignoreOccurredAt: true })) {
            throw new Error(`Conflicting event draft for deterministic eventId ${draft.eventId}`)
          }
          continue
        }
        batchEventIds.set(draft.eventId, row)

        const insertResult = insertEvent.run({
          eventId: row.event_id,
          eventType: row.event_type,
          occurredAt: row.occurred_at,
          actorId: row.actor_id,
          commandId: row.command_id,
          tick: row.tick,
          rulesetVersion: row.ruleset_version,
          payloadJson: row.payload_json,
          version: row.version,
          deterministicKey: row.deterministic_key
        })
        if (insertResult.changes === 0) {
          const existing = selectExistingEvent.get(draft.eventId) as EventRow | undefined
          if (!existing) {
            throw new Error(`Failed to append deterministic eventId ${draft.eventId}`)
          }
          if (!eventRowsMatch(existing, row, { ignoreOccurredAt: true })) {
            throw new Error(`Conflicting persisted event for deterministic eventId ${draft.eventId}`)
          }
          committed.push(rowToEvent(existing))
          continue
        }
        committed.push({ ...draft, sequence: Number(insertResult.lastInsertRowid) })
      }
      return committed
    })

    return transaction(drafts)
  }

  readEvents(): Event[] {
    const rows = this.db.prepare('SELECT * FROM event_log ORDER BY sequence ASC').all() as EventRow[]
    return rows.map(rowToEvent)
  }

  readRecentEvents(limit: number): Event[] {
    const safeLimit = Math.max(1, Math.min(1000, Math.floor(limit)))
    const rows = this.db
      .prepare('SELECT * FROM event_log ORDER BY sequence DESC LIMIT ?')
      .all(safeLimit) as EventRow[]
    return rows.reverse().map(rowToEvent)
  }

  readEventsByTypes(eventTypes: readonly string[]): Event[] {
    const types = [...new Set(eventTypes.filter((type) => type.length > 0))]
    if (types.length === 0) return []
    const rows: EventRow[] = []
    const statement = this.db.prepare('SELECT * FROM event_log WHERE event_type = ? ORDER BY sequence ASC')
    for (const type of types) {
      rows.push(...(statement.all(type) as EventRow[]))
    }
    rows.sort((a, b) => a.sequence - b.sequence)
    return rows.map(rowToEvent)
  }

  readEventsByTickWindow(input: EventTickWindowRead): EventTickWindowResult {
    const eventTypes = [...new Set(input.eventTypes.filter((type) => type.length > 0))]
    if (eventTypes.length === 0) return { events: [], limited: false }
    const safeLimit = Math.max(1, Math.min(MAX_TICK_WINDOW_MERGE_ROWS, Math.floor(input.limit)))
    const requestedMergeRows = eventTypes.length * (safeLimit + 1)
    if (requestedMergeRows > MAX_TICK_WINDOW_MERGE_ROWS) {
      return this.readEventsByTickWindowSingleQuery(input, eventTypes, safeLimit)
    }
    const rows: EventRow[] = []
    // Keep this as bounded per-type scans. SQLite can walk the
    // (event_type, tick, sequence) index for each server-selected type without
    // building the large cross-type temp sort that blocked production API reads.
    const statement = this.db
      .prepare(
        `SELECT * FROM event_log
          WHERE event_type = ?
            AND tick > ?
            AND tick <= ?
          ORDER BY tick ASC, sequence ASC
          LIMIT ?`
      )
    for (const eventType of eventTypes) {
      rows.push(
        ...(statement.all(eventType, input.sinceTick, input.untilTick, safeLimit + 1) as EventRow[])
      )
    }
    const limited = rows.length > safeLimit
    const windowRows = rows
      .sort((a, b) => (a.tick ?? 0) - (b.tick ?? 0) || a.sequence - b.sequence)
      .slice(0, safeLimit)
    return { events: windowRows.map(rowToEvent), limited }
  }

  private readEventsByTickWindowSingleQuery(
    input: EventTickWindowRead,
    eventTypes: readonly string[],
    safeLimit: number
  ): EventTickWindowResult {
    const placeholders = eventTypes.map(() => '?').join(', ')
    const rows = this.db
      .prepare(
        `SELECT * FROM event_log
          WHERE event_type IN (${placeholders})
            AND tick > ?
            AND tick <= ?
          ORDER BY tick ASC, sequence ASC
          LIMIT ?`
      )
      .all(...eventTypes, input.sinceTick, input.untilTick, safeLimit + 1) as EventRow[]
    const limited = rows.length > safeLimit
    return { events: rows.slice(0, safeLimit).map(rowToEvent), limited }
  }

  readLatestFactSnapshot(): {
    eventCount: number
    lastSequence: number
    latestTick: number
    facts: Record<string, unknown>
  } {
    const sequenceRow = this.db
      .prepare('SELECT sequence FROM event_log ORDER BY sequence DESC LIMIT 1')
      .get() as { sequence: number } | undefined
    const tickRow = this.db
      .prepare('SELECT tick FROM event_log WHERE tick IS NOT NULL ORDER BY sequence DESC LIMIT 1')
      .get() as { tick: number } | undefined
    return {
      eventCount: sequenceRow?.sequence ?? 0,
      lastSequence: sequenceRow?.sequence ?? 0,
      latestTick: tickRow?.tick ?? 0,
      facts: {}
    }
  }

  readLatestFactValues(keys: readonly string[]): Record<string, unknown> {
    const uniqueKeys = [...new Set(keys.filter((key) => key.length > 0))]
    if (uniqueKeys.length === 0) return {}
    const statement = this.db.prepare(`
      SELECT payload_json FROM event_log
      WHERE event_type = 'FACT_SET'
        AND json_extract(payload_json, '$.key') = ?
      ORDER BY sequence DESC
      LIMIT 1
    `)
    const facts: Record<string, unknown> = {}
    for (const key of uniqueKeys) {
      const row = statement.get(key) as { payload_json: string } | undefined
      if (!row) continue
      const payload = JSON.parse(row.payload_json) as { value?: unknown }
      facts[key] = payload.value
    }
    return facts
  }

  countEvents(): number {
    const row = this.db
      .prepare('SELECT sequence FROM event_log ORDER BY sequence DESC LIMIT 1')
      .get() as { sequence: number } | undefined
    return row?.sequence ?? 0
  }

  countEventsByKind(kind: string): number {
    if (!kind) return 0
    const row = this.db
      .prepare('SELECT COUNT(*) as count FROM event_log WHERE event_type = ?')
      .get(kind) as { count: number }
    return row.count
  }

  recordRejectedCommand(command: Command, rejection: RuleRejection, rejectedAt = command.submittedAt): void {
    this.db
      .prepare(
        `
        INSERT INTO rejected_command_log (
          command_id,
          command_type,
          actor_id,
          submitted_at,
          rejected_at,
          rejection_code,
          reason,
          details_json,
          payload_json
        ) VALUES (
          @commandId,
          @commandType,
          @actorId,
          @submittedAt,
          @rejectedAt,
          @rejectionCode,
          @reason,
          @detailsJson,
          @payloadJson
        )
      `
      )
      .run({
        commandId: command.commandId,
        commandType: command.commandType,
        actorId: command.actorId,
        submittedAt: command.submittedAt,
        rejectedAt,
        rejectionCode: rejection.code,
        reason: rejection.reason,
        detailsJson: rejection.details === undefined ? null : toCanonicalJson(rejection.details),
        payloadJson: toCanonicalJson(command.payload)
      })
  }

  readRejectedCommandAudit(): RejectedCommandAuditRecord[] {
    const rows = this.db
      .prepare('SELECT * FROM rejected_command_log ORDER BY rejection_id ASC')
      .all() as RejectionRow[]
    return rows.map((row) => ({
      rejectionId: row.rejection_id,
      commandId: row.command_id,
      commandType: row.command_type,
      actorId: row.actor_id,
      submittedAt: row.submitted_at,
      rejectedAt: row.rejected_at,
      rejectionCode: row.rejection_code,
      reason: row.reason,
      ...(row.details_json === null ? {} : { details: JSON.parse(row.details_json) as unknown }),
      payload: JSON.parse(row.payload_json) as unknown
    }))
  }
}

export function initializeKernelSchema(db: DatabaseConnection): void {
  db.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS event_log (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id TEXT NOT NULL UNIQUE,
      event_type TEXT NOT NULL,
      occurred_at INTEGER NOT NULL,
      actor_id TEXT NOT NULL,
      command_id TEXT,
      tick INTEGER,
      ruleset_version TEXT,
      payload_json TEXT NOT NULL,
      version INTEGER NOT NULL,
      deterministic_key TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_event_log_actor ON event_log(actor_id);
    CREATE INDEX IF NOT EXISTS idx_event_log_type ON event_log(event_type);
    CREATE INDEX IF NOT EXISTS idx_event_log_type_tick_sequence ON event_log(event_type, tick, sequence);
    CREATE INDEX IF NOT EXISTS idx_event_log_fact_key_sequence
      ON event_log(json_extract(payload_json, '$.key'), sequence)
      WHERE event_type = 'FACT_SET';
    CREATE INDEX IF NOT EXISTS idx_event_log_deterministic_key ON event_log(deterministic_key);

    CREATE TRIGGER IF NOT EXISTS event_log_no_update
    BEFORE UPDATE ON event_log
    BEGIN
      SELECT RAISE(ABORT, 'event_log is append-only');
    END;

    CREATE TRIGGER IF NOT EXISTS event_log_no_delete
    BEFORE DELETE ON event_log
    BEGIN
      SELECT RAISE(ABORT, 'event_log is append-only');
    END;

    CREATE TABLE IF NOT EXISTS rejected_command_log (
      rejection_id INTEGER PRIMARY KEY AUTOINCREMENT,
      command_id TEXT NOT NULL,
      command_type TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      submitted_at INTEGER NOT NULL,
      rejected_at INTEGER NOT NULL,
      rejection_code TEXT NOT NULL,
      reason TEXT NOT NULL,
      details_json TEXT,
      payload_json TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_rejected_command_actor ON rejected_command_log(actor_id);
    CREATE INDEX IF NOT EXISTS idx_rejected_command_command ON rejected_command_log(command_id);
  `)
}

function rowToEvent(row: EventRow): Event {
  return {
    sequence: row.sequence,
    eventId: row.event_id,
    eventType: row.event_type,
    occurredAt: row.occurred_at,
    actorId: row.actor_id,
    ...(row.command_id === null ? {} : { commandId: row.command_id }),
    ...(row.tick === null ? {} : { tick: row.tick }),
    ...(row.ruleset_version === null ? {} : { rulesetVersion: row.ruleset_version }),
    payload: JSON.parse(row.payload_json) as unknown,
    version: row.version,
    deterministicKey: row.deterministic_key
  }
}

function draftToEventDraftRow(draft: EventDraft): EventDraftRow {
  return {
    event_id: draft.eventId,
    event_type: draft.eventType,
    occurred_at: draft.occurredAt,
    actor_id: draft.actorId,
    command_id: draft.commandId ?? null,
    tick: draft.tick ?? null,
    ruleset_version: draft.rulesetVersion ?? null,
    payload_json: toCanonicalJson(draft.payload),
    version: draft.version,
    deterministic_key: draft.deterministicKey
  }
}

function eventRowsMatch(
  existing: EventRow,
  draft: EventDraftRow,
  options: EventRowCompareOptions = {}
): boolean {
  return eventDraftRowsMatch(existing, draft, options)
}

function eventDraftRowsMatch(
  left: EventDraftRow,
  right: EventDraftRow,
  options: EventRowCompareOptions = {}
): boolean {
  return (
    left.event_id === right.event_id &&
    left.event_type === right.event_type &&
    (options.ignoreOccurredAt === true || left.occurred_at === right.occurred_at) &&
    left.actor_id === right.actor_id &&
    left.command_id === right.command_id &&
    left.tick === right.tick &&
    left.ruleset_version === right.ruleset_version &&
    left.payload_json === right.payload_json &&
    left.version === right.version &&
    left.deterministic_key === right.deterministic_key
  )
}

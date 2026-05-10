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

export class SqliteEventStore {
  constructor(private readonly db: DatabaseConnection) {
    initializeKernelSchema(db)
  }

  appendEvents(drafts: readonly EventDraft[]): Event[] {
    if (drafts.length === 0) {
      return []
    }

    const insertEvent = this.db.prepare(`
      INSERT INTO event_log (
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
      for (const draft of eventDrafts) {
        const insertResult = insertEvent.run({
          eventId: draft.eventId,
          eventType: draft.eventType,
          occurredAt: draft.occurredAt,
          actorId: draft.actorId,
          commandId: draft.commandId ?? null,
          tick: draft.tick ?? null,
          rulesetVersion: draft.rulesetVersion ?? null,
          payloadJson: toCanonicalJson(draft.payload),
          version: draft.version,
          deterministicKey: draft.deterministicKey
        })
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

  readLatestFactSnapshot(): {
    eventCount: number
    lastSequence: number
    latestTick: number
    facts: Record<string, unknown>
  } {
    const meta = this.db
      .prepare(
        'SELECT COUNT(*) as eventCount, COALESCE(MAX(sequence), 0) as lastSequence, COALESCE(MAX(tick), 0) as latestTick FROM event_log'
      )
      .get() as { eventCount: number; lastSequence: number; latestTick: number }
    return {
      eventCount: meta.eventCount,
      lastSequence: meta.lastSequence,
      latestTick: meta.latestTick,
      facts: {}
    }
  }

  countEvents(): number {
    const row = this.db.prepare('SELECT COUNT(*) as count FROM event_log').get() as { count: number }
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

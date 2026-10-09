import type Database from 'better-sqlite3'

export const LEGACY_STAGE_MARKER_DDL = `CREATE TABLE legacy_import_stage(namespace TEXT PRIMARY KEY,source_digest TEXT NOT NULL,plan_digest TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status='pending-owner-and-activation-review'),owner_selection_json TEXT,imported_at INTEGER NOT NULL)`
export const LEGACY_STAGE_PRIVATE_DDL = `CREATE TABLE legacy_import_private_sources(namespace TEXT PRIMARY KEY REFERENCES legacy_import_stage(namespace),
  accounts_json TEXT NOT NULL,manifest_json TEXT NOT NULL,identities_json TEXT NOT NULL,archive_event_ids_json TEXT NOT NULL)`
/** Exact source-only schema contract. Unknown/collided tables require explicit review, never inferred readiness. */
export function assertLegacyWorldStageSchema(db: Database.Database): void {
  for (const [name, expected] of [['legacy_import_stage', LEGACY_STAGE_MARKER_DDL], ['legacy_import_private_sources', LEGACY_STAGE_PRIVATE_DDL]]) {
    const row = db.prepare('SELECT type,sql FROM sqlite_master WHERE name=?').get(name) as { type: string; sql: string | null } | undefined
    if (row?.type !== 'table' || typeof row.sql !== 'string' || row.sql !== expected) {
      throw new Error('LEGACY_STAGE_SCHEMA_REVIEW_REQUIRED')
    }
  }
  const invalid = db.prepare("SELECT namespace FROM legacy_import_stage WHERE status IS NULL OR status<>'pending-owner-and-activation-review' OR namespace IS NULL LIMIT 1").get()
  if (invalid) throw new Error('LEGACY_STAGE_STATUS_REVIEW_REQUIRED')
}

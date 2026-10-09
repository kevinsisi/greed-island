import type Database from 'better-sqlite3'
import { assertLegacyWorldStageSchema } from './legacyWorldStageSchema.js'

/** Read-only boot guard: unknown schemas and private staged artifacts are never silently activated. */
export function assertLegacyWorldStageActivationReady(db: Database.Database): void {
  const exists = db.prepare("SELECT name FROM sqlite_master WHERE name IN ('legacy_import_stage','legacy_import_private_sources')").get()
  if (!exists) return
  assertLegacyWorldStageSchema(db)
  // This source-only schema cannot express readiness; a reviewed activation migration must replace this contract.
  const pending = db.prepare('SELECT namespace FROM legacy_import_stage LIMIT 1').get()
  if (pending) throw new Error('LEGACY_STAGE_ACTIVATION_REVIEW_REQUIRED')
}

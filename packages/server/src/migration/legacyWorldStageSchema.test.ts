import type Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { LEGACY_STAGE_MARKER_DDL, LEGACY_STAGE_PRIVATE_DDL, assertLegacyWorldStageSchema } from './legacyWorldStageSchema.js'

// A readonly catalog fixture only; native SQLite schema/insert behavior is covered separately.
function catalog(marker = LEGACY_STAGE_MARKER_DDL, archive = LEGACY_STAGE_PRIVATE_DDL) {
  return { prepare: (sql: string) => ({ get: (name: string) => sql.startsWith('SELECT type,sql')
    ? { type: 'table', sql: name === 'legacy_import_stage' ? marker : archive } : undefined }) } as unknown as Database.Database
}
describe('exact staged SQLite-emitted schema contract', () => {
  it('accepts only our exact emitted marker/private schema', () => {
    expect(() => assertLegacyWorldStageSchema(catalog())).not.toThrow()
    expect(() => assertLegacyWorldStageSchema(catalog(LEGACY_STAGE_MARKER_DDL.replace('TEXT NOT NULL', 'TEXTNOT NULL')))).toThrow('SCHEMA_REVIEW_REQUIRED')
    expect(() => assertLegacyWorldStageSchema(catalog(LEGACY_STAGE_MARKER_DDL.toLowerCase()))).toThrow('SCHEMA_REVIEW_REQUIRED')
  })
  it('rejects changed CHECK literal case or internal spaces even on an empty table', () => {
    for (const literal of ['PENDING-OWNER-AND-ACTIVATION-REVIEW', 'pending -owner-and-activation-review']) {
      expect(() => assertLegacyWorldStageSchema(catalog(LEGACY_STAGE_MARKER_DDL.replace('pending-owner-and-activation-review', literal)))).toThrow('SCHEMA_REVIEW_REQUIRED')
    }
  })
  it('does not normalize alternate quoting, comments, whitespace, or type spellings into readiness', () => {
    for (const marker of [LEGACY_STAGE_MARKER_DDL.replace('CREATE TABLE', 'CREATE  TABLE'),
      LEGACY_STAGE_MARKER_DDL.replace('legacy_import_stage', '"legacy_import_stage"'),
      LEGACY_STAGE_MARKER_DDL.replace('TEXT NOT NULL', 'TEXT /* review */ NOT NULL')]) {
      expect(() => assertLegacyWorldStageSchema(catalog(marker))).toThrow('SCHEMA_REVIEW_REQUIRED')
    }
  })
})

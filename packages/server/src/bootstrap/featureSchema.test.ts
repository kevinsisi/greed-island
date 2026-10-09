import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { assertUnifiedFeatureSchemaReady, initializeUnifiedFeatureSchema } from './featureSchema.js'

const databases: Database.Database[] = []
const directories: string[] = []

function fixture(): Database.Database {
  const db = new Database(':memory:')
  databases.push(db)
  initializeUnifiedFeatureSchema(db)
  return db
}

afterEach(() => {
  vi.restoreAllMocks()
  for (const db of databases.splice(0)) if (db.open) db.close()
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

describe('unified feature schema readiness', () => {
  it('accepts explicit initialized fixtures without accounts, credentials or world seed data', () => {
    const db = fixture()
    expect(() => assertUnifiedFeatureSchemaReady(db)).not.toThrow()
    expect(db.prepare("SELECT name FROM sqlite_master WHERE name='accounts'").get()).toBeUndefined()
    expect(db.prepare('SELECT count(*) AS n FROM api_keys').get()).toEqual({ n: 0 })
    expect(db.prepare('SELECT count(*) AS n FROM world_card_drops').get()).toEqual({ n: 0 })
    expect(db.prepare('SELECT count(*) AS n FROM owned_feature_receipts').get()).toEqual({ n: 0 })
  })

  it('uses only bounded read-only source metadata queries and allows unrelated tables', () => {
    const db = fixture()
    db.exec("CREATE TABLE unrelated_progress(value TEXT); INSERT INTO unrelated_progress VALUES('preserved')")
    const exec = vi.spyOn(db, 'exec')
    const pragma = vi.spyOn(db, 'pragma')
    const prepare = vi.spyOn(db, 'prepare')
    expect(() => assertUnifiedFeatureSchemaReady(db)).not.toThrow()
    expect(exec).not.toHaveBeenCalled()
    expect(pragma).not.toHaveBeenCalled()
    expect(prepare.mock.calls.every(([sql]) => /^SELECT\b/i.test(sql))).toBe(true)
    expect(db.prepare('SELECT value FROM unrelated_progress').get()).toEqual({ value: 'preserved' })
  })

  it.each([
    'event_log', 'rejected_command_log',
    'player_wallet', 'player_jobs', 'combat_sessions', 'combat_log', 'api_keys', 'kv_settings',
    'npc_memory', 'npc_relationships', 'friends', 'messages', 'alliances', 'alliance_members',
    'player_locations', 'player_hub_locations', 'player_npc_relations', 'personal_events',
    'world_card_drops', 'player_codex', 'card_trades', 'card_action_log', 'player_techniques',
    'agent_npc_bindings', 'owned_feature_receipts', 'owned_card_system_receipts',
  ])('requires the mounted table %s', table => {
    const db = fixture()
    // The feature-only fixture deliberately has no account schema. Turn off
    // enforcement while constructing the malformed fixture, including tables
    // referenced by other feature tables; the assertion still checks every FK.
    db.pragma('foreign_keys = OFF')
    db.exec(`DROP TABLE ${table}`)
    expect(() => assertUnifiedFeatureSchemaReady(db)).toThrow(`UNIFIED_FEATURE_SCHEMA_REVIEW_REQUIRED: ${table}: missing required table`)
    expect(db.prepare('SELECT name FROM sqlite_master WHERE name=?').get(table)).toBeUndefined()
  })

  it.each([
    ['combat_sessions', 'enemy_type'], ['combat_sessions', 'species_id'],
    ['api_keys', 'disabled_until'], ['npc_relationships', 'dimensions_json'],
    ['player_locations', 'pos_x'], ['player_locations', 'pos_y'], ['player_locations', 'pos_z'],
    ['player_locations', 'client_updated_at'], ['player_hub_locations', 'pos_x'],
    ['player_hub_locations', 'pos_y'], ['player_hub_locations', 'pos_z'],
    ['player_hub_locations', 'client_updated_at'], ['personal_events', 'player_message'],
  ])('refuses the legacy %s schema without %s instead of migrating it', (table, column) => {
    const db = fixture()
    db.exec(`ALTER TABLE ${table} DROP COLUMN ${column}`)
    expect(() => assertUnifiedFeatureSchemaReady(db)).toThrow(`UNIFIED_FEATURE_SCHEMA_REVIEW_REQUIRED: ${table}: column`)
    const remaining = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
    expect(remaining.some(item => item.name === column)).toBe(false)
  })

  it('accepts reviewed appended migration columns without depending on physical column order', () => {
    const db = fixture()
    db.exec('ALTER TABLE npc_relationships DROP COLUMN dimensions_json')
    db.exec('ALTER TABLE npc_relationships ADD COLUMN dimensions_json TEXT')
    db.exec('ALTER TABLE personal_events DROP COLUMN player_message')
    db.exec("ALTER TABLE personal_events ADD COLUMN player_message TEXT NOT NULL DEFAULT ''")
    expect(() => assertUnifiedFeatureSchemaReady(db)).not.toThrow()
  })

  it('allows additional nonunique performance indices', () => {
    const db = fixture()
    db.exec('CREATE INDEX fixture_receipt_lookup ON owned_feature_receipts(request_key)')
    expect(() => assertUnifiedFeatureSchemaReady(db)).not.toThrow()
  })

  it.each(["'ACTIVE'", "'active '"])('preserves literal case and whitespace in defaults: %s', literal => {
    const db = fixture()
    const row = db.prepare("SELECT sql FROM sqlite_master WHERE name='api_keys'").get() as { sql: string }
    db.exec('DROP TABLE api_keys')
    db.exec(row.sql.replace("DEFAULT 'active'", `DEFAULT ${literal}`))
    db.exec('CREATE INDEX idx_api_keys_status ON api_keys(status)')
    expect(() => assertUnifiedFeatureSchemaReady(db)).toThrow('api_keys: column')
  })

  it.each([
    ['missing table', 'DROP TABLE player_jobs', 'player_jobs'],
    ['legacy personal_events', 'ALTER TABLE personal_events DROP COLUMN player_message', 'personal_events'],
  ])('leaves source bytes, journal mode and sidecars untouched on %s', (_description, ddl, table) => {
    const directory = mkdtempSync(join(tmpdir(), 'greed-feature-schema-'))
    directories.push(directory)
    const path = join(directory, 'canonical.sqlite')
    const writable = new Database(path)
    try {
      initializeUnifiedFeatureSchema(writable)
      writable.exec(ddl)
    } finally { writable.close() }
    const bytes = readFileSync(path)
    const readonly = new Database(path, { readonly: true, fileMustExist: true })
    try {
      expect(readonly.pragma('journal_mode', { simple: true })).toBe('delete')
      expect(() => assertUnifiedFeatureSchemaReady(readonly)).toThrow(`UNIFIED_FEATURE_SCHEMA_REVIEW_REQUIRED: ${table}`)
      expect(readonly.pragma('journal_mode', { simple: true })).toBe('delete')
    } finally { readonly.close() }
    expect(readFileSync(path)).toEqual(bytes)
    for (const suffix of ['-wal', '-shm', '-journal']) expect(existsSync(path + suffix)).toBe(false)
  })

  it.each([
    ['owned_feature_receipts', `CREATE TABLE owned_feature_receipts (
      account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      request_key TEXT NOT NULL, intent_digest TEXT NOT NULL,
      status INTEGER NOT NULL, response_json TEXT NOT NULL
    )`],
    ['owned_card_system_receipts', 'CREATE TABLE owned_card_system_receipts(effect_key TEXT NOT NULL)'],
  ])('rejects malformed %s without its retry/effect primary key', (table, ddl) => {
    const db = fixture()
    db.exec(`DROP TABLE ${table}`)
    db.exec(ddl)
    expect(() => assertUnifiedFeatureSchemaReady(db)).toThrow(`UNIFIED_FEATURE_SCHEMA_REVIEW_REQUIRED: ${table}: column`)
  })

  it.each([
    ['missing kernel receipt index', 'DROP INDEX idx_player_world_feature_receipt', 'event_log: required index idx_player_world_feature_receipt'],
    ['forged kernel receipt predicate', `DROP INDEX idx_player_world_feature_receipt;
      CREATE UNIQUE INDEX idx_player_world_feature_receipt ON event_log(actor_id, command_id)
      WHERE event_type IN ('PLAYER_WORLD_ENTERED', 'PLAYER_WORLD_MOVED', 'PLAYER_REGION_TRANSITIONED', 'PLAYER_WORLD_CHAT_POSTED', 'player_harbor_contributed')`, 'event_log: required index idx_player_world_feature_receipt'],
    ['unknown kernel unique index', `CREATE UNIQUE INDEX unreviewed_kernel_receipt ON event_log(actor_id, command_id)
      WHERE event_type IN ('PLAYER_WORLD_ENTERED', 'PLAYER_WORLD_MOVED', 'PLAYER_REGION_TRANSITIONED')`, 'event_log: unexpected unique index unreviewed_kernel_receipt'],
    ['forged expression index', `DROP INDEX idx_event_log_fact_key_sequence;
      CREATE INDEX idx_event_log_fact_key_sequence ON event_log(json_extract(payload_json, '$.other'), sequence)
      WHERE event_type = 'FACT_SET'`, 'event_log: required index idx_event_log_fact_key_sequence'],
    ['missing append-only trigger', 'DROP TRIGGER event_log_no_update', 'event_log: required trigger event_log_no_update'],
    ['forged append-only trigger', `DROP TRIGGER event_log_no_delete;
      CREATE TRIGGER event_log_no_delete BEFORE DELETE ON event_log BEGIN SELECT RAISE(ABORT, 'event_log IS append-only'); END`, 'event_log: required trigger event_log_no_delete'],
    ['missing index', 'DROP INDEX idx_drops_holder', 'world_card_drops: required index'],
    ['wrong index columns', 'DROP INDEX idx_drops_holder; CREATE INDEX idx_drops_holder ON world_card_drops(card_id)', 'world_card_drops: required index'],
    ['unexpected uniqueness', 'CREATE UNIQUE INDEX bad_receipt_uniqueness ON owned_feature_receipts(request_key)', 'owned_feature_receipts: unexpected unique index'],
    ['unexpected trigger', 'CREATE TRIGGER bad_receipt_trigger AFTER INSERT ON owned_feature_receipts BEGIN DELETE FROM owned_feature_receipts; END', 'owned_feature_receipts: unexpected table trigger'],
    ['unknown column', 'ALTER TABLE player_jobs ADD COLUMN unknown_feature INTEGER', 'player_jobs: column'],
  ])('fails closed for %s', (_description, ddl, detail) => {
    const db = fixture()
    db.exec(ddl)
    expect(() => assertUnifiedFeatureSchemaReady(db)).toThrow(`UNIFIED_FEATURE_SCHEMA_REVIEW_REQUIRED: ${detail}`)
  })

  it.each([
    ['missing foreign key', `CREATE TABLE player_wallet (
      account_id INTEGER PRIMARY KEY, gold INTEGER NOT NULL DEFAULT 0,
      energy INTEGER NOT NULL DEFAULT 100, updated_at INTEGER NOT NULL
    )`, 'foreign-key contract'],
    ['wrong default', `CREATE TABLE player_wallet (
      account_id INTEGER PRIMARY KEY, gold INTEGER NOT NULL DEFAULT 1,
      energy INTEGER NOT NULL DEFAULT 100, updated_at INTEGER NOT NULL,
      FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE CASCADE
    )`, 'column'],
    ['wrong nullability', `CREATE TABLE player_wallet (
      account_id INTEGER PRIMARY KEY, gold INTEGER DEFAULT 0,
      energy INTEGER NOT NULL DEFAULT 100, updated_at INTEGER NOT NULL,
      FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE CASCADE
    )`, 'column'],
    ['wrong column type', `CREATE TABLE player_wallet (
      account_id INTEGER PRIMARY KEY, gold TEXT NOT NULL DEFAULT 0,
      energy INTEGER NOT NULL DEFAULT 100, updated_at INTEGER NOT NULL,
      FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE CASCADE
    )`, 'column'],
  ])('refuses %s despite having all expected column names', (_description, ddl, detail) => {
    const db = fixture()
    db.exec('DROP TABLE player_wallet')
    db.exec(ddl)
    expect(() => assertUnifiedFeatureSchemaReady(db)).toThrow(`UNIFIED_FEATURE_SCHEMA_REVIEW_REQUIRED: player_wallet: ${detail}`)
  })

  it('requires relationship CHECK constraints as well as PRAGMA column/index shape', () => {
    const db = fixture()
    const row = db.prepare("SELECT sql FROM sqlite_master WHERE name='npc_relationships'").get() as { sql: string }
    db.exec('DROP TABLE npc_relationships')
    db.exec(row.sql.replace(/,\s*CHECK\s*\(npc_a < npc_b\)/, ''))
    db.exec(`CREATE INDEX idx_npc_relationships_a ON npc_relationships(npc_a);
      CREATE INDEX idx_npc_relationships_b ON npc_relationships(npc_b);
      CREATE INDEX idx_npc_relationships_type ON npc_relationships(relationship_type)`)
    expect(() => assertUnifiedFeatureSchemaReady(db)).toThrow('npc_relationships: table constraints')
  })
})

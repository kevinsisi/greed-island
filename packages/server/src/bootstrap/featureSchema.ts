import Database from 'better-sqlite3'
import { initializePlayerJobsSchema } from '../buildings/playerJobsStore.js'
import { initializeCombatSchema } from '../combat/combatStore.js'
import { initializeSettingsSchema } from '../http/settings.js'
import { initializeNpcMemorySchema } from '../kernel/npcMemory.js'
import { initializeNpcRelationshipsSchema } from '../kernel/npcRelationships.js'
import { initializeSocialSchema } from '../http/socialStore.js'
import { initializePlayerStateSchema } from '../http/playerState.js'
import { initializeCardWorldSchema } from '../http/cardWorldStore.js'
import { initializeCardActionLogSchema } from '../http/cardCommands.js'
import { initializeTechniqueShopSchema } from '../cards/techniques.js'
import { initializeAgentBindingSchema } from '../http/propertiesRouter.js'
import { initializeKernelSchema } from '../kernel/eventStore.js'

const REVIEW_REQUIRED = 'UNIFIED_FEATURE_SCHEMA_REVIEW_REQUIRED'
const MAX_SCHEMA_SQL_LENGTH = 65_536
const MAX_COLUMNS = 128
const MAX_INDICES = 128
const MAX_TRIGGERS = 16

/**
 * Explicit offline/fixture initialization only. Normal startup must call the
 * read-only assertion instead. This does not create accounts, keys or world data.
 */
export function initializeUnifiedFeatureSchema(db: Database.Database): void {
  initializeKernelSchema(db)
  initializePlayerJobsSchema(db)
  initializeCombatSchema(db)
  initializeSettingsSchema(db)
  initializeNpcMemorySchema(db)
  initializeNpcRelationshipsSchema(db)
  initializeSocialSchema(db)
  initializePlayerStateSchema(db)
  initializeCardWorldSchema(db)
  initializeCardActionLogSchema(db)
  initializeTechniqueShopSchema(db)
  initializeAgentBindingSchema(db)
  // Kept identical to the owned transaction/hook receipt definitions. Neither
  // constructor nor a runtime is needed to initialize an offline fixture.
  db.exec(`CREATE TABLE IF NOT EXISTS owned_feature_receipts (
      account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      request_key TEXT NOT NULL, intent_digest TEXT NOT NULL,
      status INTEGER NOT NULL, response_json TEXT NOT NULL,
      PRIMARY KEY(account_id, request_key)
    )`)
  db.exec(`CREATE TABLE IF NOT EXISTS owned_card_system_receipts (
    effect_key TEXT PRIMARY KEY NOT NULL
  )`)
}

type Column = {
  name: string; type: string; notnull: number; dflt_value: string | null; pk: number; hidden: number
}
type ForeignKey = {
  id: number; seq: number; table: string; from: string; to: string | null
  on_update: string; on_delete: string; match: string
}
type IndexColumn = { seqno: number; cid: number; name: string | null; desc: number; coll: string | null }
type Index = {
  name: string; unique: number; origin: string; partial: number; columns: IndexColumn[]
  expressions: string | null; predicate: string | null
}
type Trigger = { name: string; definition: string }
type TableShape = {
  name: string
  columns: Column[]
  foreignKeys: string[]
  indices: Index[]
  triggers: Trigger[]
  constraints: string
  wr: number
  strict: number
}

let expectedShapes: readonly TableShape[] | undefined

function expectedSchema(): readonly TableShape[] {
  if (expectedShapes) return expectedShapes
  // Initializers may CREATE/ALTER only this disposable database. Never pass the
  // canonical connection to an initializer while deriving the expected schema.
  const reference = new Database(':memory:')
  try {
    initializeUnifiedFeatureSchema(reference)
    const tables = reference.prepare("SELECT name FROM main.sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
      .all() as Array<{ name: string }>
    expectedShapes = tables.map(({ name }) => readTableShape(reference, name))
    return expectedShapes
  } finally { reference.close() }
}

/**
 * Bounded, metadata-only inspection of the canonical connection. Safe on a
 * readonly handle, and before writable open, WAL or any mounted constructors.
 * Missing/unknown incompatible shapes require explicit reviewed migration.
 */
export function assertUnifiedFeatureSchemaReady(db: Database.Database): void {
  for (const expected of expectedSchema()) {
    const actual = readTableShape(db, expected.name)
    if (!same(actual.columns, expected.columns)) fail(expected.name, 'column type/nullability/default/primary-key contract')
    if (!same(actual.foreignKeys, expected.foreignKeys)) fail(expected.name, 'foreign-key contract')
    if (actual.constraints !== expected.constraints || actual.wr !== expected.wr || actual.strict !== expected.strict) {
      fail(expected.name, 'table constraints or storage contract')
    }
    for (const required of expected.triggers) {
      if (!actual.triggers.some(trigger => trigger.name === required.name && trigger.definition === required.definition)) {
        fail(expected.name, `required trigger ${required.name}`)
      }
    }
    if (actual.triggers.some(trigger => !expected.triggers.some(required => required.name === trigger.name))) {
      fail(expected.name, 'unexpected table trigger')
    }
    for (const required of expected.indices) {
      // Named query indices must retain their identity. SQLite's automatic
      // constraint index names may vary with declaration order after migration.
      const found = actual.indices.some(index => (required.origin !== 'c' || index.name === required.name)
        && same(indexContract(index), indexContract(required)))
      if (!found) fail(expected.name, `required index ${required.name}`)
    }
    for (const index of actual.indices.filter(index => index.unique)) {
      if (!expected.indices.some(required => (required.origin !== 'c' || required.name === index.name)
        && same(indexContract(index), indexContract(required)))) {
        fail(expected.name, `unexpected unique index ${index.name}`)
      }
    }
  }
}

function readTableShape(db: Database.Database, name: string): TableShape {
  const table = db.prepare("SELECT sql FROM main.sqlite_master WHERE type='table' AND name=?").get(name) as { sql: string | null } | undefined
  if (!table?.sql) fail(name, 'missing required table')
  if (table.sql.length > MAX_SCHEMA_SQL_LENGTH) fail(name, 'schema exceeds inspection bounds')
  // Only the exact reference append-only triggers are allowed. Extra or forged
  // triggers can change a mounted mutation despite matching table metadata.
  const triggerRows = db.prepare("SELECT name, sql FROM main.sqlite_master WHERE type='trigger' AND tbl_name=? ORDER BY name LIMIT ?")
    .all(name, MAX_TRIGGERS + 1) as Array<{ name: string; sql: string | null }>
  if (triggerRows.length > MAX_TRIGGERS) fail(name, 'trigger inspection bounds')
  const triggers = triggerRows.map(trigger => {
    if (!trigger.sql || trigger.sql.length > MAX_SCHEMA_SQL_LENGTH) fail(name, 'trigger schema inspection bounds')
    return { name: trigger.name, definition: JSON.stringify(sqlTokens(trigger.sql)) }
  })
  const columns = db.prepare('SELECT name, type, "notnull", dflt_value, pk, hidden FROM pragma_table_xinfo(?, \'main\') LIMIT ?')
    .all(name, MAX_COLUMNS + 1) as Column[]
  if (!columns.length || columns.length > MAX_COLUMNS) fail(name, 'column inspection bounds')
  const foreignKeys = db.prepare('SELECT * FROM pragma_foreign_key_list(?, \'main\') LIMIT ?')
    .all(name, MAX_COLUMNS + 1) as ForeignKey[]
  if (foreignKeys.length > MAX_COLUMNS) fail(name, 'foreign-key inspection bounds')
  const indexRows = db.prepare('SELECT name, "unique", origin, partial FROM pragma_index_list(?, \'main\') LIMIT ?')
    .all(name, MAX_INDICES + 1) as Array<Pick<Index, 'name' | 'unique' | 'origin' | 'partial'>>
  if (indexRows.length > MAX_INDICES) fail(name, 'index inspection bounds')
  const indices = indexRows.map(index => {
    const keyColumns = db.prepare('SELECT seqno, cid, name, "desc", coll FROM pragma_index_xinfo(?, \'main\') WHERE key=1 ORDER BY seqno LIMIT ?')
      .all(index.name, MAX_COLUMNS + 1) as IndexColumn[]
    if (keyColumns.length > MAX_COLUMNS) fail(name, 'index-column inspection bounds')
    const definition = db.prepare("SELECT sql FROM main.sqlite_master WHERE type='index' AND name=?").get(index.name) as { sql: string | null } | undefined
    if (!definition || (definition.sql !== null && definition.sql.length > MAX_SCHEMA_SQL_LENGTH)) {
      fail(name, 'index schema inspection bounds')
    }
    return { ...index, columns: keyColumns, ...indexSqlContract(definition.sql) }
  })
  const flags = db.prepare("SELECT wr, strict FROM pragma_table_list WHERE schema='main' AND name=?")
    .get(name) as { wr: number; strict: number } | undefined
  if (!flags) fail(name, 'unreadable table storage contract')
  const groups = new Map<number, ForeignKey[]>()
  for (const foreignKey of foreignKeys) {
    const group = groups.get(foreignKey.id) ?? []
    group.push(foreignKey)
    groups.set(foreignKey.id, group)
  }
  return {
    name,
    columns: columns.map(column => ({ ...column,
      type: column.type.trim().replace(/\s+/g, ' ').toUpperCase(),
      dflt_value: column.dflt_value === null ? null : JSON.stringify(sqlTokens(column.dflt_value)),
    })).sort((a, b) => a.name.localeCompare(b.name)),
    foreignKeys: [...groups.values()].map(group => JSON.stringify(group.sort((a, b) => a.seq - b.seq)
      .map(({ id: _id, ...foreignKey }) => foreignKey))).sort(),
    indices,
    triggers,
    constraints: tableConstraints(table.sql),
    ...flags,
  }
}

function indexContract(index: Index): unknown {
  // Column ordinal positions can change when a reviewed migration appends a
  // field. Names/order/collation/direction identify the actual index contract.
  return { unique: index.unique, origin: index.origin, partial: index.partial,
    expressions: index.expressions, predicate: index.predicate,
    columns: index.columns.map(({ cid: _cid, ...column }) => column) }
}

function indexSqlContract(sql: string | null): { expressions: string | null; predicate: string | null } {
  // Automatic PK/UNIQUE indices have no stored SQL; their column metadata is
  // authoritative. Explicit expression/partial indices also need their SQL.
  if (sql === null) return { expressions: null, predicate: null }
  const tokens = sqlTokens(sql)
  const on = tokens.findIndex(token => !token.literal && token.value === 'ON')
  const start = tokens.findIndex((token, index) => index > on && !token.literal && token.value === '(')
  if (on < 0 || start < 0) throw new Error(`${REVIEW_REQUIRED}: unreadable index definition`)
  let end = start, depth = 0
  for (; end < tokens.length; end++) {
    const token = tokens[end]!
    if (!token.literal && token.value === '(') depth++
    if (!token.literal && token.value === ')' && --depth === 0) break
  }
  if (depth !== 0) throw new Error(`${REVIEW_REQUIRED}: unclosed index expression`)
  const suffix = tokens.slice(end + 1).filter(token => token.literal || token.value !== ';')
  if (suffix.length && (suffix[0]!.literal || suffix[0]!.value !== 'WHERE')) {
    throw new Error(`${REVIEW_REQUIRED}: unreadable index predicate`)
  }
  return { expressions: JSON.stringify(tokens.slice(start, end + 1)),
    predicate: suffix.length ? JSON.stringify(suffix.slice(1)) : null }
}

function same(actual: unknown, expected: unknown): boolean {
  return JSON.stringify(actual) === JSON.stringify(expected)
}

function fail(table: string, detail: string): never {
  throw new Error(`${REVIEW_REQUIRED}: ${table}: ${detail}; explicit reviewed offline initialization or migration is required. Canonical startup will not repair the schema.`)
}

type Token = { value: string; literal: boolean }

/** Tokenize stored DDL without confusing comments or quoted values with SQL. */
function sqlTokens(sql: string): Token[] {
  const tokens: Token[] = []
  for (let offset = 0; offset < sql.length;) {
    const char = sql[offset]!
    if (/\s/.test(char)) { offset++; continue }
    if (sql.startsWith('--', offset)) {
      const end = sql.indexOf('\n', offset + 2)
      offset = end < 0 ? sql.length : end + 1
      continue
    }
    if (sql.startsWith('/*', offset)) {
      const end = sql.indexOf('*/', offset + 2)
      if (end < 0) throw new Error(`${REVIEW_REQUIRED}: unclosed schema comment`)
      offset = end + 2
      continue
    }
    if (char === "'" || char === '"' || char === '`' || char === '[') {
      const close = char === '[' ? ']' : char
      let value = '', closed = false
      offset++
      while (offset < sql.length) {
        if (sql[offset] === close) {
          if (char !== '[' && sql[offset + 1] === close) { value += close; offset += 2; continue }
          offset++; closed = true; break
        }
        value += sql[offset++]!
      }
      if (!closed) throw new Error(`${REVIEW_REQUIRED}: unclosed schema quote`)
      tokens.push({ value: char === "'" ? value : value.toUpperCase(), literal: char === "'" })
      continue
    }
    const word = /^[\w$]+/.exec(sql.slice(offset))?.[0]
    if (word) { tokens.push({ value: word.toUpperCase(), literal: false }); offset += word.length; continue }
    tokens.push({ value: char, literal: false }); offset++
  }
  return tokens
}

function tableConstraints(sql: string): string {
  const tokens = sqlTokens(sql)
  const checks: string[] = []
  const modifiers: string[] = []
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index]!
    if (token.literal) continue
    if (['AUTOINCREMENT', 'COLLATE', 'DEFERRABLE', 'INITIALLY', 'GENERATED', 'CONFLICT'].includes(token.value)) {
      modifiers.push(JSON.stringify([token, tokens[index + 1] ?? null]))
    }
    if (token.value !== 'CHECK') continue
    if (tokens[index + 1]?.value !== '(') throw new Error(`${REVIEW_REQUIRED}: unreadable CHECK constraint`)
    let end = index + 1, depth = 0
    for (; end < tokens.length; end++) {
      const item = tokens[end]!
      if (!item.literal && item.value === '(') depth++
      if (!item.literal && item.value === ')' && --depth === 0) break
    }
    if (depth !== 0) throw new Error(`${REVIEW_REQUIRED}: unclosed CHECK constraint`)
    checks.push(JSON.stringify(tokens.slice(index + 1, end + 1)))
    index = end
  }
  return JSON.stringify({ checks: checks.sort(), modifiers: modifiers.sort() })
}

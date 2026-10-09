import type Database from 'better-sqlite3'

type Connection = Database.Database
type Column = { name: string; type: string; notnull: number; pk: number }
const LEDGERS = new Set(['event_log', 'card_action_log', 'rejected_command_log'])
const REFERENCES = new Set(['accountId', 'account_id', 'playerAccountId', 'ownerAccountId', 'targetAccountId', 'partnerAccountId', 'buyerAccountId', 'sellerAccountId', 'accountIds', 'playerAccountIds', 'actorId', 'playerId', 'userId', 'senderId', 'receiverId', 'leaderId', 'targetId', 'proposerId', 'sourceActorId', 'targetActorId', 'defeatedByActorId'])
const CARD_DROP_COLUMNS: readonly Column[] = [
  { name: 'id', type: 'INTEGER', notnull: 0, pk: 1 },
  ...['card_id', 'x', 'y', 'dropped_at_tick', 'expires_at_tick'].map(name => ({ name, type: 'INTEGER', notnull: 1, pk: 0 })),
  ...['tile_id', 'state'].map(name => ({ name, type: 'TEXT', notnull: 1, pk: 0 })),
  ...['holder_account_id', 'pickup_at_tick', 'store_deadline_tick'].map(name => ({ name, type: 'INTEGER', notnull: 0, pk: 0 })),
]

/** Read-only authority from supported canonical stores, never a guessed new principal. */
export function readCanonicalAccountIdAuthority(db: Connection): number {
  let maximum = 0
  const reserve = (value: unknown) => {
    const numeric = typeof value === 'number' ? value : typeof value === 'string' && /^[0-9]+$/.test(value) ? Number(value) : null
    if (numeric === null || numeric <= 0) return
    if (!Number.isSafeInteger(numeric)) throw new Error('Ambiguous historical account ID requires manual migration.')
    maximum = Math.max(maximum, numeric)
  }
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as Array<{ name: string }>
  const names = new Set(tables.map(table => table.name))
  if (names.has('accounts')) for (const row of db.prepare('SELECT id FROM accounts').all() as Array<{ id: unknown }>) reserve(row.id)
  if (names.has('sqlite_sequence')) {
    const sequence = db.prepare("SELECT seq FROM sqlite_sequence WHERE name='accounts'").get() as { seq: unknown } | undefined
    if (sequence) reserve(sequence.seq)
  }
  for (const { name } of tables) {
    const columns = db.prepare(`PRAGMA table_info(${quote(name)})`).all() as Column[]
    if (columns.some(column => column.name === 'actor_id') && !LEDGERS.has(name)) {
      throw new Error(`Unsupported actor-bearing history ${name} requires manual migration.`)
    }
    // FK metadata is an explicit account-reference contract, not a naming guess.
    const foreignKeys = db.prepare(`PRAGMA foreign_key_list(${quote(name)})`).all() as Array<{ table: string; from: string; to: string | null }>
    for (const foreign of foreignKeys.filter(key => key.table === 'accounts')) {
      if (foreign.to !== 'id' && foreign.to !== null && foreign.to !== '') throw new Error('Unsupported account-reference foreign key requires manual migration.')
      for (const row of db.prepare(`SELECT ${quote(foreign.from)} AS referenced_id FROM ${quote(name)}`).all() as Array<{ referenced_id: unknown }>) reserve(row.referenced_id)
    }
    // Canonical held-card ownership predates an accounts FK. Validate its reviewed
    // shape explicitly instead of guessing from a column-name suffix.
    if (name === 'world_card_drops') {
      if (columns.length !== CARD_DROP_COLUMNS.length || CARD_DROP_COLUMNS.some(expected => !columns.some(column => column.name === expected.name && column.type.toUpperCase() === expected.type && column.notnull === expected.notnull && column.pk === expected.pk))) {
        throw new Error('Unsupported world-card ownership schema requires manual migration.')
      }
      for (const row of db.prepare('SELECT holder_account_id FROM world_card_drops').all() as Array<{ holder_account_id: unknown }>) {
        if (row.holder_account_id !== null) reservePlayerReference(row.holder_account_id, reserve)
      }
    }
    if (!LEDGERS.has(name)) continue
    if (!columns.some(column => column.name === 'actor_id')) throw new Error('Unsupported actor history schema requires manual migration.')
    const payload = columns.some(column => column.name === 'payload_json') ? 'payload_json' : columns.some(column => column.name === 'payload') ? 'payload' : null
    if (name !== 'rejected_command_log' && !payload) throw new Error('Unsupported committed history schema requires manual migration.')
    const rows = db.prepare(`SELECT actor_id${name !== 'rejected_command_log' && payload ? `,${quote(payload)} AS account_payload` : ''} FROM ${quote(name)}`).all() as Array<{ actor_id: unknown; account_payload?: unknown }>
    for (const row of rows) {
      reserve(row.actor_id)
      if (name === 'rejected_command_log') continue // Its payload is rejected intent, not fact.
      if (typeof row.account_payload !== 'string') throw new Error('Ambiguous historical payload requires manual migration.')
      let value: unknown
      try { value = JSON.parse(row.account_payload) } catch { throw new Error('Ambiguous historical payload requires manual migration.') }
      collect(value, reserve)
    }
  }
  return maximum
}

/** Explicit offline/transactional reservation. Never invoked by a constructor/startup. */
export function reserveCanonicalAccountIds(db: Connection): number {
  assertAutoincrementAccounts(db)
  const maximum = readCanonicalAccountIdAuthority(db)
  if (maximum > 0) {
    const changed = db.prepare("UPDATE sqlite_sequence SET seq=MAX(seq,?) WHERE name='accounts'").run(maximum)
    if (changed.changes === 0) db.prepare("INSERT INTO sqlite_sequence(name,seq) VALUES('accounts',?)").run(maximum)
  }
  return maximum
}

/** Read-only readiness gate: normal signup cannot proceed on an unsafe allocator. */
export function assertAccountAllocatorReady(db: Connection): void {
  assertAutoincrementAccounts(db)
  const authority = readCanonicalAccountIdAuthority(db)
  const hasSequence = !!db.prepare("SELECT name FROM sqlite_master WHERE name='sqlite_sequence'").get()
  const sequence = hasSequence ? (db.prepare("SELECT seq FROM sqlite_sequence WHERE name='accounts'").get() as { seq: number } | undefined)?.seq ?? 0 : 0
  if (!Number.isSafeInteger(sequence) || sequence < authority) throw new Error('Account allocator is unreserved; explicit reviewed migration is required.')
}

function assertAutoincrementAccounts(db: Connection): void {
  const columns = db.prepare('PRAGMA table_info(accounts)').all() as Array<{ name: string; type: string; pk: number }>
  const definition = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='accounts'").get() as { sql: string } | undefined
  if (!columns.some(column => column.name === 'id' && column.type.toUpperCase() === 'INTEGER' && column.pk === 1)
    || !definition || !sqlTokens(definition.sql).includes('AUTOINCREMENT')) throw new Error('Unsupported account allocator requires explicit manual migration.')
}

// Lex keywords instead of accepting AUTOINCREMENT inside a comment/string/quoted name.
function sqlTokens(sql: string): string[] {
  const tokens: string[] = []
  for (let i = 0; i < sql.length;) {
    const char = sql[i]!
    if (char === '-' && sql[i + 1] === '-') { i += 2; while (i < sql.length && sql[i] !== '\n') i++; continue }
    if (char === '/' && sql[i + 1] === '*') { i += 2; while (i < sql.length && !(sql[i] === '*' && sql[i + 1] === '/')) i++; i += 2; continue }
    if (char === "'" || char === '"' || char === '`' || char === '[') {
      const closing = char === '[' ? ']' : char; i++
      while (i < sql.length) {
        if (sql[i] === closing) { if (sql[i + 1] === closing) { i += 2; continue }; i++; break }
        i++
      }
      continue
    }
    if ((char >= 'a' && char <= 'z') || (char >= 'A' && char <= 'Z') || char === '_') {
      const start = i++
      while (i < sql.length && ((sql[i]! >= 'a' && sql[i]! <= 'z') || (sql[i]! >= 'A' && sql[i]! <= 'Z') || (sql[i]! >= '0' && sql[i]! <= '9') || sql[i] === '_')) i++
      tokens.push(sql.slice(start, i).toUpperCase()); continue
    }
    i++
  }
  return tokens
}

function collect(value: unknown, reserve: (value: unknown) => void, depth = 0): void {
  if (depth > 64) throw new Error('Ambiguous deep history requires manual migration.')
  if (Array.isArray(value)) { for (const child of value) collect(child, reserve, depth + 1); return }
  if (!value || typeof value !== 'object') return
  const record = value as Record<string, unknown>
  // GoodsInventoryProjection can replay this legacy-readable player shape even
  // though the current generic goods validator rejects it. Reserve its principal.
  if (record.holderType === 'player') reservePlayerReference(record.holderId, reserve)
  // Current transport validation AND projection reject player endpoints. Keep
  // such ambiguous historical semantics behind explicit manual classification.
  if (record.fromHolderType === 'player' || record.toHolderType === 'player') {
    throw new Error('Unsupported player transport history requires manual migration.')
  }
  if ('playerActorId' in record) reservePlayerReference(record.playerActorId, reserve)
  for (const [key, child] of Object.entries(value)) {
    if (REFERENCES.has(key)) {
      if (Array.isArray(child)) for (const item of child) reserve(item)
      else reserve(child)
    }
    collect(child, reserve, depth + 1)
  }
}
function reservePlayerReference(value: unknown, reserve: (value: unknown) => void): void {
  const numeric = typeof value === 'number' ? value : typeof value === 'string' && /^[0-9]+$/.test(value) ? Number(value) : null
  if (numeric === null || !Number.isSafeInteger(numeric) || numeric <= 0) throw new Error('Ambiguous historical player reference requires manual migration.')
  reserve(numeric)
}
function quote(name: string): string { return `"${name.replaceAll('"', '""')}"` }

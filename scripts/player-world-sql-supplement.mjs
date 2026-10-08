import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { performance } from 'node:perf_hooks'

const directory = mkdtempSync(join(tmpdir(), 'greed-world-sql-only-'))
const path = join(directory, 'synthetic.sqlite')
let db = new DatabaseSync(path)
try {
  // Execute the repository's actual schema text; this remains SQL-only supplemental evidence.
  const source = readFileSync(new URL('../packages/server/src/kernel/eventStore.ts', import.meta.url), 'utf8')
  const start = source.indexOf('  db.exec(`', source.indexOf('export function initializeKernelSchema')) + '  db.exec(`'.length
  const end = source.indexOf('`)', start)
  assert(start > 0 && end > start)
  db.exec(source.slice(start, end)); db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;')
  const insert = db.prepare(`INSERT INTO event_log(event_id,event_type,occurred_at,actor_id,command_id,tick,ruleset_version,payload_json,version,deterministic_key)
    VALUES(?,?,?,?,?,?,?,?,?,?)`)
  const steps = 100, players = 2, started = performance.now()
  for (let step = 0; step < steps; step += 1) {
    db.exec('BEGIN IMMEDIATE')
    for (let actor = 1; actor <= players; actor += 1) {
      const key = `synthetic-${actor}-${step}`
      const data = { accountId: actor, tileId: 't_dock', x: step % 2 ? 0 : 0.4, z: -6, movementStep: step,
        clientCommandId: `m-${step}`, intentDigest: 'a'.repeat(64) }
      insert.run(key, 'PLAYER_WORLD_MOVED', 0, String(actor), `player-world:${actor}:m-${step}`, 0,
        'canonical-player-world@1', JSON.stringify({ actorType: 'player', data, narration: null }), 1, key)
    }
    db.exec('COMMIT')
  }
  const elapsedMs = performance.now() - started
  const latestSql = `SELECT e.* FROM event_log e JOIN (SELECT actor_id, MAX(sequence) AS sequence FROM event_log
    WHERE event_type IN (?,?,?) GROUP BY actor_id) latest ON e.sequence=latest.sequence ORDER BY e.sequence`
  const types = ['PLAYER_WORLD_ENTERED','PLAYER_WORLD_MOVED','PLAYER_REGION_TRANSITIONED']
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM event_log').get().count, steps * players)
  assert.equal(db.prepare(latestSql).all(...types).length, players)
  assert.throws(() => insert.run('conflict', types[1], 0, '1', 'player-world:1:m-0', 0, 'canonical-player-world@1', '{}', 1, 'conflict'), /UNIQUE/)
  db.exec('BEGIN IMMEDIATE'); insert.run('rollback', types[1], 0, '1', 'player-world:1:rollback', 0, 'canonical-player-world@1', '{}', 1, 'rollback'); db.exec('ROLLBACK')
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM event_log').get().count, steps * players)
  assert.throws(() => db.exec('DELETE FROM event_log'), /append-only/)
  db.close(); db = new DatabaseSync(path)
  const restored = db.prepare(latestSql).all(...types).map(row => JSON.parse(row.payload_json).data)
  assert(restored.every(data => data.movementStep === steps - 1 && data.x === 0))
  console.log(JSON.stringify({ evidence: 'SUPPLEMENTAL_SQL_ONLY', node: process.version,
    storage: 'node:sqlite DatabaseSync; repository schema; file-backed WAL synchronous=FULL', players,
    acceptedSyntheticPositionRows: steps * players, transactions: steps, elapsedMs,
    eventsPerSecond: steps * players * 1000 / elapsedMs, transactionsPerSecond: steps * 1000 / elapsedMs,
    dbBytes: statSync(path).size, checks: ['actor/command uniqueness','atomic rollback','append-only trigger','latest-per-actor SQL','file reopen'],
    excluded: ['better-sqlite3 adapter','canonical SimulationRuntime','actual HTTP/SSE','production capacity','network latency'] }, null, 2))
} finally { db.close(); rmSync(directory, { recursive: true, force: true }) }

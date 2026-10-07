/** Dedicated disposable local fixture server. Never imported by production startup. */
import Database from 'better-sqlite3'
import { randomBytes } from 'node:crypto'
import { chmodSync, existsSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'
import { INITIAL_PLAYERS } from './domain.js'
import { createMultiplayerApp, hashPassword } from './http.js'
import { MultiplayerRuntime } from './runtime.js'
import type { FixtureIdentity } from './types.js'
import { acquireFixtureLock } from './fixtureLock.js'

type Credentials = { id: string; name: string; username: string; password: string }
const HOST = '127.0.0.1'
const PORT = 4179

function fixtureDirectory(): string {
  const args = process.argv.slice(2)
  if (args.length !== 0 && (args.length !== 2 || args[0] !== '--data-dir')) throw new Error('Usage: node dist/multiplayer/server.js [--data-dir EXISTING_TEMP_FIXTURE_DIRECTORY]')
  const base = realpathSync(tmpdir())
  if (args.length === 0) return mkdtempSync(join(base, 'greed-multiplayer-'))
  const candidate = realpathSync(resolve(args[1]!))
  const rel = relative(base, candidate)
  if (!rel || rel.startsWith(`..${sep}`) || rel === '..' || !basename(candidate).startsWith('greed-multiplayer-') || dirname(candidate) !== base || !existsSync(join(candidate, 'local-fixture.json'))) throw new Error('Only an existing temporary greed-multiplayer fixture directory may be reopened.')
  const marker = JSON.parse(readFileSync(join(candidate, 'local-fixture.json'), 'utf8')) as { kind?: string; version?: number }
  if (marker.kind !== 'local-multiplayer' || marker.version !== 1) throw new Error('Not a supported local multiplayer fixture directory.')
  return candidate
}

function main(): void {
  const dataDir = fixtureDirectory()
  chmodSync(dataDir, 0o700)
  const lockPath = join(dataDir, 'running.lock')
  // Exclusive process ownership prevents two runtimes racing on one projection.
  const releaseLock = acquireFixtureLock(lockPath)
  try {
  const credentialsPath = join(dataDir, 'credentials.json')
  let credentials: Credentials[]
  if (existsSync(credentialsPath)) {
    credentials = JSON.parse(readFileSync(credentialsPath, 'utf8')) as Credentials[]
    if (!Array.isArray(credentials) || credentials.length !== 2 || credentials.some((p, i) => p.id !== INITIAL_PLAYERS[i]!.id || typeof p.password !== 'string' || p.password.length < 16 || typeof p.username !== 'string')) throw new Error('Invalid local fixture credentials.')
  } else {
    credentials = INITIAL_PLAYERS.map((p, index) => ({ id: p.id, name: p.name, username: `traveler-${index + 1}`, password: randomBytes(18).toString('base64url') }))
    writeFileSync(credentialsPath, JSON.stringify(credentials, null, 2), { mode: 0o600, flag: 'wx' })
    writeFileSync(join(dataDir, 'local-fixture.json'), JSON.stringify({ kind: 'local-multiplayer', version: 1 }), { mode: 0o600, flag: 'wx' })
  }
  chmodSync(credentialsPath, 0o600)
  const fixtures: FixtureIdentity[] = credentials.map(({ password, ...identity }) => ({ ...identity, passwordHash: hashPassword(password) }))
  const db = new Database(join(dataDir, 'room.sqlite'))
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  const runtime = new MultiplayerRuntime(db)
  const app = createMultiplayerApp({ runtime, fixtures })
  const server = app.listen(PORT, HOST, () => {
    runtime.start()
    console.log(`[local-multiplayer] listening http://${HOST}:${PORT}`)
    console.log(`[local-multiplayer] private fixture credentials: ${credentialsPath}`)
    console.log(`[local-multiplayer] reopen with --data-dir ${dataDir}`)
  })
  let stopped = false
  const shutdown = () => {
    if (stopped) return
    stopped = true
    runtime.stop()
    server.closeAllConnections()
    server.close()
    db.close()
    releaseLock()
  }
  server.on('error', error => { console.error(`[local-multiplayer] ${error.message}`); shutdown(); process.exitCode = 1 })
  process.on('SIGINT', () => { shutdown(); process.exit(0) })
  process.on('SIGTERM', () => { shutdown(); process.exit(0) })
  } catch (error) { releaseLock(); throw error }
}
main()

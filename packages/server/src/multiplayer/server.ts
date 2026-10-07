/** Dedicated disposable local fixture server. Never imported by production startup. */
import Database from 'better-sqlite3'
import { randomBytes } from 'node:crypto'
import { chmodSync, existsSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'
import { generateRoster } from './domain.js'
import { createMultiplayerApp, hashPassword } from './http.js'
import { MultiplayerRuntime } from './runtime.js'
import type { FixtureIdentity } from './types.js'
import { acquireFixtureLock } from './fixtureLock.js'
import { parseFixtureArgs, validateCredentials, type FixtureArguments, type FixtureCredentials } from './fixtures.js'

const HOST = '127.0.0.1'
const PORT = 4179

function fixtureDirectory(args: FixtureArguments): string {
  const base = realpathSync(tmpdir())
  if (args.dataDir === null) return mkdtempSync(join(base, 'greed-multiplayer-'))
  const candidate = realpathSync(resolve(args.dataDir))
  const rel = relative(base, candidate)
  if (!rel || rel.startsWith(`..${sep}`) || rel === '..' || !basename(candidate).startsWith('greed-multiplayer-') || dirname(candidate) !== base || !existsSync(join(candidate, 'local-fixture.json'))) throw new Error('Only an existing temporary greed-multiplayer fixture directory may be reopened.')
  const marker = JSON.parse(readFileSync(join(candidate, 'local-fixture.json'), 'utf8')) as { kind?: string; version?: number }
  if (marker.kind !== 'local-multiplayer' || marker.version !== 1) throw new Error('Not a supported local multiplayer fixture directory.')
  return candidate
}

function main(): void {
  const args = parseFixtureArgs(process.argv.slice(2))
  const dataDir = fixtureDirectory(args)
  chmodSync(dataDir, 0o700)
  const lockPath = join(dataDir, 'running.lock')
  // Exclusive process ownership prevents two runtimes racing on one projection.
  const releaseLock = acquireFixtureLock(lockPath)
  try {
    const credentialsPath = join(dataDir, 'credentials.json')
    if (args.dataDir !== null && !existsSync(credentialsPath)) throw new Error('Existing fixture credentials are missing; refusing to replace identities.')
    const db = new Database(join(dataDir, 'room.sqlite'), { fileMustExist: args.dataDir !== null })
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')
    const newRoster = args.dataDir === null ? generateRoster(args.fixtureCount) : undefined
    const runtime = new MultiplayerRuntime(db, newRoster ? { roster: newRoster } : { requireExisting: true })
    let credentials: FixtureCredentials[]
    if (args.dataDir !== null) {
      const existing: unknown = JSON.parse(readFileSync(credentialsPath, 'utf8'))
      // The replayed event roster, rather than today's fixture-count default, is authoritative.
      const firstId = Array.isArray(existing) && typeof existing[0]?.id === 'string' ? existing[0].id as string : ''
      credentials = validateCredentials(existing, runtime.snapshot(firstId).players)
    } else {
      credentials = newRoster!.map((p, index) => ({ id: p.id, name: p.name, username: `traveler-${index + 1}`, password: randomBytes(18).toString('base64url') }))
      writeFileSync(credentialsPath, JSON.stringify(credentials, null, 2), { mode: 0o600, flag: 'wx' })
      writeFileSync(join(dataDir, 'local-fixture.json'), JSON.stringify({ kind: 'local-multiplayer', version: 1 }), { mode: 0o600, flag: 'wx' })
    }
    chmodSync(credentialsPath, 0o600)
    const fixtures: FixtureIdentity[] = credentials.map(({ password, ...identity }) => ({ ...identity, passwordHash: hashPassword(password) }))
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

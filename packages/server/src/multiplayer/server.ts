/** Dedicated disposable local fixture server. Never imported by production startup. */
import { chmodSync, existsSync, mkdtempSync, readFileSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'
import { createMultiplayerApp, parseAllowedOrigins } from './http.js'
import { acquireFixtureLock } from './fixtureLock.js'
import { parseFixtureArgs, type FixtureArguments } from './fixtures.js'
import { readMultiplayerConfig } from './config.js'
import { openFixtureStore, preparePersistentDataDirectory } from './fixtureStorage.js'

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
  const config = readMultiplayerConfig()
  const args = parseFixtureArgs(process.argv.slice(2))
  if (config.dataDir && args.dataDir !== null) {
    throw new Error('Use MULTIPLAYER_DATA_DIR instead of --data-dir when the environment variable is set.')
  }
  const storage = config.dataDir
    ? preparePersistentDataDirectory(config.dataDir)
    : { dataDir: fixtureDirectory(args), existing: args.dataDir !== null }
  const { dataDir, existing } = storage
  chmodSync(dataDir, 0o700)
  const lockPath = join(dataDir, 'running.lock')
  // Exclusive process ownership prevents two runtimes racing on one projection.
  const releaseLock = acquireFixtureLock(lockPath)
  try {
    const { db, runtime, credentials, fixtures } = openFixtureStore(dataDir, args.fixtureCount, existing)
    const credentialsPath = join(dataDir, 'credentials.json')
    const app = createMultiplayerApp({ runtime, fixtures, allowedOrigins: parseAllowedOrigins(process.env.MULTIPLAYER_ALLOWED_ORIGINS) })
    const server = app.listen(config.port, config.host, () => {
      runtime.start()
      console.log(`[local-multiplayer] listening http://${config.host}:${config.port}`)
      console.log(`[local-multiplayer] private fixture credentials: ${credentialsPath}`)
      console.log(config.dataDir
        ? `[local-multiplayer] reopen with MULTIPLAYER_DATA_DIR=${dataDir}`
        : `[local-multiplayer] reopen with --data-dir ${dataDir}`)
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

import { mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { readMultiplayerConfig } from './config.js'
import { parseAllowedOrigins } from './http.js'
import { openFixtureStore, preparePersistentDataDirectory } from './fixtureStorage.js'

const temporaryDirectories: string[] = []

function temporaryDirectory(): string {
  const path = mkdtempSync(join(tmpdir(), 'greed-multiplayer-config-test-'))
  temporaryDirectories.push(path)
  return path
}

afterEach(() => {
  for (const path of temporaryDirectories.splice(0)) rmSync(path, { recursive: true, force: true })
})

describe('multiplayer environment configuration', () => {
  it('defaults host, port, and data directory', () => {
    expect(readMultiplayerConfig({})).toEqual({ host: '127.0.0.1', port: 4179, dataDir: null })
  })

  it('reads configured host, port, and persistent data directory', () => {
    expect(readMultiplayerConfig({
      MULTIPLAYER_HOST: '0.0.0.0',
      MULTIPLAYER_PORT: '28100',
      MULTIPLAYER_DATA_DIR: '  /var/lib/greed-multiplayer  ',
    })).toEqual({ host: '0.0.0.0', port: 28100, dataDir: '/var/lib/greed-multiplayer' })
  })

  it.each(['', '0', '65536', '4179x', '1.5'])('rejects invalid MULTIPLAYER_PORT %s', port => {
    expect(() => readMultiplayerConfig({ MULTIPLAYER_PORT: port })).toThrow(/MULTIPLAYER_PORT/)
  })

  it('uses the fixed origin allow-list unless a comma-separated value is configured', () => {
    expect(parseAllowedOrigins(undefined)).toEqual(['http://localhost:4178', 'http://127.0.0.1:4178'])
    expect(parseAllowedOrigins(' https://game.example, http://127.0.0.1:4178 ,,')).toEqual([
      'https://game.example', 'http://127.0.0.1:4178',
    ])
    expect(parseAllowedOrigins('   ')).toEqual(['http://localhost:4178', 'http://127.0.0.1:4178'])
  })
})

describe('persistent multiplayer fixture data', () => {
  it('creates the fixture once and reuses its database and credentials after restart', () => {
    const root = temporaryDirectory()
    const dataDir = join(root, 'mounted-room')
    const firstDirectory = preparePersistentDataDirectory(dataDir)
    expect(firstDirectory).toEqual({ dataDir, existing: false })

    const first = openFixtureStore(firstDirectory.dataDir, 3, firstDirectory.existing)
    try {
      expect(first.credentials).toHaveLength(3)
      expect(statSync(join(dataDir, 'credentials.json')).mode & 0o777).toBe(0o600)
      const identity = first.credentials[0]!
      first.runtime.connect(identity.id)
      first.runtime.execute(identity.id, {
        commandId: 'persisted-move', type: 'move', payload: { dx: 0, dz: 1 },
      })
      const beforeRestart = first.runtime.snapshot(identity.id)
      first.runtime.stop()
      first.db.close()

      const restartedDirectory = preparePersistentDataDirectory(dataDir)
      expect(restartedDirectory).toEqual({ dataDir, existing: true })
      const restarted = openFixtureStore(restartedDirectory.dataDir, 50, restartedDirectory.existing)
      try {
        expect(restarted.credentials).toEqual(first.credentials)
        expect(restarted.fixtures.map(({ username }) => username)).toEqual(first.fixtures.map(({ username }) => username))
        const afterRestart = restarted.runtime.snapshot(identity.id)
        expect(afterRestart.players.map(({ online: _online, ...player }) => player)).toEqual(
          beforeRestart.players.map(({ online: _online, ...player }) => player),
        )
        expect(afterRestart.players).toHaveLength(3)
      } finally {
        restarted.runtime.stop()
        restarted.db.close()
      }
    } finally {
      first.runtime.stop()
      if (first.db.open) first.db.close()
    }
  })

  it('refuses a non-empty configured directory without a fixture marker', () => {
    const root = temporaryDirectory()
    const dataDir = join(root, 'not-a-fixture')
    const prepared = preparePersistentDataDirectory(dataDir)
    expect(prepared.existing).toBe(false)
    writeFileSync(join(dataDir, 'unrelated.txt'), 'preserve')
    expect(() => preparePersistentDataDirectory(dataDir)).toThrow(/non-empty/)
  })
})

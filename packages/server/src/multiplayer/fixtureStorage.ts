import Database from 'better-sqlite3'
import { randomBytes } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { AccountStore } from './accounts.js'
import { generateRoster } from './domain.js'
import { hashPassword } from './http.js'
import { MultiplayerRuntime } from './runtime.js'
import type { FixtureIdentity } from './types.js'
import { validateCredentials, type FixtureCredentials } from './fixtures.js'

type FixtureMarker = { kind?: unknown; version?: unknown }

export type PreparedDataDirectory = Readonly<{
  dataDir: string
  existing: boolean
}>

export type FixtureStore = Readonly<{
  db: Database.Database
  runtime: MultiplayerRuntime
  credentials: FixtureCredentials[]
  fixtures: FixtureIdentity[]
}>

export function preparePersistentDataDirectory(configuredPath: string): PreparedDataDirectory {
  const requestedPath = resolve(configuredPath)
  mkdirSync(requestedPath, { recursive: true, mode: 0o700 })
  chmodSync(requestedPath, 0o700)

  const markerPath = join(requestedPath, 'local-fixture.json')
  if (existsSync(markerPath)) {
    const marker = JSON.parse(readFileSync(markerPath, 'utf8')) as FixtureMarker
    if (marker.kind !== 'local-multiplayer' || marker.version !== 1) {
      throw new Error('Not a supported local multiplayer fixture directory.')
    }
    return { dataDir: requestedPath, existing: true }
  }

  if (readdirSync(requestedPath).length > 0) {
    throw new Error('Persistent multiplayer data directory is non-empty but has no fixture marker; refusing to overwrite it.')
  }
  return { dataDir: requestedPath, existing: false }
}

export function openFixtureStore(dataDir: string, fixtureCount: number, existing: boolean): FixtureStore {
  const credentialsPath = join(dataDir, 'credentials.json')
  const accountStore = new AccountStore(join(dataDir, 'accounts.json'))
  const databasePath = join(dataDir, 'room.sqlite')
  if (existing && !existsSync(credentialsPath)) {
    throw new Error('Existing fixture credentials are missing; refusing to replace identities.')
  }

  const db = new Database(databasePath, { fileMustExist: existing })
  let runtime: MultiplayerRuntime | undefined
  try {
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')
    const roster = existing ? undefined : generateRoster(fixtureCount)
    runtime = new MultiplayerRuntime(db, roster ? { roster } : { requireExisting: true })

    let credentials: FixtureCredentials[]
    if (existing) {
      const stored: unknown = JSON.parse(readFileSync(credentialsPath, 'utf8'))
      const registeredAccounts = accountStore.list()
      let roomPlayers = runtime.listRoster()
      const roomPlayersById = new Map(roomPlayers.map(player => [player.id, player]))
      for (const account of registeredAccounts) {
        const roomPlayer = roomPlayersById.get(account.id)
        if (!roomPlayer) {
          // Account JSON is committed before MP_PLAYER_JOINED. Recover that narrow crash window by replaying the missing fact.
          try { runtime.addPlayer({ id: account.id, name: account.name, x: 0, z: -6 }) }
          catch { throw new Error('Registered multiplayer account could not be restored to the room event log.') }
          roomPlayersById.set(account.id, { id: account.id, name: account.name, x: 0, z: -6 })
        } else if (roomPlayer.name !== account.name) {
          throw new Error('Registered multiplayer account does not match its room player identity.')
        }
      }
      roomPlayers = [...roomPlayersById.values()]
      credentials = validateCredentials(stored, roomPlayers, new Set(registeredAccounts.map(account => account.id)))
    } else {
      credentials = roster!.map((player, index) => ({
        id: player.id,
        name: player.name,
        username: `traveler-${index + 1}`,
        password: randomBytes(18).toString('base64url'),
      }))
      writeFileSync(credentialsPath, JSON.stringify(credentials, null, 2), { mode: 0o600, flag: 'wx' })
      writeFileSync(join(dataDir, 'local-fixture.json'), JSON.stringify({ kind: 'local-multiplayer', version: 1 }), { mode: 0o600, flag: 'wx' })
    }
    chmodSync(credentialsPath, 0o600)

    const fixtures = credentials.map(({ password, ...identity }) => ({
      ...identity,
      passwordHash: hashPassword(password),
    }))
    return { db, runtime, credentials, fixtures }
  } catch (error) {
    runtime?.stop()
    if (db.open) db.close()
    throw error
  }
}

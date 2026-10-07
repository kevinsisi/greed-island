import { DEFAULT_ROOM_CONFIG, MAX_FIXTURE_COUNT } from './domain.js'
import type { RosterPlayer } from './types.js'

export type FixtureCredentials = { id: string; name: string; username: string; password: string }
export type FixtureArguments = { dataDir: string | null; fixtureCount: number }

/** Test identities may only be generated for a fresh disposable room. */
export function parseFixtureArgs(args: readonly string[]): FixtureArguments {
  if (args.length === 0) return { dataDir: null, fixtureCount: DEFAULT_ROOM_CONFIG.maxOnlinePlayers }
  if (args.length === 2 && args[0] === '--data-dir' && args[1]?.trim()) return { dataDir: args[1], fixtureCount: DEFAULT_ROOM_CONFIG.maxOnlinePlayers }
  if (args.length === 2 && args[0] === '--fixture-count' && /^\d+$/.test(args[1] ?? '')) {
    const fixtureCount = Number(args[1])
    if (Number.isSafeInteger(fixtureCount) && fixtureCount >= 2 && fixtureCount <= MAX_FIXTURE_COUNT) return { dataDir: null, fixtureCount }
  }
  throw new Error(`Usage: server.js [--data-dir EXISTING_TEMP_FIXTURE_DIRECTORY | --fixture-count 2..${MAX_FIXTURE_COUNT}]. Roster changes are only allowed in a fresh temporary room.`)
}

/** Match persisted credentials to the replayed roster; never add or promote accounts. */
export function validateCredentials(value: unknown, roster: readonly Pick<RosterPlayer, 'id' | 'name'>[]): FixtureCredentials[] {
  if (!Array.isArray(value) || value.length !== roster.length || roster.length < 2) throw new Error('Fixture credentials do not match the persisted room roster.')
  const expected = new Map(roster.map(p => [p.id, p.name]))
  const ids = new Set<string>(), usernames = new Set<string>()
  return value.map((item: unknown) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('Invalid local fixture credentials.')
    const p = item as Record<string, unknown>
    if (Object.keys(p).some(key => !['id', 'name', 'username', 'password'].includes(key)) || typeof p.id !== 'string' || !expected.has(p.id) || ids.has(p.id) || p.name !== expected.get(p.id) || typeof p.username !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(p.username) || usernames.has(p.username) || typeof p.password !== 'string' || p.password.length < 16 || p.password.length > 200) throw new Error('Invalid local fixture credentials.')
    ids.add(p.id); usernames.add(p.username)
    return { id: p.id, name: p.name as string, username: p.username, password: p.password }
  })
}

import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { AccountStore } from './accounts.js'

const directories: string[] = []
afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }) })

describe('multiplayer account store', () => {
  it('atomically persists hash-only accounts with private file permissions and case-insensitive lookup', () => {
    const directory = mkdtempSync(join(tmpdir(), 'greed-mp-account-store-'))
    directories.push(directory)
    const path = join(directory, 'accounts.json')
    const store = new AccountStore(path)
    const account = { id: 'player-test', name: 'TestUser', username: 'TestUser', passwordHash: 'salt:hash-value', role: 'player' as const }
    store.write([account])
    expect(store.find('testuser')).toEqual(account)
    expect(readFileSync(path, 'utf8')).not.toContain('plaintext')
    expect(statSync(path).mode & 0o777).toBe(0o600)
    expect(new AccountStore(path).list()).toEqual([account])
  })
})

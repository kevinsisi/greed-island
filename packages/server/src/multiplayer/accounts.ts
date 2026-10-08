import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { dirname, join } from 'node:path'

export type AccountRole = 'player' | 'admin'
export type StoredAccount = { id: string; name: string; username: string; passwordHash: string; role: AccountRole }

export function validateStoredAccounts(value: unknown): StoredAccount[] {
  if (!Array.isArray(value)) throw new Error('Invalid multiplayer account store.')
  const ids = new Set<string>()
  const usernames = new Set<string>()
  return value.map((item: unknown) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('Invalid multiplayer account record.')
    const account = item as Record<string, unknown>
    const usernameKey = typeof account.username === 'string' ? account.username.toLowerCase() : ''
    if (Object.keys(account).some(key => !['id', 'name', 'username', 'passwordHash', 'role'].includes(key))
      || Object.keys(account).length !== 5
      || typeof account.id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(account.id) || ids.has(account.id)
      || typeof account.name !== 'string' || account.name.trim().length < 1 || account.name.length > 80
      || typeof account.username !== 'string' || !/^[A-Za-z0-9_-]{3,32}$/.test(account.username) || usernames.has(usernameKey)
      || typeof account.passwordHash !== 'string' || !/^[a-f0-9]{32}:[a-f0-9]{64}$/.test(account.passwordHash)
      || (account.role !== 'player' && account.role !== 'admin')) throw new Error('Invalid multiplayer account record.')
    ids.add(account.id)
    usernames.add(usernameKey)
    return account as unknown as StoredAccount
  })
}

/** Hash-only account file. Rename publishes a complete file atomically on the same volume. */
export class AccountStore {
  constructor(readonly path: string) {}

  list(): StoredAccount[] {
    if (!existsSync(this.path)) return []
    const parsed: unknown = JSON.parse(readFileSync(this.path, 'utf8'))
    return validateStoredAccounts(parsed)
  }

  find(username: string): StoredAccount | undefined {
    const normalized = username.toLowerCase()
    return this.list().find(account => account.username.toLowerCase() === normalized)
  }

  write(accounts: readonly StoredAccount[]): void {
    const directory = dirname(this.path)
    mkdirSync(directory, { recursive: true, mode: 0o700 })
    chmodSync(directory, 0o700)
    const temp = join(directory, `.accounts-${process.pid}-${randomBytes(8).toString('hex')}.tmp`)
    try {
      writeFileSync(temp, JSON.stringify(accounts, null, 2), { mode: 0o600, flag: 'wx' })
      chmodSync(temp, 0o600)
      renameSync(temp, this.path)
      chmodSync(this.path, 0o600)
    } catch (error) {
      try { if (existsSync(temp)) unlinkSync(temp) } catch { /* preserve original write error */ }
      throw error
    }
  }
}

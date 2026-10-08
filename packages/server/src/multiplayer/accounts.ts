import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { dirname, join } from 'node:path'

export type AccountRole = 'player' | 'admin'
export type StoredAccount = { id: string; name: string; username: string; passwordHash: string; role: AccountRole }

/** Hash-only account file. Rename publishes a complete file atomically on the same volume. */
export class AccountStore {
  constructor(readonly path: string) {}

  list(): StoredAccount[] {
    if (!existsSync(this.path)) return []
    const parsed: unknown = JSON.parse(readFileSync(this.path, 'utf8'))
    if (!Array.isArray(parsed)) throw new Error('Invalid multiplayer account store.')
    return parsed as StoredAccount[]
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

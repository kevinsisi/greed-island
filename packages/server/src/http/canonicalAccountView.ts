import type Database from 'better-sqlite3'
import { AuthError } from '../identity/authService.js'
import { accountId } from '../identity/principal.js'
import type { AccountProfile, SqliteAccountRepository } from '../identity/sqliteAccountRepository.js'

export type CanonicalAccountSummary = Readonly<{
  id: number; email: string | null; username: string | null
  createdAt: number; role: AccountProfile['role']; nickname: string | null
  avatar: string; displayName: string
}>
export interface CanonicalAccountView {
  findById(id: number): CanonicalAccountSummary | null
  findByEmail(email: string): CanonicalAccountSummary | null
  listAccounts(limit?: number): CanonicalAccountSummary[]
  getLastSeenTick(id: number): number
  /** Caller must already own this account through mutation authorization. */
  setLastSeenTick(id: number, tick: number): void
}

/** A projection facade over the SAME repository/table; no credential methods. */
export function createCanonicalAccountView(db: Database.Database, accounts: SqliteAccountRepository): CanonicalAccountView {
  const findById = (id: number): CanonicalAccountSummary | null => {
    if (!Number.isSafeInteger(id) || id <= 0) return null
    const profile = accounts.getProfile(accountId(id))
    return profile ? Object.freeze({
      id: profile.accountId, email: profile.email, username: profile.username,
      createdAt: profile.createdAt, role: profile.role, nickname: profile.nickname,
      avatar: profile.avatar, displayName: profile.displayName,
    }) : null
  }
  return Object.freeze({
    findById,
    findByEmail(email: string) {
      let principal
      try { principal = accounts.findPrincipalByAlias({ kind: 'email', value: email }) } catch { return null }
      return principal ? findById(principal.accountId) : null
    },
    listAccounts(limit = 200) {
      const maximum = Number.isFinite(limit) ? Math.min(500, Math.max(1, Math.floor(limit))) : 200
      const rows = db.prepare("SELECT id FROM accounts WHERE status='active' ORDER BY id LIMIT ?").all(maximum) as Array<{ id: number }>
      return rows.flatMap(row => { const profile = findById(row.id); return profile ? [profile] : [] })
    },
    getLastSeenTick(id: number) {
      const row = db.prepare("SELECT last_seen_tick FROM accounts WHERE id=? AND status='active'").get(accountId(id)) as { last_seen_tick: number } | undefined
      if (!row) throw new AuthError('UNAUTHORIZED')
      return row.last_seen_tick
    },
    setLastSeenTick(id: number, tick: number) {
      if (!Number.isSafeInteger(tick) || tick < 0) throw new Error('Invalid canonical visit tick.')
      const result = db.prepare("UPDATE accounts SET last_seen_tick=MAX(last_seen_tick,?) WHERE id=? AND status='active'").run(tick, accountId(id))
      if (result.changes !== 1) throw new AuthError('UNAUTHORIZED')
    },
  })
}

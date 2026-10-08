import type Database from 'better-sqlite3'
import { assertUnifiedIdentitySchema } from './schema.js'
import { accountId, normalizeLoginAlias, type AccountId, type AccountRepository, type AccountRole, type LoginAlias, type Principal } from './principal.js'
import { hashStoredPassword, passwordScheme, verifyStoredPassword } from './passwordVerifier.js'
import type { IdentityMigrationPlan } from './migrationPlan.js'

type Row = { id: number; email: string | null; password_hash: string; password_scheme: string; role: AccountRole; status: 'active' | 'disabled'; nickname: string | null; avatar: string; display_name: string | null; created_at: number }
export type AccountProfile = Readonly<{ accountId: AccountId; email: string | null; username: string | null; nickname: string | null; avatar: string; displayName: string; role: AccountRole; createdAt: number }>
const DUMMY_HASH = `scrypt-v1:${'0'.repeat(32)}:${'0'.repeat(64)}`

/** One repository over the canonical accounts table, never a new DB or file store. */
export class SqliteAccountRepository implements AccountRepository {
  constructor(private readonly db: Database.Database, private readonly now: () => number = Date.now) {
    assertUnifiedIdentitySchema(db)
    if (Number(db.pragma('foreign_keys', { simple: true })) !== 1) throw new Error('Unified account repository requires foreign-key enforcement.')
  }

  findPrincipal(id: AccountId): Principal | null {
    const row = this.row(accountId(id))
    return row?.status === 'active' ? this.principal(row) : null
  }
  findPrincipalByAlias(raw: LoginAlias): Principal | null {
    const alias = normalizeLoginAlias(raw)
    const row = this.byAlias(alias)
    return row?.status === 'active' ? this.principal(row) : null
  }
  getProfile(id: AccountId): AccountProfile | null {
    const row = this.row(accountId(id))
    if (!row || row.status !== 'active') return null
    const alias = this.db.prepare("SELECT display_value FROM account_login_aliases WHERE account_id=? AND kind='username'").get(id) as { display_value: string } | undefined
    const username = alias?.display_value ?? null
    return { accountId: accountId(row.id), email: row.email, username, nickname: row.nickname, avatar: row.avatar, displayName: row.nickname ?? row.display_name ?? username ?? row.email?.split('@')[0] ?? `Player ${row.id}`, role: this.principal(row).role, createdAt: row.created_at }
  }
  ownershipReadiness(): Readonly<{ ready: boolean; blocker: 'OWNER_BOOTSTRAP_REQUIRED' | null }> {
    const admin = this.db.prepare("SELECT id FROM accounts WHERE role='admin' AND status='active' LIMIT 1").get()
    return { ready: !!admin, blocker: admin ? null : 'OWNER_BOOTSTRAP_REQUIRED' }
  }
  async verifyCredentials(raw: LoginAlias, password: string): Promise<Principal | null> {
    const alias = normalizeLoginAlias(raw)
    const row = this.byAlias(alias)
    const encoded = row?.password_hash ?? DUMMY_HASH
    if (row && passwordScheme(encoded) !== row.password_scheme) return null
    const matches = await verifyStoredPassword(password, encoded)
    const current = row ? this.row(accountId(row.id)) : undefined
    return matches && current?.status === 'active' && current.password_hash === encoded && current.password_scheme === row?.password_scheme ? this.principal(current) : null
  }
  async createPlayer(raw: LoginAlias, password: string, onCreated?: (principal: Principal) => void): Promise<Principal> {
    const alias = normalizeLoginAlias(raw)
    const hash = await hashStoredPassword(password)
    return this.db.transaction(() => {
      if (this.byAlias(alias)) throw new IdentityError('ALIAS_TAKEN')
      const result = this.db.prepare("INSERT INTO accounts(email,password_hash,password_scheme,created_at,role,nickname,avatar,display_name,last_seen_tick) VALUES(?,?,?,?,'player',NULL,'tide',NULL,0)").run(alias.kind === 'email' ? alias.value : null, hash, 'scrypt-v1', this.now())
      const id = accountId(Number(result.lastInsertRowid))
      this.db.prepare('INSERT INTO account_login_aliases(kind,normalized,display_value,account_id) VALUES(?,?,?,?)').run(alias.kind, alias.value, raw.value.trim(), id)
      const principal = { accountId: id, role: 'player' as const }
      onCreated?.(principal)
      return principal
    })()
  }

  /** Explicit reviewed-plan import seam; callers here use synthetic data only. */
  importLegacyPlayer(input: Readonly<{ namespace: string; legacyId: string; username: string; name: string; passwordHash: string }>, plan: IdentityMigrationPlan): Principal {
    if (!plan.readyForReviewedImport || plan.adminBootstrap !== 'none' || plan.blockers.length > 0 || !this.ownershipReadiness().ready) throw new IdentityError('IMPORT_BLOCKED')
    const identity = plan.identities.find(item => item.mapping.namespace === input.namespace && item.mapping.legacyId === input.legacyId)
    const alias = normalizeLoginAlias({ kind: 'username', value: input.username })
    if (!identity || identity.alias.kind !== 'username' || identity.alias.value !== alias.value
      || !/^[A-Za-z0-9_-]{1,100}$/.test(input.namespace) || !/^[A-Za-z0-9_-]{1,100}$/.test(input.legacyId)
      || typeof input.name !== 'string' || input.name.trim().length < 1 || input.name.length > 80
      || passwordScheme(input.passwordHash) !== 'legacy-mp-scrypt-v1') throw new IdentityError('IMPORT_DESCRIPTOR_CONFLICT')
    const id = accountId(identity.mapping.accountId)
    return this.db.transaction(() => {
      const source = this.db.prepare('SELECT account_id FROM account_source_identities WHERE namespace=? AND legacy_id=?').get(input.namespace, input.legacyId) as { account_id: number } | undefined
      if (source) {
        const row = this.row(accountId(source.account_id))
        if (!row || source.account_id !== id || this.byAlias(alias)?.id !== id) throw new IdentityError('IMPORT_DESCRIPTOR_CONFLICT')
        // Password/profile changes after initial import are never overwritten on retry.
        return this.principal(row)
      }
      if (identity.action !== 'create' || identity.role !== 'player' || this.row(id) || this.byAlias(alias)) throw new IdentityError('IMPORT_DESCRIPTOR_CONFLICT')
      this.db.prepare("INSERT INTO accounts(id,email,password_hash,password_scheme,created_at,role,nickname,avatar,display_name,last_seen_tick) VALUES(?,NULL,?,'legacy-mp-scrypt-v1',?,'player',NULL,'tide',?,0)").run(id, input.passwordHash, this.now(), input.name)
      this.db.prepare("INSERT INTO account_login_aliases(kind,normalized,display_value,account_id) VALUES('username',?,?,?)").run(alias.value, input.username, id)
      this.db.prepare('INSERT INTO account_source_identities(namespace,legacy_id,account_id) VALUES(?,?,?)').run(input.namespace, input.legacyId, id)
      return { accountId: id, role: 'player' as const }
    })()
  }

  private row(id: AccountId): Row | undefined { return this.db.prepare('SELECT * FROM accounts WHERE id=?').get(id) as Row | undefined }
  private byAlias(alias: LoginAlias): Row | undefined { return this.db.prepare('SELECT a.* FROM accounts a JOIN account_login_aliases l ON l.account_id=a.id WHERE l.kind=? AND l.normalized=?').get(alias.kind, alias.value) as Row | undefined }
  private principal(row: Row): Principal {
    if (!['player', 'gm', 'admin', 'agent'].includes(row.role)) throw new IdentityError('INVALID_ACCOUNT_ROLE')
    return { accountId: accountId(row.id), role: row.role }
  }
}

export class IdentityError extends Error {
  constructor(readonly code: string) { super(code); this.name = 'IdentityError' }
}

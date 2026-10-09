import Database from 'better-sqlite3'
import { createHash } from 'node:crypto'
import { afterEach, describe, expect, it } from 'vitest'
import { AuthService } from './authService.js'
import { migrateIdentitySchema } from './schema.js'

const ORIGIN = 'https://greed.example.test', PASSWORD = 'synthetic-admin-password', PLAYER_PASSWORD = 'synthetic-player-password'
const databases: Database.Database[] = []
afterEach(() => { for (const db of databases.splice(0)) db.close() })
async function fixture() {
  const db = new Database(':memory:'); databases.push(db); db.pragma('foreign_keys=ON'); migrateIdentitySchema(db)
  let now = 1000
  const auth = new AuthService(db, { allowedOrigins: [ORIGIN], now: () => now })
  const admin = await auth.accounts.createPlayer({ kind: 'username', value: 'owner-admin' }, PASSWORD)
  db.prepare("UPDATE accounts SET role='admin' WHERE id=?").run(admin.accountId)
  const player = await auth.accounts.createPlayer({ kind: 'username', value: 'ordinary-player' }, PLAYER_PASSWORD)
  const administrator = (await auth.login({ kind: 'username', value: 'owner-admin' }, PASSWORD, ORIGIN))!
  const playerSession = (await auth.login({ kind: 'username', value: 'ordinary-player' }, PLAYER_PASSWORD, ORIGIN))!
  return { db, auth, admin, player, administrator, playerSession, advance: (ms: number) => { now += ms } }
}

describe('one-cookie administrative role/status and recovery service', () => {
  it('lists disabled profiles only to a current active administrator without credentials', async () => {
    const { db, auth, player, administrator, playerSession } = await fixture()
    db.prepare("UPDATE accounts SET status='disabled' WHERE id=?").run(player.accountId)
    const users = auth.listAdministrativeProfiles(administrator.token)
    expect(users.find(user => user.accountId === player.accountId)?.status).toBe('disabled')
    expect(JSON.stringify(users)).not.toContain('password_hash')
    expect(() => auth.listAdministrativeProfiles(playerSession.token)).toThrow('UNAUTHORIZED')
    expect(() => auth.listAdministrativeProfiles('0'.repeat(64))).toThrow('UNAUTHORIZED')
  })
  it('preserves validated self nickname/avatar editing without altering identity or credentials', async () => {
    const { db, auth, player, playerSession } = await fixture()
    const before = db.prepare('SELECT email,password_hash,password_scheme,role FROM accounts WHERE id=?').get(player.accountId)
    expect(auth.updateProfile(playerSession.token, ORIGIN, { nickname: '  New Nickname  ', avatar: 'moon' })).toMatchObject({ accountId: player.accountId, nickname: 'New Nickname', avatar: 'moon', displayName: 'New Nickname', email: null })
    expect(auth.updateProfile(playerSession.token, ORIGIN, { nickname: '' }).nickname).toBeNull()
    expect(() => auth.updateProfile(playerSession.token, ORIGIN, { nickname: 'x'.repeat(25) })).toThrow('INVALID_NICKNAME')
    expect(() => auth.updateProfile(playerSession.token, ORIGIN, { avatar: 'untrusted' })).toThrow('INVALID_AVATAR')
    expect(db.prepare('SELECT email,password_hash,password_scheme,role FROM accounts WHERE id=?').get(player.accountId)).toEqual(before)
  })
  it('protects the last ACTIVE administrator even if a disabled admin exists', async () => {
    const { db, auth, admin, player, administrator } = await fixture()
    db.prepare("UPDATE accounts SET role='admin',status='disabled' WHERE id=?").run(player.accountId)
    expect(() => auth.setAccountRole(administrator.token, ORIGIN, admin.accountId, 'player')).toThrow('LAST_ADMIN')
    expect(() => auth.setAccountStatus(administrator.token, ORIGIN, admin.accountId, 'disabled')).toThrow('LAST_ADMIN')
    expect(auth.resolve(administrator.token)?.role).toBe('admin')
    expect(db.prepare('SELECT role,status FROM accounts WHERE id=?').get(admin.accountId)).toEqual({ role: 'admin', status: 'active' })
  })
  it('rereads role/status, revokes affected sessions and keeps other sessions intact', async () => {
    const { auth, admin, player, administrator, playerSession } = await fixture()
    const changed = auth.setAccountRole(administrator.token, ORIGIN, player.accountId, 'gm')
    expect(changed.role).toBe('gm')
    expect(auth.resolve(playerSession.token)).toBeNull()
    expect(auth.resolve(administrator.token)?.accountId).toBe(admin.accountId)
    const newPlayerSession = (await auth.login({ kind: 'username', value: 'ordinary-player' }, PLAYER_PASSWORD, ORIGIN))!
    auth.setAccountStatus(administrator.token, ORIGIN, player.accountId, 'disabled')
    expect(auth.resolve(newPlayerSession.token)).toBeNull()
    expect(() => auth.issuePasswordReset(administrator.token, ORIGIN, player.accountId)).toThrow('ACCOUNT_DISABLED')
  })
  it('does not authorize role/reset issuance from stale roles or an invalid Origin', async () => {
    const { db, auth, player, administrator, playerSession } = await fixture()
    expect(() => auth.issuePasswordReset(playerSession.token, ORIGIN, player.accountId)).toThrow('FORBIDDEN')
    expect(() => auth.issuePasswordReset(administrator.token, 'https://evil.test', player.accountId)).toThrow('ORIGIN_NOT_ALLOWED')
    db.exec("UPDATE accounts SET role='player' WHERE role='admin'")
    expect(() => auth.issuePasswordReset(administrator.token, ORIGIN, player.accountId)).toThrow('FORBIDDEN')
    expect(db.prepare('SELECT COUNT(*) count FROM auth_password_resets').get()).toEqual({ count: 0 })
  })
  it('stores only hashed reset proof and atomically consumes it once, revoking all target sessions', async () => {
    const { db, auth, player, administrator, playerSession } = await fixture()
    const second = (await auth.login({ kind: 'username', value: 'ordinary-player' }, PLAYER_PASSWORD, ORIGIN))!
    const reset = auth.issuePasswordReset(administrator.token, ORIGIN, player.accountId)
    const stored = db.prepare('SELECT * FROM auth_password_resets').get() as { token_hash: string }
    expect(stored.token_hash).toBe(createHash('sha256').update(reset.token).digest('hex'))
    expect(JSON.stringify(stored)).not.toContain(reset.token)
    const result = await auth.redeemPasswordReset(reset.token, 'new-synthetic-password', ORIGIN)
    expect(result.principal.accountId).toBe(player.accountId)
    expect(auth.resolve(playerSession.token)).toBeNull(); expect(auth.resolve(second.token)).toBeNull()
    expect(auth.resolve(administrator.token)?.role).toBe('admin')
    await expect(auth.redeemPasswordReset(reset.token, 'other-new-password', ORIGIN)).rejects.toThrow('INVALID_RESET')
    expect(await auth.login({ kind: 'username', value: 'ordinary-player' }, PLAYER_PASSWORD, ORIGIN)).toBeNull()
    expect((await auth.login({ kind: 'username', value: 'ordinary-player' }, 'new-synthetic-password', ORIGIN))?.principal.accountId).toBe(player.accountId)
  })
  it('allows only one of two racing reset redemptions to succeed', async () => {
    const { auth, player, administrator } = await fixture()
    const reset = auth.issuePasswordReset(administrator.token, ORIGIN, player.accountId)
    const results = await Promise.allSettled([
      auth.redeemPasswordReset(reset.token, 'first-new-password', ORIGIN),
      auth.redeemPasswordReset(reset.token, 'second-new-password', ORIGIN),
    ])
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter(result => result.status === 'rejected')).toHaveLength(1)
  })
  it('rejects expired/unknown proof and invalidates issued proofs after a self password change', async () => {
    const { auth, player, administrator, playerSession, advance } = await fixture()
    const old = auth.issuePasswordReset(administrator.token, ORIGIN, player.accountId)
    advance(60 * 60 * 1000)
    await expect(auth.redeemPasswordReset(old.token, 'new-synthetic-password', ORIGIN)).rejects.toThrow('INVALID_RESET')
    await expect(auth.redeemPasswordReset('0'.repeat(64), 'new-synthetic-password', ORIGIN)).rejects.toThrow('INVALID_RESET')
    const fresh = auth.issuePasswordReset(administrator.token, ORIGIN, player.accountId)
    await auth.changePassword(playerSession.token, ORIGIN, PLAYER_PASSWORD, 'self-new-password')
    await expect(auth.redeemPasswordReset(fresh.token, 'new-synthetic-password', ORIGIN)).rejects.toThrow('INVALID_RESET')
  })
  it('rolls back consumed proof/password/sessions if final session creation fails', async () => {
    const { db, auth, player, administrator, playerSession } = await fixture()
    const reset = auth.issuePasswordReset(administrator.token, ORIGIN, player.accountId)
    const before = db.prepare('SELECT password_hash FROM accounts WHERE id=?').get(player.accountId)
    db.exec("CREATE TRIGGER fail_reset_session BEFORE INSERT ON auth_sessions BEGIN SELECT RAISE(ABORT,'synthetic reset failure'); END")
    await expect(auth.redeemPasswordReset(reset.token, 'new-synthetic-password', ORIGIN)).rejects.toThrow('synthetic reset failure')
    expect(db.prepare('SELECT password_hash FROM accounts WHERE id=?').get(player.accountId)).toEqual(before)
    expect((db.prepare('SELECT consumed_at FROM auth_password_resets').get() as { consumed_at: number | null }).consumed_at).toBeNull()
    expect(auth.resolve(playerSession.token)?.accountId).toBe(player.accountId)
  })
})

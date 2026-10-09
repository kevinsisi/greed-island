import { afterEach, describe, expect, it, vi } from 'vitest'
import { RECOVERY_TEST_ORIGIN, recoveryFixture } from './authRecovery.testSupport.js'
afterEach(() => vi.restoreAllMocks())
describe('sole-cookie unified administrator recovery', () => {
  it('keeps proof issuance current-admin-only and Origin/context guarded without credential logs', async () => {
    const { db, auth, request, player, admin } = await recoveryFixture()
    const path = '/admin/users/' + player.principal.accountId + '/reset-password'
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const issued = vi.spyOn(auth, 'issuePasswordReset')
    expect((await request(path, null, {})).status).toBe(401)
    expect((await request(path, player, {})).status).toBe(403)
    expect((await request(path, admin, {}, player.principal.accountId)).status).toBe(409)
    expect((await request(path, admin, {}, null)).status).toBe(400)
    expect((await request(path, admin, {}, undefined, 'https://evil.example')).status).toBe(403)
    expect(db.prepare('SELECT COUNT(*) AS count FROM auth_password_resets').get()).toEqual({ count: 0 })
    expect(issued).toHaveBeenCalledTimes(1) // Only the correctly bound player reaches service role authorization; it refuses.
    const allowed = await request(path, admin, {})
    expect(allowed.status).toBe(200)
    const result = await allowed.json() as { token: string; resetPath: string; target: { accountId: number; email: string } }
    expect(result.target).toMatchObject({ accountId: player.principal.accountId, email: 'registered@example.test' })
    expect(result.token).toMatch(/^[a-f0-9]{64}$/); expect(result.resetPath).toBe('/reset-password'); expect(result.resetPath).not.toContain(result.token)
    const stored = db.prepare('SELECT token_hash FROM auth_password_resets').get() as { token_hash: string }
    expect(stored.token_hash).not.toBe(result.token); expect(log).not.toHaveBeenCalled()
    auth.logout(admin.token, RECOVERY_TEST_ORIGIN)
    expect((await request(path, admin, {})).status).toBe(401)
    expect(db.prepare('SELECT COUNT(*) AS count FROM auth_password_resets').get()).toEqual({ count: 1 })
  })
  it('redeems only the admin-issued single-use proof into the same account/cookie and revokes its old session', async () => {
    const { auth, request, player, admin } = await recoveryFixture()
    const issued = await request('/admin/users/' + player.principal.accountId + '/reset-password', admin, {})
    const { token } = await issued.json() as { token: string }
    const redeemed = await request('/auth/reset-password', null, { token, password: 'replacement-synthetic-password' })
    expect(redeemed.status).toBe(200); expect(redeemed.headers.get('set-cookie')).toContain('greed_session=')
    const body = await redeemed.json(); expect(Object.keys(body)).toEqual(['profile']); expect(body.profile.accountId).toBe(player.principal.accountId)
    expect(auth.resolve(player.token)).toBeNull()
    expect((await request('/auth/reset-password', null, { token, password: 'second-replacement-password' })).status).toBe(400)
  })
})

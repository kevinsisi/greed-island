import { afterEach, describe, expect, it, vi } from 'vitest'
import { recoveryFixture } from './authRecovery.testSupport.js'
afterEach(() => vi.restoreAllMocks())
describe('sole-cookie anonymous recovery boundary', () => {
  it('gives registered and unknown aliases the same admin-recovery response without lookup, proof issuance, session changes or logs', async () => {
    const { db, auth, request } = await recoveryFixture()
    const lookup = vi.spyOn(auth.accounts, 'findPrincipalByAlias')
    const issue = vi.spyOn(auth, 'issuePasswordReset')
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const before = db.prepare('SELECT total_changes() AS count').get()
    const registered = await request('/auth/forgot-password', null, { email: 'registered@example.test' })
    const unknown = await request('/auth/forgot-password', null, { email: 'unknown@example.test' })
    expect(registered.status).toBe(403); expect(unknown.status).toBe(403)
    expect(await registered.json()).toEqual({ error: 'ADMIN_RECOVERY_REQUIRED' }); expect(await unknown.json()).toEqual({ error: 'ADMIN_RECOVERY_REQUIRED' })
    expect(lookup).not.toHaveBeenCalled(); expect(issue).not.toHaveBeenCalled(); expect(log).not.toHaveBeenCalled()
    expect(db.prepare('SELECT COUNT(*) AS count FROM auth_password_resets').get()).toEqual({ count: 0 })
    expect(db.prepare('SELECT total_changes() AS count').get()).toEqual(before)
  })
})

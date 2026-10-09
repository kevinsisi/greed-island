import { describe, expect, it } from 'vitest'
import { profileFixture } from './testFixtures'
import { recoveryGrant, recoveryInputError, recoveryTargets } from './recovery'

const proof = 'a'.repeat(64)
const administrative = () => ({ ...profileFixture(), status: 'active' as const })
describe('single-account manual recovery protocol', () => {
  it('requires manual full proof, bounded new password and exact confirmation', () => {
    expect(recoveryInputError(proof, 'long-password-12', 'long-password-12')).toBeNull()
    expect(recoveryInputError('', 'long-password-12', 'long-password-12')).toContain('復原證明')
    expect(recoveryInputError(proof.toUpperCase(), 'long-password-12', 'long-password-12')).toContain('復原證明')
    expect(recoveryInputError(proof, 'short', 'short')).toContain('新密碼')
    expect(recoveryInputError(proof, 'long-password-12', 'other-password')).toContain('不一致')
  })
  it('projects an admin picker without retaining target email, username or profile metadata', () => {
    expect(recoveryTargets({ users: [administrative()] })).toEqual([{ accountId: 1, displayName: '旅人甲', role: 'player', status: 'active' }])
    expect(recoveryTargets({ users: [administrative(), administrative()] })).toBeNull()
    expect(recoveryTargets({ users: [{ ...administrative(), status: 'unknown' }] })).toBeNull()
  })
  it('accepts only a matching active target, full proof and fixed token-free reset path', () => {
    const grant = { ok: true, target: administrative(), token: proof, expiresAt: 100, resetPath: '/reset-password' }
    expect(recoveryGrant(grant, 1)).toEqual({ target: { accountId: 1, displayName: '旅人甲', role: 'player', status: 'active' }, token: proof, expiresAt: 100, resetPath: '/reset-password' })
    expect(recoveryGrant(grant, 2)).toBeNull()
    expect(recoveryGrant({ ...grant, target: { ...administrative(), status: 'disabled' } }, 1)).toBeNull()
    expect(recoveryGrant({ ...grant, resetPath: `/reset-password?token=${proof}` }, 1)).toBeNull()
    expect(recoveryGrant({ ...grant, resetPath: 'https://example.com' }, 1)).toBeNull()
    expect(recoveryGrant({ ...grant, token: 'short' }, 1)).toBeNull()
  })
})

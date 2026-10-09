import type { AccountProfile } from './types'
import { isAccountProfile, record } from './protocol'

export interface RecoveryTarget { accountId: number; displayName: string; role: AccountProfile['role']; status: 'active' | 'disabled' }
export interface RecoveryGrant { target: RecoveryTarget; token: string; expiresAt: number; resetPath: '/reset-password' }
export function recoveryInputError(token: string, password: string, confirmation: string): string | null {
  if (!/^[a-f0-9]{64}$/.test(token.trim())) return '請輸入管理員交付的完整復原證明。'
  if (password.length < 12 || password.length > 200) return '新密碼須為 12–200 字元。'
  if (password !== confirmation) return '兩次輸入的新密碼不一致。'
  return null
}
function isAdministrativeProfile(value: unknown): value is AccountProfile & { status: 'active' | 'disabled' } {
  return isAccountProfile(value) && record(value) && (value.status === 'active' || value.status === 'disabled')
}
function target(profile: AccountProfile & { status: 'active' | 'disabled' }): RecoveryTarget {
  return { accountId: profile.accountId, displayName: profile.displayName, role: profile.role, status: profile.status }
}
export function recoveryTargets(value: unknown): RecoveryTarget[] | null {
  if (!record(value) || !Array.isArray(value.users) || !value.users.every(isAdministrativeProfile)) return null
  const ids = value.users.map(user => user.accountId)
  return new Set(ids).size === ids.length ? value.users.map(target) : null
}
export function recoveryGrant(value: unknown, targetAccountId: number): RecoveryGrant | null {
  if (!record(value) || value.ok !== true || !isAdministrativeProfile(value.target) || value.target.status !== 'active'
    || value.target.accountId !== targetAccountId || typeof value.token !== 'string' || !/^[a-f0-9]{64}$/.test(value.token)
    || typeof value.expiresAt !== 'number' || !Number.isSafeInteger(value.expiresAt) || value.expiresAt <= 0
    || value.resetPath !== '/reset-password') return null
  return { target: target(value.target), token: value.token, expiresAt: value.expiresAt, resetPath: '/reset-password' }
}

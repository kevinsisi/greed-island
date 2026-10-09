import { describe, expect, it } from 'vitest'
import { accountActorId, accountId, normalizeLoginAlias, type AccountRepository } from './principal.js'

describe('canonical identity boundary', () => {
  it.each([1, 42, Number.MAX_SAFE_INTEGER])('keeps numeric account %s and its actor string', value => {
    expect(accountId(value)).toBe(value)
    expect(accountActorId(accountId(value))).toBe(String(value))
  })
  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1, '1', 'player-a', null])('rejects invalid principal %s', value => {
    expect(() => accountId(value)).toThrow('positive safe integer')
  })
  it('keeps typed aliases distinct and normalizes their case', () => {
    expect(normalizeLoginAlias({ kind: 'username', value: ' Traveler_A ' })).toEqual({ kind: 'username', value: 'traveler_a' })
    expect(normalizeLoginAlias({ kind: 'email', value: ' PERSON@Example.Test ' })).toEqual({ kind: 'email', value: 'person@example.test' })
    expect(() => normalizeLoginAlias({ kind: 'username', value: 'person@example.test' })).toThrow()
    expect(() => normalizeLoginAlias({ kind: 'email', value: 'traveler-a' })).toThrow()
  })
  it('supports one repository principal regardless of the login alias', async () => {
    const principal = { accountId: accountId(7), role: 'player' as const }
    const repository: AccountRepository = {
      findPrincipal: () => principal,
      findPrincipalByAlias: () => principal,
      verifyCredentials: async () => principal,
      createPlayer: async () => principal,
    }
    expect(repository.findPrincipal(accountId(7))).toEqual(repository.findPrincipalByAlias({ kind: 'username', value: 'traveler' }))
    expect(await repository.verifyCredentials({ kind: 'email', value: 'person@example.test' }, 'synthetic-password')).toEqual(principal)
  })
})

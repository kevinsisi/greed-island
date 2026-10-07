import { describe, expect, it } from 'vitest'
import { generateRoster } from './domain.js'
import { parseFixtureArgs, validateCredentials } from './fixtures.js'

function credentials(count = 50) {
  return generateRoster(count).map(({ id, name }, index) => ({
    id, name, username: `test-traveler-${index + 1}`, password: `test-only-password-${index + 1}`,
  }))
}

describe('temporary fixture arguments', () => {
  it('defaults to 50 and permits a bounded count only for a fresh room', () => {
    expect(parseFixtureArgs([])).toEqual({ dataDir: null, fixtureCount: 50 })
    for (const count of [2, 50, 1000]) {
      expect(parseFixtureArgs(['--fixture-count', String(count)])).toEqual({ dataDir: null, fixtureCount: count })
    }
    expect(parseFixtureArgs(['--data-dir', '/tmp/greed-multiplayer-fixture'])).toEqual({
      dataDir: '/tmp/greed-multiplayer-fixture', fixtureCount: 50,
    })
  })

  it.each([
    ['--fixture-count', '0'], ['--fixture-count', '1'], ['--fixture-count', '1001'],
    ['--fixture-count', '-2'], ['--fixture-count', '2.5'], ['--fixture-count', 'Infinity'],
    ['--fixture-count', 'NaN'], ['--fixture-count', '50people'], ['--fixture-count', ' 50 '],
    ['--fixture-count'], ['--data-dir'], ['--data-dir', '   '], ['--host', '0.0.0.0'],
    ['--fixture-count', '50', '--data-dir', '/tmp/greed-multiplayer-fixture'],
    ['--data-dir', '/tmp/greed-multiplayer-fixture', '--fixture-count', '50'],
    ['--fixture-count', '50', '--fixture-count', '50'],
  ].map((args) => ({ args })))('rejects invalid options or changing an existing room roster (%#)', ({ args }) => {
    expect(() => parseFixtureArgs(args)).toThrow()
  })
})

describe('persisted fixture identity validation', () => {
  it('accepts all 50 matching identities in any order and returns detached credential records', () => {
    const input = credentials().reverse()
    const result = validateCredentials(input, generateRoster())
    expect(result).toEqual(input)
    expect(result).toHaveLength(50)
    expect(new Set(result.map(({ id }) => id)).size).toBe(50)
    result[0]!.password = 'changed test result'
    expect(input[0]!.password).not.toBe(result[0]!.password)
  })

  it('accepts the recorded two-player legacy roster without adding default identities', () => {
    const old = credentials(2)
    expect(validateCredentials(old, generateRoster(2))).toEqual(old)
    expect(() => validateCredentials(old, generateRoster(50))).toThrow()
  })

  it.each([
    { label: 'missing set', value: null },
    { label: 'object instead of array', value: {} },
    { label: 'empty set', value: [] },
    { label: 'one missing identity', value: credentials(2).slice(1) },
    { label: 'extra identity', value: credentials(3) },
    { label: 'duplicate ID', value: [credentials(2)[0], credentials(2)[0]] },
    { label: 'unknown ID', value: [credentials(2)[0], { ...credentials(2)[1], id: 'outside-roster' }] },
    { label: 'renamed player', value: [credentials(2)[0], { ...credentials(2)[1], name: 'Changed name' }] },
    { label: 'duplicate username', value: [credentials(2)[0], { ...credentials(2)[1], username: credentials(2)[0]!.username }] },
    { label: 'invalid username', value: [credentials(2)[0], { ...credentials(2)[1], username: 'space not allowed' }] },
    { label: 'empty username', value: [credentials(2)[0], { ...credentials(2)[1], username: '' }] },
    { label: 'overlong username', value: [credentials(2)[0], { ...credentials(2)[1], username: 'x'.repeat(101) }] },
    { label: 'short password', value: [credentials(2)[0], { ...credentials(2)[1], password: 'x'.repeat(15) }] },
    { label: 'overlong password', value: [credentials(2)[0], { ...credentials(2)[1], password: 'x'.repeat(201) }] },
    { label: 'numeric password', value: [credentials(2)[0], { ...credentials(2)[1], password: 1234567890123456 }] },
    { label: 'role promotion', value: [credentials(2)[0], { ...credentials(2)[1], role: 'admin' }] },
    { label: 'resource injection', value: [credentials(2)[0], { ...credentials(2)[1], supplies: 99 }] },
    { label: 'missing password', value: [credentials(2)[0], { id: 'player-b', name: '潮汐旅人', username: 'second' }] },
  ])('rejects $label rather than replacing or promoting a persisted identity', ({ value }) => {
    expect(() => validateCredentials(value, generateRoster(2))).toThrow()
  })

  it('accepts the explicit password length boundaries without changing existing values', () => {
    for (const length of [16, 200]) {
      const input = credentials(2).map((entry) => ({ ...entry, password: 'x'.repeat(length) }))
      expect(validateCredentials(input, generateRoster(2))).toEqual(input)
    }
  })
})

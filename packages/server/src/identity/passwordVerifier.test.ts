import { scryptSync } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { beforeAll, describe, expect, it } from 'vitest'
import { hashStoredPassword, passwordScheme, verifyStoredPassword } from './passwordVerifier.js'

const SALT = '0123456789abcdef0123456789abcdef'
function legacyHash(password: string): string { return `${SALT}:${scryptSync(password, SALT, 32).toString('hex')}` }

describe('one side-effect-free password verifier', () => {
  let bcryptHash: string
  beforeAll(async () => { bcryptHash = await bcrypt.hash('synthetic-password', 4) })
  it('writes explicitly versioned full-input credentials with fresh salts', async () => {
    const password = '潮'.repeat(100)
    const first = await hashStoredPassword(password), second = await hashStoredPassword(password)
    expect(passwordScheme(first)).toBe('scrypt-v1')
    expect(first).not.toBe(second)
    expect(await verifyStoredPassword(password, first)).toBe(true)
    expect(await verifyStoredPassword(password.slice(0, -1), first)).toBe(false)
  })
  it('rejects weak or oversized new credentials without changing legacy verification limits', async () => {
    await expect(hashStoredPassword('short')).rejects.toThrow('12 to 200')
    await expect(hashStoredPassword('x'.repeat(201))).rejects.toThrow('12 to 200')
    expect(await verifyStoredPassword('x'.repeat(200), legacyHash('x'.repeat(200)))).toBe(true)
  })
  it('identifies and verifies existing bcrypt credentials unchanged', async () => {
    expect(passwordScheme(bcryptHash)).toBe('bcrypt-v1')
    expect(await verifyStoredPassword('synthetic-password', bcryptHash)).toBe(true)
    expect(await verifyStoredPassword('wrong-password', bcryptHash)).toBe(false)
  })
  it('uses exact legacy MP salt text and constant-size digest comparison', async () => {
    const encoded = legacyHash('synthetic-mp-password')
    expect(passwordScheme(encoded)).toBe('legacy-mp-scrypt-v1')
    expect(await verifyStoredPassword('synthetic-mp-password', encoded)).toBe(true)
    expect(await verifyStoredPassword('wrong-password', encoded)).toBe(false)
    const decodedSaltHash = `${SALT}:${scryptSync('synthetic-mp-password', Buffer.from(SALT, 'hex'), 32).toString('hex')}`
    expect(await verifyStoredPassword('synthetic-mp-password', decodedSaltHash)).toBe(false)
  })
  it.each(['', 'salt:hash', `${SALT}:00`, `${SALT}:` + 'g'.repeat(64), `${SALT.toUpperCase()}:` + '0'.repeat(64), '$2b$03$' + 'a'.repeat(53), '$2b$04$' + 'a'.repeat(52), '$2b$04$' + 'a'.repeat(54)])('rejects malformed hashes without decoding or comparing them', async encoded => {
    expect(passwordScheme(encoded)).toBeNull()
    expect(await verifyStoredPassword('synthetic-password', encoded)).toBe(false)
  })
  it.each(['x'.repeat(200), '潮'.repeat(100)])('preserves every byte of long legacy scrypt passwords', async password => {
    const encoded = legacyHash(password)
    expect(Buffer.byteLength(password)).toBeGreaterThan(72)
    expect(await verifyStoredPassword(password, encoded)).toBe(true)
    expect(await verifyStoredPassword(password.slice(0, -1) + 'y', encoded)).toBe(false)
    expect(encoded).toBe(legacyHash(password))
  })
  it('keeps existing bcrypt compatibility without rehashing either format', async () => {
    const password = 'x'.repeat(80)
    const hash = await bcrypt.hash(password, 4)
    expect(await verifyStoredPassword(password, hash)).toBe(true)
    const legacy = legacyHash(password)
    expect(await verifyStoredPassword(password, legacy)).toBe(true)
    expect(await verifyStoredPassword('x'.repeat(72), legacy)).toBe(false)
    expect(passwordScheme(legacy)).toBe('legacy-mp-scrypt-v1')
  })
})

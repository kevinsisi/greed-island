import bcrypt from 'bcryptjs'
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { passwordScheme } from './passwordEncoding.js'

export { passwordScheme } from './passwordEncoding.js'
export type { PasswordScheme } from './passwordEncoding.js'
const LEGACY_SCRYPT_FORMAT = /^([a-f0-9]{32}):([a-f0-9]{64})$/
const LEGACY_SCRYPT_KEY_BYTES = 32
// These are the defaults used by the original MP scryptSync writer.
const LEGACY_SCRYPT_OPTIONS = { N: 16_384, r: 8, p: 1, maxmem: 32 * 1024 * 1024 }

/** Format dispatch is compatibility only, never a credential rewrite. */
export async function hashStoredPassword(password: string): Promise<string> {
  if (typeof password !== 'string' || password.length < 12 || password.length > 200) throw new Error('New passwords must contain 12 to 200 characters.')
  const salt = randomBytes(16).toString('hex')
  const digest = await deriveScrypt(password, salt)
  return `scrypt-v1:${salt}:${digest.toString('hex')}`
}

/** Verifies the entire legacy scrypt input; no bcrypt rehash/truncation side effect. */
export async function verifyStoredPassword(password: string, encoded: string): Promise<boolean> {
  if (typeof password !== 'string' || typeof encoded !== 'string') return false
  const scheme = passwordScheme(encoded)
  if (scheme === 'bcrypt-v1') return bcrypt.compare(password, encoded)
  if (scheme !== 'legacy-mp-scrypt-v1' && scheme !== 'scrypt-v1') return false
  const payload = scheme === 'scrypt-v1' ? encoded.slice('scrypt-v1:'.length) : encoded
  const match = LEGACY_SCRYPT_FORMAT.exec(payload)!
  const salt = match[1]!
  const expected = Buffer.from(match[2]!, 'hex')
  // The old writer passes the hexadecimal SALT TEXT, not decoded salt bytes.
  const actual = await deriveScrypt(password, salt)
  return timingSafeEqual(expected, actual)
}

function deriveScrypt(password: string, salt: string): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, LEGACY_SCRYPT_KEY_BYTES, LEGACY_SCRYPT_OPTIONS, (error, key) => {
      if (error) reject(error)
      else resolve(key)
    })
  })
}

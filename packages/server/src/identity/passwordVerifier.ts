import bcrypt from 'bcryptjs'
import { scrypt, timingSafeEqual } from 'node:crypto'

export type PasswordScheme = 'bcrypt-v1' | 'legacy-mp-scrypt-v1'

const BCRYPT_FORMAT = /^\$2[aby]\$(0[4-9]|[12][0-9]|3[01])\$[./A-Za-z0-9]{53}$/
const LEGACY_SCRYPT_FORMAT = /^([a-f0-9]{32}):([a-f0-9]{64})$/
const LEGACY_SCRYPT_KEY_BYTES = 32
// These are the defaults used by the original MP scryptSync writer.
const LEGACY_SCRYPT_OPTIONS = { N: 16_384, r: 8, p: 1, maxmem: 32 * 1024 * 1024 }

/** Format dispatch is compatibility only, never a credential rewrite. */
export function passwordScheme(encoded: string): PasswordScheme | null {
  if (BCRYPT_FORMAT.test(encoded)) return 'bcrypt-v1'
  if (LEGACY_SCRYPT_FORMAT.test(encoded)) return 'legacy-mp-scrypt-v1'
  return null
}

/** Verifies the entire legacy scrypt input; no bcrypt rehash/truncation side effect. */
export async function verifyStoredPassword(password: string, encoded: string): Promise<boolean> {
  if (typeof password !== 'string' || typeof encoded !== 'string') return false
  const scheme = passwordScheme(encoded)
  if (scheme === 'bcrypt-v1') return bcrypt.compare(password, encoded)
  if (scheme !== 'legacy-mp-scrypt-v1') return false
  const match = LEGACY_SCRYPT_FORMAT.exec(encoded)!
  const salt = match[1]!
  const expected = Buffer.from(match[2]!, 'hex')
  // The old writer passes the hexadecimal SALT TEXT, not decoded salt bytes.
  const actual = await new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, LEGACY_SCRYPT_KEY_BYTES, LEGACY_SCRYPT_OPTIONS, (error, key) => {
      if (error) reject(error)
      else resolve(key)
    })
  })
  return timingSafeEqual(expected, actual)
}

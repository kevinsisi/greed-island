export type PasswordScheme = 'bcrypt-v1' | 'legacy-mp-scrypt-v1' | 'scrypt-v1'
const BCRYPT = /^\$2[aby]\$(0[4-9]|[12][0-9]|3[01])\$[./A-Za-z0-9]{53}$/
const LEGACY_SCRYPT = /^[a-f0-9]{32}:[a-f0-9]{64}$/
const VERSIONED_SCRYPT = /^scrypt-v1:[a-f0-9]{32}:[a-f0-9]{64}$/

/** Classification is independent of credential verification and never executes a hash. */
export function passwordScheme(encoded: string): PasswordScheme | null {
  if (typeof encoded !== 'string') return null
  if (BCRYPT.test(encoded)) return 'bcrypt-v1'
  if (LEGACY_SCRYPT.test(encoded)) return 'legacy-mp-scrypt-v1'
  if (VERSIONED_SCRYPT.test(encoded)) return 'scrypt-v1'
  return null
}

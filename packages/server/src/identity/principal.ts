export type AccountRole = 'player' | 'gm' | 'admin' | 'agent'
declare const accountIdBrand: unique symbol
export type AccountId = number & { readonly [accountIdBrand]: true }
export type LoginAliasKind = 'username' | 'email'
export type LoginAlias = Readonly<{ kind: LoginAliasKind; value: string }>

export function accountId(value: unknown): AccountId {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    throw new Error('Canonical account ID must be a positive safe integer.')
  }
  return value as AccountId
}

export function accountActorId(id: AccountId): string {
  return String(accountId(id))
}

export function normalizeLoginAlias(alias: LoginAlias): LoginAlias {
  if (typeof alias.value !== 'string') throw new Error('Login alias must be a string.')
  const value = alias.value.trim().toLowerCase()
  const valid = alias.kind === 'username'
    ? /^[a-z0-9_-]{3,32}$/.test(value)
    : alias.kind === 'email' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
  if (!valid) throw new Error('Invalid typed login alias.')
  return { kind: alias.kind, value }
}

export type Principal = Readonly<{
  accountId: AccountId
  role: AccountRole
}>

/** Single repository boundary. Aliases are logins for one numeric principal. */
export interface AccountRepository {
  findPrincipal(id: AccountId): Principal | null
  findPrincipalByAlias(alias: LoginAlias): Principal | null
  verifyCredentials(alias: LoginAlias, password: string): Promise<Principal | null>
  /** Registration cannot request an elevated role. */
  createPlayer(alias: LoginAlias, password: string): Promise<Principal>
}

// Test-only synthetic session adapter. Never imported by a normal startup.
import Database from 'better-sqlite3'
import { createHash, randomBytes, scryptSync } from 'node:crypto'
import { AuthService } from '../identity/authService.js'
import { migrateIdentitySchema } from '../identity/schema.js'
import { createHttpAuthorization, type HttpAuthorization } from './authorization.js'
import { accountId } from '../identity/principal.js'

export const COOKIE_TEST_ORIGIN = 'http://127.0.0.1:4178'
const contexts = new WeakMap<HttpAuthorization, { db: Database.Database; initialize: () => HttpAuthorization }>()
const actors = new Map<string, number>()
/** Initialization is explicit and lazy so supported old-schema fixture rows can be seeded first. */
export function createCookieTestAuthorization(db: Database.Database): HttpAuthorization {
  let value: HttpAuthorization | undefined
  const initialize = () => {
    if (!value) {
      migrateIdentitySchema(db)
      value = createHttpAuthorization(new AuthService(db, { allowedOrigins: [COOKIE_TEST_ORIGIN], secureCookies: false }))
    }
    return value
  }
  const config: HttpAuthorization = {
    get authService() { return initialize().authService },
    session: (req, res, next) => initialize().session(req, res, next),
    mutation: (req, res, next) => initialize().mutation(req, res, next),
    optional: (req, res, next) => initialize().optional(req, res, next),
    forRequest: (req, res, next) => initialize().forRequest(req, res, next),
    role: (...allowed) => (req, res, next) => initialize().role(...allowed)(req, res, next),
    resolve: req => initialize().resolve(req),
    reauthorizeMutation: (req, allowed) => initialize().reauthorizeMutation(req, allowed),
    token: req => initialize().token(req),
  }
  contexts.set(config, { db, initialize })
  return config
}
export function issueCookieTestSession(config: HttpAuthorization, claims: { sub: number; [key: string]: unknown }): string {
  const context = contexts.get(config)
  if (!context) throw new Error('Only an explicit synthetic fixture may issue a test cookie.')
  context.initialize()
  const id = accountId(claims.sub)
  if (!config.authService.accounts.findPrincipal(id)) throw new Error('Synthetic actor was not seeded.')
  const token = randomBytes(32).toString('hex'), now = Date.now()
  context.db.prepare('INSERT INTO auth_sessions(token_hash,account_id,created_at,expires_at,revoked_at) VALUES(?,?,?,?,NULL)')
    .run(createHash('sha256').update(token).digest('hex'), id, now, now + 60 * 60 * 1000)
  actors.set(token, id)
  return token
}
export function cookieTestHeaders(token: string): { Cookie: string; Origin: string; 'X-Greed-Account-Id': string } {
  const id = actors.get(token)
  if (!id) throw new Error('Unknown synthetic cookie context.')
  return { Cookie: 'greed_session=' + token, Origin: COOKIE_TEST_ORIGIN, 'X-Greed-Account-Id': String(id) }
}
/** For projection-only tests that formerly authenticated an invented JWT actor. */
export function seedCookieTestAccount(db: Database.Database, id: number): void {
  migrateIdentitySchema(db)
  const salt = '1'.repeat(32), hash = `scrypt-v1:${salt}:${scryptSync('synthetic-only-password', salt, 32).toString('hex')}`
  db.prepare('INSERT INTO accounts(id,password_hash,password_scheme,created_at,role,status,display_name) VALUES(?,?,?,0,?,?,?)')
    .run(accountId(id), hash, 'scrypt-v1', 'player', 'active', 'Synthetic player')
}

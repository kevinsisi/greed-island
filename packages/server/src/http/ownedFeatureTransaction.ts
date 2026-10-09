import type Database from 'better-sqlite3'
import type { Request } from 'express'
import { AuthError } from '../identity/authService.js'
import { hashCanonicalJson } from '../kernel/canonicalJson.js'
import type { HttpAuthorization } from './authorization.js'

export class OwnedFeatureError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message)
    this.name = 'OwnedFeatureError'
  }
}
export type OwnedFeatureResult = Readonly<{ status: number; body: unknown }>

/** Same-DB transaction and optional retry receipt. No actor is accepted from client data. */
export class OwnedFeatureTransaction {
  constructor(private readonly db: Database.Database, private readonly auth: HttpAuthorization) {
    db.exec(`CREATE TABLE IF NOT EXISTS owned_feature_receipts (
      account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      request_key TEXT NOT NULL, intent_digest TEXT NOT NULL,
      status INTEGER NOT NULL, response_json TEXT NOT NULL,
      PRIMARY KEY(account_id, request_key)
    )`)
  }

  run(req: Request, route: string, intent: unknown, commit: (actor: number) => OwnedFeatureResult): OwnedFeatureResult {
    const key = req.get('Idempotency-Key')
    if (key !== undefined && !/^[A-Za-z0-9._:-]{1,80}$/.test(key)) {
      throw new OwnedFeatureError(400, 'INVALID_IDEMPOTENCY_KEY', 'Use a stable 1–80 character request key.')
    }
    const digest = hashCanonicalJson({ route, intent })
    return this.db.transaction(() => {
      const current = this.auth.reauthorizeMutation(req)
      if (key !== undefined) {
        const receipt = this.db.prepare(`SELECT intent_digest, status, response_json FROM owned_feature_receipts
          WHERE account_id=? AND request_key=?`).get(current.sub, key) as {
          intent_digest: string; status: number; response_json: string
        } | undefined
        if (receipt) {
          if (receipt.intent_digest !== digest) {
            throw new OwnedFeatureError(409, 'IDEMPOTENCY_CONFLICT', 'This request key already belongs to a different action.')
          }
          return { status: receipt.status, body: JSON.parse(receipt.response_json) as unknown }
        }
      }
      const result = commit(current.sub)
      // Re-read status/session/role before the encompassing SQLite commit. A
      // projection failure or revoked identity rolls back every write and log.
      if (this.auth.reauthorizeMutation(req).sub !== current.sub) throw new AuthError('UNAUTHORIZED')
      if (key !== undefined) {
        this.db.prepare(`INSERT INTO owned_feature_receipts
          (account_id, request_key, intent_digest, status, response_json) VALUES (?, ?, ?, ?, ?)`)
          .run(current.sub, key, digest, result.status, JSON.stringify(result.body))
      }
      return result
    })()
  }
}

export function ownedFeatureErrorStatus(error: unknown): { status: number; code: string; message: string } | null {
  if (error instanceof OwnedFeatureError) return { status: error.status, code: error.code, message: error.message }
  if (error instanceof AuthError) {
    const status = error.code === 'UNAUTHORIZED' ? 401
      : error.code === 'FORBIDDEN' || error.code === 'ORIGIN_NOT_ALLOWED' ? 403
      : error.code === 'ACCOUNT_CHANGED' ? 409 : 400
    return { status, code: error.code, message: error.message }
  }
  return null
}

import type Database from 'better-sqlite3'
import { accountId, type AccountId } from '../identity/principal.js'
import type { HarborProgressPolicy } from './harborBeacon.js'

/** Read-only SAME-account-database boundary. Any imported provenance needs an explicit reviewed progress fact. */
export function createHarborProgressPolicy(db: Database.Database): HarborProgressPolicy {
  return (id: AccountId) => {
    const principal = accountId(id)
    if (!db.prepare('SELECT id FROM accounts WHERE id=?').get(principal)) return 'legacy-review-required'
    return db.prepare('SELECT namespace FROM account_source_identities WHERE account_id=?').get(principal) ? 'legacy-review-required' : 'new-player'
  }
}

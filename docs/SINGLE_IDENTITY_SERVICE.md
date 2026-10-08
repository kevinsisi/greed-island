# Canonical account repository and cookie service

This executable slice supplies the account/session boundary for one canonical
world. It is not a production cutover: startup and routing are unchanged;
no live database, account file, credential file or deployment was accessed.
The reviewed foundation is preserved separately.

## One storage identity

`SqliteAccountRepository` reads/writes the existing canonical `accounts`
table in the caller's SQLite connection. It does not open a database, read
accounts.json or create a separate account system. The old AccountStore
remains the legacy startup compatibility path until the coherent cutover.

Unified profiles explicitly allow absent email and retain username, original
display name, nickname, avatar, role and numeric identity. They are separate
from the legacy email-required DTO; no fake email, type assertion workaround
or change to old JWT claims is used. Other gameplay tables continue to
reference the unchanged numeric accounts ID.

New self-registration always creates a player and atomically records the
account, typed alias and session. New passwords use the explicit full-input
`scrypt-v1` encoding; existing bcrypt and literal-salt MP scrypt formats remain
readable without any automatic rewrite. Credential verification re-reads
the current credential, role and active status after asynchronous hashing.
Legacy 80-character display names and long passwords are not truncated.

The explicit import seam requires a blocker-free reviewed plan, current
canonical owner readiness and an exact source/alias/ID match. It never
imports a requested elevated role. Repeated imports use source provenance
and never overwrite a user's later password/profile changes.

## Explicit migration, never startup migration

`migrateIdentitySchema(db)` must be called separately in an exclusively owned
offline connection. No constructor calls it. Unified repository/service
constructors fail closed unless schema version 2 is ready and foreign-key
enforcement is enabled.

The migration validates known legacy columns, IDs, credentials and existing
FK consistency before changing anything. It creates a replacement accounts
table, copies numeric IDs and profile/tick/role data, restores the original
AUTOINCREMENT high-water mark, and reconstructs indexes, triggers and views.
All child/history rows keep their IDs and values. The whole operation is a
transaction; errors roll back schema/data/objects and finally restore the
connection's original foreign_keys setting. Unsupported source columns and
existing violations block the operation rather than discard information.
Older schemas receive only their established optional profile defaults;
there is no automatic administrator promotion.

Version 2 adds typed alias, legacy provenance and hashed-token session tables
in the same DB. `ownershipReadiness()` explicitly reports missing canonical
admin ownership. It does not choose or promote an owner.

Before any live invocation, consistent recoverable backups, offline writer
control, reviewed source/conflict/progress mapping, owner proof if needed,
rollback verification and explicit live authorization remain required.

## Shared cookie authentication contract

- Cookie `greed_session`: HttpOnly, SameSite=Strict, path=/, Secure by default.
  Disabling Secure is explicit and allowed only for loopback fixture origins.
  Forwarded protocol headers are never consulted.
- Registration/login and every cookie-authenticated mutation require an exact
  configured Origin. Missing Origin, suffix matches and trailing-slash variants
  are rejected before mutation.
- The raw random session token is returned once for Set-Cookie. Only SHA256
  token hashes are stored. No password, hash or token is logged.
- Session resolution checks expiry/revocation and re-reads the current account
  role, active status and existence from the repository.
- Logout is idempotent, including expired sessions. Password change requires
  the current password and fresh session, then atomically changes the full-input
  hash and revokes all prior sessions. Account-wide revocation requires the
  authenticated owner or a current admin.
- `onRevoked` provides stream-cleanup notification. World streams must also
  re-resolve the token before sending so expiry/disabled accounts close promptly.
- `sessionTokenFromCookie` rejects malformed and duplicate session cookies.
  Clear-Cookie must use the same root-path/HttpOnly/SameSite/Secure options with
  maxAge omitted.

The world adapter consumes Principal.accountId (number) and uses String(id)
for EventLog actor IDs. It must use this AuthService rather than another
file-account reader. Legacy gameplay progress is still a separately reviewed
Command -> Rule Engine -> EventLog import; account import does not convert or
refill supplies/rewards, or claim that position progress is migrated.

## Verification and remaining gate

Synthetic native tests cover exact FK/history values, optional old schemas,
schema rollback and FK state restoration; account/alias/session atomicity,
old/new credentials, original names, no-email registration, import conflicts,
Origin/CSRF, cookie policy, persisted hashed sessions, role/status freshness,
expiry, logout and password-change revocation. Node22.23.2/better-sqlite3 feature
CI and independent review are authoritative; supplemental Node24/built-in
SQLite checks are explicitly not a substitute.

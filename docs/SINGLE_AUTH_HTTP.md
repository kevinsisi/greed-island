# One cookie-auth HTTP boundary

`createUnifiedAuthRouter({ auth })` is mounted once at `/api` and receives the
same AuthService used by canonical world snapshot/stream/command routes. It
does not construct another repository, read account files, issue JWTs,
perform schema migration or change startup. This candidate is source-only;
coherent composition/cutover and live authorization remain separate gates.

## Agreed frontend contract

- POST `/api/auth/register`: `{ username, password }`
- POST `/api/auth/login`: `{ identifier, password }`, where identifier is the
  existing username or existing email
- GET `/api/auth/me`: `{ profile }`
- POST `/api/auth/logout`: `{ ok: true }`
- GET `/api/profile`: `{ profile }`
- POST `/api/profile/password`: `{ currentPassword, newPassword }` -> `{ ok: true }`

Successful registration/login also return `{ profile }`. UnifiedAccountDTO
is AccountProfile: accountId, username (nullable), email (nullable), nickname
(nullable), avatar, displayName, role and createdAt. Existing IDs/names are
preserved; no email is invented. There is no token in JSON. The browser uses
credentials:include and the one HttpOnly cookie. Registering a username does
not create a new bearer identity or a second account kind.

New usernames contain 3–32 ASCII letters, numbers, `_` or `-`; login matching
is case-insensitive and entered display case is preserved. New passwords
contain 12–200 characters; legacy passwords remain verified unchanged.

Old active JWT/cookie sessions may expire at the coherent cutover. Users can
sign in again with the same credentials; they are not asked to register
again. No legacy bearer exchange or second auth router is introduced.

## Security boundary

- All responses use Cache-Control:no-store.
- Mutators require exact configured Origin before parsing/processing.
- Signup/login/current-password attempts share a bounded window budget.
  The default key is req.socket.remoteAddress, never forwarded headers.
  A trusted composition root may provide a separately verified client-key
  policy for a known proxy; it must not blindly trust X-Forwarded-For.
- The rate-budget map itself has a bounded maximum number of clients.
- Small JSON bodies and exact field lists reject role/target injection.
- Session token helpers reject malformed or duplicate cookies.
- Cookie logout/current-password/admin/world mutators require the displayed
  account's `X-Greed-Account-Id` assertion. It never authenticates/selects an
  actor. Missing/invalid values fail closed with ACCOUNT_CONTEXT_REQUIRED;
  a mismatch returns HTTP409 ACCOUNT_CHANGED before any mutation/cookie clear.
  Login/register are explicit identity-switch actions and are exempt.
- Successful login/register revokes only the incoming prior cookie session,
  signalling its stream to close. Other sessions for that account remain
  valid; failed login does not revoke or replace the prior session.
- Me/profile re-read the current active account; password change revokes
  all previous sessions and clears the same root-path cookie.
- Identity/admin private GET inventory is `/api/profile` and `/api/admin/users`.
  Both require the displayed account's expected-ID assertion against the freshly
  resolved cookie principal before returning private data. Missing/invalid IDs
  return HTTP400 ACCOUNT_CONTEXT_REQUIRED; stale context returns HTTP409
  ACCOUNT_CHANGED. IDs are positive JavaScript-safe integers, including values
  above the 32-bit range. The header grants no authentication or admin permission.
  `/api/auth/me` is the initial synchronization exception: it discovers the current
  cookie identity without requiring or trusting an expected account header.
  Private reads do not require a mutation Origin, alter sessions or clear cookies.
- Logout is idempotent and clears the same cookie without maxAge.
- Anonymous forgot-password explicitly returns ADMIN_RECOVERY_REQUIRED and
  never reads or returns a reset token. Existing authenticated admin recovery
  remains guarded; this router adds no anonymous recovery capability.
- Shared middleware sets res.locals.unifiedPrincipal after resolving the
  same AuthService. World command guards re-run mutation authentication at
  their actual flush, and streams re-resolve on expiry/revocation.
- An accountId revocation notification is a signal to recheck stream tokens,
  not permission to disconnect every valid session for that account.

At coherent cutover the old multiplayer auth entries must be removed/rejected;
the canonical world must not retain a permanent alternate account router.
Existing source progress is not labelled imported just because login succeeds.

## Tests and release gate

Synthetic HTTP/native tests cover username-only registration, existing-email
login, profile/accountId DTO, no JSON tokens, cookie lifecycle, exact Origin,
role/body rejection, forwarded-address spoof resistance, attempt limits,
recovery denial, current status/expiry, repeat logout and password revocation.
Supplemental actual-source Express4/real Node SQLite smoke passed. Exact
Node22.23.2/better-sqlite3/bcrypt feature CI and independent review remain
authoritative; no live account, data or deployment was changed here.

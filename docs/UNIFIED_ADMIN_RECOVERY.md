# Preserved profile, admin and recovery on one cookie service

This source-only follow-on uses the same AuthService/private canonical DB.
It adds no JWT router, file-account store, live credential action or startup
migration. `createUnifiedAdminRouter({ auth, clientKey? })` mounts once at /api
beside the shared auth and world routers. `clientKey`, when supplied, must be
the same separately verified proxy policy; arbitrary forwarded headers are
never trusted by default.

## Account/profile/admin contract

- PATCH /api/profile `{ nickname?, avatar? }` -> `{ profile }`. Existing
  nickname trimming/null/24-character and eight avatar-preset rules remain.
- GET /api/admin/users -> `{ users: AdministrativeProfile[] }`.
- PUT /api/admin/users/:id/role `{ role }` -> `{ profile }`.
- PUT /api/admin/users/:id/status `{ status }` -> `{ profile }`.

AdministrativeProfile extends the existing nullable-email AccountProfile with
status active/disabled. Disabled records are readable only through the guarded
administrative path, never an authenticated active principal. Listing uses
current active-admin permission; mutators additionally use exact Origin and
the displayed actor's expected-account assertion. The assertion is not an
authentication identity or the target account selector.

Role/status changes are transactional, re-read current actor permissions and
count only ACTIVE admins. The last active admin cannot be demoted or disabled.
Changed target sessions are revoked after the committed change; unrelated
accounts/sessions remain intact. No username/legacy role becomes admin by
inference. Existing roles/profiles remain unchanged by schema upgrade.

## Same-service password recovery

- POST /api/admin/users/:id/reset-password `{}` -> `{ ok, target, token,
  expiresAt, resetPath:'/reset-password' }`, only an authenticated active admin
  with exact Origin and the expected ADMIN account ID may issue it.
- POST /api/auth/reset-password `{ token, password }` -> `{ profile }` plus the
  existing HttpOnly cookie. A valid proof intentionally authenticates that
  one target, rather than trusting a cookie or account ID supplied in the body.

Proofs are 256-bit random values, expire after one hour, are hashed at rest and
are never logged or embedded in a URL. The admin sees a one-time proof for the
existing authorized recovery product action; session tokens remain cookie-only
and never appear in JSON/storage. The recipient enters the proof manually in
memory. Anonymous forgot-password still returns ADMIN_RECOVERY_REQUIRED and
never creates or reveals a proof.

Redemption atomically validates unexpired/single-use proof, active target and
unchanged credential fingerprint, writes a full-input scrypt password, consumes
all target proofs and revokes all target's old sessions before issuing one new
cookie session. A failed final session insertion rolls everything back. Only
one racing redemption succeeds. Ordinary password/status changes invalidate
pending proofs. Successful reset also revokes only the incoming prior-browser
cookie session; other account sessions are not globally revoked.

Old reset-token rows are preserved as existing data/audit, but the new verifier
does not accept those previously anonymously exposable tokens. An active admin
can issue a new proof. This is not deletion or a forced second signup.

## Explicit additive schema upgrade

Schema version3 adds only auth_password_resets metadata to an existing version2
DB through explicit migrateIdentitySchema invocation. Accounts, roles, IDs,
aliases, sessions, progress and original reset rows stay unchanged. Constructors
remain fail-closed/read-only; normal startup does not upgrade. Old canonical
schemas still use the already reviewed copy/rollback/FK-preservation migration.
The stage/owner/backup/live-approval gates are unchanged.

Staged identity planning must supply the canonical ID authority above all
existing IDs, AUTOINCREMENT high-water and known historical account references.
New explicit imports also reject reused sequence/EventLog IDs; exact source-map
retries remain idempotent. Numeric actor IDs in rejected-command audit records
are reserved, but attacker-supplied rejected payloads are not committed facts.
Committed account-reference payloads are inspected structurally; ambiguous or
unsafe history blocks import rather than silently reusing a historical actor.

The ONE shared accountIdAuthority module verifies existing accounts/sequence,
every accounts(id) foreign-key reference, canonical EventLog actors/references,
card_action_log actors/target/proposer references, and rejected-command actors.
Its reviewed non-FK exception is world_card_drops.holder_account_id, with the
canonical table shape checked before reservation. Numeric combat playerActorId,
sourceActorId, targetActorId and defeatedByActorId references are reserved;
textual NPC/animal counterparts are not account identities. Goods holderId is
an account reference only when holderType is player. This preserves readable
legacy goods ownership even though the current generic goods validator rejects
player holders. Current transport validators and projection both reject player
endpoints; encountered from/to player-holder history fails closed for manual
classification. NPC, building and settlement holder IDs are never inferred as
player IDs, and no gameplay facts are rewritten by these allocator checks.
Migration explicitly reserves the AUTOINCREMENT range before readiness even
when no legacy accounts are imported. Normal startup/constructors/signup only
assert allocator readiness and never silently reseed. Unknown actor-bearing
ledgers require explicit manual review. Recovery readiness checks exact column
types/nullability/primary key, account foreign key and uniqueness/lookup indices;
an incompatible v2 collision fails transactionally without a version advance.

## Verification

Native synthetic tests cover active-last-admin guards, stale permissions,
profile identity/credential preservation, hashed proofs, disabled/expired/unknown
proof rejection, self-change invalidation, parallel single-use redemption,
target-only session revocation and rollback on failed session creation. HTTP
tests cover same-cookie/expected-ID/Origin, admin-only issuance, no-token JSON
redemption, generic anonymous rejection and profile/role/status routes.
Supplemental actual-source Express4/real Node SQLite checks passed; exact
Node22/better-sqlite3/bcrypt feature CI and independent review remain gates.

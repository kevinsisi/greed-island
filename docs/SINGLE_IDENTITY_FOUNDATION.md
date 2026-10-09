# Single account / single world: safe identity foundation

This checkpoint is a tested foundation for one account repository and one
canonical world. It does not switch startup, deploy, read/import live data,
change routing, or add another account service. Existing registration and
login transports remain until a separately reviewed cutover.

## Product contract

- One numeric canonical account ID backs all game systems. Existing canonical
  IDs, foreign-key progress and roles must remain unchanged.
- Username and email are typed login aliases for that same principal, not
  separate account kinds. Imported username-only accounts must not receive
  invented email addresses or require a second registration.
- Unified/import adapters must set `adminBootstrap: 'none'`. The old
  `legacy-first-account` default is retained only to avoid changing existing
  startup in this foundation patch. Both first registration and schema-time
  earliest-account promotion honor the explicit policy.
- Admin ownership is not inferred from a username, legacy admin label or
  import order. Missing canonical admin ownership blocks live cutover until
  the owner is explicitly selected and verified.

## Implemented boundary

`identity/principal.ts` defines positive safe-integer IDs, their existing
`String(id)` event actor form, typed aliases and the single repository
contract. This contract is not a second store or an enabled runtime adapter.

`identity/passwordVerifier.ts` is the one shared compatibility verifier used
by canonical credential/current-password checks. It accepts existing bcrypt
and legacy MP scrypt hashes without rewriting them. The original MP scrypt
uses N=16384, r=8, p=1 and a 32-byte digest with the literal hexadecimal salt
text. Decoding that salt as binary changes the result. Async scrypt preserves
the full password, including legacy inputs longer than 72 UTF-8 bytes; the
foundation never rehashes them into truncating bcrypt. Password creation and
explicit password update policy are unchanged in this checkpoint.

`identity/migrationPlan.ts` is a pure dry-run over identity and progress
descriptors. It has no filesystem/database access and accepts no passwords
or credential hashes. It preserves canonical IDs, sorts source identities
for deterministic numeric allocation, rejects duplicate/many-to-one maps,
and reuses previous mappings only when the target carries matching source
provenance. A plan reports conflicts instead of renaming or silently merging.
`readyForReviewedImport` means descriptor blockers are empty; it is neither
authorization nor evidence that an import or canonical rule has executed.

## Live migration remains gated

The later schema change must explicitly allow absent email, add typed unique
aliases and provenance, and preserve every referencing table. Do not put
bulk import or nullable-email rebuild in an ordinary store constructor.

Before live action: verify the actual source/destination databases, take
consistent recoverable backups, stop conflicting writers, produce the
offline ID/conflict plan, obtain approval and test rollback. No irreversible
delete is part of this contract.

Legacy supplies, rewards, contributions, reward claims, messages and position
each require a referenced reviewed canonical import rule. They must not be
discarded, refilled, counted as canonical gold/energy or described as
successfully migrated while their mapping is pending. Canonical world changes
must still follow Command -> Rule Engine -> EventLog -> Projection. Import
provenance and original source history must remain available for audit; no
second permanent multiplayer room runtime is the intended end state.

Player-position/world integration is a separate slice. No five-second
position-checkpoint exception is granted by this identity foundation.

## Verification scope

Focused tests cover both bootstrap code paths, unchanged existing roles,
both credential formats, malformed hashes, long/Unicode passwords,
canonical ID validation, deterministic planning, source/alias/provenance
conflicts and complete pending-progress accounting. All databases used in
these tests are synthetic in-memory databases. Full repository verification
and feature-branch CI remain release gates, not implied by this document.

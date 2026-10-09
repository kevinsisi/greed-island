# Source-only private legacy preservation

This is an offline staging library and synthetic test candidate. It is not wired to runtime startup, signup, deployment, an L390 mount, environment defaults, or a live-data path. Every source path and destination connection is explicit. The accepted apply-purpose is `synthetic-private-stage`.

## Read and dry run

1. `readLegacyWorldSourceFiles({accountsPath, roomPath, namespace})` opens an explicitly supplied room database read-only with `fileMustExist`, inside one read transaction. Always call `source.close()` afterward. It reads the existing recorded world; empty history refuses initialization/refill.
2. `readCanonicalStageState(db)` inventories the existing numeric identities and calls the ONE shared `readCanonicalAccountIdAuthority`. Its target fingerprint includes IDs, roles/status, credential encodings, aliases, provenance, high-water and EventLog sequence.
3. `planLegacyWorldStage({source,target,reviewedLinks?,ownerSelection?})` is pure. `legacyWorldStageReport(plan)` is the safe conflict/count/hash report. It excludes credential hashes and private event/chat payloads.

Source manifest hashes exact accounts JSON bytes and canonical row metadata with the original `payload_json` string intact. It also records source count/sequence span and projected RoomState hash. Unsupported/corrupt source history fails closed rather than being repaired. Roster IDs without an account record remain source-namespace actors in the archive, with an explicit activation blocker.

## Identity and owner contracts

New identities are allocated strictly above the shared canonical authority, including deleted-ID sequence and reviewed committed history. They are imported with role `player`, status `disabled`, and the original legacy scrypt hash unchanged plus `legacy-mp-scrypt-v1` scheme. No plaintext is handled, and these new accounts cannot log in. Original role claims, string IDs and display names remain private evidence.

An existing canonical account is linked only by existing exact provenance or an explicit reviewed link with numeric account ID, review reference and `keep-canonical` credential disposition. Alias/provenance/username-slot conflicts hard-block staging. Existing canonical credentials, roles, status, profile and wallet rows are never overwritten or downgraded. The plan is independently re-evaluated before apply, so a forged below-authority allocation cannot pass merely by recomputing a digest.

Optional owner selection names the reviewed numeric ID and exact source provenance, with an operator verification reference. It is recorded only as metadata. It grants no privilege, activates no account and cannot make the staged database bootable. Usernames and legacy admin claims never select an owner automatically.

The shared identity authority dependency is excluded from this patch. Current tested source dependency: `greed-identity-history-fix`, commit `ab13761049bf9791f4472f13860d72e01114f5a2`, pending root review. Do not activate against an older incomplete allocator inventory.

## Apply and exact preservation

`applyLegacyWorldStage({db,source,plan,purpose:'synthetic-private-stage',recordedAt})` uses one supplied SQLite connection and one outer transaction for account/alias/provenance writes, allocator reservation, canonical EventLog archive events and private archive tables. Foreign keys must already be enabled and valid. No runtime/broadcast callback exists.

Private tables:

- `legacy_import_stage(namespace,source_digest,plan_digest,status,owner_selection_json,imported_at)`. Status is restricted to `pending-owner-and-activation-review`.
- `legacy_import_private_sources(namespace,accounts_json,manifest_json,identities_json,archive_event_ids_json)`, referencing the staging marker. Raw hash-only accounts JSON is stored here, never in EventLog/public snapshots.

Raw source rows are preserved in typed `LEGACY_WORLD_PRIVATE_ARCHIVE_V1` events, in batches of 256. The final archive event stores the exact projected RoomState as opaque `stateJson`, declared numeric `canonicalMappings.accountId`, original source role claims, and `private-exact-unmapped` disposition. Legacy tick is not converted to canonical simulation tick. Credentials never enter archive EventLog events. These archive events are excluded before recent autonomous/NPC/narrative history limits.

This preserves source positions, supplies, rewards, contributions, beacon completion/window, awarded IDs, movement-rate history, last100 projected messages, and every historical raw event exactly. It does not create canonical wallet/items/quests/beacon state or publish old chat. Private NPC dialogue is not imported into the public world channel. Canonical positions/gameplay mappings need separate reviewed semantics.

A repeat of the same namespace/source verifies exact private bytes, source mapping and source username alias→numeric account binding, every immutable archive event ID/kind/digest/count/hash and exact progress before returning a duplicate result. It does not overwrite later canonical credentials/profile/role. A changed source or target blocks; missing/tampered private archive blocks. Missing or reassigned legacy aliases return STAGED_ALIAS_CHANGED without restoring or overwriting later authorized changes. Allocation is explicitly reserved on first apply and verified retry, including zero new accounts.

## Rollback and activation gates

Failure at any write phase rolls the entire transaction back, including schema markers, IDs, aliases, archive facts and allocator updates. After successful staging, rollback means retaining the untouched legacy source and discarding/restoring the separately backed-up staged database as an operator-reviewed artifact. Never delete/rewrite committed EventLog facts to manufacture an undo.

Normal bootstrap must call the read-only `assertLegacyWorldStageActivationReady(db)` before starting services. Marker and private archive tables must match the exact SQLite-emitted DDL bytes from this source-only schema contract, with no SQL normalization or broad alternate-DDL tolerance; collided/unknown schemas and NULL/unknown status fail closed. Every marker produced by this library fails with `LEGACY_STAGE_ACTIVATION_REVIEW_REQUIRED`. There is deliberately no activation/status-update API.

Before any actual cutover: authorize source access/credential handling separately; create reviewed immutable source/staging backups and hashes; resolve alias/unmapped-actor conflicts; verify/select the owner and separately authorize privilege activation; review every legacy gameplay mapping or expose archival preservation honestly; run exact Node22/native tests and combined product/browser CI; review a separate readiness/activation migration and reversible volume switch. This candidate is not permission to perform those actions.

## Verification

Local Node24/Vitest4: 9 pure staging tests,3 exact emitted-schema catalog tests and1 existing runtime history regression passed. Full tsc has no authored migration/runtime diagnostics but remains blocked on baseline missing dependencies/types. Fourteen actual-native-SQLite tests are authored for read-only file hashes, exact307 source event/progress rows, three rollback phases, durable reopen/idempotency, source/target/archive conflicts, forged below-authority IDs, existing roles/wallet preservation, zero-new-account reservation, collided NULL-status marker schemas, quoted CHECK literal mismatch and nullable TEXTNOT NULL token collision on empty tables, exact valid schema insertion and missing/reassigned source-alias drift. Local native runs fail before execution because better-sqlite3's binding is absent; exact Node22 hosted CI is required. No compatibility shim or production load is used.

# Offline account activation candidate, review revision V2 (receipt schema version 1)

Base: reviewed feature cd84ff6966bd21f9520c9911a3588a39edad9b1d server sources. This isolated candidate has not been published, run on owner data, or connected to startup/CLI/deployment.

## Explicit scope

- inspectOfflineActivation is read-only and returns hashes and account mapping/status metadata, never password verifiers or raw archive payloads.
- The source must be supplied explicitly. One staged namespace is supported; multiple sources require separate design rather than partial activation.
- Existing exact staged archive verification is reused, including original source bytes, archive EventLog entries, recorded mappings and current aliases.
- The complete restoration row must pass canonical HarborBeaconProjection semantics and exact command/rule-generated metadata comparison, including actor/type, kind, beacon identity/tick, movement step, ruleset, version, command receipt, event ID and deterministic key. The progress digest binds the entire stored row including sequence and audit time. Actual reviewed harbor restoration and exact canonical positions are required. Unknown/unmapped actors, newer harbor gameplay facts and mismatched restoration state fail closed.
- Every imported identity must have an explicit disposition. Only create-disabled-player records can become active, and only as player. Existing canonical accounts are preserve-existing only.
- The policy names an already active canonical admin. A source admin claim cannot grant privilege; no automatic bootstrap, promotion or owner selection exists.
- New imported accounts retain their exact original credential verifier. Existing credentials are untouched. Imported accounts with any stored session/reset artifacts are rejected, not silently revived or repaired.
- An immediate SQLite transaction changes only approved account statuses and adds an append-only version-1 receipt. Account fields, source archives, stage markers, aliases/provenance, sessions/resets, schema and existing EventLog rows are checked for unintended changes. Injected interruptions roll back both statuses and receipt schema/content.
- An activation-specific snapshot of every staged database table/row and schema (excluding only the new receipt table) is bound into the reviewed policy and the receipt before/after digests. It includes full password scheme/profile/session/reset rows, stage metadata, all history bytes and unrelated stored progress. Exact SQLite integers and binary values are preserved in hashing; rows are streamed in deterministic key order. Verification reconstructs the approved pre-state by substituting only selected account statuses back to disabled, so a changed receipt cannot hide another field change.
- An identical policy retry verifies the existing receipt and returns without writes; changed policy, source, mappings, credentials, progress, status or target fingerprint fails closed. It never reapplies an earlier status over a later disable.

## Deliberate remaining boundaries

The existing production boot gate still rejects nonempty staging markers. A successful candidate receipt explicitly says productionBootEnabled:false. No stage marker is removed or relabeled, and no deploy review JSON is generated.

verifyOfflineActivationReceipt is an OFFLINE PRE-CUTOVER verifier, not a future always-on boot verifier. Its reviewed target fingerprint and strict imported-auth/position checks deliberately reject intervening gameplay, login, password or account changes. A later runtime gate must separately distinguish immutable preservation evidence from legitimate ongoing mutable state; do not wire this verifier directly into startup.

A policy reviewReference is an audit reference, not authentication or a cryptographic signature. This module is not exposed through HTTP and grants no caller access to a file. A future operator/CLI integration must independently establish owner approval, exclusive offline ownership, backups, source cutoff, trusted policy delivery and permissions. Arbitrary privileged database/file rewriting is outside receipt-hash authenticity; the digest is an integrity binding for an independently approved policy, not a signature.

No CLI, production schema switch, actual source selection, admin promotion, real credentials, real data operation, live AI, host execution or deployment is part of this slice.

## Verification

- 28 pure policy/canonical restoration tests pass locally, including malformed actors, kinds, beacon clocks, movement steps and rule/event metadata.
- New native SQLite tests additionally cover pre-apply and post-receipt drift in password scheme, profile, sessions, resets, stage metadata and historical audit bytes; unchanged ordinary identity fingerprints do not hide these changes. Extra coverage binds unrelated progress, exact 64-bit integers and binary bytes.
- Native SQLite tests cover selective activation, original-password login, kept-disabled accounts, preserved admin/archive/EventLog, unchanged boot block, transactional rollback at both boundaries, durable reopen/read-only verification/idempotency, missing restoration, credential/alias/status/policy drift, imported auth artifacts and receipt immutability/unknown schema.
- Native collection is blocked locally by missing bcryptjs; the local dependency cache also lacks better_sqlite3.node. No native assertion is claimed as run.
- Full local noEmit reports only the four known cache diagnostics (three missing bcryptjs imports and runtimeBudget.test.ts implicit-any); no authored diagnostics. This is not a full typecheck pass.
- Independent review and exact supported-Node native CI are required before publication/acceptance. Existing cd84ff6 CI results do not cover these new files.

# Preserve settings and GM administration through canonical identity

Restore the existing settings/provider configuration, simulation advance and card
art API contracts using the injected canonical cookie authorization, SettingsStore
and SimulationRuntime. Do not construct accounts, a second settings store or a
second runtime. Every private read requires the expected numeric account context;
every mutation requires the exact allowed Origin and current GM/admin role.
Reauthorize after asynchronous body/provider work and immediately before commit.

Provider transport, provider ordering and existing free-model filtering remain
unchanged. Key material and provider errors are never returned to clients. This
candidate does not perform live provider requests, credential creation, production
settings changes, migration, import, asset deletion, startup changes or publishing.

Card-art replacement/removal archives existing bytes in non-public
assets/history/card-images. Archive exhaustion rejects a new operation instead of
permanently deleting history. Only known 1..100 PNG/JPEG/WebP art paths are served.

## Verification

The focused 25-test supplemental HTTP suite covers anonymous/bearer denial,
private expected-account reads, exact Origin/context, refreshed role/revocation,
streamed-body commit guards, provider-result post-await reauthorization, redaction,
art validation/archival and bounded-history rejection. Native Node 22/locked
better-sqlite3, integrated startup/browser and publication remain release gates.

## Immutable provider credential trust

The global OpenCode Basic credential is associated with an explicitly supplied
startup-only canonical origin, separate from editable provider URLs. Missing or
malformed trust and newly edited origins receive no global header. Same-origin
path changes preserve the existing service authentication, while redirect errors
remain denied and upstream authentication failures remain visible. Regression
coverage uses only inert env fixtures and mocked provider transport.

# Canonical settings and GM administration preservation

This is an isolated feature-adapter candidate on frozen base `01e44ef`.
It changes neither startup, identity issuance, owner bootstrap nor deployment.
The production mount remains a separate integration/release gate.

## Routes and existing views

All private routes require the shared cookie principal, current GM/admin role
from the canonical accounts table and `X-Greed-Account-Id`. All mutators also
require the exact allowed Origin. There is no bearer/JWT acceptance or additional
account store. This family does not introduce personal settings; any future
account-specific setting must derive its owner exclusively from this principal.

- SettingsPage: GET `/settings/health`, GET/POST `/settings/keys`,
  DELETE `/settings/keys/:id`, POST `/settings/keys/reactivate-all`,
  GET/PUT `/settings/providers`, GET/POST/DELETE `/settings/opencode`,
  GET `/settings/opencode/models`.
- AdminLineagePage: POST `/admin/sim/advance` with the same runtime tick path,
  existing 50,000-tick cap and existing before/after/timing response.
- AdminCardsPage: GET `/admin/cards/images`, PUT/DELETE
  `/admin/cards/:id/image`, preserving the public `/card-images/:name` mapping.

The existing canonical client/view candidate already sends account-context
headers for these paths and separates account epochs. This backend patch does
not modify or recreate those views.

## Explicit integration seam

Inject the exact SettingsStore attached to the canonical runtime, its existing
HttpAuthorization and its canonical SimulationRuntime. `dataDir` is the directory
containing the canonical database. Under `/api`, mount these exports after the
raw world router and before the identity router's global small-body parser:

- `createSettingsRouter({ store, authConfig, openCodeCredentialOrigin })`
- `createAdminSimRouter({ runtime, authConfig })`
- `createAdminCardsRouter({ dataDir, authConfig })`

Do not instantiate AccountStore, SettingsStore, AuthService or a runtime inside
these adapters. Settings use 16KiB JSON bodies, simulation uses 4KiB and card-art
PUT uses the bounded base64 envelope for at most 5MiB of decoded bytes. Each parser
runs only on a known route after authorization. Reauthorization runs after body
parsing and immediately before each synchronous commit. Unknown/auth/world paths
do not inherit the media parser.

## Secrets and provider behavior

Key responses retain summary fields but use a fully redacted fingerprint and a
generic provider-error marker. No key body, suffix, credential or raw provider
exception is serialized or logged. Provider server URLs with userinfo, query or
fragment are rejected. The existing OpenCode session/provider API is retained;
no third-party API migration is included. Provider model discovery keeps the
existing provider/free-model filters, rejects HTTP redirects, caps JSON reads at
2MiB, and rechecks current identity/role after awaits before returning data.

The existing global `OPENCODE_SERVER_PASSWORD` is forwarded only to the immutable
`openCodeCredentialOrigin` supplied explicitly by trusted startup composition.
The composition maps non-secret `OPENCODE_CREDENTIAL_ORIGIN` metadata into that
input; it must not infer trust from mutable DB settings or a requested URL edit.
The router snapshots the canonical scheme/host/port before handling requests.
Same-origin path variants retain the existing Basic authentication. Missing or
malformed origin trust, or any changed origin, uses no global authentication
header. A provider authentication failure is returned honestly as an upstream
failure; no unauthenticated-success fallback or second key store is introduced.

No live provider request, API credential creation/transmission or production
settings write was made while preparing or testing this candidate. Fixtures use
inert synthetic strings and a fake settings store.

## Art preservation

Only IDs 1..100 and signature-checked PNG/JPEG/WebP bytes are accepted. Listing
and catalog decoration delegate to the shared validated public reader owned by
the public-read integration candidate. No art directory is created by reads.

Replacement/removal moves all current known extensions to non-public
`assets/history/card-images`, with server-generated names. The history limit is
1,000 files and 100MiB; exhaustion rejects the operation without deleting prior
art. Paths are server-derived and reject symlink roots/directories/files,
traversal and client-supplied archive paths. The public reader accepts exact
known current filenames only, so it cannot expose history. Existing art is never
permanently deleted; failed publish renames restore prior public files.

## Verification and remaining gates

- Supplemental Node 24 HTTP/SQLite suite: 25 tests passed using a temporary
  `node:sqlite` compatibility adapter; bcrypt stub throws if invoked. Tests cover
  anonymous/bearer denial, private-read missing/stale context, exact-Origin and
  cross-account mutation denial, current-role/revocation changes, streamed-body
  reauthorization, post-await model reads, full redaction, no unauthorized media
  parser, invalid IDs/signatures/URLs, reversible archive and exhaustion/symlinks,
  and immutable credential-origin/default/path/new-origin/redirect guards.
- Focused strict TypeScript: passed using a temporary ambient bcrypt declaration,
  without package installation or production-source stubs.
- OpenSpec aggregate check could not run because the frozen base lacks the
  referenced scripts/openspec-check.mjs; no spec-check pass is claimed.
- Native test collection is blocked by unavailable bcryptjs; native
  better-sqlite3 binding is independently unavailable. No native result is claimed.
- Full server typecheck remains blocked by pre-existing missing bcryptjs and
  runtimeBudget.test.ts typing under the locally available Vitest 4.
- Initial independent review found and reproduced cross-origin global-credential
  forwarding. This isolated replacement fixes that blocker; re-review is pending.
- Startup composition, exact locked Node 22 native SQLite/runtime/reopen tests,
  complete CI, browser view/account-switch QA, main merge and L390 release remain
  separate gates. No push or deploy was attempted.

# One canonical startup candidate

The existing `packages/server/src/server.ts` is the active entrypoint. It now
uses `resolveUnifiedConfig` and `createUnifiedServer`, with no old/new mode
selector. One explicitly selected database supplies one SqliteEventStore,
one SimulationRuntime, one AuthService and the AuthService's canonical
SqliteAccountRepository. SimulationRuntime already owns exactly one internal
PlayerWorldService and its 100ms movement cadence. Do not create another
service or independent world clock in the composition root.

## Database and ownership gates

GREED_ISLAND_DB_PATH is an absolute existing file path; allowed HTTPS browser
origins are explicit in GREED_ISLAND_ALLOWED_ORIGINS. Normal startup never
creates directories/databases, migrates identity, imports source files,
promotes accounts, issues credentials or seeds provider keys. Before opening
a writable connection or setting WAL, a fileMustExist read-only connection
checks the exact legacy-staging schema/activation gate first, unified identity,
reserved account-ID historical authority, existing canonical EventLog
tables/columns, foreign-key integrity and an existing active admin. Any pending
staged source artifact, malformed/NULL/collided marker, or unknown staging
schema refuses boot with a read-only review error. This source-only import
schema cannot express activation readiness; normal startup never marks it
ready. Account-ID sequences are never silently reseeded at boot. Readiness is rechecked
after reopening. A missing, legacy/unmigrated, accounts-only or ownerless
database refuses boot. There is no insecure JWT fallback.

Existing jobs/combat/NPC memory/relationships/settings/narration/NPC-agent
runtime attachments share the same DB. Current provider settings are
preserved; this bootstrap does not insert environment keys or change them.
This does not expose their old HTTP mutators or certify every existing
world-system backlog as complete.

The lifetime owns HTTP listen/close, world and movement runtime start/stop,
deferred large-log hydration and stream teardown. Close is idempotent and
cancels queued movement before the DB closes. No browser connection is needed
for autonomous world ticks.

## Reviewed HTTP surface

Routers mount ONCE at /api in world → auth → admin order. The world raw-body limit runs before every JSON parser:
- createUnifiedAuthRouter({auth}) owns /auth/register, /auth/login, /auth/me,
  /auth/logout, /profile and /profile/password. Anonymous forgot-password
  denies recovery; it never returns a reset token.
- createPlayerWorldRouter({runtime,authService,sessionTokenFromCookie}) owns
  /world/snapshot, /world/stream and /world/command.
- createUnifiedAdminRouter({auth}) owns guarded /admin/users, role/status changes,
  admin-issued reset proofs and single-use /auth/reset-password redemption.
  Schema version3/recovery upgrade is explicit; constructors never upgrade it.

The exact same AuthService resolves the HttpOnly cookie for both. Mutations
use exact Origin and X-Greed-Account-Id as an assertion against the cookie,
never as account authority. The world adapter reauthorizes queued commands
at commit and rechecks streams on expiry/revocation. A one-token logout must
not disconnect another valid session belonging to the same account.

Health/version are safe reads. /api/map requires the same session and emits
only whitelisted geographic names/IDs/biomes, availability and edge types.
Legacy NPC detail, events/world-events, card/social/commerce/settings/admin
routes and /mp-api are not mounted. GET does not make a payload privacy-safe.
Future feature adapters need field/role/privacy and canonical-position
review. The previous last-admin/admin-issued recovery protections cannot be
silently lost; the unified guarded adapter remains a cutover gate.

## Explicit browser/CI fixture

Build the complete server with the repository's normal server build first,
then run `node scripts/unified-browser-fixture.mjs`. This fixture is distinct
from normal startup: it allocates a fresh mkdtemp directory itself and has no
option to open a user-supplied existing database. It explicitly initializes
kernel/identity, creates synthetic fixture-one and fixture-two players plus
a separate fixture-admin owner, clears setup sessions and uses the SAME
normal factory. Public registration remains player, including the first
ordinary signup. It never generates or prints production credentials.

Defaults: loopback 127.0.0.1:4179; allowed browser Origin
http://127.0.0.1:4178. UNIFIED_FIXTURE_PORT and
UNIFIED_FIXTURE_ALLOWED_ORIGINS may override ports/loopback Origins only.
The normal config's explicit local-HTTP allowance requires both listen host
and every origin to be loopback. There is no network-binding fixture switch.

Synthetic player credentials: usernames fixture-one / fixture-two, password
fixture-only-password-42. Login/register use ordinary UI/API; players are not
pre-entered. Real repository card/NPC catalogs supply the canonical world.
Readiness: GET /healthz returns {ok:true,mode:'unified',version,tick}.
There is no test coordinate injection or mutation endpoint. Use the ordinary
UI for movement, entry, map transitions and reconnect. Shutdown closes the
normal server and deletes only its own mkdtemp directory.

## Deployment boundary

deploy/l390 is a candidate using the existing two containers and loopback
web port. The old multiplayer service name is reused but runs the one normal
server. An external existing canonical volume has no default; old fixture
volume/accounts/resources remain untouched. /game terminates the old
multiplayer/prototype redirect and /mp-api is denied.

A successful code build, cookie login, Caddy stub test or synthetic fixture
does not prove legacy identity/progress preservation or authorize live
operations. Required live gates include exact backup/dry-run mapping,
verified admin/recovery, every progress field's preservation contract,
complete native+browser acceptance and owner approval. No live DB, secrets,
migration, account, public exposure, Caddy reload or deploy is part of this
work.

## Main CI → L390 source delivery

Deploy L390 runs only after successful push CI on the same repository's main.
Hosted Ubuntu rechecks the current main SHA, validates real isolated Caddy
routing/Compose contracts and packages exact-SHA image archives. A separate
hosted Windows job parses PowerShell5.1 AST without running deployment. Only
the dedicated Windows/X64/greed-island-l390 runner can load/deploy/test. The
legacy desktop workflow is manual-only. L390_DEPLOY_PATH has no desktop
fallback. No Docker Hub credentials or user-data artifacts are introduced.

The deployer requires actual current Compose/env and unchanged loopback port,
image/archive integrity, existing external volume, read-only identity/EventLog/
FK/active-admin readiness before any stop, and an owner first-cutover receipt
with exact canonical/legacy volumes and mapping/progress preservation digests.
A staged canonical volume must be distinct from the active old-room source.
The local receipt records a completed reviewed import; it is not a migration
command or permission to invent mappings. Import/high-water/admin selection
remain separately reviewed gates.

Backups inherit an already-private local AppData ACL, verified without changing
permissions. Prior code images/config and whole quiesced volumes (including
WAL/SHM/accounts) stay on L390. Bounded rollout probes verify exact SHA/version/
imageIDs, auth/Origin protection and terminating redirects. Rollback restores
images/config only when DB compatibility was proved, then verifies health and
imageIDs. It never automatically restores/deletes a DB or claims unverified
rollback success. Runner enrollment and non-admin Docker access remain setup
gates; no host work was performed in this source candidate.

A native-image smoke runs on a newly allocated temporary DB only and tests
ordinary player signup/entry and autonomous world ticks. It is not a full
production, browser, chat/beacon or legacy-progress acceptance test. Optional
real-deployed functional tests with operator-approved synthetic accounts are a
separate gated deliverable, never automatic account creation in CD.

## Verification for this source slice

Local Node24/Vitest4:20 config tests passed;27 combined config/bootstrap tests
passed using the explicitly supplemental Node SQLite adapter and actual
Express/AuthService/SimulationRuntime. Real fixture subprocess smoke passed
ordinary two-seed login/entry, two HTTP/SSE peers, authoritative movement,
logout peer removal and temporary-DB cleanup. This is not better-sqlite3 or
real-browser/L390 evidence. The native binding attempt failed before6
assertion paths because better-sqlite3.node is absent. Full server TypeScript
is blocked by existing missing bcrypt/JWT modules/types and existing Vitest4
runtimeBudget typing; no authored bootstrap diagnostics were reported.

Seven source deployment contracts pass. Actual two Docker/Compose contracts
skip locally because Docker is unavailable. Workflow YAML parses, Python/Node
syntax and git diff whitespace pass. PowerShell AST/runtime, native Node22
full CI, real Caddy/Compose, full browser and actual L390 acceptance remain
unverified here. The reviewed route-family preservation follow-on is required
before calling the ONE-game implementation feature-complete or main-ready.

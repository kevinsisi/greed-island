# One canonical server: mounted feature acceptance

This source composition has one canonical persistent SQLite connection, EventLog,
SimulationRuntime (including its PlayerWorld service and clock), AuthService and
cookie principal. It shares the exact jobs, combat, settings, player-state, card
store/pipeline and technique projection instances between HTTP and runtime.
The card-system hook subscribes to the existing runtime tick/combat callbacks;
shutdown unsubscribes it and closes world, public, social and combat streams
before stopping the runtime and closing SQLite. No boot card seeding occurs.

## Mount order and trust

1. `/api/world/{snapshot,stream,command}` owns the raw 4 KiB transport limit first.
2. Reviewed GM card-art, settings and simulation adapters authorize against the
   same current cookie role/context before their route-specific bounded parser.
3. The sole identity/auth and admin-recovery routers apply the normal 4 KiB parser.
4. Social, public/operator projections, property/building reads, owned cards,
   techniques, canonical NPC/player and combat adapters follow on `/api`.
5. Public SSE and validated file-backed card-art are managed independently.
   Geography `/api/map` retains its existing session requirement.

Every private GET below requires `X-Greed-Account-Id` as a positive safe-integer
assertion of the displayed account. The cookie alone supplies identity/role.
No cookie is 401, absent/invalid assertion is 400 ACCOUNT_CONTEXT_REQUIRED,
a stale assertion is 409 ACCOUNT_CHANGED and a forbidden current role is 403.
`/api/auth/me` remains the initial context synchronization exception. Private SSE
uses `expectedAccountId` as an assertion, never as authentication. Mutators also
require the exact allowed Origin and revalidate before committing effects.

| Mounted family | Export / shared dependencies | Accepted behavior / actual HTTP regression |
| --- | --- | --- |
| Auth/profile/admin recovery | identity auth/admin routers; same AuthService | Source-reviewed private profile/admin reads, owner recovery, last active admin guard; canonical auth tests retained |
| World/social | PlayerWorld, Social REST/SSE; same runtime/cookie DB | Existing admission, movement/chat/beacon/interior and token-specific stream lifecycle; Social GET messages pure, explicit POST mark-read |
| Public and operator reads | world/publicReadModels; `/admin/world` GM/admin | Explicit field allowlists, no raw facts/private NPC dialogue/credentials; operator null/readiness fields match private AdminWorld client |
| Buildings/areas/ecology | createBuildingsReadRouter, createAreaEcologyRouter; exact runtime/jobs | Public catalog/physical projections; private wallet uses peekWallet and returns null/readiness false without lazy creation |
| Goods/properties | createGoodsRouter, createPropertiesReadRouter; same DB/account view/runtime | Public non-player inventory and reviewed listing DTO; player goods self-only; bindings require own agent/admin context |
| Owned cards/codex/trade | createOwnedCardRouter; same card store/pipeline/jobs | Own private reads, guarded pickup/store/release/materialize/trade; GET since-last-visit pure and POST visit explicit |
| Techniques | createOwnedTechniqueRouter; exact technique projection also injected into combat | Owned catalog/list and guarded local purchase, no wallet seeded on read |
| GM settings/media/simulation | createSettingsRouter, createAdminCardsRouter, createAdminSimRouter; exact settings/runtime/dataDir | Current GM/admin role and account context; private key summaries; validated reversible art; large media after role check |
| NPC/player/combat | createUnifiedNpcRouter, createUnifiedPlayerSurvivalRouter, createUnifiedPlayerCivilizationRouter, createUnifiedCombatRouter | Canonical admission/position/interior/proximity, own history, pure needs GET, explicit reconcile POST, fenced async/queued effects and owned combat streams |

`unifiedMountedFamilies.test.ts` exercises the actual normal factory and mounted
Express HTTP routes, not middleware mocks. It covers all private family absence,
missing context, stale A-view/B-cookie reads, logout revocation, player-vs-GM
roles, self-vs-other goods, pure wallet/card reads, authorized media over 4 KiB,
world raw-body 413, same-Origin/context mutation rejection, real public reads
and explicit unmounted paths. The existing operator producer/client render
contract uses actual typed operator projection fields. These are local source
and supplemental SQL-adapter checks until the pinned native jobs pass.

## Read-only startup gate and explicit fixtures

Before writable open/WAL or any canonical constructor, startup checks staging
activation, identity/recovery schema, complete account-ID high-water authority,
EventLog, FK integrity, an existing active owner admin, and all mounted feature
schema contracts, including the EventLog append-only triggers and partial unique
receipt indices. Missing tables or supported legacy column shapes fail with
UNIFIED_FEATURE_SCHEMA_REVIEW_REQUIRED. There is no startup ALTER/repair/reseed.

`initializeUnifiedFeatureSchema` is an explicitly invoked offline/fixture helper;
it creates no accounts, keys, wallet balances, drops or world progress. Normal
boot never invokes it on the canonical connection. Readiness derives expected
metadata in a disposable memory schema and inspects the 26 canonical kernel/feature tables with SELECT metadata
queries only. Required append-only triggers and literal-preserving receipt-index
predicates are checked; no schema DDL runs on the inspected connection. Synthetic browser/native-image jobs explicitly initialize
only their freshly allocated temporary DB before starting the normal factory.
Existing operator volumes require a reviewed, backed-up offline migration plan.

`OPENCODE_CREDENTIAL_ORIGIN` is optional immutable non-secret startup metadata.
Only an exact HTTP(S) origin without path/credentials is passed to the settings
adapter. Missing/malformed metadata provides no trust. Editable provider URLs
never establish credential trust; mismatched origins receive no global Basic
credential. Compose passes this metadata separately from the editable DB state.

## Remaining integration gates

| Unmounted or bounded feature | Gate / response |
| --- | --- |
| Building employment/work/rest and agent binding writes | Mixed legacy mutation exports are not mounted; actual HTTP is 404 pending canonical location/current-role/commit review |
| Admin NPC statistics/management and lineage | `/admin/npc-stats` and `/admin/lineage` legacy factories not mounted; require separate current-cookie role, privacy and reversible data-action review |
| Chronicle/history, biological-node and settlement route families | `/world/chronicle`, `/world/history-arcs[/:arcType]`, `/world/bio-nodes[/:tileId]`, `/settlements[/:id]` not mounted pending explicit DTO/privacy/ownership review; their public names do not authorize raw EventLog/facts exposure |
| Generic `/world/player-action` | Canonical adapter permits only its reviewed own dismiss/leave and conserved local deposit intents; unsupported actions are rejected explicitly |
| NPC intervention retry | Compose root-reviewed fa4231fc correction a8840fd; receipts preserve original effects or explicit legacy-null effects plus separately labeled current relations; only same-tick identical typed intents are covered |
| Legacy L390 identities/passwords/progress | Staged archival records remain preserved but activation blocked; no silent semantic conversion, auto-admin, new production credentials or source-volume mutation |
| Deployment/publication | Precise owner publication approval, native build/SQLite/combined/browser/Docker-Caddy checks, registered non-admin L390 runner and owner-approved backup/import/admin/progress remain required |

No source test, adapter result or Compose configuration is evidence of an actual
L390 rollout, live progress migration, full feature completion or native SQLite
acceptance. The source functional script remains separately operator-gated and
does not auto-create live test accounts from deployment.

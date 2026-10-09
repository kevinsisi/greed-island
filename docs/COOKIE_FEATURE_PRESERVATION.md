# Cookie feature preservation: bounded Social integration

## Composition and authentication

One `createUnifiedServer` constructs one canonical DB handle, `AuthService`, `SqliteEventStore`, and `SimulationRuntime`. The world router is mounted first at `/api`, before the auth router's 4 KiB parser. Auth, unified administration, and reviewed Social routers receive the same service. The Social repository uses the same DB; its account projection wraps the existing `auth.accounts` repository and exposes no credential/role creation API. The retired `http/server.ts` exports the canonical factory only. `http/auth.ts` is a thin compatibility-name module: no JWT issuance, verifier, bearer exchange, separate startup, owner-email promotion, or second auth router.

The expected account header/query is an assertion, never authentication. All private Social GETs require `X-Greed-Account-Id`; missing/malformed is 400 `ACCOUNT_CONTEXT_REQUIRED`, cookie B with stale A assertion is 409 `ACCOUNT_CHANGED`. Mutations additionally require the configured exact Origin. Current account status/role is read from the cookie session's canonical account on every request. `/auth/me` remains the initial cookie synchronization exception. Public geography does not become private data merely because its current route requires a session.

The `HttpAuthorization` seam offers `reauthorizeMutation(req, allowedRoles?)` for async handlers to call after awaits and immediately before their commit. Initial middleware alone is not proof that an async family is safe to mount. Any former GET that writes state must be separated into a context/Origin-guarded mutation first.

## Mounted acceptance matrix

| Routes | Method/context | Ownership and field policy | Test evidence |
|---|---|---|---|
| `/api/auth/me` | GET cookie, initial-sync exception | Canonical current profile; provider controls request epoch | Bootstrap cookie integration; identity HTTP suite |
| `/api/profile`, `/api/admin/users` | Identity-owned private GET | Expected-ID read guard is a separate identity delta; administration requires current admin | Integration remains dependent on reviewed identity read-context delta |
| `/api/world/{snapshot,stream,command}` | World-owner contract; cookie, Origin + expected actor on commands | Same canonical runtime/EventLog; no raw private NPC dialogue | Bootstrap integration + world-owner tests |
| `/api/map` | Session geography projection | Only region id/name/biome/available/generated and edge from/to/crossing/available | Bootstrap key whitelist test |
| `/api/social/friends`, `/friend-requests`, `/conversations`, `/alliance` | Private GET + expected header | Lists scoped to cookie actor; peer summaries contain only id/displayName, no login/contact aliases; disabled-peer inbox history is preserved with an unavailable summary | Family privacy and mounted integration tests |
| `/api/social/messages/:userId` | Private GET + expected header | Only caller/peer message pair; side-effect free; peer summary id/displayName | Family GET-read/disabled-peer archive regression + mounted DB read_at check |
| `/api/social/messages/:userId/read` | POST Origin + expected header | Marks only messages addressed to cookie actor from that peer | Wrong actor 409; third-party pair remains unread; mounted route test |
| `/api/social/message/:targetUserId` | POST Origin + expected header | Sender cookie-derived, active target required, content bounded by original SocialStore rules | Family CSRF and mounted send/read tests |
| `/api/social/friend-request/:targetUserId`, `/friend-{accept,reject}/:requestId`, `/friends/:friendId` | POST/DELETE Origin + expected header | Sender cookie-derived; response only addressee; removal requires existing friendship | Other account cannot accept (403); original SocialStore ownership predicates retained |
| `/api/social/alliance/create`, `/alliance/invite/:userId`, `/alliance/leave` | POST Origin + expected header | Membership actor cookie-derived; invite only existing alliance leader; active target | Leader/member target checks and every-route anonymous/stale/revoked regression |
| `/api/social/presence` | POST Origin + expected header | Compatibility acknowledgement only; ignores body actor/tile/coordinates; no mutable location rows written | Forged-body and mounted real-runtime projection tests |
| `/api/social/nearby` | Private GET + expected header | Actual admitted accounts in actor's current canonical tile; optional tile is a matching view assertion | Remote-tile 409; no unadmitted actors; peer alias omission; mounted runtime test |
| `/api/social/stream?expectedAccountId=...` | GET cookie + required numeric query assertion | Per-cookie token/initial role pinned; bus target checked; bearer/access_token never authenticate | Missing/invalid/stale assertion; isolated owner hints; same-account second session survives first logout |

Social presence coordinates are canonical exterior grid coordinates: x=subCol, y=subRow, z=0 from `runtime.getPlayerWorldGridPose`. They are not the former 600×400 or hub-canvas client coordinates. Rendering conversion belongs to the client. Social heartbeat never admits a player; only an actual admitted world connection makes an actor online. Existing legacy location tables remain archival data, not a new movement authority.

A stream sends terminal `session.invalidated` with `{error:"UNAUTHORIZED"}` and closes on its token revocation, account/role/status replacement, or expiry. It revalidates before each private hint and heartbeat. Logout revokes only that token; another valid token for the same account continues. A slow client is disconnected on `write(false)`; server close releases subscriptions/timers idempotently.

## Explicit unmounted integration gates

This slice is not a claim that all prior game features are delivered. Remaining families are unavailable in the active factory and Caddy whitelist until each privacy/ownership/spatial/commit review passes. They must be restored, not permanently discarded.

| Family/source | Required preservation review before mounting |
|---|---|
| `world.ts`, `sse.ts`, history/chronicle/dashboard | DTO whitelist for public world/narrative; type-filtered summaries rather than raw EventLog; actor-private data excluded; real dashboard wallet/codex; bounded stream lifecycle |
| `npc.ts` | Public display projection versus private mind/plans/history; self-only dialogue history; exterior/indoor policy; cookie-derived runtime actor pose; reauthorization after AI awaits |
| `buildingsRouter`, settlements, ecology, goods | Public catalog/projection field review; owned wallet/jobs/trade targets; canonical region/building proximity; no body actor/location authority |
| `cardWorldRouter`, technique shop | Owned codex/held cards/drop/trade/target predicates; canonical actor pose; replace since-last-visit GET write with explicit visit mutation; commit revalidation |
| `combatRouter`, properties | Canonical actor/NPC proximity and indoor policy; ownership/role of commands and targets; per-commit revalidation |
| `livingWorldRouter`, player civilization/survival | Command-type and target whitelist; canonical account/location; remove GET seed/reconcile/last_seen side effects or make explicit mutations; no request-supplied actor |
| settings, admin NPC/card-art/simulation/lineage | Current GM/admin role; no provider-key values ever returned; bounded input/upload, exact resource role policy; per-commit revalidation |
| old `profileRouter`, `adminRouter` | Never mount second profile/credential/recovery implementation; unified identity-owned routers are the sole active routes |
| archived MP beacon/supplies/rewards/progress | Exact source events/projection archival preservation and owner-reviewed identity links; canonical port is a separate world delta; no fake zeros, currency conversion, or live import at startup |

## AuthConfig migration coverage

`AuthConfig` now aliases injected `HttpAuthorization` in all 18 production consumers: adminCardsRouter, adminLineageRouter, adminNpcsRouter, adminRouter, adminSimRouter, buildingsRouter, cardWorldRouter, combatRouter, livingWorldRouter, npc, playerCivilizationRouter, playerSurvivalRouter, profileRouter, propertiesRouter, settingsRouter, social, techniqueShopRouter, world. This changes their authentication middleware to the same cookie/Origin/context seam, but does not mount them or satisfy their separate feature/privacy review.

Eight existing JWT test files are converted: adminNpcsRouter, buildingsRouter, npc, npcDeceasedGate, npcMindSheet, playerCivilizationRouter, playerSurvivalRouter, social. The first seven use an explicitly named synthetic test helper: supported old-schema fixture migration is explicit/lazy, then synthetic sessions are inserted in the same ephemeral DB, with Origin and expected-ID headers. No JWT library is used by server source or tests. Social tests use real canonical registration and repository projections.

Local supplemental Node24 SQLite-adapter suites: 13 files / 90 tests pass, covering the mounted bootstrap, auth/config, and these route tests. Every one of the 16 mounted Social REST routes is exercised anonymously, with stale A→B context, and after revocation. Four Social SSE tests cover query/cookie guards, per-token invalidation, role/status/expiry, and bounded slow-client cleanup. The adapter is not native better-sqlite3 evidence. The local bcrypt fixture-only alias creates a valid-format seed hash and throws on credential verification; no bcrypt compatibility result is claimed. Full server TypeScript has no diagnostics in authored changes; baseline missing bcryptjs declarations and runtimeBudget.test's Vitest4 implicit-any remain local environment limitations. Exact Node22/native CI, mounted browser tests, Docker/Caddy, and L390 tests remain separate gates.

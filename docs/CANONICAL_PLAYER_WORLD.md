# Canonical player-world integration candidate

This branch-only candidate places player positions into the existing SimulationRuntime and SqliteEventStore. It does not open room.sqlite, load accounts.json, create credentials, import fixtures, alter stored account progress, wire startup routes, or deploy. The identity repository, sessions, and world service must receive the same existing canonical database through the composition root.

## Transport binding

The agreed adapter endpoints are GET `/api/world/snapshot`, GET `/api/world/stream`, and POST `/api/world/command`; SSE event name is `snapshot`. This candidate implements the runtime facade and a managed HTTP/SSE adapter. The root factory/startup and disposable unified fixture are owned separately.

- AuthService.resolve must succeed before a snapshot or stream. Revalidate expiry/revocation before every SSE send, not only at connection time.
- AuthService.requireMutation must succeed before command submission. Require the X-Greed-Account-Id positive safe numeric expected-account assertion on world commands; compare it to the cookie principal before enqueue and again at flush. The assertion never selects the actor. Mismatch is409 ACCOUNT_CHANGED and missing/invalid is400 ACCOUNT_CONTEXT_REQUIRED. Do not accept client AccountIds in the intent body, movement steps, coordinates, origin overrides, or gameplay state.
- Call `runtime.submitPlayerWorldCommand(principal.accountId, body)` for actual HTTP commands. It queues intents into the next shared 100ms movement transaction and returns a Promise for the committed ACK. Do not use the synchronous test facade in ordinary HTTP handlers, because it forfeits actual cross-player batching.
- Use `runtime.subscribePlayerWorld(principal.accountId, snapshotListener)`. Unsubscribe on close, expiry, revocation, backpressure termination, and all setup failures. Each subscription owns one connection token; multiple tabs count as one online account. Unsubscribing changes presence only, never the persisted position.
- The HTTP adapter handles AuthService.onRevoked by re-resolving each individual stream token and closing only invalid sessions. Do not blindly call broad account disconnection on logout: a second valid session must remain online. Per-command guard closures revalidate tokens at the actual queued commit and reject only invalid sessions' intents. A valid 12-hour cookie alone never marks the account online.
- Start and stop the canonical SimulationRuntime normally; its own start/stop lifecycle owns the one player movement cadence. `advancePlayerMovementStep()` is a deterministic test driver, not a public endpoint.
- Clients should enter only on `WORLD_ENTRY_REQUIRED`, with `{commandId,type:'enter',payload:{}}`. A simultaneous tab may receive `ALREADY_IN_WORLD` and should reread the existing snapshot. Network errors and unauthorized responses must not trigger a spawn.

## Snapshot v1 and ACK

The snapshot is a distinct canonical contract, not an old RoomSnapshot with fake resource fields. The TypeScript authority is `packages/server/src/playerWorld/snapshot.ts` and `types.ts`.

Top-level: `version:1`, `worldId:'canonical-world'`, numeric `selfId`, `tileId`, global EventLog `revision`, connection-only `presenceRevision`, canonical `worldTick`, and server-owned `movementStep`.

`players` contains self and online players in the same region, each with numeric `accountId`, `tileId`, `x/z`, last accepted `movementStep`, position event `sequence`, and real connection-derived `online`. Optional public `displayName` comes from a read-only resolver attached to the SAME AccountRepository, cached once per account per cadence and never persisted as duplicate identity truth. Render it as text; fall back to an account label when absent. Offline or other-region actors are not local avatars. `map.regionOnlineCounts` comes from online account positions, not cookies, fixture rosters, or fake players.

`npcs` contains the canonical runtime's living outdoor non-traveling NPCs in the same region. It exposes safe names/colors, canonical `subCol/subRow/subZ`, activity, location, and a read-only `presentationPosition`. Deceased, indoor, and traveling NPCs are excluded. NPC simulation continues with the existing world clock while players are offline.

`geometry` exposes canonical tile ID, presentation kind, bounds, player radius, move-per-step, obstacles, spawn, and server-defined portal/arrival points. `map` exposes all known region definitions with availability/generation/geometry-support flags, canonical available adjacency, and edges with real land/water-crossing type and availability. Locked or ungenerated endpoints never become traversable just because an adjacency definition mentions them.

ACK: `{accepted:true,commandId,revision,duplicate?:true}`. Duplicate retries return the original position event's revision. SSE publishes at most once per 100ms cadence; global sequence revisions may skip because other actors and canonical world events also commit. Do not require consecutive revisions or ACK equality with a later snapshot. Presence-only updates may have equal EventLog revision and newer presenceRevision/movementStep.

## Units, geometry, and movement

- `t_dock` preserves the existing multiplayer harbor rectangle, two obstacle rectangles, radius 0.35, and move distance 0.4 per server sub-step. It is the presentation of the canonical dock tile, not a separate room/world.
- All other supported regions, including `t_central`, use the canonical area-grid geometry: `x = subCol`, `z = subRow`, one unit per existing cell. Dimensions and terrain masks come from server NpcEngine; buildings use real catalog placement cells with conservative 0.8-cell footprints. Pixel sprite sizes are not physical dimensions. The six land-region masks come from NpcEngine; Temple/Salt Marsh water masks are exact promotions of existing terrainMask.ts literals, with AST-based source parity tests. Full authored 3D scenery and dynamic construction collision/blocked-player resolution remain pending.
- The dock portal `(0,16)` and central portal `(7,9)` are server-owned endpoints of the existing `t_dock ↔ t_central` water-crossing edge. A transition requires proximity to the endpoint, available adjacency, supported destination geometry, and walkable arrival. It is an explicit region crossing; no boat/travel-duration mechanic is fabricated.
- Harbor NPC rendering maps the 15×10 canonical NPC grid across the usable harbor bounds. These display coordinates do not authorize NPC interaction proximity. Existing spatial interactions require a separately reviewed canonical player-position-to-sub-grid contract; old client social/presence coordinates must not be gameplay authority.
- Coverage is 8/8 base regions plus 1 Salt Marsh geometry. Salt Marsh remains unavailable until canonical unlock events allow the region/edge; its expansion buildings enter collision only when their canonical building IDs are unlocked. All known supported graph edges have reciprocal markers selected from the real walkable component, with walkable arrivals and reachable-marker invariants. The preserved dock↔central markers remain exact. Three known generated frontiers lack authored terrain and fail closed: t_frontier_badlands, t_frontier_highland, t_frontier_cove. This is not a claim that every gameplay feature or authored 3D scene is complete.

The server sub-clock is a monotonically increasing integer advanced by the canonical runtime's 100ms timer; wall time only schedules callbacks and supplies event audit metadata. Rule evaluation uses the sub-step, canonical world tick, validated intent, geometry, and committed projection. At most one movement/transition per account per sub-step is accepted. It is restored above the highest persisted movement step on restart.

Every accepted move, including an unchanged collision result, and every crossing immediately becomes a typed canonical event. No five-second checkpoint is introduced. The actual queued facade compiles all valid pending players together and appends in one transaction. Invalid queued members reject independently; any database transaction failure rolls back the entire accepted group. Projection, ACK resolution, and snapshot notification happen only after commit.

Snapshot publication is coalesced; all accepted step facts remain durable. Snapshot construction iterates online accounts rather than every historical offline player, shares one snapshot per account's tabs within a cadence, and does not invalidate unchanged expensive NPC snapshots on position-only commits. High-frequency position events are kept out of unrelated NPC store fanout and narrative SSE, while remaining in the EventLog.

The existing impulse/single-flight client remains subject to network RTT. This candidate does not claim a latency or production-capacity fix.

## Existing progress and cutover boundary

No supplies, rewards, gold, quest progress, or beacon fields are synthesized into this snapshot. Existing canonical account/player tables are not rewritten. Legacy fixture resources/progress and standalone prototype saves require an explicit exact-preservation import contract; they are not equivalent to canonical currency or quests and must not be silently mapped or discarded. A complete production cutover remains blocked on that contract, backup/review, remaining region/gameplay integration, and end-to-end acceptance. Nothing here authorizes a live migration or deploy.

## Verification

Local supplemental environment: Node v24.19.0, reused Vitest v4.1.1. Seven focused pure/protocol suites pass: 126 tests covering new strict intents/rules/event projection/service event fixtures plus existing mapGraph/NpcEngine regressions. Real Express HTTP/SSE tests cover401/409 distinction, Origin/forgery rejection, queued session revalidation, initial snapshot, two-tab presence, individual logout/idle expiry, setup/shutdown cleanup, payload/stream limits, and large valid snapshot drain behavior, stale-tab account-switch assertions, all supported region spawns/reciprocal crossings, and exact authored water-mask source parity; they use a pure event fixture, not native SQLite. The service fixture is explicitly in-memory unit evidence, not a SQLite adapter.

Full local TypeScript currently reports existing missing bcryptjs/jsonwebtoken modules/types and an existing Vitest-4 runtimeBudget test typing issue. There are no diagnostic errors in the new or modified authored files. This is not a full server build pass.

Actual better-sqlite3 service tests are written for file reopen, per-step persistence, water crossing, existing-progress preservation, rollback after insertion, concurrent queued retries, indexed receipt/latest-position reads, and a two-player 200-movement-event/100-transaction workload with snapshot fanout metrics. Real SimulationRuntime tests cover small/large boot hydration, bypass rejection, autonomous NPC/world snapshot invalidation, and exclusion of movement from narrative spam. They require the repository's real native SQLite dependency and must pass Node22 feature CI; they have not passed locally because the native binding is missing. The attempted existing living-world native suite likewise fails at that binding, before rule assertions.

`node scripts/player-world-sql-supplement.mjs` is explicitly supplemental SQL-only evidence. It uses Node24 node:sqlite, the repository schema, file-backed WAL/FULL, 200 synthetic rows in 100 two-row transactions, checks unique actor/command receipts, atomic rollback, append-only triggers, latest-per-actor query, and file reopen. The local sample was 4.61ms, about 43,430 rows/s and 21,715 transactions/s, database 188,416 bytes. These are small ephemeral SQL measurements, not better-sqlite3, runtime, HTTP/SSE, latency, or production-capacity evidence. Real service fanout/rate metrics must come from the native CI benchmark.

No browser acceptance, 50-client live load, secrets, live database, migration, release, or deployment was performed in this candidate.

HTTP/SSE bounds: four streams per account, 200 total streams, maximum 128 KiB snapshot frame, one newest pending snapshot while a socket drains, and a five-second drain deadline. Idle session validity is checked at every send and at a five-second heartbeat. Slow clients do not accumulate an unbounded event queue.

High-frequency position facts are excluded before LIMIT in existing civilization evidence, NPC cooldown history, and restart narrative windows, preserving autonomous world behavior without weakening raw EventLog durability. The world route also enforces its 4 KiB body bound when a broader parent parser has already run; composition should still mount it before broad parsers.

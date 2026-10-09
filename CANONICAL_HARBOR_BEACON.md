# Original harbor beacon in the canonical world

This additive source candidate composes frozen spatial read facades, private staging/exact-schema fixes and peer-chat SSE verification. Its local dependency base is `416ded4602615fcd7dda4131b6a8ad544dd5545a`; frozen foundational patches remain unchanged. No auth/startup/deploy file is owned by this delta.

## One public contract

- Intent: `{commandId,type:'contribute',payload:{}}` through the existing authenticated `/api/world/command`, cookie principal, required expected-account assertion, Origin, bounded queue and commit-time session/admission revalidation. Body coordinates/account IDs/resources are forbidden. ACK format is unchanged.
- Required snapshot `beacon`: `id`, `tileId:'t_dock'`, `x:0`, `z:6`, `radius:2.5`, `required`, `participationWindowTicks`, `tick`, `tickMs:100`, `closesAtTick`, numeric `contributors`, numeric `awardedAccountIds`, `completed`, `phase` (`gathering|collecting|completed`). Countdown is `(closesAtTick-tick)*tickMs`; NPC `worldTick` is not the countdown clock.
- Required self and same-tile peer `harborProgress`: `{status:'ready',supplies,rewards}` or `{status:'legacy-review-required',supplies:null,rewards:null}`. These are the original harbor counters, not wallet/items/quests. Public peer counters retain the old public roster scope. No private identity fields are exposed.
- Unresolved legacy provenance returns409 `LEGACY_HARBOR_PROGRESS_REVIEW_REQUIRED` and never receives fictional zero/new-player values. Wrong region/radius returns original `OUT_OF_RANGE`; duplicate contribution/completed event returns original `ALREADY_CONTRIBUTED`; original `NO_SUPPLIES`/cutoff rules remain.

`Runtime.attachPlayerWorldHarborProgressPolicy(createHarborProgressPolicy(sameCanonicalDb))` is the read-only account boundary. Existing accounts without imported provenance use original new-player join semantics (one supply, zero rewards). Any imported provenance remains unresolved until an explicit typed reviewed progress fact exists. No username/display name implies identity or owner privilege. Policy reads for public snapshots are cached once/account/cadence, avoiding N×N database reads; mutation classification is re-read at commit.

## Exact rule reuse, one timer/transaction

`HarborBeaconProjection` holds only beacon/progress facts. It does not persist a second position/presence/room state. For evaluation, a temporary adapter view uses the SAME canonical durable player positions, numeric actors and recorded counters, and invokes the original `multiplayer/domain.ts` contribution and system-tick rules directly. No RoomRuntime, accounts.json store, second EventStore or timer is constructed.

The existing100ms player-world cadence advances a meaningful active collection counter by one and batches its typed tick/completion/reward facts with that sub-step's queued player commands in the SAME SQLite transaction. System cutoff/completion happens before those player commands, preserving deadline behavior. Idle gathering/completed clock ticks do not create redundant beacon facts; canonical movement/chat continue using the existing world sub-clock. Active remaining-window count resumes exactly after restart, rather than treating offline wall time as gameplay time. Original two-participant/300-step window, late participation, one supply spent, one reward per contributor, and no reset/refill/repeat claim are preserved. Distinct contributors retain the original1000 recorded-participant upper bound; this bounds completion/reward auxiliaries independently of the50 concurrent-account admission cap.

Typed events:

- `PLAYER_HARBOR_CONTRIBUTED` is the sole player receipt event. Its account, prior/next quantities, client command ID and digest are server-derived.
- `HARBOR_BEACON_COLLECTION_OPENED`, `HARBOR_BEACON_TICKED`, `HARBOR_BEACON_COMPLETED`, `HARBOR_BEACON_REWARDED` are separate system auxiliary facts with their own stable command identities. One accepted contribution may therefore commit two facts without colliding with the per-player receipt index or creating a fake movement event.
- `HARBOR_BEACON_LEGACY_PROGRESS_RESTORED` is explicit reviewed staging only. All typed beacon commands are blocked from the generic runtime command facade; ordinary clients can only use the contribute intent.

Projection/ACK/broadcast happen after transaction commit. Failed writes leave quantities, cutoff, rewards and receipt truth unchanged. SSE publication remains coalesced to one per existing cadence/account. Rewards persist for legitimate offline contributors without granting cookie-only presence. Direct trusted execute/test calls cannot advance collection time outside the existing timer.

## Source-preserving staged association

`migration.stageReviewedLegacyHarborProgress` is source/synthetic-only, with purpose `synthetic-reviewed-harbor-association`. It requires the existing reviewed private stage, re-verifies exact archived source bytes/events/ID provenance/username aliases through the staging verifier, and takes its numeric mappings from the verified stored associations. It never selects actors by names or trusts a changed input mapping.

It preserves source positions as typed canonical entry facts only if no conflicting canonical position exists, then preserves exact supplies/rewards/config/contributions/cutoff/completion/awarded IDs as one typed progress restoration. Original source tick remains progress data, not canonical NPC time. Unmapped source actors, alias drift, canonical position or existing-progress conflict require manual review, never overwrites. Repeated verified association does not reset later progress/positions or duplicate facts. All restoration writes roll back together.

Account hashes/roles/status and the owner selection gate are untouched. Imported accounts stay disabled/player; `assertLegacyWorldStageActivationReady` still blocks normal startup. This helper creates no admin, enables no login, changes no volume and performs no live read or activation. Actual owner/privilege/readiness activation needs separate review. Historical raw public chat remains privately archived; this delta does not publish/import it, and no private NPC dialogue enters the world channel.

## Verification

Local Node24/Vitest4:109 tests across12 suites pass, including9 beacon tests,16 actual HTTP/SSE protocol tests, existing movement/chat/capacity/map/geometry/identity-preservation history/schema checks. Beacon tests compare original-domain contribution/open/cutoff/completion/reward behavior at every one of300 collection steps, late participant, dock/radius, unresolved legacy progress, policy cache bound, one transaction/publication, receipt idempotency, restart/offline reward and rollback. Authored files have no tsc diagnostics; full tsc remains blocked by existing missing dependencies/types in the scoped source environment.

Five new native better-sqlite3 tests are authored for durable file reopen/300 ticks/offline one-time reward, rollback+retry, exact source progress/position association while accounts remain disabled, alias/mapping drift/rollback and conflicting canonical position. Native binding is unavailable locally; exact Node22 hosted native and combined browser CI remain required. No compatibility shim or production load is used.

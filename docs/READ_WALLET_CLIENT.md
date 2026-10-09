# Nullable wallet and reviewed read-model client compatibility

Local source-only delta on beacon 103803 plus preservation 8512 and all four reviewed correction deltas. No publisher pacing delta is included and no shared source upload/push/live action occurs.

## Verified contracts and behavior

- Property-read patch c0f60dcf5763e786b81cb13a6176b341ee1323d963119868ee71f3a259b9abe1 returns wallet:null/walletInitialized:false without creating a row. Existing wallet gold/energy/updatedAt and own jobs remain actual stored data. The client validates this discriminated envelope and numeric owner, never substitutes 0/100 or initializes a wallet.
- GameShell and BuildingPage show loading, uninitialized or unavailable status explicitly; actual ready balance and energy render exactly. Technique-count read failure no longer hides a valid wallet. Reads are single-flight, bounded at 6 seconds and bound to the view's session epoch; old responses after logout/replacement/same-account re-login/unmount cannot restore the balance.
- Existing food-purchase buttons use the same wallet read and are disabled unless its actual balance covers 10 gold. Unknown/unavailable/insufficient state cannot invoke those handlers. Work/rest stay command-owned and their existing semantics are preserved; no new wallet initialization path is inferred. Technique purchase has no current UI caller; server 8da0aff requires an existing wallet and returns WALLET_REQUIRED rather than seeding one.
- Owned-card 8da0aff GET active/held responses have required energy:number|null and walletInitialized:boolean. The client validates readiness and retains exact nulls. Explicit null/absent perceivedSecondsLeft displays unavailable; it never substitutes rawSecondsLeft or derives a fabricated deadline timer. Real server perceived seconds retain existing visual smoothing. Pickup/store/release have no wallet debit and remain available according to their existing server rules.
- Private admin-target GET now includes the displayed administrator's X-Greed-Account-Id, matching identity delta e2fbfa1. This header is an assertion against the cookie, never authentication.

## Read-catalog allowlist audit

Startup worker confirmed exact dashboard names: cardsOwned:number|null, cardsOwnedReady:boolean, ticksSinceLastVisit:number|null, wallet:ownWallet|null, walletInitialized:boolean, accountContext:number|null. ServerDashboard now represents these fields; the sole WorldStateProvider preserves them without null→0 casts. No live rendered dashboard consumer currently assumes these values.

Two concrete safe-field issues were sent to the public-read owner: existing /cards decoration must preserve only validated file-backed imageUrl, and construction projects must preserve actual known builderNpcIds. The client construction mapper now retains that allowlisted crew. The world technology read omitted evidenceEventIds, while the original Hub summarized its length and would crash. Startup will expose only actual evidenceCount, with raw IDs omitted. UI accepts this public count, or explicitly reports unavailable evidence; private rationale remains optional with no fabricated text.

Optional cognitive/intent/life/AI-utterance NPC fields are already conditionally projected. The safe required display/physical/greet fields and explicitly redacted internalState:{} remain compatible. No private cognitive fields were requested as a fallback.

GET cards/since-last-visit is now pure and explicit POST cards/visit is a separate acknowledged mutation. Its existing frontend caller is the inactive SinceLastVisitPanel; current Hub uses WhenYouWereGone/worldSinceLastVisit. No hidden acknowledgement was added to reads in this delta.

## Verification and composition

- Cached frontend suite: 55 files/483 tests passed, including 14 new nullable wallet, epoch/lifecycle/timeout, owned-card perception/readiness, construction crew and public technology render regressions. Existing admin test also asserts its private GET header.
- Strict affected TypeScript and whitespace checks pass. Full app check remains blocked by missing Babylon/Phaser/Leaflet declarations and renderer cascades; exact pinned build/browser/native CI remains required.
- All four prior correction patches and beacon patch reverse-check intact against this source. Uncommitted tooling is excluded.
- Publisher pacing delta changes multiplayer3d/client.ts/client.test.ts/moveIntentQueue.ts/moveIntentQueue.test.ts. This read-model delta has only the private admin GET header/assertion hunk in the first two files. Compose it by hunk with beacon/pacing/epoch guards intact, never by whole-file replacement. Rerun 483 frontend regressions plus publisher low-RAF queue tests and normal UI browser acceptance after composition.

Public-read safe art/evidence/crew changes are coordinated contracts, not a claim that those server bytes are frozen or mounted. Backend family mounts and browser feature preservation remain acceptance gates.

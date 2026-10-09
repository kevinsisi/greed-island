# Reviewed building, ecology, goods and property reads

Base: frozen commit `01e44ef10e07ce6408f9c9f19be938d2320ccf99`.

## Factory contract

The unified startup may mount only these factories at `/api` using its existing canonical DB, `SimulationRuntime`, attached `PlayerJobsStore`, `CanonicalAccountView`, and injected `HttpAuthorization`:

- `createBuildingsReadRouter({ runtime, jobs, authConfig })`
- `createAreaEcologyRouter({ runtime })`
- `createGoodsRouter({ runtime, authConfig })`
- `createPropertiesReadRouter({ db, accounts, runtime, authConfig })`

No factory constructs a second identity service, credentials store, jobs store, runtime or EventLog. The property factory creates the existing bindings schema at composition time only. The mixed legacy `createBuildingsRouter` and `createPropertiesRouter` exports remain available for the separate mutation review and must not be mounted by this slice. Building apply/quit/work/rest and property binding POST/DELETE are absent from the reviewed factories; existing mutator handlers are preserved unchanged.

## Access and target policy

Public GETs retain their original anonymous availability: `/buildings`, `/buildings/:id`, `/buildings-catalog`, `/areas`, `/areas/:tileId`, `/area/:tileId/ecology`, `/goods/market-prices`, NPC/building/settlement `/goods/inventory/:ownerId`, and `/properties`.

Private reads use the sole canonical cookie and required `X-Greed-Account-Id` assertion. Bearer headers and query access tokens never authenticate. Missing assertions return 400; stale A assertion with cookie B returns 409; revoked/disabled sessions return 401. Read Origin/cross-site policy is enforced by the same injected authorization seam.

- `/wallet`: reads only the cookie account's wallet and jobs. An absent row is `wallet: null, walletInitialized: false`; no seed, fake balance, currency conversion or write occurs. Existing wallets retain their actual gold/energy/updatedAt and return `walletInitialized: true`. Initialization belongs to a separately reviewed entry/command path.
- `/properties/bindings`: current canonical agent/admin role; SELECT scoped to cookie account. Query/body account IDs never select another owner's bindings.
- `/goods/inventory/self`: only `holderType: player` rows with holder ID equal to the canonical cookie account.
- Numeric `/goods/inventory/:ownerId`: compatibility assertion of that same account, never inventory authority. Another number, `0`, or leading-zero mismatch returns 403 after cookie/context validation. The nonnumeric public branch filters to the explicit NPC/building/settlement holder-type allowlist, including when a player row has a colliding holder ID.

`PlayerJobsStore.peekWallet` is SELECT-only. `AmbientNarrator.peek` reads and copies an already generated cache entry; it does not register a visitor, schedule AI, update cache, write a world fact or invoke a provider. Area ambient returns the existing cache or explicit null. Autonomous background narration remains unchanged.

## DTO allowlists

No route returns an account login/contact alias, password hash, provider key/error, raw NPC mind/plan/dialogue, or arbitrary runtime/projection field.

- Building definition: id, tileId, nameZh, nameEn, descriptionZh, type; placement col/row/glyph/size; interior cols/rows/backgroundColor and prop col/row/glyph/size/label; ownerNpcId; hiring shift/capacity/wage/taskZh; enterable, restorative, tags, livestockCapacity; reviewed state/health/constructionProgress extensions.
- Building occupant: npcId, shift, isOwner, public nameZh/activity and committed productive-action domain/narration. No runtime-state spread.
- In-progress construction: projectId, kind, targetTileId, buildingId, progress, targetProgress, startedAtTick, completedAtTick, initiatedByNpcId, builderNpcIds.
- Wallet: cookie accountId, gold, energy, updatedAt. Jobs: cookie accountId, buildingId, shift, hiredAtTick, totalEarnings, shiftsCompleted, lastShiftTick. Envelope: walletInitialized, currentTick, currentShift.
- Area: tileId; only the four known factionControl entries; dominantFaction; resources food/safety/economy; lastUpdatedTick; local event tick/kind/narration, and detail faction/resource/value only. Internal pressure cooldowns are omitted.
- Ambient: tileId, text, source, generatedAtTick, generatedAt. aiError and provider metadata are omitted.
- Ecology: tileId; animal speciesId/tileId/biomeRegion/count/animalIds/intent/thoughtZh; fishery tileId/density/harvestedTotal/collapsed/lastUpdatedTick; migration waveId/speciesId/fromTileId/toTileId/migrationType/startedAtTick/count; predator species/tile/lastKillAtTick; plant speciesId/density/capacity/saturationPct/state/thoughtZh. Ecology thoughtZh is the existing deterministic species display text, not private NPC mind state.
- Goods inventory: goodsId, quantity, nameZh, unit. Market: marketId, settlementId, goodsId, nameZh, supplyQuantity, demandQuantity, priceGold.
- Property listing: id/title/price/address/lat/lng/rooms/hall/bath/sizePing/buildingType/floor/age/photoUrls/agentName/agentContact. Agent contact is the upstream public listing's business contact, never an account alias. Binding: own accountId, npcId, public npcName, boundAt.

Property upstream requests forward only existing browser filters region/type/rooms/priceMin/priceMax/sizeMin/sizeMax/ageMax and bounded page/limit. Cookies, auth headers, account selectors and unknown query keys are never forwarded. The server-configured upstream destination is unchanged. HTTP failures/timeout/malformed envelopes report 503, not fabricated successful listings. Timers are cleared on every terminal branch.

## Verification scope

Six focused files / 30 tests pass locally through the clearly supplemental Node24 `node:sqlite` adapter and fixture-only bcrypt alias. Coverage includes all private guards, target scoping, dynamic roles/disabled accounts, public deep canaries, unchanged original building/ecology/goods regressions, no-seed wallet reads, no-AI ambient peek, public upstream filter/DTO/error handling, and absence of mutator registrations. The adapter is not native `better-sqlite3` evidence and the bcrypt fixture alias does not verify credentials.

Full server TypeScript has no authored-file diagnostics. The local baseline still has three missing bcryptjs-module diagnostics and the existing runtimeBudget.test Vitest4 implicit-any diagnostic. Native Node22/better-sqlite3 CI, combined-factory/Caddy acceptance, browser nullable-wallet handling and L390 validation remain separate gates. This candidate does not edit bootstrap, unifiedServer, Caddy, publish, merge or deploy.

# Owned-card preservation adapter

## Source inventory and ownership

Baseline: greed-cookie-feature-adapters commit 01e44ef10e07ce6408f9c9f19be938d2320ccf99.
This candidate owns only cardWorldRouter.ts, bounded deadline guards in cardWorldStore.ts, techniqueShopRouter.ts, the new transaction/hook adapters and their tests. It does not mount the retired broad HTTP factory or construct another account, simulation or room authority. PlayerJobsStore.peekWallet is a separately supplied read-only dependency from the property-read candidate.

Preserved exact routes under /api:

- Public GET /cards/config
- Private GET /cards/active?tileId=, /cards/held, /cards/since-last-visit, /codex, /trade/list
- Player POST /cards/pickup, /cards/store, /cards/release, /codex/materialize
- Player POST /trade/propose, /trade/accept/:tradeId, /trade/reject/:tradeId, /trade/cancel/:tradeId
- Private GET /shop/techniques (catalog plus actor-owned counts), /me/techniques
- Player POST /shop/techniques/:id/buy
- Explicit new POST /cards/visit acknowledges the summary. GET /cards/since-last-visit is now side-effect free.

The public card catalog is owned by startup preservation. Technique catalog-with-owned-count remains private, as the old route was. Goods/world/property reads and the wallet read route are owned by the property-read candidate. Building/job/currency earning commands, combat entry/action routers, spell/card-use commands and unrelated owned-goods actions are outside this bounded adapter.

## Mount contract

Use createOwnedCardRouter from http/cardWorldRouter.ts with {db,store,pipeline,runtime,accounts,jobs,authConfig}.
Use createOwnedTechniqueRouter from http/techniqueShopRouter.ts with {db,jobs,runtime,authConfig}.
Use attachOwnedCardWorld from http/ownedCardWorldHooks.ts with {db,store,pipeline,runtime,accounts}; retain the returned idempotent cleanup in server shutdown.

All DB/stores/projections must reference the same already-open canonical DB. accounts is CanonicalAccountView wrapping the same AuthService repository. authConfig is the shared HttpAuthorization instance. runtime is the existing canonical SimulationRuntime. jobs is the same PlayerJobsStore attached to that runtime, including the property candidate's pure peekWallet facade. The card store and action pipeline are created once by the composition root from that same DB/catalog.

The hook subscribes only to the existing runtime tick and combat-resolved sources, creates no timer and performs no startup seed. Normal future ticks continue deterministic spawn/expiry rules. Durable same-DB tick/combat receipts prevent duplicate effects when replayed/re-attached. Cleanup prevents duplicate listeners.

## Security and state guarantees

All private reads require a live canonical cookie and X-Greed-Account-Id. Mutators additionally require exact allowed Origin and reauthorize at the encompassing SQLite commit. Bearer-only auth, a prefilled req.auth, body actor IDs, body coordinates and SocialStore presence are never authorities.

Gameplay actions require an admitted canonical world connection and the canonical grid-pose facade. Pickup uses the existing 1.4-cell radius and the authored 600 x 400 canvas's 40px cells, with a half-cell centre offset. Technique purchase requires the canonical admitted t_temple region, retaining the original regional purchase rule.

Private active-drop reads include available drops plus only the caller's held drops. Reads filter elapsed deadlines without writing expiry state. The bounded store guards reject pickup/store/release after the real deadline even before a tick callback has reconciled state. Trade ownership and atomic swap rules remain in the existing pipeline/store.

Card action projection and audit log, technique wallet debit and owned row, visit tick, and optional retry receipt are enclosed in one same-DB SQLite transaction. Failure rolls back all writes. Idempotency-Key is optional for compatibility; stable keys of 1-80 letters/digits/._:- replay the exact successful response for the same account and normalized intent. Reusing a key for another intent is 409 IDEMPOTENCY_CONFLICT. Clients without a key retain ordinary one-action-per-request semantics.

No GET initializes a wallet or substitutes a fabricated balance/energy. Card reads return energy:null and walletInitialized:false when no wallet exists. Their perceived timer is null while raw server deadline remains available. Technique purchase returns 409 WALLET_REQUIRED for an absent wallet.

Only new combat loot is converted from combatLootPosition's documented subcell result to existing canvas-pixel coordinates. Saved drops/codex/trades/wallets are not rewritten. Victory chance/pool/cap and defeat deterministic selection remain the existing rules.

## Verification

- 29 focused tests across 6 files passed using a supplemental node:sqlite adapter and a fixture-only bcrypt import alias that throws if verification is attempted. This covers actual canonical scrypt registrations/sessions, Origin/context enforcement, private reads/no seeds, spoofed actors/locations, admitted range, deadlines, ownership, durable retries, materialization, all trade verbs, card-log rollback, two-inventory exchange rollback, wallet debit/owned rollback, commit-time rejection and hook lifecycle/replay/expiry rollback.
- Supplemental TypeScript noEmit passed with only a temporary bcrypt type declaration, declaration emission disabled and the existing unrelated runtimeBudget.test.ts implicit-any excluded. No candidate production dependency or auth implementation was stubbed.
- git diff --check passed.
- Native test execution was attempted and blocked before fixture setup by missing better_sqlite3.node in the supplied shared dependency tree. No native SQLite behavior is claimed.
- Normal server build was attempted and remains blocked by absent bcryptjs types/package and baseline bootstrap declaration naming/runtimeBudget.test.ts errors. The startup worker owns the declaration fix. Full aggregate/native checks have not passed.

No production DB, credentials, remote push, deployment or source upload was accessed or performed.

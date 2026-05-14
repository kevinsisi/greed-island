# Greed Island Progress Handoff

This file records current development state for the next AI or human
developer. Keep latest status at the top.

## 2026-05-14 — Phase E1.3 ecosystem migration engine

### Implemented

- Started OpenSpec change `ecosystem-migration` for `docs/WORLD_CAPABILITIES.md` Phase E1.3.
- Added `MIGRATION_WAVE_STARTED` and `ANIMAL_MIGRATED` command/event types with validator coverage.
- Added deterministic migration planner (`ecosystem/migration.ts`) using `SpeciesMigrationPattern`, `MAP_ADJACENCY`, and per-tile carrying capacity.
  - `pressure` species migrate when tile occupancy ≥ `ECOSYSTEM_MIGRATION_PRESSURE_THRESHOLD` (80%) of carrying capacity.
  - `seasonal` species migrate on every cadence tick when a destination with capacity exists.
  - `none` and `event_driven` species are skipped.
  - Destination selection prefers biome-matching adjacent ecosystem tiles; falls back to any adjacent ecosystem tile with capacity; deterministic hash tiebreak.
- `AnimalPopulationProjection` now handles `ANIMAL_MIGRATED`: removes animal id from source tile row, upserts on destination tile row with correct `biomeRegion`.
- New `AnimalMigrationProjection` tracks active migration waves from `MIGRATION_WAVE_STARTED` (`migration_routes` projection); increments wave `count` on each `ANIMAL_MIGRATED`; first-write-wins for replay safety.
- Runtime hydrates `AnimalMigrationProjection` on boot; emits `MIGRATION_WAVE_STARTED` then `ANIMAL_MIGRATED` through Rule Engine at most once per cadence tick.
- Both migration event types suppressed from public recent-event and chronicle surfaces.
- `WorldSnapshot.facts.migrationRoutes` exposes wave rows from projection.
- `/admin/world` renders migration wave table (speciesId, fromTile, toTile, type, count, startedAtTick), labeled as Phase E1.3 abstract migration.

### Honest scope

- This is pressure + seasonal migration only. No `event_driven` migration, no multi-tick in-transit state, no extinction warnings, no predator mortality. Animals move tile-to-tile atomically in one event.
- Season tracking uses reproduction cadence period, not a true game-calendar season.

### Verification

- Focused server tests: `npm run test -w @greed-island/server -- ecosystem/migration projections/animalMigration projections/animalPopulation sim/runtimeMigration kernel/livingWorld` passed: 67 tests.
- `npm run build:server` passed.
- `npm run build:web` passed with the known Vite chunk-size warning.
- Full suite: `npm test` passed: **352 server** + 34 web tests.
- `npx openspec validate ecosystem-migration --strict` passed.
- `npx openspec validate --all --strict` passed: 30 passed, 0 failed.

### CI / Deploy

- CI run `25838119729` — success.
- Deploy Dev image push `25838119742` — success; desktop runner timed out twice (Docker Desktop unresponsive); image pulled and containers restarted manually.
- Live `/healthz` at tick 14928: `{"ok":true,"version":"0.16.0","tick":14928}` ✓
- Live `/api/world.facts.migrationRoutes`: key present; first wave observed at tick 14952 — `iron_beak_vulture` pressure migration `t_mountain → t_forest`, count=1 ✓

### Outstanding

- Next E1 slice: predator mortality (ANIMAL_DIED_STARVATION) — now unblocked by migration. Or extend migration with `event_driven` triggers.

## 2026-05-14 — Phase E1.2 ecosystem reproduction + carrying capacity

### Implemented

- Started OpenSpec change `ecosystem-reproduction-capacity` for `docs/WORLD_CAPABILITIES.md` Phase E1.2.
- Added `ANIMAL_REPRODUCED` command/event with validator coverage.
- Added deterministic reproduction planner using `animal_population`, species `reproductionRate`, and the existing per-tile carrying-capacity policy.
- Reproduction requires at least two same-species animal ids on the tile and no full-capacity population.
- Runtime now plans at most one reproduction per cadence tick and emits `ANIMAL_REPRODUCED` only through the Rule Engine.
- `AnimalPopulationProjection` now adds reproduced newborn animal ids during replay/incremental projection, with duplicate newborn safety.
- Routine reproduction facts are hidden from public recent-event and chronicle surfaces.

### Honest scope

- This is local population recovery only. It has no migration, seasonality, sex/pair genealogy, genetics, gestation, lifecycle aging, overpopulation mortality, or extinction warning policy.
- Carrying capacity is the same simple per-tile cap already used by biome spawning.

### Verification

- Focused server tests: `npm run test -w @greed-island/server -- ecosystem/reproduction kernel/livingWorld projections/animalPopulation sim/runtimeReproduction` passed: 53 tests.
- `npm run build:server` passed.
- `npm run build:web` passed with the known Vite chunk-size warning.
- Full suite: `npm test` passed: **333 server** + 34 web tests.
- `npx openspec validate ecosystem-reproduction-capacity --strict` passed.
- `npx openspec validate --all --strict` passed: 29 passed, 0 failed.
- Commit `ab9a793` (`feat(eco): add animal reproduction capacity`) pushed to `main`.
- CI run `25836110686` passed; Deploy Dev run `25836110663` passed. Both only reported the known GitHub Actions Node.js 20 deprecation annotation.
- Live `/healthz` after deploy returned `{"ok":true,"version":"0.16.0","tick":125931}`.
- Live `/api/world` smoke at tick `125931`: `animalPopulationRows = 15`, `marketPrices = 4`, `productionChains.recipes = 1`.

### Outstanding

- Next E1 slice should be migration (`ANIMAL_MIGRATED`, `MIGRATION_WAVE_STARTED`, migration route projection) before starvation can safely become predator death or range expansion.

## 2026-05-14 — Phase E1.1 ecosystem predation

### Implemented

- Started OpenSpec change `ecosystem-predation` for `docs/WORLD_CAPABILITIES.md` Phase E1.1.
- Added `ANIMAL_STARVED` command/event with validator coverage.
- Added deterministic predation planner using `animal_population` rows and species `preyTargets`.
- Runtime now plans at most one same-tile predator/prey interaction per tick:
  - valid prey exists: emits `ANIMAL_HUNT_STARTED`, `ANIMAL_HUNT_RESOLVED`, and `ANIMAL_KILLED` through the Rule Engine.
  - no same-tile target prey exists: emits `ANIMAL_STARVED` starvation pressure through the Rule Engine.
- Predator kills reuse `ANIMAL_KILLED`, so `AnimalPopulationProjection` removes prey through the existing authoritative population-removal path.
- Routine predation/starvation facts are hidden from public recent-event and chronicle surfaces.

### Honest scope

- This is same-tile E1.1 predation pressure only. It has no off-tile hunting, migration, reproduction, carrying-capacity balancing, predator death, carcass/goods generation from animal-on-animal kills, or extinction policy.
- `ANIMAL_STARVED` is a pressure signal only; it does not directly remove predator population in this slice.

### Verification

- Focused server tests: `npm run test -w @greed-island/server -- ecosystem/predation kernel/livingWorld sim/runtimePredation projections/animalPopulation` passed: 52 tests.
- `npm run build:server` passed.
- `npm run build:web` passed with the known Vite chunk-size warning.
- Full suite: `npm test` passed: **326 server** + 34 web tests.
- `npx openspec validate ecosystem-predation --strict` passed.
- `npx openspec validate --all --strict` passed: 28 passed, 0 failed.
- Commit `031eac6` (`feat(eco): add predator prey pressure`) pushed to `main`.
- CI run `25834085886` passed; Deploy Dev run `25834085882` passed. Both only reported the known GitHub Actions Node.js 20 deprecation annotation.
- Live `/healthz` after deploy returned `{"ok":true,"version":"0.16.0","tick":125000}`.
- Live `/api/world` smoke at tick `125000`: `animalPopulationRows = 0`, `marketPrices = 4`, `productionChains.recipes = 1`.

### Outstanding

- Next E1 slices should cover reproduction/carrying capacity and migration before predator starvation can safely become predator mortality.

## 2026-05-13 — Phase 2 §35.4 market formation

### Implemented

- Started OpenSpec change `market-formation` for `docs/WORLD_CAPABILITIES.md` Phase 2 §35.4.
- Added `MARKET_PRICE_DISCOVERED` command/event with validator coverage.
- Added deterministic market pricing policy for tracked central settlement goods:
  - `fish`
  - `meat`
  - `salt_marsh_brine`
  - `refined_salt`
- Added `MarketPricesProjection` keyed by `(settlementId, goodsId)` with replay/canonical-hash tests.
- `SimulationRuntime` now derives prices from `GoodsInventoryProjection` settlement supply and fixed baseline demand, then emits price discovery through the Rule Engine only when price/supply/demand changes.
- Runtime exposes `WorldSnapshot.facts.marketPrices`.
- `/admin/world` now renders market price rows and labels them as Phase 2 §35.4 price projection, not NPC purchases or player shop transactions.
- Routine `MARKET_PRICE_DISCOVERED` events are hidden from public narrative/chronicle surfaces.

### Honest scope

- This is price projection only. It has no NPC purchase transactions, household budgets, player buy/sell UI, market orders, arbitrage, taxes, spoilage, or dynamic demand from festivals/population/cooking.
- Prices are deterministic baseline demand + settlement inventory supply. Later slices can replace baseline demand with population, season, faction, and consumption pressure.

### Verification

- Focused server tests: `npm run test -w @greed-island/server -- goods/marketPricing projections/marketPrices sim/runtimeMarketPrices kernel/livingWorld` passed: 48 tests.
- `npm run build:server` passed.
- `npm run build:web` passed with the known Vite chunk-size warning.
- Full suite: `npm test` passed: **319 server** + 34 web tests.
- `npx openspec validate market-formation --strict` passed.
- `npx openspec validate --all --strict` passed: 27 passed, 0 failed.
- Commit `dcf659c` (`feat(goods): add market price formation`) pushed to `main`.
- CI run `25815422835` passed; Deploy Dev run `25815423920` passed. Both only reported the known GitHub Actions Node.js 20 deprecation annotation.
- Live `/healthz` after deploy returned `{"ok":true,"version":"0.16.0","tick":120083}`.
- Live `/api/world` smoke at tick `120083`: `marketPrices = 4`, first row `fish` at `12` gold, `productionChains.recipes = 1`.

### Outstanding

- Next likely phase after §35.4 is Phase E1 predator/prey + migration, unless we first add NPC purchase/meal consumption as a narrow follow-up OpenSpec.

## 2026-05-13 — Phase 2 §35.3 goods production chains

### Implemented

- Started OpenSpec change `goods-production-chains` for `docs/WORLD_CAPABILITIES.md` Phase 2 §35.3.
- Added deterministic production recipe metadata for `salt_marsh_brine -> refined_salt`.
- Added `ProductionChainsProjection` with recipe snapshot, processed totals, replay, and canonical hash.
- `SimulationRuntime` now emits `GOODS_PROCESSED` through the Rule Engine when `settlement.t_central` has enough `salt_marsh_brine` inventory.
- `GoodsInventoryProjection` already performs the input subtraction/output addition, so production does not fabricate missing inputs.
- Runtime exposes `WorldSnapshot.facts.productionChains`.
- `/admin/world` now renders production recipes and processed totals, labeled as Phase 2 §35.3 production rather than market prices or meals.

### Honest scope

- This is one deterministic production recipe only. There is still no market price discovery, NPC purchasing, meals, spoilage, warehouse capacity, player crafting, or multi-step manufacturing graph.
- Storms can disrupt logistics from §35.2, but they still do not damage production buildings or cities.

### Verification

- Focused server tests: `npm run test -w @greed-island/server -- goods/productionChains projections/productionChains sim/runtimeProductionChains kernel/livingWorld projections/goodsInventory` passed: 51 tests.
- `npm run build:server` passed.
- `npm run build:web` passed with the known Vite chunk-size warning.
- Full suite: `npm test` passed: **312 server** + 34 web tests.
- `npx openspec validate goods-production-chains --strict` passed.
- `npx openspec validate --all --strict` passed: 26 passed, 0 failed.
- Commit `ab54bcd` (`feat(goods): add production chain processing`) pushed to `main`.
- CI run `25814013498` passed; Deploy Dev run `25814014812` passed. Both only reported the known GitHub Actions Node.js 20 deprecation annotation.
- Live `/healthz` after deploy returned `{"ok":true,"version":"0.16.0","tick":119758}`.
- Live `/api/world` smoke at tick `119758`: `productionChains.recipes = 1`, `productionChains.processed = 0`, `logistics.routes = 0`, `logistics.transports = 0`.

### Outstanding

- Next Phase 2 slice should be §35.4 market formation so refined salt and other goods can affect local supply/demand and prices.

## 2026-05-13 — Phase 2 §35.2 goods logistics

### Implemented

- Started OpenSpec change `goods-logistics` for `docs/WORLD_CAPABILITIES.md` Phase 2 §35.2.
- Added trade-route and goods-transport command/event primitives:
  - `TRADE_ROUTE_OPENED`
  - `TRADE_ROUTE_CLOSED`
  - `GOODS_TRANSPORT_STARTED`
  - `GOODS_TRANSPORT_ARRIVED`
  - `GOODS_TRANSPORT_LOST`
- Added `LogisticsProjection` with open/closed route rows, transport status rows, replay, canonical hash, and duplicate-resolution safety.
- `SimulationRuntime` now plans an abstract logistics chain when ecosystem-sourced goods are stored outside `t_central`:
  - open route if needed
  - consume source inventory for loading
  - start transport
  - arrive and store on `settlement.t_central`
- Active `weather.storm` world events now make planned shipment emit `GOODS_TRANSPORT_LOST` instead of arrival/storage. This does not damage buildings or cities.
- Runtime exposes `WorldSnapshot.facts.logistics` and rebuilds/fans out accepted logistics events into the projection.
- `/admin/world` now renders logistics route and transport rows, explicitly labeled as an abstract first logistics slice without roads, warehouses, prices, pathfinding, or city damage.
- Routine logistics events are hidden from public narrative/chronicle surfaces; GM visibility comes from projections.

### Honest scope

- This is Phase 2 §35.2 abstract logistics only. It has no multi-tick travel, pathfinding risk beyond active storms, warehouses, road construction, market prices, player hauling, building damage, or city destruction.
- Cooking, production chains, household consumption, and market formation remain future Phase 2 slices.

### Verification

- Focused server tests: `npm run test -w @greed-island/server -- projections/logistics sim/runtimeLogistics sim/runtimeGoodsInventory kernel/livingWorld` passed: 47 tests.
- `npm run build:server` passed.
- `npm run build:web` passed with the known Vite chunk-size warning.
- Full suite: `npm test` passed: **306 server** + 34 web tests.
- `npx openspec validate goods-logistics --strict` passed.
- `npx openspec validate --all --strict` passed: 25 passed, 0 failed.
- Commit `16583fd` (`feat(goods): add abstract goods logistics`) pushed to `main`.
- CI run `25813214469` passed; Deploy Dev run `25813214497` passed. Both only reported the known GitHub Actions Node.js 20 deprecation annotation.
- Live `/healthz` after deploy returned `{"ok":true,"version":"0.16.0","tick":119579}`.

### Outstanding

- §35.3 production chains has now started in `goods-production-chains`.

## 2026-05-13 — Phase 2 §35.1 goods primitives

### Implemented

- Started OpenSpec change `goods-primitives` for `docs/WORLD_CAPABILITIES.md` Phase 2 §35.1.
- Added goods command/event primitives:
  - `GOODS_EXTRACTED`
  - `GOODS_STORED`
  - `GOODS_PROCESSED`
  - `GOODS_CONSUMED`
  - `GOODS_DESTROYED`
- Added `GoodsInventoryProjection` keyed by `(holderType, holderId, goodsId)` with replay/canonical-hash tests.
- `SimulationRuntime` now promotes accepted ecosystem outputs into goods:
  - `MEAT_HARVESTED` → `GOODS_EXTRACTED:meat` + `GOODS_STORED:meat` on the hunter NPC
  - `FISHERY_HARVESTED` → `GOODS_EXTRACTED:fish` + `GOODS_STORED:fish` on the fisher NPC
- Runtime fans accepted goods events into projection, rebuilds it on boot, and exposes `WorldSnapshot.facts.goodsInventory`.
- `/admin/world` now renders goods inventory rows with goods id, quantity, holder, tile, and updated tick.
- Routine `GOODS_*` events are hidden from public narrative surfaces; GM sees the authoritative projection instead.

### Honest scope

- This is Phase 2 goods substrate only. NPCs can now carry fish/meat inventory from ecosystem outputs, but there is still no NPC purchase flow, cooking recipe, meal consumption, logistics carrier, market price, spoilage policy, or player inventory bridge.

### Verification

- Focused server tests: `npm run test -w @greed-island/server -- projections/goodsInventory kernel/livingWorld sim/runtimeGoodsInventory kernel/chronicleRenderer` passed: 57 tests.
- Focused web visibility test: `npm run test -w @greed-island/web -- state/eventVisibility` passed: 3 tests.
- `npm run build:server` passed.
- `npm run build:web` passed with the known Vite chunk-size warning.
- Full suite: `npm test` passed: **301 server** + 34 web tests.
- `npx openspec validate goods-primitives --strict` passed.
- `npx openspec validate --all --strict` passed: 24 passed, 0 failed.
- Commit `f9a3365` (`feat(goods): track ecosystem harvest inventory`) pushed to `main`.
- CI run `25804686088` passed; Deploy Dev run `25804685682` passed. Both only reported the known GitHub Actions Node.js 20 deprecation annotation.
- Live `/healthz` after deploy returned `{"ok":true,"version":"0.16.0","tick":117740}`.
- Live `/api/world.facts.goodsInventory` exists; smoke samples at ticks `117740` and `117752` had 0 rows because no new post-deploy `MEAT_HARVESTED` or `FISHERY_HARVESTED` event had occurred yet. Pre-deploy ecosystem events are not retroactively converted into goods events.

### Outstanding

- Next Phase 2 slice should be production/cooking or NPC exchange, so fish can move from inventory into meals and food-need reduction instead of stopping at held goods.

## 2026-05-13 — E0.4 GM visibility follow-up

### Implemented

- Added `/admin/world` as a GM/admin world observer page.
- Added visible GM world entry points:
  - desktop navigation rail for GM/admin
  - profile staff shortcuts for GM/admin, preserving mobile access through `/profile`
  - admin page shortcut for admins
- The GM world page now renders `WorldSnapshot.facts.fisheryDensity` as a fishery density table with tile name/id, density bar, harvested total, collapse/stress/stable status, and last updated tick.
- The page also shows current tick, data source, connection mode, and fishery row count.

### Verification

- `npm run build:web` passed with the known Vite chunk-size warning.
- `npm run test -w @greed-island/web` passed: 34 tests.
- `npx openspec validate ecosystem-fishery-density --strict` passed.
- `npx openspec validate --all --strict` passed: 23 passed, 0 failed.
- Commit `cd3eb0e` (`feat(gm): show fishery density in world view`) pushed to `main`.
- CI run `25802979233` passed; Deploy Dev run `25802979345` passed. Both only reported the known GitHub Actions Node.js 20 deprecation annotation.
- Live `/healthz` after deploy returned `{"ok":true,"version":"0.16.0","tick":117385}`.
- Live `/api/world.facts.fisheryDensity` had 2 rows at tick `117385`: `t_dock` density 16/collapsed and `t_temple` density 16/collapsed.

### Outstanding

- E0.4 is visible in GM UI, but it is still only an ecological pressure projection. NPCs do not yet buy fish, cook fish, store fish goods, sell fish at market, or consume prepared meals. That belongs in the next goods/logistics/cooking slice.

## 2026-05-13 — Phase E0.4 fishery density

### Implemented

- Started `docs/WORLD_CAPABILITIES.md` Phase E0.4 with new OpenSpec change `ecosystem-fishery-density`.
- Added `FISHERY_HARVESTED` and `FISHERY_COLLAPSED` typed commands/events with validators.
- Added `packages/server/src/ecosystem/fishery.ts`:
  - fisher-role detection for fisher/fishmonger/net-mender roles
  - coastal fishery tile detection for `t_dock`, `t_temple`, and `t_salt_marsh`
  - deterministic harvest planning with `FISHERY_HARVEST_DELTA = 12`
  - collapse crossing at `FISHERY_COLLAPSE_THRESHOLD = 20`
- Added `FisheryDensityProjection` keyed by tile id with replay/canonical-hash tests.
- `SimulationRuntime` now plans fishery harvest from fisher productive actions, fans accepted fishery events into the projection, rebuilds it on boot, and exposes `facts.fisheryDensity`.

### Honest scope

- Tile-level fishery only. No species-specific fishery, recovery/regrowth, goods inventory, market pricing, or extinction history yet.
- No fish purchase/cooking/meal consumption loop yet; `FISHERY_HARVESTED` is currently a world/ecosystem fact, not a commodity transaction.

### Verification

- Focused tests: `npm run test -w @greed-island/server -- ecosystem/fishery projections/fisheryDensity kernel/livingWorld` passed: 45 tests.
- Full suite: `npm test` passed: **296 server** + 34 web tests.
- `npm run build:server` passed.
- `npm run build:web` passed with the known Vite chunk-size warning.
- `npx openspec validate ecosystem-fishery-density --strict` passed.
- `npx openspec validate --all --strict` passed: 23 passed, 0 failed.
- Commit `d7fef26` (`feat(eco): add fishery density projection`) pushed to `main`.
- CI run `25798295594` passed; Deploy Dev run `25798295660` passed. Both only reported the known GitHub Actions Node.js 20 deprecation annotation.
- Live `/healthz` after deploy returned `{"ok":true,"version":"0.16.0","tick":116291}`.
- Live `/api/world` exposes `facts.fisheryDensity`; smoke sample at tick `116293` had 0 rows because no qualifying fisher harvest had occurred since deploy.

### Outstanding

- E0.4 live endpoint is deployed; wait for a qualifying fisher productive action to produce the first non-empty `fisheryDensity` row, or add a deterministic fixture/admin trigger in a future slice if faster live evidence is needed.
- Next ecosystem slice remains open: fishery recovery/regrowth, species-specific fishery, or Phase 2 goods/logistics bridge.

## 2026-05-13 — Phase E0.3 simple hunting

### Implemented

- Started `docs/WORLD_CAPABILITIES.md` Phase E0.3 with new OpenSpec change `ecosystem-simple-hunting`.
- Added typed ecosystem hunting commands/events:
  - `ANIMAL_HUNT_STARTED`
  - `ANIMAL_HUNT_RESOLVED`
  - `ANIMAL_KILLED`
  - `CARCASS_CREATED`
  - `MEAT_HARVESTED`
- Added validators and command catalog coverage for the full hunting chain.
- Added deterministic simple hunting policy in `packages/server/src/ecosystem/hunting.ts`:
  - only hunter-role NPCs qualify
  - food need must be at least `ECOSYSTEM_HUNT_FOOD_NEED_THRESHOLD = 60`
  - prey must be an edible same-tile `animal_population` row
  - hunt id, target animal choice, and carcass id derive from canonical hashes
  - duplicate same-tick hunts reserve animal ids to avoid double targeting
- Extended `AnimalPopulationProjection` so `ANIMAL_KILLED` removes the killed animal id and duplicate kills cannot reduce count below zero.
- Added `withMeatHarvestedRecorded(...)` so accepted `MEAT_HARVESTED` credits NPC `civic.gold` and civic XP as the Phase 2 goods placeholder bridge.
- `SimulationRuntime` now plans the simple hunting chain from hunter productive actions and reduces accepted meat harvests into `LifeExpansionState`.

### Honest scope

- This is one-tick simple hunting only. No injury, failed hunt consequences, combat sub-runtime, carcass inventory, true goods inventory, fishery density, migration, reproduction, or extinction logic yet.
- Meat harvest currently credits NPC civic economy, not household storage/goods tables; true storage lands in Phase 2 goods/logistics.

### Verification

- Focused tests: `npm run test -w @greed-island/server -- ecosystem/hunting projections/animalPopulation kernel/livingWorld sim/cityLife` passed: 75 tests.
- Full suite: `npm test` passed: **292 server** + 34 web tests.
- `npm run build:server` passed.
- `npm run build:web` passed with the known Vite chunk-size warning.
- `npx openspec validate ecosystem-simple-hunting --strict` passed.
- `npx openspec validate --all --strict` passed: 22 passed, 0 failed.
- Commit `1e2c188` (`feat(eco): add simple hunting chain`) pushed to `main`.
- CI run `25797518715` passed; Deploy Dev run `25797518707` passed. Both only reported the known GitHub Actions Node.js 20 deprecation annotation.
- Live `/healthz` after deploy returned `{"ok":true,"version":"0.16.0","tick":116100}`.
- Live `/api/world` still exposes `facts.animalPopulation`; smoke sample at tick `116100` had 1 population row.

### Outstanding

- E0.4 fishery density remains next if continuing Phase E0.

## 2026-05-13 — Phase E0.2 animal spawning + animal_population projection

### Implemented

- Started `docs/WORLD_CAPABILITIES.md` Phase E0.2 with new OpenSpec change `ecosystem-animal-spawning`.
- Added `ANIMAL_SPAWNED` to the living-world command/event catalog.
- Added `AnimalSpawnedCmd { animal, spawnedAtTick, motivation?, narration }` and Rule Engine validation for concrete `Animal` payloads.
- Added deterministic spawn policy in `packages/server/src/ecosystem/animalSpawning.ts`:
  - fixed cadence via `ECOSYSTEM_SPAWN_CADENCE_TICKS`
  - one active eligible tile per cadence tick
  - explicit tile-to-region mapping for documented ecosystem regions
  - generic `grass` and generic `water` tiles do not invent species
  - legendary species are deferred for future mythic ecology behavior
  - animal id / position / pack id derive from canonical hashes of species, tile, and tick
- Added `AnimalPopulationProjection` in `packages/server/src/projections/animalPopulation.ts`:
  - `rebuildFromEvents(events)`
  - `project(event)`
  - `countSpeciesOnTile(speciesId, tileId)`
  - `getBySpeciesAndTile(speciesId, tileId)`
  - `list()`
  - `canonicalHash()`
- `SimulationRuntime` now plans animal spawns each cadence tick, submits them through the Rule Engine, fans accepted events into `AnimalPopulationProjection`, rebuilds the projection on boot, and exposes `facts.animalPopulation` plus `getAnimalPopulation()`.
- `ANIMAL_SPAWNED` is suppressed from public recent-event / SSE / chronicle surfaces so routine wildlife births do not spam narrative feeds.

### Honest scope

- This is E0.2 spawning only. No hunting, fishery depletion, migration, reproduction, predator/prey balancing, starvation, extinction, carcass, or goods extraction yet.
- `animal_population` is in-memory projection material rebuilt from EventLog, matching current settlement/NPC-state projection style.
- Generic water tiles (`t_dock`, `t_temple`) remain non-spawning until a documented coastal/fishery region policy exists; salt-marsh spawning is explicit to `t_salt_marsh` once unlocked.

### Verification

- Focused tests: `npm run test -w @greed-island/server -- ecosystem/animalSpawning projections/animalPopulation kernel/livingWorld sim/runtimeAnimalSpawning` passed: 49 tests.
- Full suite: `npm test` passed: **287 server** + 34 web tests.
- `npm run build:server` passed.
- `npm run build:web` passed with the known Vite chunk-size warning.
- `npx openspec validate ecosystem-animal-spawning --strict` passed.
- `npx openspec validate --all --strict` passed: 21 passed, 0 failed.
- Commit `4ddcdbc` (`feat(eco): spawn deterministic animal populations`) pushed to `main`.
- CI run `25796560338` passed; Deploy Dev run `25796560331` passed. Both only reported the known GitHub Actions Node.js 20 deprecation annotation.
- Live `/healthz` after deploy returned `{"ok":true,"version":"0.16.0","tick":115862}`.
- Live `/api/world` exposes `facts.animalPopulation`; after the next spawn cadence it returned 1 population row at tick `115872`.

### Outstanding

- Next E0 slice: E0.3 simple hunting (`ANIMAL_HUNT_STARTED`, `ANIMAL_HUNT_RESOLVED`, `ANIMAL_KILLED`, `CARCASS_CREATED`, `MEAT_HARVESTED`) and first population reduction path.

## 2026-05-13 — Phase 1 §33.2 NPC state typed projection

### Implemented

- Started `docs/WORLD_CAPABILITIES.md` Phase 1 §33.2 with new OpenSpec change `npc-state-typed-projection`.
- Added `NPC_STATE_RECORDED` to the living-world command catalog.
- Added validator coverage for `NpcStateRecordedCmd { npcId, state, narration }`.
- Added `packages/server/src/projections/npcState.ts` with:
  - `rebuildFromEvents(events)`
  - `project(event)`
  - `getByNpcId(npcId)`
  - `getAll()`
  - `canonicalHash()`
- `SimulationRuntime` now emits typed `NPC_STATE_RECORDED` events for:
  - normal `NpcEngine.tick()` changed states
  - post-accepted social-task updates after `NPC_INTERACT`
- New NPC state changes no longer write `npc.state.<id>` FACT_SET snapshots.
- Boot hydration now prefers `NpcStateProjection` rebuilt from EventLog; legacy `npc.state.<id>` facts remain fallback only for pre-migration logs.
- `NPC_STATE_RECORDED` is suppressed from recent narrative / chronicle surfaces so the typed state event does not spam public feeds.
- Updated comments in `runtime.ts` / `npcEngine.ts` so the codebase no longer claims NPC state is primarily FACT_SET-backed.

### Honest scope

- This slice migrates NPC state persistence, but does **not** touch area/building/weather/season/rare-window FACT_SET domains yet.
- The new projection is in-memory like `SettlementsProjection`, not a SQLite projection table.
- This is the first 33.2 slice, not the whole 33.3 projection sweep.

### Verification

- Focused tests: `npm run test -w @greed-island/server -- livingWorld npcState runtimeNpcStateProjection` passed: 45 tests.
- Full suite: `npm test` passed: **279 server** + 34 web tests.
- `npx tsc -p packages/server/tsconfig.json --noEmit` passed.
- `npm run build:server` + `npm run build:web` passed (web only reported the known Vite chunk-size warning).
- `npx openspec validate npc-state-typed-projection --strict` passed.
- `npx openspec validate --all --strict` passed: 20 passed, 0 failed.
- Commit `c3068f1` (`feat(sim): persist NPC state as typed events`) pushed to `main`.
- CI run `25794738289` passed; Deploy Dev run `25794738301` passed. Both only reported the known GitHub Actions Node.js 20 deprecation annotation.
- Live `/healthz` after deploy returned `{"ok":true,"version":"0.16.0","tick":115399}`.

### Outstanding

- Follow-up 33.2 decision: whether to archive this slice after CI or keep it open until a future SQLite-backed `npc_state` table exists.
- 33.3 projection rebuild contract sweep for the other FACT_SET-backed domains remains open.

## 2026-05-13 — Phase E0.1 ecosystem foundation (species catalog + Animal substrate)

### Implemented

- Started Phase E0 with the first real Layer 2.5 substrate slice: new OpenSpec change `ecosystem-foundation`.
- Added `packages/server/src/ecosystem/species.ts`.
- Defined canonical Layer 2.5 domain types:
  - `EcosystemRegionId`
  - `SpeciesCategory`, `SpeciesDietType`, `SpeciesPackBehavior`, `SpeciesActivityWindow`, `SpeciesMigrationPattern`, `SpeciesRarity`
  - `AnimalLifecycleStage`, `AnimalState`
  - `Species`
  - `Animal`
- Encoded the initial 22-species catalog from `docs/WORLD_CAPABILITIES.md` §6.4 across the 5 regions:
  - salt_marsh: 5
  - forest: 5
  - mountain: 4
  - desert: 4
  - ruin: 4
- Added deterministic read-only helpers:
  - `listSpecies()`
  - `getSpecies(id)`
  - `requireSpecies(id)`
  - `listSpeciesByRegion(region)`
  - `listSpeciesByCategory(category)`
- This slice is substrate only: no wildlife engine, no `ANIMAL_SPAWNED`, no projections, no runtime tick integration yet.

### Verification

- Focused tests: `npm run test -w @greed-island/server -- ecosystem/species settlements` passed: 15 tests.
- Full suite: `npm test` passed: **273 server** + 34 web tests.
- `npx tsc -p packages/server/tsconfig.json --noEmit` passed.
- `npm run build:server` + `npm run build:web` passed (web only reported the known Vite chunk-size warning).
- `npx openspec validate ecosystem-foundation --strict` passed.
- `npx openspec validate settlement-domain --strict` passed.
- `npx openspec validate --all --strict` passed: 19 passed, 0 failed.
- Commit `cf53455` (`feat(eco): add initial species substrate`) pushed to `main`.
- CI run `25793089359` passed; Deploy Dev run `25793089369` passed. Both only reported the known GitHub Actions Node.js 20 deprecation annotation.
- Live `/healthz` after deploy returned `{"ok":true,"version":"0.16.0","tick":114886}`.

### Outstanding

- Next E0 slice: `ANIMAL_SPAWNED` + `animal_population` projection + deterministic per-biome spawn policy.
- 33.2 NPC FACT_SET -> typed-event migration still not started.

## 2026-05-13 — Settlement Domain follow-up verification

### Verified after follow-up fix

- Commit `8c86c59` (`feat(civ): Settlement Domain - first Layer 3 entity`) passed CI run `25790844474` and Deploy Dev run `25790844483`.
- Follow-up fix commit `463341d` (`fix(civ): wire settlementsProjection into runTick fan-out`) passed CI run `25791885567` and Deploy Dev run `25791885547`.
- Live `/api/settlements` now returns real runtime-projected settlements immediately after formation without waiting for reboot/hydration. Sample live rows included `settlement.t_central.6be1e1b95a6535b0`, `settlement.t_dock.622154c6d982dca8`, and `settlement.t_forest.e59f205c55e7ca3f`.
- Live `/healthz` at the same verification window returned `{"ok":true,"version":"0.16.0","tick":114886}`.

## 2026-05-13 — Phase 1 NPC partition slice 3b (active-set gating)

### Implemented

- Completed slice 3b of `simulation-budget-enforcement`: deterministic NPC partition is now wired into `NpcEngine` behavior, not only snapshot observability.
- `NpcTickContext` gained optional `activeNpcSet`.
- `SimulationRuntime.runTick()` now passes `npcPartition.active` into `NpcEngine.tick(...)` every tick.
- `NpcEngine` now filters:
  - Phase 2 productive-action candidates to active NPCs only
  - Phase 3 interaction candidates to active NPCs only
- Added slice 3b allow-list overrides via internal `isBudgetActiveNpc(...)`:
  - `activity === 'move'`
  - active `player-dialog` hold task
  - non-null `personalityOverride.targetTile`
  These NPCs stay active even when they are outside the round-robin bucket, preserving continuity-sensitive deterministic behavior.
- `simulation-budget-enforcement` spec delta now includes the slice 3b behavior requirement and scenarios for productive gating, interaction gating, and allow-list bypass.
- Tests updated for the new partitioned behavior:
  - `npcEngine.test.ts`: productive gating, interaction gating, personality override bypass, player-dialog hold bypass
  - `runtimePresence.test.ts`: no longer assumes an `NPC_INTERACT` event on the first tick under active/background filtering; still verifies authoritative indoor/outdoor presence behavior.

### Honest scope

- This is still **not** background-policy execution. Inactive NPCs continue to advance schedule/movement/state through Phase 1 of `NpcEngine.tick`; slice 3b only gates productive + interaction phases.
- Slice 4 regional activation is still open.
- Dashboard UI does not yet render `tickCommandStats` / `npcPartition` headroom.

### Verification

- Focused tests: `npm run test -w @greed-island/server -- npcEngine runtimeBudget runtimePresence runtimeExpansion` passed: 43 tests.
- Full suite: `npm test` passed: **266 server** + 34 web tests.
- `npx tsc -p packages/server/tsconfig.json --noEmit` + `packages/web/tsconfig.json --noEmit` passed.
- `npm run build:server` + `npm run build:web` passed (web only reported the known Vite chunk-size warning).
- `npx openspec validate simulation-budget-enforcement --strict` passed.
- `npx openspec validate --all --strict` passed: 18 passed, 0 failed.
- Commit `23cfca6` (`feat(sim): gate NPC actions by active partition`) pushed to `main`.
- CI run `25791664215` passed; Deploy Dev run `25791664183` passed. Both only reported the known GitHub Actions Node.js 20 deprecation annotation.
- Live `/healthz` after deploy returned `{"ok":true,"version":"0.16.0","tick":114629}`.

### Outstanding

- Slice 4 regional activation.
- Browser visual smoke of `/admin/npcs` rendering (carried over).

## 2026-05-13 — v0.16.0 release bump

### Bumped

- `packages/server/src/version.ts`: `0.15.47` → `0.16.0`.
- `packages/web/src/version.ts`: `0.15.46` → `0.16.0` (web had drifted one minor behind server).
- `packages/server/package.json` + `packages/web/package.json`: `0.15.47` → `0.16.0`.

### Why 0.16.0

This session shipped multiple architectural milestones that the v0.15.47 → v0.15.47k micro-labels in `ROADMAP.md` did not surface in the runtime version string. `/healthz` had been reporting `0.15.47` since session start, which made the user reasonably ask "版本是多少？我看沒改？". Cumulative changes since baseline v0.15.47:

- `ARCHITECTURE.md` §12 "Six Runtime Layers" formalized.
- Layer 2.5 Ecosystem Runtime constitution integrated into `WORLD_CAPABILITIES.md`.
- GM NPC Dashboard (`/admin/npcs` + `/api/admin/npc-stats`).
- Phase 1 budget gate slices 1+2+3a (per-tick command count observability, deterministic hard-cap rejection into `rejected_command_log`, NPC partition computation + snapshot).
- **First Layer 3 Civilization Runtime entity: Settlement Domain** (`/api/settlements`, autonomous formation from sustained NPC co-presence, `SETTLEMENT_FORMED` Command + projection + rule-engine validator).

These together justify a minor release bump from the v0.15 line into v0.16, signaling "Layer 3 civilization runtime is now alive".

## 2026-05-13 — Phase 1 §33.4 Settlement Domain (first Layer 3 entity)

### Implemented

- First Layer 3 Civilization Runtime entity: **Settlement** can now emerge from sustained NPC co-presence and become a real domain object on the world snapshot. Opens `docs/WORLD_CAPABILITIES.md` §28.1 (concrete domain object + commands + projection).
- New OpenSpec change `settlement-domain` (validates strict). New `civilization-runtime` capability spec.
- New `SETTLEMENT_FORMED` Command in `livingWorldCommands.ts` with payload `{ settlementId, tileId, formedAtTick, founderNpcIds, narration }`. Validator enforces sorted unique `founderNpcIds` for replay determinism.
- New pure helper `packages/server/src/sim/settlementDetection.ts::detectSettlementFormation()` consumes `{ npcsByTile, previousHistory, existingSettlementTiles, tick }`, returns `{ detections, nextHistory }`. Detection criterion: ≥ `SETTLEMENT_FORMATION_MIN_NPCS = 3` outdoor non-moving NPCs co-located for ≥ `SETTLEMENT_FORMATION_MIN_TICKS = 12` consecutive ticks with the same cohort, and tile not already settled.
- New `SettlementsProjection` (`packages/server/src/projections/settlements.ts`) with `rebuildFromEvents`, `project(event)`, `getAll / getById / getByTile / getTilesWithSettlement`, first-write-wins semantics for replay safety.
- `SimulationRuntime` integration:
  - Constructs the projection at init, rebuilds from EventLog on boot via `readEventsByTickWindow({ eventTypes: ['SETTLEMENT_FORMED'] })`.
  - In `runTick()` after NPC engine processing, gathers `outdoorByTile` via `buildingRuntime.npcsOutsideOnTile`, runs `detectSettlementFormation`, and pushes one `SETTLEMENT_FORMED` Command per detection through the Rule Engine. Settlement id derived deterministically via `hashCanonicalJson` of `{ scheme, tileId, formedAtTick, founderNpcIds }`.
  - New `getSettlements()` + `getSettlementById(id)` accessors.
- New HTTP router `packages/server/src/http/settlementsRouter.ts` exposing read-only `GET /api/settlements` and `GET /api/settlements/:id`. Wired into `createHttpApp` between buildings and combat routers.
- Web client gains `ServerSettlement` type + `api.settlements()` / `api.settlementById(id)` methods.

### Honest scope

- This slice is **founding only**. Population / decline / split / migration / takeover (§28.1 follow-up Commands) ship in later slices.
- Hub map UI overlay for settlements is deferred to a `settlement-domain-ui` follow-up.
- Settlement-aware NPC behaviour (e.g. NPCs preferring their home settlement) is Phase 3 humanity work.

### Verification

- `npm test`: **262 server** + 34 web tests passed (+15: 7 from `settlementDetection.test.ts`, 8 from `settlements.test.ts`).
- `npx tsc -p packages/server/tsconfig.json --noEmit` + `packages/web/tsconfig.json --noEmit` pass.
- `npm run build:server` + `npm run build:web` pass.
- `npx openspec validate settlement-domain --strict` passes.
- `npx openspec validate --all --strict` passes (18 items, +1 from new `civilization-runtime` capability).

### Outstanding

- Commit + push + CI/Deploy Dev green.
- Local docker rebuild + `curl /api/settlements` smoke.
- Browser visual smoke of `/admin/npcs` rendering (carried over).
- Phase 1 §33.1 slices 3b (NpcEngine filter) and 4 (regional activation) still open.

## 2026-05-13 — Phase 1 NPC partition (slice 3a — computation + snapshot exposure)

### Implemented

- Slice 3a of `simulation-budget-enforcement`: deterministic round-robin NPC partition (period `NPC_PARTITION_PERIOD = 4`). Computes the partition each tick and exposes it on the world snapshot. **No NPC engine behaviour change** — slice 3b will wire the active set into productive + interaction filtering.
- New constant `NPC_PARTITION_PERIOD = 4` in `config/world.ts` with the rationale (50 NPCs / 4 buckets ≈ 12-13 NPCs active per tick).
- New pure helper `packages/server/src/sim/npcPartition.ts::partitionNpcsForTick(npcIds, tick, period)` returns `{ active: Set<string>, period, totalCount, activeCount }`. Content-hash bucketing via simple deterministic char-code function. Throws on invalid period / tick.
- `SimulationRuntime.runTick()` computes the partition at the start of each tick, stores `lastActiveNpcCount`, exposes `WorldSnapshot.npcPartition`. Web `ServerWorldSnapshot.npcPartition` typed for forward compatibility.
- Spec delta extended with one new ADDED Requirement (deterministic partition + every-NPC-active-once-per-period + snapshot exposure) covering 3 scenarios.

### Verification

- `npm test`: **247 server** + 34 web tests passed (+10 from `npcPartition.test.ts`, +2 from `runtimeBudget.test.ts` partition exposure / round-robin sum tests).
- `npx tsc -p packages/server/tsconfig.json --noEmit` + `packages/web/tsconfig.json --noEmit` pass.
- `npm run build:server` + `npm run build:web` pass.
- `npx openspec validate simulation-budget-enforcement --strict` passes.

### Outstanding

- Slice 3b (plumb active set into `NpcEngine.tick`; filter Phase 2 productive + Phase 3 interaction to active NPCs only; add allow-list overrides for `move` / `dialogHold` / `personalityOverride.targetTile`; update affected tests in `cityLife.test.ts` / `npcEngine.test.ts` / `runtimeExpansion.test.ts` / `runtimePresence.test.ts`).
- Slice 4 (regional activation).
- Browser visual smoke of `/admin/npcs` rendering (carried over).
- Dashboard UI to render `tickCommandStats` + `npcPartition` headroom.

## 2026-05-13 — Phase 1 budget hard-cap enforcement slice

### Implemented

- Slice 2 of `simulation-budget-enforcement`: deterministic per-tick command hard cap with overflow rejection routed to `rejected_command_log`. `WorldState` unaffected.
- New constants in `config/world.ts`: `MAX_COMMANDS_PER_TICK_HARD_CAP = 8000`, `COMMAND_CAP_REJECTION_CODE = 'COMMAND_CAP_EXCEEDED'`.
- New pure helper `packages/server/src/sim/commandBudget.ts::applyCommandHardCap(commands, hardCap)` returns `{ kept, rejected }`. Identity-preserving under cap (no sort); sorts ascending by `commandId` and slices first N when over cap. Returns frozen arrays.
- `SimulationRuntime.runTick()` calls the helper after the soft-cap warning; for each rejected command calls `eventStore.recordRejectedCommand(...)` with code `COMMAND_CAP_EXCEEDED`, then iterates `acceptedCommands` (the kept partition) in the existing rule-engine loop.
- `WorldSnapshot.tickCommandStats` gains `hardCap` and `hardCapRejectedSinceBoot` fields. Web `ServerTickCommandStats` gets matching optional fields.
- Spec delta extended with three new ADDED Requirements (hard-cap enforcement + determinism, WorldState invariance under rejection, hard-cap value exposure).

### Verification

- `npm test`: 230 server + 34 web tests passed (+7 `commandBudget.test.ts` pure-helper tests, +1 runtime hard-cap test).
- `npx tsc -p packages/server/tsconfig.json --noEmit` + `packages/web/tsconfig.json --noEmit` pass.
- `npm run build:server` + `npm run build:web` pass.
- `npx openspec validate simulation-budget-enforcement --strict` passes (now covers slices 1 + 2 requirements).

### Outstanding

- Slice 3 (NPC partitioning: active vs background).
- Slice 4 (regional activation).
- Browser visual smoke of `/admin/npcs` rendering (carried over).
- Dashboard UI to render `tickCommandStats.lastTick / softCap / hardCap` headroom (deferred until slice 4 lands).

## 2026-05-13 — Phase 0 archive + Phase 1 budget observability slice

### Implemented

- Archived Phase 0 OpenSpec change `architecture-formalization` as `2026-05-13-architecture-formalization`. ARCHITECTURE.md §12 (Six Runtime Layers) merged into canonical `openspec/specs/simulation-kernel/spec.md` via layer-vocabulary requirement.
- Opened new umbrella OpenSpec change `simulation-budget-enforcement` covering the 4 sub-deliverables of WORLD_CAPABILITIES.md §33.1 (command cap observability → enforcement → NPC partitioning → regional activation). Slice 1 (observability) ships in this commit; slices 2–4 stay unchecked.
- Added `MAX_COMMANDS_PER_TICK_SOFT_CAP = 5000` constant in `packages/server/src/config/world.ts`.
- `SimulationRuntime` tracks `lastTickCommandCount`, `peakTickCommandCount`, `softCapHitCount`. `runTick()` updates these right after the `commands` array is fully built and emits a single `console.warn` per tick over the soft cap. No rejection (observability slice).
- New `TickCommandStats` type on `WorldSnapshot.tickCommandStats`. Rides through `/api/world` and `/api/dashboard` (no router changes needed — the field is on the existing snapshot).
- Web `ServerWorldSnapshot` type gains optional `tickCommandStats` so future dashboard UI can render headroom (e.g. `1234 / 5000`).

### Verification

- `npm test`: 223 server tests + 34 web tests passed (added 4 `runtimeBudget.test.ts` tests covering snapshot exposure, peak monotonicity, no-warning under normal load, and soft-cap counter staying at 0 under real 50-NPC tick).
- `npx tsc -p packages/server/tsconfig.json --noEmit` and `packages/web/tsconfig.json --noEmit` pass.
- `npm run build:server` and `npm run build:web` pass.
- `npx openspec validate simulation-budget-enforcement --strict` passes.

### Outstanding

- Slice 2 (hard cap + deterministic overflow → `rejected_command_log`).
- Slice 3 (NPC partitioning: active vs background).
- Slice 4 (regional activation).
- Browser visual smoke of `/admin/npcs` rendering (carried over).

## 2026-05-13 — v0.15.48 Phase 0 Architecture Formalization

### Implemented

- Started Phase 0 from `docs/WORLD_CAPABILITIES.md` Part IV: architecture formalization before Phase 1/E0 implementation.
- Added OpenSpec change `architecture-formalization` with proposal/tasks/spec delta against `simulation-kernel`.
- Added `ARCHITECTURE.md` §12 "Six Runtime Layers":
  - Layer 1 Simulation Kernel
  - Layer 2 Living World Runtime
  - Layer 2.5 Ecosystem Runtime
  - Layer 3 Civilization Runtime
  - Layer 4 Combat Runtime
  - Layer 5 Perception Runtime
- Captured inter-layer dependency rules: budget gate before growth, typed events before permanence, ecosystem before metabolism, settlement before economy, combat feeds the world, cards are rule operators, player is an ordinary actor, perception never owns truth.
- OpenSpec hygiene: archived proposal-only `player-intervene-and-combat` under `openspec/changes/archive/2026-05-13-player-intervene-and-combat-proposal-only/` so strict validation is not blocked by a change with no deltas.
- OpenSpec hygiene: removed empty `construction-motivation-chronicle` active directory from the working tree.
- Memory placement decision: this phase/layer/world-route decision is Greed Island project memory, recorded in project docs (`PROGRESS.md`, `ROADMAP.md`, `ARCHITECTURE.md`, OpenSpec), not `homelab-docs` global memory. Only cross-project workflow/deployment/user-preference rules belong in `homelab-docs` memory.
- `gm-npc-dashboard` has already been archived in commit `5864e1a`; earlier handoff lines saying archive was still pending are stale. Browser visual smoke evidence is not independently reproduced in this session, but archived task 5.8 is marked complete by the company Claude Code run.

### Verification

- `npx openspec validate architecture-formalization --strict` passed.
- `npx openspec validate --all --strict` passed: 17 passed, 0 failed.
- `npx openspec list` active changes now shows 4 active changes:
  `architecture-formalization`, `civ-evo-construction`,
  `combat-phase-c-realtime-subtick`, `combat-system`.
- Commit `d46a153` (`docs(world): formalize runtime layers`) pushed to `main`.
- CI run `25786027078` passed: build/typecheck/test + OpenSpec validate.
- Deploy Dev run `25786027052` passed. Both runs only reported the known GitHub Actions Node.js 20 deprecation annotation.

## 2026-05-13 — v0.15.47g GM NPC Dashboard + Layer 2.5 ECO Doc Integration + Local Docker Refresh

### Sequenced work (after GM dashboard slice below)

- Integrated user-authored `docs/WITH_ECO.md` (1030 lines) into `docs/WORLD_CAPABILITIES.md` as the constitutional substrate for **Layer 2.5 Ecosystem Runtime**. Runtime layer model goes from 5 to 6 layers (`Kernel / Living World / Ecosystem / Civilization / Combat / Perception`). Source `docs/WITH_ECO.md` deleted (consolidated).
- WORLD_CAPABILITIES.md 從 1397 行擴成 **1774 行**：Part I §6 新增完整 ecosystem vision、§10 加 P3 Ecosystem Foundation 優先級、§11 dev order 變成 7 civ + 5 eco 共 12 個 phase 交錯 (0, 1, E0, 2, E1, 3, E2, 4, 5, E3, 6, E4)、Part II §27 新增 ecosystem baseline = 0% implemented、Part III §30.12-30.18 七條 ecosystem crosswalk、Part IV §34/§36/§38/§41/§42.2 五個 E-phase 章節、Part V §43.2 11 條 ecosystem success criteria。
- Honest sizing update: 程式 phase 從 7 個變成 12 個，total releases 估算從 16–25 升到 **26–43**，duration estimate 從 6–12 個月升到 **6 個月–2 年**。Ecosystem 把 program 規模約翻倍。
- Local docker stack 重建（`down` 保留 `deploy/data/` → `up -d --build`）：`version: "0.15.47"` 接續，tick 從 11882 走到 11890 不斷，`/api/admin/npc-stats` 匿名回 401。

### CI / Deploy evidence

- Commit `ac9e85a` (GM dashboard ship) → CI run `25782314152` ✅ + Deploy Dev run `25782314113` ✅.
- Commit `6d1e627` (ECO doc integration) → CI run `25782668554` ✅ + Deploy Dev run `25782668586` ✅.
- 本地 healthz post-rebuild: `{"ok":true,"version":"0.15.47","tick":11890}`.

### Historical outstanding notes from original session

- `gm-npc-dashboard` was archived later in commit `5864e1a`.
- Phase 0 architecture-formalization is now tracked above in the v0.15.48 entry.
- Browser visual smoke of `/admin/npcs` was not independently reproduced in this opencode session; retain as residual manual confidence check if desired.

## 2026-05-13 — GM NPC Dashboard slice

### Implemented

- New OpenSpec change `gm-npc-dashboard` (proposal + tasks + spec; validates strict).
- `SqliteEventStore.countEventsByKind(kind)` — additive helper backed by existing `idx_event_log_type` index.
- `SimulationRuntime.getManualNpcIds()` — returns the loaded profile IDs.
- `GET /api/admin/npc-stats` (`packages/server/src/http/adminNpcsRouter.ts`) gated to `gm` or `admin` via `requireRole`. Response: `{ totalNpcs, byOrigin: { manual, born }, births: { totalEventCount, recent[] }, households: { totalEventCount, recent[] }, deaths: { available: false, reason, plannedAt }, generatedAtTick }`.
- New frontend `AdminNpcsPage` at `/admin/npcs` with stat cards (Total / Manual / Born / Births / Households / Deaths placeholder), recent-births table, recent-households table, deaths "Phase 5 pending" panel; access-denied fallback for non-GM/admin.
- `AdminPage` gains a `「進入 NPC 儀表板」` action link.
- i18n keys (zh + en) for the new page.

### Honest scope

- `byOrigin.born` is `0` today because `NPC_CHILD_BORN` records children as parent-side linkage, not as standalone runtime NPCs. Promoting children to full NPC entities is a Phase 1 follow-up in `docs/WORLD_CAPABILITIES.md`.
- `deaths.available` is `false` until Phase 5.2 lands `NPC_DECEASED`. The page surfaces this honestly rather than rendering an empty column.

### Verification

- `npm test`: 219 server tests + 34 web tests passed (added 6 adminNpcsRouter tests).
- `npm run build:server` passed.
- `npm run build:web` passed (only the known Vite chunk-size warning).
- `npx tsc -p packages/server/tsconfig.json --noEmit` + `packages/web/tsconfig.json --noEmit` passed.
- `npx openspec validate gm-npc-dashboard --strict` passed.
- TODO post-push: live `curl https://hunter.sisihome.org/api/admin/npc-stats` smoke (deploy auto-triggers on push).

## 2026-05-12 — v0.15.47f OpenSpec Alignment + Worktree/Branch Convergence

### Cleanup

- Created `openspec/changes/world-agenda-directives/design.md` covering
  deterministic directive derivation, sponsor precedence (civilian dominance fix),
  pressureScore ranking, and runtime flow.
- Backported monotonic invariant (section 10) and shared visibility cap (section 11)
  to `openspec/changes/civ-evo-construction/tasks.md` so implementation tasks are
  visible in all doc surfaces.
- Removed 8 stale git worktrees from `.claude/worktrees/` (bold-solomon, brave-banach,
  cranky-hawking, determined-yalow, dreamy-galileo, exciting-hugle, inspiring-goldberg,
  mystifying-davinci).
- Removed 1 external worktree at `greed-island-npc-humanity`.
- Deleted 9 merged local branches (`claude/brave-banach`, `claude/cranky-hawking`,
  `claude/determined-yalow`, `claude/dreamy-galileo`, `claude/exciting-hugle`,
  `claude/frosty-sutherland`, `claude/inspiring-goldberg`, `claude/mystifying-davinci`,
  `opencode/npc-humanity-ai-memory`).
- Force-deleted 2 unmerged branches locally + remotely (`claude/bold-solomon-e77264`,
  `claude/magical-maxwell-ae08a2`).
- Deleted 9 merged remote branches (`origin/claude/*` stale branches +
  `origin/opencode/npc-humanity-ai-memory`).
- Final state: single worktree on `main`, single local+remote branch (`main`).

### Verification

- Commit `176c47c` (`docs: align OpenSpec docs with system`) passed
  CI run `25775186467` and Deploy Dev run `25775186475`; both only reported
  the known Node.js 20 actions deprecation annotation.

## 2026-05-12 — v0.15.47e Completed NPC Buildings Persist

### Implemented

- Added `packages/server/src/buildings/dynamicConstruction.ts`.
- Completed NPC-initiated construction projects now project into permanent
  `BuildingRuntimeView` rows instead of disappearing when `completedAtTick` is
  set.
- Runtime now merges completed NPC buildings into:
  - `getBuildingsOnTile(tileId)`
  - `getAllBuildings()`
  - `/api/buildings?tileId=X`
  - `/api/buildings/:id`
- Completed dynamic building IDs are project-specific, e.g.
  `b_civ_evo_t_central.abcdef12`, so repeated autonomous projects on the same
  tile do not collide.
- Completed buildings are enterable `landmark` buildings, retain
  `ownerNpcId = initiatedByNpcId`, and expose basic hiring slots.
- Follow-up: `BuildingRuntime` now accepts runtime-projected completed building
  defs, so the owner NPC can be resolved as an occupant when working/trading/etc.
  in the same tile. Those NPCs are removed from outdoor presence, preventing
  indoor/outdoor duplication for dynamic completed buildings.
- Hotfix: NPC autonomous construction is capped at 3 completed/open facilities
  per tile. This stops repeated same-tile "自主設施" speculation and caps the
  runtime/API projection so existing live history no longer renders dozens of
  duplicate building icons.
- Follow-up realism fix: autonomous construction now requires both real NPC
  construction demand and enough personal gold (`CIV_EVO_CONSTRUCTION_GOLD_COST`).
  `CONSTRUCTION_INITIATE` carries `goldCost`, and the lifeExpansion projection
  deducts the initiating NPC's gold exactly once. Healthy-economy tiles are not
  permanently excluded; they require stronger personal demand.
- Chronicle clarity fix: routine `NPC_PRODUCTIVE_ACTION` events are still stored
  and visible under NPC filtering, but no longer drive the default chronicle
  summary/ticker surface. Construction site labels now spell out progress as
  `建造中 current/target` plus remaining points instead of an unexplained ratio.
- World agenda slice: added deterministic `WorldAgendaDirective` derivation from
  area resources, faction control, and active world events. Life-goal,
  productive-action, and construction motivations now cite a sponsor/directive,
  then role interpretation, then personal pressure, so city-scale actions read
  as top-down institutional/faction/hidden-overseer pressure rather than a
  generic NPC motivation pool.
- Follow-up agenda tuning: ordinary `civilian` dominance no longer becomes a
  faction command (`平民地方支部`) because live observation showed it flattened
  every district into the same sponsor. Active world events now outrank local
  faction/resource directives, so hidden-overseer pressure can actually surface.
- Hub construction stability fix: right-bottom expansion map state now merges
  authoritative `lifeExpansion.unlockedTileIds` into active districts, so the
  salt-marsh expansion does not flicker back to `施工中` while `/api/map` is
  still catching up. Construction activity markers also let authoritative
  construction project state suppress stale recent progress events, preventing
  old `CONSTRUCTION_PROJECT_PROGRESS` rows from resurrecting completed sites.
- Building/construction monotonicity invariant: construction/building state may
  advance, but MUST NOT regress or flicker. `withConstructionProgress` now
  ignores progress attempts after completion, `construction_projects` keeps the
  maximum observed progress and first completion tick, and hydrated completed
  records normalize to `progress = targetProgress` so completed buildings never
  look partially built again.
- Completed/open autonomous building visibility now shares one deterministic
  per-tile cap window. Runtime uses the earliest `startedAtTick` projects
  (`projectId` tie-breaker) for both completed dynamic building defs and
  in-progress construction sites, so later projects cannot displace already
  visible buildings or resurrect extra construction markers beyond the cap.

### Verification

- `npx tsc -p packages/server/tsconfig.json --noEmit` passed.
- `npm run test -w @greed-island/server -- dynamicConstruction buildingsRouter runtimeExpansion` passed: 7 tests.
- `npm test` passed: 201 server tests + 30 web tests.
- `npm run build:server` passed.
- `npm run build:web` passed with only the known Vite chunk-size warning.
- `npx openspec validate civ-evo-construction --strict` and
  `npx openspec validate npc-economy-skills --strict` passed.
- Commit `0196436` (`feat(construction): persist completed npc buildings`) passed
  CI run `25738921562` and Deploy Dev run `25738921084`.
- Live `/api/buildings?tileId=t_mountain` verified multiple completed NPC
  buildings now appear, including `b_civ_evo_t_mountain.60c7d731`,
  `b_civ_evo_t_mountain.7eb240bc`, and `b_civ_evo_t_mountain.4e0addcd`.
- Live `/api/buildings/b_civ_evo_t_mountain.60c7d731` returned the completed
  building detail with `enterable: true`, owner `mountain.miner.lei_zi`, interior
  props, and hiring slots.
- Follow-up focused tests: `npm run test -w @greed-island/server -- buildingRuntime dynamicConstruction buildingsRouter runtimeExpansion` passed: 10 tests.
- Hotfix focused tests: `npm run test -w @greed-island/server -- cityLife buildingRuntime dynamicConstruction buildingsRouter runtimeExpansion` passed: 30 tests. `npx tsc -p tsconfig.json --noEmit` passed in `packages/server`.
- Demand/cost focused tests: `npm run test -w @greed-island/server -- cityLife livingWorld runtimeExpansion` passed: 64 tests. `npx tsc -p tsconfig.json --noEmit` passed in `packages/server`.
- Chronicle clarity focused tests: `npm run test -w @greed-island/server -- livingWorld chronicleRenderer` passed: 50 tests. `npm run test -w @greed-island/web -- eventVisibility TimelinePage` passed: 6 tests. Server and web typechecks passed.
- World agenda focused tests: `npm run test -w @greed-island/server -- worldAgenda runtimeExpansion livingWorld` passed: 43 tests. `npx tsc -p tsconfig.json --noEmit` passed in `packages/server`. `npx openspec validate world-agenda-directives --strict` passed.
- Agenda priority focused tests: `npm run test -w @greed-island/server -- worldAgenda runtimeExpansion` passed: 5 tests. `npx tsc -p tsconfig.json --noEmit` passed in `packages/server`. Full `npm test` passed: 213 server tests + 31 web tests. `npm run build:server` passed. `npm run build:web` passed with only the known Vite chunk-size warning. `npx openspec validate world-agenda-directives --strict` passed.
- Commit `4796868` (`fix(world): prefer event agenda over civilian dominance`) passed CI run `25749417496` and Deploy Dev run `25749417500`; both only reported the known Node.js 20 actions deprecation annotation. Live `/healthz` returned version `0.15.47` at tick `102493`. Live `/api/events?limit=12` after deploy showed newest productive motivations using `民生配給會` resource governance or `島嶼主宰的暗流` world-event pressure; remaining `平民地方支部` examples were older pre-deploy history.
- Hub construction stability focused tests: `npm run test -w @greed-island/web -- constructionActivity hubDistricts` passed: 7 tests. `npx tsc -p tsconfig.json --noEmit` passed in `packages/web`. Full `npm test` passed: 213 server tests + 34 web tests. `npm run build:web` passed with only the known Vite chunk-size warning.
- Commit `83e6376` (`fix(hub): stabilize construction map state`) passed CI run `25772000924` and Deploy Dev run `25772000909`; both only reported the known Node.js 20 actions deprecation annotation. Live `/healthz` returned version `0.15.47` at tick `108446`, and live `/api/map` included `t_salt_marsh`, confirming the deployed authoritative map still contains the right-bottom expansion district.
- Construction monotonicity focused tests: `npm run test -w @greed-island/server -- cityLife constructionProjects` passed: 31 tests. `npx tsc -p tsconfig.json --noEmit` passed in `packages/server`. Full `npm test` passed: 216 server tests + 34 web tests. `npm run build:server` passed. `npx openspec validate civ-evo-construction --strict` passed.
- Commit `27e472d` (`fix(construction): enforce monotonic building state`) passed CI run `25773171084` and Deploy Dev run `25773171088`; both only reported the known Node.js 20 actions deprecation annotation. Live `/healthz` returned version `0.15.47` at tick `108852` after deploy.
- Construction visibility cap focused tests: `npm run test -w @greed-island/server -- constructionProjects buildingsRouter dynamicConstruction cityLife` passed: 38 tests. `npx tsc -p tsconfig.json --noEmit` passed in `packages/server`. `npx openspec validate civ-evo-construction --strict` passed. Full `npm test` passed: 217 server tests + 34 web tests. `npm run build:server` passed.
- Commit `9d15598` (`fix(construction): share stable visibility cap`) passed CI run `25773458826` and Deploy Dev run `25773458815`; both only reported the known Node.js 20 actions deprecation annotation. Live `/healthz` returned version `0.15.47` at tick `108947`. Live `/api/buildings?tileId=t_mountain`, `t_dimai`, and `t_central` showed no in-progress overflow and visible autonomous completed buildings stayed capped at three per tile.

## 2026-05-12 — v0.15.47d NPC Personal Economy + Skill XP Slice

### 2026-05-12 Follow-up — Skill XP Affects Productive Output

- Added deterministic helper `productiveDeltaWithNpcSkill(...)`.
- Every 25 XP in the matching skill grants +1 productive delta, capped at +3.
- Domain mapping:
  - `build -> construction`
  - `learn -> knowledge`
  - `trade -> commerce`
  - `service -> civic`
- Runtime now applies skill-adjusted delta to accepted `NPC_PRODUCTIVE_ACTION`
  payloads and to construction progress commands. This means high-skill builders
  build faster, high-commerce NPCs earn more per trade action, and learning XP
  improves future learn actions.
- Tests added for matching-domain bonus, non-matching-domain isolation, and cap
  behavior.
- Verification: `npm test` passed (198 server tests + 30 web tests),
  `npm run build:server` passed, `npm run build:web` passed with the known Vite
  chunk-size warning, and `npx openspec validate npc-economy-skills --strict`
  passed.
- Commit `55aa49a` (`feat(npc): let skill xp improve productive output`) passed
  CI run `25732723920` and Deploy Dev run `25732723905`.
- Live `/api/events?limit=100` verified skill-boosted productive deltas after
  deploy:
  - `forest.falconer.ye_jing` build delta `5`.
  - `desert.starreader.gu_lao` learn delta `5`.
  - `port.concierge.an_qing_an` service delta `5`.
  - `port.merchant.anton` trade delta `5`.

### Implemented

- Added OpenSpec change `openspec/changes/npc-economy-skills/`.
- Extended `LifeExpansionState` with `npcCivicRecords[npcId]`:
  - `gold`: deterministic personal money earned from productive actions.
  - `skillXp`: deterministic XP buckets for `construction`, `knowledge`,
    `commerce`, and `civic`.
  - `lastProductiveTick`: last tick where accepted productive work changed the
    NPC's personal record.
- Added pure reducer `withNpcProductiveActionRecorded(...)`:
  - `build -> construction XP`, gold `1 * delta`.
  - `learn -> knowledge XP`, gold `0`.
  - `trade -> commerce XP`, gold `3 * delta`.
  - `service -> civic XP`, gold `2 * delta`.
  - XP gain is `5 * delta`.
- Runtime now updates `lifeExpansion` after accepted `NPC_PRODUCTIVE_ACTION`, so
  NPC work/learning has replayable personal consequences rather than only flavor
  narration.
- `SimulationRuntime.getNpcs()` now exposes `npc.civic` so `/api/npcs` consumers
  can inspect NPC money and skill XP.
- Frontend `NpcSummary` type now includes optional `civic`.

### Verification

- Focused tests: `npm run test -w @greed-island/server -- runtimeExpansion cityLife` passed.
- Full suite during implementation: `npm test` passed with 196 server tests + 30 web tests.
- Builds: `npm run build:server` passed; `npm run build:web` passed with only the existing Vite chunk-size warning.
- OpenSpec: `npx openspec validate npc-economy-skills --strict` passed.

### CI/CD + Live Verification

- Commit `5a898f7` (`feat(npc): persist personal economy and skill xp`) pushed to
  `main`.
- CI run `25731941727` passed: OpenSpec validate + build/typecheck/test.
- Deploy Dev run `25731941739` passed.
- Live `/api/npcs` after deploy: 50 NPCs total, 9 already have non-null `civic`
  records after productive ticks.
- Sample live records confirmed:
  - `central.broker.gui`: `gold=6`, `commerce XP=10`, `lastProductiveTick=98692`.
  - `central.busker.huang_yu_cheng`: `gold=1`, `construction XP=5`.
  - `central.guildclerk.su_fang`: `gold=4`, `civic XP=10`.

## 2026-05-12 — v0.15.47c Projection Payload Nesting Fix + E2E Completion Verified

### 2026-05-12 Follow-up — Active-District Construction Visibility Fix

- User reported that NPC construction still looked invisible on the Hub map: no
  NPC/build crew appeared to be building, so completed projects felt like they
  appeared out of nowhere.
- Root cause: `packages/web/src/game/MapScene.ts` skipped construction-site
  rendering whenever `activity.districtId` was already active/unlocked:
  `if (this.isActiveDistrict(activity.districtId)) continue`. Autonomous civ-evo
  projects currently target active districts such as `t_dimai` and `t_mountain`,
  so the frontend deliberately hid them.
- Fix: removed that active-district skip. Hub construction markers now render on
  both active districts and locked expansion districts, showing the construction
  label, progress fraction, builder names, and animated worker/tool markers.
- Also updated `packages/web/src/pages/constructionActivity.ts` to read recent
  rule-engine events from `payload.data` with fallback to flat `payload`, matching
  the live typed-event shape.
- Verification: `npm run test -w @greed-island/web -- constructionActivity`
  passed (4 tests); `npm run build:web` passed with only the known Vite chunk-size
  warning.

### What Was Fixed

The `constructionProjects` projection's `buildRowsFromEvents()` was reading
event payload fields directly from `event.payload.*`, but the rule engine wraps
all typed-event fields under `event.payload.data` (with `actorType` and
`narration` at the outer level). This caused all `project(ev)` calls to silently
skip CONSTRUCTION_PROJECT_PROGRESS and BUILDING_CONSTRUCTED events, leaving the
projection permanently stale — the `/api/buildings` endpoint showed completed
projects with frozen progress values.

**`packages/server/src/projections/constructionProjects.ts`:**
- `data = isRecord(payload.data) ? payload.data : payload` — reads from the
  nested `.data` field for live rule-engine events, falls back to the flat
  payload for test fixtures.
- All three event-type handlers (CONSTRUCTION_INITIATE / CONSTRUCTION_PROJECT_PROGRESS /
  BUILDING_CONSTRUCTED) now use `data.*` instead of `payload.*`.

### What Was Verified End-to-End Live

- NPC-initiated project on t_mountain (lei_zi) progressed from 0 → 24/24,
  completed at tick 97993 with `completedAtTick` set in world fact.
- `BUILDING_CONSTRUCTED` event was emitted and recorded in EventLog.
- After projection fix deploy, `/api/buildings?tileId=t_mountain` correctly
  returns only the active project (progress 7/24 by mo_fan), with no stale
  completed entries.
- NPC autonomous construction continues generating new projects: **5 total
  in world history** (2 completed by lei_zi, 2 in progress by lei_zi + mo_fan).

### Local Verification

- `npm test`: 195 server tests all pass (23 files).
- `npm run build:server` passed.
- `git diff --check` passed.

### CI/CD

- Commits `392dbb1` (projection fix) passed CI run `25729485271` and
  Deploy Dev run `25729485263` (live-verified after deploy).

## 2026-05-12 — v0.15.47 NPC-Initiated Construction Surface

### Completed Locally

- Continued `openspec/changes/civ-evo-construction/` through Slice 4-6.
- Added `ConstructionProjectsProjection` with `rebuildFromEvents()`,
  `getInProgressByTile()`, `getByProjectId()`, and canonical-hash tests.
- Hydrated/runtime-projected `construction_projects` from the committed
  EventLog/lifeExpansion state, and projected newly committed construction
  events as they arrive.
- Extended `GET /api/buildings?tileId=X` to return `inProgress` NPC-initiated
  projects, and to expose each open project as an enterable `construction`
  site view so the player can click into it from the Area map.
- Extended the Hub construction projection so NPC-initiated in-progress projects
  render through existing `MapScene.drawConstructionSites()` with no new Phaser
  drawing branch.
- Added B1 demo trigger: `CIV_EVO_CONSTRUCTION_DEMO_ECONOMY_THRESHOLD = 80` so
  current low/mid-economy districts can trigger autonomous construction now.
- Preserved the correction that salt-marsh remains a legacy/system fixed project
  (`initiatedByNpcId: ""`) and must not be described as NPC-autonomous.
- Bumped app version from `0.15.46` to `0.15.47`.

### Local Verification

- `npm run test -w @greed-island/server -- constructionProjects buildingsRouter cityLife` passed: 20 tests.
- `npm run test -w @greed-island/web -- constructionActivity` passed: 3 tests.
- `npm test` passed: server 23 files / 193 tests, web 10 files / 29 tests.
- `npm run build:server` passed.
- `npm run build:web` passed, with the existing Vite chunk-size warning.
- `npx openspec validate civ-evo-construction --strict` passed.
- `git diff --check` passed.

### CI/CD + Live Verification

- Commit `212dd78` (`feat(construction): surface npc-initiated sites`) passed CI
  run `25726976702` and Deploy Dev run `25726976704`.
- Follow-up commit `291be4a` fixed `packages/server/src/version.ts` so
  `/healthz` and `/api/version` report the intended `0.15.47` app version.
- Commit `291be4a` passed CI run `25727404230` and Deploy Dev run
  `25727404200`; the only recurring annotation is the existing GitHub Actions
  Node.js 20 deprecation warning.
- Live public and direct deployed health checks both returned `version=0.15.47`
  at tick `97547`.
- Live `/api/world` at tick `97562` contains one open NPC-initiated project:
  `project.civ-evo.60c7d73178549922db29fbde`, target tile `t_mountain`,
  building `b_civ_evo_t_mountain`, initiated by `mountain.miner.lei_zi`,
  progress `0/24`.
- Live `/api/buildings?tileId=t_mountain` returns that project in `inProgress`
  and exposes `b_civ_evo_t_mountain` as an enterable `construction` building
  with glyph `🚧`.
- Live `/api/buildings/b_civ_evo_t_mountain` returns the construction building
  detail and interior props, confirming the Area click-through target is served.

### Still Open

- **6.3 UI smoke** (manual browser click-through still needs visual confirmation)
- Salt-marsh `withUnlockedExpansion` is still salt-marsh-specific; generic `BUILDING_CONSTRUCTED` unlock for NPC-initiated projects remains for a later slice.

## 2026-05-12 — v0.15.47b NPC-Initiated Construction Progress Fix

### What Was Missing

Despite Slice 4-6 making NPC-initiated projects visible through the API/frontend,
`withConstructionProgress()` in `cityLife.ts` was only ever called with no
`projectId`, defaulting to the hardcoded salt-marsh project. NPC-initiated
projects (e.g. `mountain.miner.lei_zi`'s `b_civ_evo_t_mountain`) never advanced
past 0/24.

### Fix

**`packages/server/src/sim/runtime.ts`:**
1. Reducer for `CONSTRUCTION_PROJECT_PROGRESS` now extracts `projectId` from the
   command payload and passes it to `withConstructionProgress()`. Without this,
   even if the command is emitted, the reducer ignores the target project.
2. After each productive NPC event, the runtime now scans for any open
   NPC-initiated project on the NPC's tile and emits
   `CONSTRUCTION_PROJECT_PROGRESS` for it (same delta logic: 2 for `build`
   domain, 1 for others).

**`packages/server/src/sim/cityLife.test.ts`:**
- Added "Slice 7: E2E lifecycle" describe block with two tests: progress
  advancing through target, clamp-on-overflow behavior.

### Verification

- `npm test`: 195 server tests + 29 web tests passed
  (server count includes +2 new E2E lifecycle tests).
- `npm run build:server` + `npm run build:web` passed.

## 2026-05-12 — Construction Autonomy Correction

### Verified Reality

- User report was correct: the current visible salt-marsh map expansion is not a
  fully NPC-autonomous construction system.
- Live `/api/world` at tick `96466` shows only
  `project.salt_marsh_settlement` under `lifeExpansion.constructionProjects`,
  with `initiatedByNpcId: ""`. That marks it as the legacy/system project, not
  an NPC-initiated project.
- Code confirms the hard-coded path:
  - `packages/server/src/sim/cityLife.ts` has fixed constants
    `SALT_MARSH_PROJECT_ID`, `SALT_MARSH_TILE_ID`,
    `SALT_MARSH_BUILDING_ID`, and `SALT_MARSH_PROJECT_TARGET`.
  - `withConstructionProgress()` always creates/updates that fixed salt-marsh
    project when no project exists.
  - `withUnlockedExpansion()` always unlocks `t_salt_marsh` and
    `b_salt_marsh_field_station`.
  - `packages/server/src/sim/runtime.ts` converts generic
    `NPC_PRODUCTIVE_ACTION` output into progress for that fixed salt-marsh
    project. NPC labor is used as a trigger/source attribution, but the project
    target is not autonomously selected by an NPC.
- The civ-evo-construction work through `v0.15.43` only implemented autonomous
  initiation (`CONSTRUCTION_INITIATE` records with `initiatedByNpcId`) for
  non-salt-marsh low-economy districts. The remaining projection/API/frontend
  slices are still incomplete, so those projects are not yet the current visible
  Hub map construction experience.

### Correct Framing

- Do not describe the current salt-marsh Hub construction as "NPC autonomous
  building". It is a legacy fixed expansion whose progress is advanced by
  accepted NPC productive events.
- Real NPC-autonomous construction requires continuing
  `openspec/changes/civ-evo-construction/` Slice 4+:
  `construction_projects` projection, API exposure, frontend Hub projection,
  and generic project progress/completion behavior.

## 2026-05-12 — v0.15.46 MapScene Restart-Safe Sprite Registries

### Completed This Session

- Live browser crash captured during v0.15.45 testing:
  `Uncaught TypeError: Cannot read properties of undefined (reading 'sys')`
  thrown from `setTexture` inside `MapScene.refreshNpcSprites` (call
  stack: `step → update → step → bootScene → create → spawnNpcs →
  refreshNpcSprites:913 → setTexture:phaser.js:45368`).
- Root cause: `MapScene.applyExternalUpdate()` calls `this.scene.restart()`
  whenever `activeDistrictIds` content changes. `scene.restart()` reuses
  the same `MapScene` JS instance, so class-field Maps such as
  `npcSprites`, `peerSprites`, and `districtLabels` retained references
  to display objects from the previous, now-destroyed scene. The first
  `refreshNpcSprites` after restart fetched a dead sprite from the Map
  and called `setTexture` on it, which faulted inside Phaser because
  the sprite's `.scene` was undefined. Symptom in the browser: half the
  Hub map renders, the rest is frozen, t_salt_marsh still labelled
  「施工中」.
- Fix in `MapScene.ts`:
  - New `resetSpriteRegistries()` clears every Map / array / nullable
    field that holds a Phaser display reference: `npcSprites`,
    `peerSprites`, `districtLabels`, `constructionSiteObjects`,
    `playerNameLabel`, `overlayGraphics`, `envSprites`, `envTweens`,
    `nearbyNpcId`.
  - Called at the top of `create()` (defensive — even the first create
    is safe) and from SHUTDOWN / DESTROY handlers (so the next create
    on restart sees empty registries).
- Bumped app version from `0.15.45` to `0.15.46`.

### Local Verification

- `npm test` passed: server 22 / 189, web 10 / 28.
- `npm run build:server` and `npm run build:web` passed.

### Still Open

- Docker rebuild + browser hard reload to confirm the crash is gone.
- Investigate WHY `activeDistrictIds` content is changing at all during
  a session (it should be stable while the world is up). Suspected
  cause: a transient `/api/map` snapshot during boot hydration that
  excludes a tile then re-includes it. Worth tracing once the crash is
  out of the way.

## 2026-05-12 — v0.15.45 Hub Mount Latch + Since-Panel Session Memory

### Completed This Session

- Two regressions reported by the user during live v0.15.44 testing:
  - Hub map kept flipping between "施工中 / 載入中" placeholder and the
    populated map, requiring frequent reloads. Root cause: the v0.15.44
    gate `source === 'server'` unmounted / remounted the entire Phaser
    scene whenever SSE briefly fell back to `'fixture'` on a transient
    error.
  - The "不在時的潮鳴市" (Since-Last-Visit) panel popped up on every
    HubPage mount, route change, or reload — not just when the user
    actually returned after being offline.
- Fixes:
  - `HubPage`: replaced the live `source === 'server'` gate with a
    one-way `hasServerWorld` latch held in `useState`. Once true, the
    Phaser canvas stays mounted forever — transient SSE/poll failures
    no longer tear the scene down.
  - `HubPage`: `showSincePanel` now hydrates from `sessionStorage`
    (key `gi:hub:since-panel-dismissed:v1`). Dismissal persists for
    the tab session; closing the tab and reopening still surfaces the
    catch-up panel, matching the user-reported expectation
    "只有離線重新進入世界才跳".
- Bumped app version from `0.15.44` to `0.15.45`.

### Local Verification

- `npm test` passed: server 22 files / 189 tests, web 10 files / 28
  tests.
- `npm run build:server` and `npm run build:web` passed.

### Still Open

- Live browser smoke after docker rebuild:
  - Hub map should stay mounted across network blips (the scene must
    not "reset" while panning / moving).
  - Closing the catch-up panel should keep it closed for the rest of
    the tab session.
- civ-evo-construction Slice 4+ continues to wait.

## 2026-05-12 — v0.15.44 Hub Traveller Sprite + Fixture Flicker Fix

### Completed This Session

- Two related Hub map UX bugs surfaced by the v0.15.40 diagnostic:
  - **Static traveller sprite** — `MapScene.computeNpcTarget` returned
    the literal midpoint of `from`/`to` district centers for routed
    NPCs, so the sprite spawned at the midpoint and sat there until the
    server's route visibility hold (4 ticks ≈ 20s) expired. To the user
    this looked like "the NPC is shown but does not move".
  - **District label flicker** — `WorldStateContext` falls back to
    `fixtureMap` until `/api/world` responds. The fixture has only 8
    tiles (no `t_salt_marsh`), so `HubPage.activeDistrictIds` briefly
    omits `t_salt_marsh`; `MapScene.labelFor()` then prints "施工中"
    for that district. The label flipped to the real name as soon as
    the server snapshot arrived.
- Fixes:
  - `MapScene.computeNpcTarget` now returns the *destination*
    district's center for routed NPCs. A new
    `computeNpcSpawnPosition` returns the *origin* center, so a freshly
    spawned routed sprite starts at the origin and tweens toward the
    destination.
  - `MapScene.tweenNpcTo` accepts an optional `durationMs`. Routed
    travellers use `NPC_ROUTED_TWEEN_MS = 18000ms`, close to the
    server's `NPC_CROSS_TILE_ROUTE_VISIBLE_TICKS = 4` window of ~20s.
    Non-routed NPCs keep the existing `NPC_MOVE_TWEEN_MS = 4500ms`
    tick-pace tween.
  - `HubPage` only mounts the Phaser canvas when
    `useWorldState().source === 'server'`. Before that it shows a thin
    "載入潮鳴市…" / "Loading Tide Hum City…" placeholder, eliminating
    the brief "施工中" flicker from fixture state.
- Bumped app version from `0.15.43` to `0.15.44`.

### Local Verification

- `npm test` passed: server 22 files / 189 tests, web 10 files / 28
  tests.
- `npm run build:server` and `npm run build:web` passed.
- Local docker rebuilt; `/healthz` returns `version=0.15.44`.

### Still Open

- Live browser smoke: confirm routed travellers visibly walk between
  districts and that no district shows "施工中" on cold reload.
- Hub-side rendering regression test (still gated on a deterministic
  Phaser test harness, deferred since v0.15.40).
- civ-evo-construction Slice 4+ (projection / API / frontend) remains
  on the queue.

## 2026-05-12 — v0.15.43 civ-evo-construction Slice 3: NPC Policy

### Completed This Session

- First policy slice of `openspec/changes/civ-evo-construction/`.
  NPCs in low-economy districts can now autonomously submit
  `CONSTRUCTION_INITIATE` commands through the existing
  productive-build event path; the §11.8 loop is not yet user-visible
  end-to-end because projection/API/frontend slices remain open.
  - `packages/server/src/sim/cityLife.ts`: added pure
    `decideCivEvoConstructionInitiate(input)`. Returns the command
    payload to emit, or `null` when policy says "skip this tick". Gating
    rules per `openspec/changes/civ-evo-construction/tasks.md` Slice 3:
    not salt-marsh, `areaState.resources.economy < 50` (Slice-3 proxy
    for the §11.8 infrastructure resource that is not yet modelled),
    no open civ-evo project on this tile, no open civ-evo project by
    this NPC. Building id is `b_civ_evo_${tile}`, duration is a fixed
    `24` ticks.
  - `packages/server/src/sim/runtime.ts`: every productive-build event
    is now also evaluated for civ-evo initiation. Salt-marsh's existing
    progress engine is unchanged.
  - `packages/server/src/sim/npcEngine.ts`: reserved a new
    `NpcAgentTaskKind = 'build'` value for the projection layer to
    advertise "this NPC is autonomously building" later (Slices 6 / 7);
    the deterministic record lives in
    `lifeExpansion.constructionProjects[…].initiatedByNpcId`.
  - `packages/server/src/sim/cityLife.test.ts`: 7 new tests pinning
    each gate (low economy, salt-marsh, same-tile race, per-NPC single
    open project, salt-marsh project not blocking civ-evo on other
    tiles, re-emission allowed after completion).
- Bumped app version from `0.15.42` to `0.15.43`.

### Local Verification

- `npm run test -w @greed-island/server -- cityLife` passed: 14 tests
  (was 7 — added 7 Slice-3 policy cases).
- `npm test` passed: server 22 files / 189 tests, web 10 files / 28
  tests.
- `npm run build:server` and `npm run build:web` passed.
- `openspec validate civ-evo-construction --strict` still passes.

### Still Open

- Docker rebuild + browser smoke after deploy: a low-economy district
  should produce a single open civ-evo project per tile.
- Slice 4 next: `construction_projects` projection table with
  `rebuildFromEvents` + canonical-hash test (closes §11.7 partially for
  this domain).
- Open question: whether to introduce a real `infrastructure` resource
  on `AreaState` (currently proxied by `economy`). Defer to a later
  slice — the policy boundary is the only call site.

## 2026-05-12 — v0.15.42 civ-evo-construction Slice 2: Event Reducer

### Completed This Session

- Second implementation slice of `openspec/changes/civ-evo-construction/`.
  Adds the deterministic reducer that turns a committed
  `CONSTRUCTION_INITIATE` event into a `ConstructionProjectRecord`,
  tagged with the originating NPC.
  - `packages/server/src/sim/cityLife.ts`:
    - Extended `ConstructionProjectRecord` with `initiatedByNpcId: string`
      (legacy salt-marsh records default to `''`).
    - Added `deriveConstructionInitiateProjectId(...)` returning a stable
      `project.civ-evo.<24-char hash>` id seeded by canonical-JSON over
      `{scheme, npcId, tileId, buildingId, startedAtTick, rulesetVersion}`.
    - Added `withConstructionInitiated(state, input)` reducer.
      Idempotent: if the derived `projectId` already exists, returns
      state ref unchanged — required for EventLog replay determinism.
    - Updated `hydrateLifeExpansionState` to preserve `initiatedByNpcId`
      on the way in (defaults to `''` for older snapshots).
  - `packages/server/src/sim/runtime.ts`: added a `CONSTRUCTION_INITIATE`
    branch to the Rule-Engine-accepted command dispatch alongside the
    existing salt-marsh `CONSTRUCTION_PROJECT_PROGRESS` branch.
  - `packages/server/src/sim/cityLife.test.ts`: 5 new tests covering
    deterministic projectId derivation, record shape, idempotency,
    distinct projects per `(npcId, tick)`, and `hydrateLifeExpansionState`
    round-trip.
- No NPC policy emits `CONSTRUCTION_INITIATE` yet (Slice 3). The
  reducer is exercised only via tests so far; running the deployed
  server still observes 0 new civ-evo projects.
- Bumped app version from `0.15.41` to `0.15.42`.

### Local Verification

- `npm run test -w @greed-island/server -- cityLife` passed: 7 tests.
- `npm test` passed: server 22 files / 182 tests, web 10 files / 28
  tests.
- `npm run build:server` passed (`exactOptionalPropertyTypes` mode
  required guarding the optional `rulesetVersion` spread).
- `npm run build:web` passed.
- `openspec validate civ-evo-construction --strict` still passes.

### Still Open

- Slice 3 (NPC policy + `build` task variant) — next. Will be the first
  slice with user-visible effect once an NPC actually emits the command.
- Open questions in `design.md` will start to bite at Slice 3 (catalog
  scope, duration model, same-tile race, tile buildability check
  location, chronicle narration).

## 2026-05-12 — v0.15.41 civ-evo-construction Slice 1: Command Catalog

### Completed This Session

- First implementation slice of `openspec/changes/civ-evo-construction/`.
  Adds the `CONSTRUCTION_INITIATE` command type so NPCs can later submit
  autonomous construction intent through the Rule Engine.
  - `packages/server/src/kernel/livingWorldCommands.ts`: added
    `CONSTRUCTION_INITIATE` to `LIVING_WORLD_COMMAND_TYPES`,
    `ConstructionInitiateCmd` payload type, union membership, and the
    matching `VALIDATORS` entry (non-empty `npcId/tileId/buildingId`,
    integer `duration` in `[1, 1000]`, optional `ConstructionMotivation`,
    required `narration`).
  - `packages/server/src/kernel/livingWorld.test.ts`: extended the
    catalog-accepts test plus added a dedicated
    `CONSTRUCTION_INITIATE validator` block covering each rejection path
    (empty IDs, non-numeric / fractional / zero / out-of-range duration,
    non-string narration, malformed motivation).
- No NPC policy emits this command yet — that lands in Slice 3 (task
  group 3 in `openspec/changes/civ-evo-construction/tasks.md`). The
  Rule Engine simply now refuses to drop the command on the floor when
  a future policy emits it.
- Bumped app version from `0.15.40` to `0.15.41`.

### Local Verification

- `npm run test -w @greed-island/server -- livingWorld` passed: 38 tests
  (incl. 11 new `CONSTRUCTION_INITIATE` validator cases).
- `npm test` passed: server 22 files / 167 tests, web 10 files / 28
  tests.
- `npm run build:server` passed.
- `npm run build:web` passed, with the existing Vite chunk-size warning.
- `openspec validate civ-evo-construction --strict` still passes.

### Still Open

- Slice 2 (Event Reducer + `initiatedByNpcId` + deterministic
  `projectId` hash + replay test) — next.
- Open questions on duration / catalog scope / same-tile race / tile
  buildability / chronicle narration remain unanswered; defaults
  reused from `design.md` are tolerated until Slice 3 (NPC policy).

## 2026-05-12 — Civilization Evolution + Combat Phase C OpenSpec Proposed

### Completed This Session

- Drafted and committed two reviewable OpenSpec changes for the two largest
  open architectural targets in `ARCHITECTURE.md` §11:
  - `openspec/changes/civ-evo-construction/`: smallest deterministic slice of
    §11.8 (Civilization Evolution). NPCs autonomously submit
    `CONSTRUCTION_INITIATE` commands; Rule Engine commits `CONSTRUCTION_INITIATED`
    events; no new `FACT_SET` domain introduced (avoids §11.5 regression).
    Production chains, settlement formation, and factions remain out of scope
    for this slice.
  - `openspec/changes/combat-phase-c-realtime-subtick/`: sibling change to
    `combat-phase-b-single-shot/`. 10 Hz sub-tick loop, 5-phase rule engine,
    deterministic card priority + `(actorId, commandId)` tie-break, SSE-driven
    `CombatProjection` with reconcile-on-reject. Refactors `CombatStore` into
    a read-only projection of canonical EventLog events, closing §11.4.
- Both proposals pass `openspec validate --strict`. Each carries an explicit
  Open Questions block in `design.md` that blocks `/opsx:apply` until answered.

### CI/CD + Live Verification

- Commit `da88078` pushed to `main`.
- GitHub Actions CI run `25718288400` passed.
- GitHub Actions Deploy Dev run `25718288375` passed (docs-only change, no
  runtime delta expected).

### Still Open

- User decision required on each proposal's Open Questions before any task
  implementation begins.
- `civ-evo-construction` open questions:
  1. Building catalog scope for first slice (whitelist vs full catalog)
  2. Construction duration model (fixed per-building / hash-bounded / NPC-skill)
  3. Same-tile race policy (first-wins vs multi-NPC collaboration)
  4. Tile-buildability check location (NPC policy vs Rule Engine validator)
  5. Chronicle / Timeline narration of NPC-initiated construction in this slice
- `combat-phase-c-realtime-subtick` open questions:
  1. Multi-tick card channeling vs instant-cast in v1
  2. NPC card AI: keep `seededRandInt(deck)` in v1, planner in Phase D
  3. Damage formula: card stats replace Phase B formula or layer on top
  4. Snapshot retention duration after combat resolves
  5. AoE cards (nullable target) in v1 or strictly single-target

## 2026-05-12 — v0.15.40 Hub Traveller Diagnostic Instrumentation

### Completed This Session

- Reproduced the Hub traveller rendering investigation from the v0.15.39 handoff
  end-to-end via static analysis of `hubMapNpcs()`, `PhaserGame` effect
  plumbing, `MapScene.applyExternalUpdate()`, `refreshNpcSprites()`, and
  `computeNpcTarget()`. Code path is consistent with the projection tests and
  there is no obvious filter or coordinate bug visible without browser state.
- Added diagnostic instrumentation so the next live deploy exposes the gap
  directly instead of requiring another static-analysis pass:
  - `MapScene.getHubTravellerDiagnostics()` returns `inputCount`,
    `routedInputCount`, `routedInputIds`, `spriteCount`, and per-sprite
    `{ x, y, alpha, depth, visible }` entries.
  - `PhaserGame` exposes the getter as `window.__giHubTravellerDiagnostics()`
    so the live Hub can be probed from browser devtools without a dev build.
  - `MapScene.refreshNpcSprites()` emits one `console.debug('[gi:hub-traveller]', …)`
    summary per refresh when the input contains routed travellers.
  - `HubPage` emits `console.debug('[gi:hub-traveller:react]', …)` whenever
    the React projection produces routed map NPCs, so we can tell whether the
    gap is at the React state, projection, or Phaser sprite layer.
- Bumped app version from `0.15.39` to `0.15.40`.

### Local Verification

- `npm test` passed: server 22 files / 166 tests, web 10 files / 28 tests.
- `npm run build:server` passed.
- `npm run build:web` passed, with the existing Vite chunk-size warning.

### CI/CD + Live Verification

- Commit `6eebc8e` pushed to `main`.
- GitHub Actions CI run `25718223343` passed.
- GitHub Actions Deploy Dev run `25718223330` passed (Deploy Dev runner-internal
  smoke check confirms `v0.15.40` is running on the desktop host).

### Still Open

- Use the new diagnostic in a live browser session to capture
  `routedInputCount` vs `spriteCount` and per-sprite `(x, y, alpha, depth,
  visible)` for a sample tick where the side text says an NPC is moving. The
  resulting evidence pins the visual failure to one of:
  (a) React state lacks routed travellers (server projection bug),
  (b) `hubMapNpcs()` projection drops routed travellers in the browser,
  (c) `refreshNpcSprites()` does not create the sprite,
  (d) sprite exists but is invisible (alpha / depth / off-canvas).
- Add a frontend rendering regression test once the concrete failure is found.
- Do not reintroduce parent-map child NPC rendering as a workaround. Hub must
  stay limited to routed cross-district travellers.

## 2026-05-12 — v0.15.39 Hub Traveller Rendering Follow-Up

### Completed This Session

- Confirmed live `v0.15.39` already fixed the server-side scarcity problem: live
  `/api/npcs` sampling after deploy produced legal routed Hub travellers with
  `activity=move` and a non-null `travelRoute`.
- Investigated the remaining report that the Hub map still looks visually empty
  even when side text says an NPC is moving between districts.
- Reviewed the current frontend path:
  - `HubPage` projects `useWorldState().npcs` through `hubMapNpcs()`.
  - `hubMapNpcs()` only emits NPCs with known district ids, `activity=move`, no
    `buildingId`, and a normalized `travelRoute`.
  - `PhaserGame` passes those `MapNpc[]` into `MapScene.applyExternalUpdate()`.
  - `MapScene.refreshNpcSprites()` should create/update one sprite per routed
    NPC, and `computeNpcTarget()` should place routed NPCs at the midpoint
    between `fromDistrictId` and `toDistrictId`.
- No product code change was made in this follow-up; the worktree was still clean
  before this documentation update, except for the pre-existing untracked
  `.claude/worktrees/` directory.

### Current Assessment

- The server and React projection now appear to provide the data required for Hub
  traveller rendering.
- The likely remaining gap is a runtime/visual Phaser behavior issue rather than
  missing server travellers. The next debugging step should verify the actual
  Phaser object state in browser/devtools or an automated browser smoke test:
  routed `mapNpcs.length`, `MapScene.npcSprites.size`, sprite `alpha`, depth, and
  final `(x,y)` positions during a live traveller sample.
- Do not reintroduce parent-map child NPC rendering as a workaround. Hub must stay
  limited to routed cross-district travellers; child area NPCs belong only to
  area/building maps.

### Next Steps

- Reproduce the visual failure in a browser against live or local server data.
- If `mapNpcs.length > 0` but `npcSprites.size === 0`, inspect
  `applyExternalUpdate()` timing and scene active/restart flow.
- If sprites exist but are invisible, inspect texture generation, alpha fade,
  depth ordering, and target coordinates for `travelRoute` midpoints.
- Add a frontend rendering regression once the concrete failure is found.

## 2026-05-12 — v0.15.39 Cross-District Traveller Cadence

### Completed Locally

- Root cause: after restoring the one-NPC-one-map rule in `v0.15.37`, legal Hub
  travellers were still too rare. `v0.15.38` route visibility alone was not
  enough in live sampling because the server produced too few cross-district
  decisions.
- Added a server-side route visibility hold: cross-tile `travelRoute` state now
  remains visible for 4 ticks (about 20 seconds) before the NPC resumes local
  area presence or continues the next route segment.
- Added deterministic ambient errand decisions so non-low-state NPCs periodically
  choose a neighboring district through NPC policy, producing real Hub travellers
  instead of parent-map child NPC duplicates.
- Preserved the parent/child layer rule: Hub still only renders routed
  cross-district travellers, never child area outdoor NPCs.
- Added `NPC_CROSS_TILE_ROUTE_VISIBLE_TICKS` coverage so the route visibility
  window cannot silently shrink back to a single tick.
- Added ambient errand coverage proving a group of routine NPCs produces multiple
  legal routed travellers.
- Bumped app version from `0.15.38` to `0.15.39`.

### Local Verification

- `npm run test -w @greed-island/server -- npcEngine` passed: 30 tests.
- `npm test` passed: server 22 files / 166 tests, web 10 files / 28 tests.
- `npm run build:server` passed.
- `npm run build:web` passed, with the existing Vite chunk-size warning.
- `git diff --check` passed.
- Gemini staged review reported no findings.

### CI/CD + Live Verification

- Code commit `72f7b7b` pushed to `main`.
- GitHub Actions CI run `25712965531` passed.
- GitHub Actions Deploy Dev run `25712965526` passed.
- Live `v0.15.39` verification after deploy:
  - `/healthz`: `200`, `version=0.15.39`, `tick=93423`.
  - 10 consecutive `/api/npcs` samples over live ticks `93423..93432` had routed
    Hub travellers in every sample, with counts ranging from `1` to `4`.
  - Sample routed traveller IDs included `desert.starreader.gu_lao`,
    `dock.surfer.jiang_bo_ran`, `central.exchange.shen_ruo_yun`,
    `ruin.singer.zhou_you_you`, `central.noodle.a_cheng`, and
    `port.concierge.an_qing_an`.

### Still Open

- If Hub still feels underpopulated, add non-NPC aggregate district activity
  indicators; do not render child area NPCs on the parent map.

## 2026-05-12 — v0.15.37 Hub Parent/Child NPC Layer Fix

### Completed Locally

- Root cause: `v0.15.36` changed Hub projection to show every outdoor district
  NPC, so the parent Hub map rendered NPCs that already belonged to child area
  maps.
- Restored the one-NPC-one-map rule for Hub projection: parent Hub only renders
  NPCs that are actively crossing districts with a valid `travelRoute`.
- Local outdoor NPCs and arrived expansion NPCs now stay on their child area map
  only; building occupants remain owned by building maps.
- Added regression coverage proving local/arrived child-map NPCs are excluded
  from Hub, while routed travellers remain visible on Hub.
- Bumped app version from `0.15.36` to `0.15.37`.

### Local Verification

- `npm run test -w @greed-island/web -- npcProjection` passed: 6 tests.
- `npm test` passed: server 22 files / 163 tests, web 10 files / 28 tests.
- `npm run build:server` passed.
- `npm run build:web` passed, with the existing Vite chunk-size warning.
- `git diff --check` passed.
- Gemini staged review reported no findings.

### CI/CD + Live Verification

- Code commit `456640b` pushed to `main`.
- GitHub Actions CI run `25711915895` passed.
- GitHub Actions Deploy Dev run `25711915891` passed.
- Live `v0.15.37` verification after deploy:
  - `/healthz`: `200`, `version=0.15.37`, `tick=93028`.
  - `/api/map`: includes unlocked `t_salt_marsh`; tile count is `9`.
  - `/api/npcs`: 50 NPCs returned; 47 current child-map outdoor NPCs are now
    excluded from Hub projection, and current routed Hub travellers are `0`.

### Still Open

- If the parent Hub feels too empty with zero travellers, add aggregate district
  activity badges or construction summaries, not child NPC sprites.

## 2026-05-12 — v0.15.36 Restart-Safe Expansion Hydration

### Completed Locally

- Root cause: availability-first boot used an empty latest fact snapshot, so
  deploy/restart could temporarily lose persisted expansion state until runtime
  progressed enough to reconstruct it from new facts.
- Added targeted boot hydration for selected latest `FACT_SET` values instead of
  replaying the full production EventLog, preserving restart availability while
  restoring expansion, weather, active-event, building-occupant, NPC, and area
  state facts.
- Added `SqliteEventStore.readLatestFactValues(keys)` plus schema support for
  efficient latest fact lookup by fact key.
- Covered restart persistence for `world.lifeExpansion`, including unlocked
  `t_salt_marsh` and `b_salt_marsh_field_station`.
- Updated Hub NPC projection so the world overview shows outdoor district life,
  not only cross-district travellers.
- Bumped app version from `0.15.35` to `0.15.36`.

### Local Verification

- `npm test` passed.
- `npm run build:server` passed.
- `npm run build:web` passed, with the existing Vite chunk-size warning.
- `git diff --check` passed.
- Gemini staged review raised only non-blocking audit concerns after targeted
  comments and restart tests were added.

### CI/CD + Live Verification

- Code commit `299b574` pushed to `main`.
- GitHub Actions CI run `25711337994` passed.
- GitHub Actions Deploy Dev run `25711337993` passed.
- Public endpoint briefly returned `502 Bad Gateway` immediately after deploy,
  then recovered without a hotfix; direct Tailscale host and Docker checks showed
  healthy `greed-island-web` and `greed-island-server` containers.
- Live `v0.15.36` verification after recovery:
  - `/healthz`: `200`, `version=0.15.36`, `tick=92836`.
  - `/api/map`: includes unlocked `t_salt_marsh`; tile count is `9`.
  - `/api/world`: `facts.lifeExpansion.unlockedTileIds` includes
    `t_salt_marsh`, `unlockedBuildingIds` includes
    `b_salt_marsh_field_station`, and `project.salt_marsh_settlement` remains
    `12/12` complete after deploy/restart.
  - `/api/npcs`: 50 NPCs returned; 47 are map-visible outdoor district NPCs for
    the Hub overview feed.
  - `/api/events?limit=3`: latest sampled events carry server-authored
    `payload.motivation` data.

### Still Open

- Next NPC depth slice should move beyond surface motion into persistent inner
  life: memory, expectations, routines, fatigue, relationships, goals, and dream
  or subconscious state, while preserving NPC policy -> command -> Rule Engine ->
  Event authority.

## 2026-05-12 — v0.15.35 Construction Crews + Hub Life Projection

### Completed Locally

- Root cause: locked expansion districts could be hidden or look inert, making
  salt-marsh construction feel like magic rather than NPC labor.
- Kept construction-zone visuals visible for locked expansion sites and added
  deterministic construction crew/progress overlays on the Hub map.
- Added `constructionActivitiesFor()` to project build progress, worker count,
  and crew marker positions from server facts into map-renderable activity.
- Fixed Hub NPC projection so salt-marsh travellers and arrived outdoor NPCs are
  not hidden by transit-only filtering.
- Added pure Hub walkability/spawn helpers so locked expansion districts remain
  non-enterable while construction visuals can still be displayed.
- Bumped app version from `0.15.34` to `0.15.35`.

### Local Verification

- `npm test` passed.
- `npm run build:server` passed.
- `npm run build:web` passed, with the existing Vite chunk-size warning.
- `git diff --check` passed.
- Gemini staged review produced no blocking findings after fixes.

### CI/CD + Live Verification

- Code commit `b697fb4` pushed to `main`.
- GitHub Actions CI run `25710687572` passed.
- GitHub Actions Deploy Dev run `25710687605` passed.
- Live `/healthz` returned `version=0.15.35`, `tick=92574`.

### Still Open

- `v0.15.35` exposed that restart hydration could still make expansion state
  flicker after deploy; fixed in `v0.15.36`.

## 2026-05-12 — v0.15.34 Server Event Motivation Payloads

### Completed Locally

- Added OpenSpec change `server-event-motivation-payloads` requiring deterministic
  server-authored motivation payloads for living-world events when runtime context
  is available.
- Added a generic `EventMotivation` shape and Rule Engine validation so malformed
  optional `motivation` payloads are rejected before events are appended.
- Attached authoritative motivation payloads to common runtime event families:
  NPC movement/activity, productive actions, interactions, area pressure, weather
  and season changes, rare windows, world-event spawn/end, building enter/leave,
  life goals, households, and children.
- Kept the `v0.15.33` client fallback path for older events and edge cases, while
  allowing new events to carry committed reasons in `payload.data.motivation`.
- Bumped app version from `0.15.33` to `0.15.34`.

### Local Verification

- `npm test` passed: server 22 files / 162 tests, web 8 files / 21 tests.
- `npm run build:server` passed.
- `npm run build:web` passed, with the existing Vite chunk-size warning.
- `npx openspec validate server-event-motivation-payloads --strict` passed.
- `git diff --check` passed.
- Gemini staged review initially hit Windows UTF-8 pipe rendering for Chinese text;
  rerunning with UTF-8 pipe settings found one test-coverage gap, which was fixed
  with runtime assertions for representative activity, interaction, building,
  area-pressure, weather, and world-event motivations. Final Gemini review:
  `No findings`.

### CI/CD + Live Verification

- Code commit `1bd24ec` pushed to `main`.
- GitHub Actions CI run `25709754151` passed.
- GitHub Actions Deploy Dev run `25709754147` passed.
- Live `v0.15.34` verification after deploy:
  - `https://hunter.sisihome.org/healthz`: `200`, `version=0.15.34`, `tick=92232`.
  - `https://hunter.sisihome.org/api/events?limit=100`: 86 of 100 sampled recent
    rows carried committed motivation payloads.
  - Sample motivated rows included `WORLD_EVENT_SPAWN`, `WEATHER_CHANGE`,
    `NPC_INTERACT`, and `NPC_PRODUCTIVE_ACTION`; productive action payloads include
    both `explanation` and `projectPurpose`.

### Still Open

- Continue enriching individual motivations as future NPC planners expose more
  domain-specific intent, but new common runtime events now prefer committed
  server reasons over client inference.

## 2026-05-12 — v0.15.33 Event Motivation Chronicle

### Completed Locally

- Responded to the issue that the chronicle showed what happened but not why it
  happened; broadened the solution from construction-only to all public events.
- Added OpenSpec change `event-motivation-chronicle` requiring public Timeline
  rows to expose deterministic motivation, pressure, purpose, or trigger context.
- Added explicit construction motivation payloads for new construction progress,
  map unlock, and building unlock events, derived from NPC life goals/needs and
  project purpose rather than AI text.
- Added deterministic Timeline motivation fallbacks for public event families:
  productive actions, NPC interactions, area pressure, life goals, households,
  children, movement/activity, building enter/leave, weather/season cycles, world
  events, rare windows, player interventions, and card events.
- Kept raw payload disclosure available while surfacing `事件動機` as first-class
  context on Timeline cards.
- Bumped app version from `0.15.32` to `0.15.33`.

### Local Verification

- `npm test` passed: server 22 files / 160 tests, web 8 files / 21 tests.
- `npm run build:server` passed.
- `npm run build:web` passed, with the existing Vite chunk-size warning.
- `npx openspec validate event-motivation-chronicle --strict` passed.
- `git diff --check` passed with only Windows LF→CRLF working-copy warnings.
- Gemini staged review repeatedly reported a template-literal issue caused by
  Chinese diff encoding; source and tests confirm interpolation works and
  motivation explanations contain actual tile names with no `{` / `}` placeholders.

### CI/CD + Live Verification

- Code commit `21113bf` pushed to `main`.
- GitHub Actions CI run `25707720719` passed.
- GitHub Actions Deploy Dev run `25707720708` passed.
- Live `v0.15.33` verification after deploy:
  - `/healthz`: `200`, `version=0.15.33`, `tick=91499`.
  - `/api/events?limit=80`: current window included `AREA_PRESSURE`,
    `NPC_INTERACT`, and `NPC_PRODUCTIVE_ACTION` rows that now receive deterministic
    Timeline motivation fallback text.
  - Deployed web asset `/assets/index-CswV12I_.js` contains `事件動機`, the salt-marsh
    fallback explanation, and productive-action motivation fallback text.

### Still Open

- Future depth: move more non-construction motivations into authoritative server
  payloads as each domain gets richer planning state. Current release guarantees
  visible deterministic motivation for public Timeline rows without AI invention.

## 2026-05-12 — v0.15.32 NPC Life Goals + Expansion Foundation

### Completed Locally

- Added deterministic NPC life pressure and life-goal projection on `/api/npcs`,
  derived from needs, role/personality signals, local area resources, and household
  state without AI mutating world state.
- Added authoritative life/household/child/construction command types and Rule
  Engine events: `NPC_LIFE_GOAL_SET`, `NPC_HOUSEHOLD_FORMED`, `NPC_CHILD_BORN`,
  `CONSTRUCTION_PROJECT_PROGRESS`, `MAP_TILE_UNLOCKED`, and `BUILDING_CONSTRUCTED`.
- Connected committed productive actions in build/service/trade/learn domains to
  the `project.salt_marsh_settlement` construction project, completing at `12/12`
  progress and unlocking `t_salt_marsh` plus `b_salt_marsh_field_station`.
- Threaded life goals, households, construction progress, map unlocks, and building
  unlocks through replay/projection, catch-up summaries, API types, Hub navigation,
  Area/Hub map rendering, and Since Last Visit UI.
- Kept expansion authority server-side: Hub only treats districts returned by
  `/api/map` as enterable, and expansion building detail lookup relies on runtime
  unlocked building projection even before any NPC occupies the building.
- Bumped app version from `0.15.31` to `0.15.32` and completed OpenSpec change
  `npc-life-goals-and-expansion` verification/release tasks.

### Local Verification

- `npm test` passed: server 22 files / 160 tests, web 7 files / 18 tests.
- `npm run build:server` passed.
- `npm run build:web` passed, with the existing Vite chunk-size warning.
- `npx openspec validate npc-life-goals-and-expansion --strict` passed.
- `git diff --check` passed.
- Focused regression coverage added for deterministic city-life projection,
  runtime end-to-end life/household/construction/unlock facts, unlocked map graph
  routing, living-world command validation, and constructed expansion building API
  detail lookup with zero occupants.
- Gemini staged review found two actionable issues: household formation was gated
  to only the first household, and direct building detail lookup needed to rely on
  runtime-unlocked buildings. Both were fixed and covered by tests. Remaining
  `????` review notes were confirmed as Gemini CLI encoding artifacts against
  source files containing valid localized Chinese text.

### CI/CD + Live Verification

- Code commit `bd8a3ae` pushed to `main`.
- GitHub Actions CI run `25706302025` passed.
- GitHub Actions Deploy Dev run `25706302028` passed.
- Live `v0.15.32` verification after deploy:
  - `/healthz`: `200`, `version=0.15.32`, `tick=91002` during the first probe.
  - `/api/npcs`: `200`, NPC rows include `life.needs`, `life.goal`, and
    `life.householdId` projections.
  - `/api/events?limit=5000`: included `11` `CONSTRUCTION_PROJECT_PROGRESS`, `1`
    `MAP_TILE_UNLOCKED`, and `1` `BUILDING_CONSTRUCTED` event for the salt-marsh
    project; the next 30-tick gate emitted `8` `NPC_LIFE_GOAL_SET` and `1`
    `NPC_HOUSEHOLD_FORMED` event at tick `91021`.
  - `/api/map`: `200`, includes unlocked `t_salt_marsh` / `鹽沼外環`.
  - `/api/buildings?tileId=t_salt_marsh`: `200`, includes
    `b_salt_marsh_field_station` with localized Chinese building/prop labels.
  - `/api/buildings/b_salt_marsh_field_station`: `200`, returns the constructed
    building even with `occupants=[]`.

### Still Open

- `NPC_CHILD_BORN` is intentionally delayed until 90 ticks after household
  formation; local integration tests cover it, but live evidence was not delayed
  another 7.5 minutes just to wait for the first production child event.
- Optional follow-up: add Phaser-level E2E/scene tests for locked district visuals
  if future map-rendering changes become frequent.

## 2026-05-11 — v0.15.31 Productive City Actions

### Completed Locally

- Added deterministic `NPC_PRODUCTIVE_ACTION` events so NPC runtime policy can
  emit construction/repair, learning/research, trade/supply, and public-service
  progress as authoritative world events.
- Threaded productive actions through the Command → Rule Engine → Event pipeline,
  simulation runtime, catch-up summaries, NPC memory projection, API types, and the
  Since Last Visit panel's `城市進展` section.
- Balanced the public event stream by lowering spontaneous social interaction
  probability, increasing social cooldown, and capping social/productive events per
  tick so chronicles no longer collapse into mostly NPC arguments.
- Added tests for productive event variety, deterministic tile ordering under the
  per-tick cap, narration template substitution, Chinese role-keyword shaping,
  catch-up summary output, and NPC memory projection.
- Bumped app version from `0.15.30` to `0.15.31` and marked OpenSpec task `3.9`.

### Local Verification

- `npm test` passed: server 20 files / 155 tests, web 7 files / 18 tests.
- `npm run build:server` passed.
- `npm run build:web` passed, with the existing Vite chunk-size warning.
- `npx openspec validate npc-humanity-ai-memory --strict` passed.
- `git diff --check` passed.
- Gemini staged review initially found deterministic ordering and memory-test gaps;
  both were fixed. Final remaining review notes were accepted as intentional or
  expected: reduced social frequency is the balance goal, broader exhaustive
  narration matrices are optional follow-up, and Chinese narration strings are
  current localized game text.

### CI/CD + Live Verification

- Code commit `589ca77` pushed to `main`.
- GitHub Actions CI run `25679493406` passed.
- GitHub Actions Deploy Dev run `25679493433` passed.
- Live `v0.15.31` verification after deploy:
  - `/healthz`: `200`, `version=0.15.31`, `tick=84224`, `121ms`.
  - `/api/version`: `200`, `version=0.15.31`, `25ms`.
  - `/api/world`: `200`, `13ms`, `eventCount=1490350`, `npcCount=50`.
  - `/api/events?limit=80`: `200`, `127ms`, included 12
    `NPC_PRODUCTIVE_ACTION` events versus 3 `NPC_INTERACT` events in the sample.
  - `/api/events?limit=1000` returned the capped 100-event window with 23
    productive actions across `build`, `learn`, `trade`, and `service` domains.
  - `/api/world/catch-up?sinceTick=84197`: `200`, `25ms`, `untilTick=84227`, and
    `summary.productiveActions` contained concrete city-progress rows.

### Still Open

- Optional follow-up: add a full narration matrix test if we want exhaustive
  snapshot coverage for every archetype/role/fallback sentence branch.

## 2026-05-11 — v0.15.30 Bounded Catch-Up Availability Fix

### Completed Locally

- Investigated the post-`v0.15.29` mobile fallback report and confirmed the
  frontend was serving static HTML quickly while `/healthz` and `/api/*` could
  hang past a 5-second client timeout.
- Identified the root cause: returning-player living-world catch-up endpoints
  synchronously hydrated or sorted across the production EventLog, so one large
  catch-up request could block the Node event loop and make unrelated API calls
  appear offline.
- Changed `/api/world/catch-up` and `/api/world/since-last-visit` to use a
  bounded EventLog tick-window read instead of `readEvents()`.
- Added an index-aware `(event_type, tick, sequence)` EventLog path and kept a
  single-query fallback for unusually large event-type sets, avoiding the
  production `idx_event_log_type` + temp-sort plan that measured about `27.8s`.
- Updated latest boot snapshot lookup to avoid `MAX(tick)` scans on large logs.
- Added regression coverage for latest tick lookup, bounded tick-window reads,
  and chronological ordering across interleaved event types.
- Bumped app version from `0.15.29` to `0.15.30`.

### Local Verification

- `npm run build:server` passed.
- `npm run build:web` passed, with the existing Vite chunk-size warning.
- `npm test` passed after the final query fix: server 20 files / 151 tests, web 7
  files / 18 tests.
- `npx openspec validate npc-humanity-ai-memory --strict` passed.
- `git diff --check` passed with only Windows LF→CRLF working-copy warnings.
- Gemini staged review initially flagged the per-type query memory/order edge;
  after adding a bounded fallback and interleaved ordering coverage, final review
  returned `No findings`.

### CI/CD + Live Verification

- Code commits `a18c9cf` and `7c4a542` pushed to `main`.
- Latest GitHub Actions CI run `25674841411` passed.
- Latest GitHub Actions Deploy Dev run `25674841366` passed.
- First `v0.15.30` deploy created the new composite EventLog index before HTTP
  listen; that one-time migration caused short `502` restart-window responses but
  did not expose a slow listening API.
- Live `v0.15.30` verification after boot:
  - `/healthz`: `200`, `version=0.15.30`, `123ms`.
  - `/api/version`: `200`, `23ms`, `Cache-Control: no-store`.
  - `/api/world`: `200`, `12ms`, `Cache-Control: no-store`, `eventCount=1457931`.
  - `/api/npcs`: `200`, `24ms`, `Cache-Control: no-store`.
  - `/api/cards`: `200`, `27ms`, `Cache-Control: no-store`.
  - `/api/map`: `200`, `9ms`, `Cache-Control: no-store`.
  - `/api/events?limit=5`: `200`, `13ms`, `Cache-Control: no-store`.
  - `/api/world/catch-up?sinceTick=0`: `200`, `2403ms`, `Cache-Control: no-store`,
    `totalEvents=5000` partial bounded summary.
  - Parallel stress probe while catch-up was running: catch-up `2393ms`, delayed
    `/healthz` `2365ms`, both under the 5-second client timeout.

### Still Open

- If returning-player summary latency needs to be even lower, reduce
  `CATCH_UP_EVENT_LIMIT` from `5000` or move catch-up reduction to a background
  projection; current live behavior is under the mobile timeout and no longer
  forces fixture fallback.

## 2026-05-11 — v0.15.29 NPC Layer Uniqueness + Chronicle Cleanup

### Completed Locally

- Fixed a regression from the Hub visibility recovery: Hub no longer renders every
  area-local outdoor NPC as an individual sprite.
- Restored the one-NPC-one-map-layer rule: Area-local NPCs render in AreaPage,
  building occupants render in BuildingPage, and Hub only renders NPCs that are
  actually crossing districts via `travelRoute`.
- Added projection regression coverage proving local outdoor NPCs stay off Hub.
- Changed Timeline chronicle summary requests to allow AI rendering instead of
  forcing deterministic fallback with `ai=0`.
- Hid internal `WORLD_TICK` / `FACT_SET` rows and no-narration rows from public
  Timeline and mobile/desktop event ticker surfaces, so the UI no longer shows
  `WORLD_TICK` or `尚未生成敘事` as public story content.
- Bumped app version from `0.15.28` to `0.15.29`.

### Local Verification

- `npm run test -w @greed-island/web -- npcProjection eventVisibility` passed: 2
  files / 5 tests.
- `npm run build:web` passed, with the existing Vite chunk-size warning.
- `npm run build:server` passed.
- Final `npm test` passed: server 20 files / 148 tests, web 7 files / 18 tests.
- `npx openspec validate npc-humanity-ai-memory --strict` passed.
- `git diff --check` passed with only Windows LF→CRLF working-copy warnings.
- Gemini staged review returned `No findings`.

### CI/CD + Live Verification

- Commit `2559b24` pushed to `main`.
- GitHub Actions CI run `25672281805` passed.
- GitHub Actions Deploy Dev run `25672281818` passed.
- Live `v0.15.29` verification after deploy:
  - `/healthz`: `version=0.15.29`, `tick=82730`.
  - `/api/npcs`: `50` rows.
  - Hub traveller markers expected from live data: `0`, because no NPC currently
    has `activity='move'` plus `travelRoute`; local district NPCs now stay off Hub.
  - Nighttide local outdoor NPCs: `14`, rendered only by the area layer.
  - `/api/events?limit=30` public filtered head is `AREA_PRESSURE`, not
    `WORLD_TICK`, with narration present.
  - `/api/world/chronicle?limit=40&ai=1`: `source=ai`, `requested=true`,
    `activeKeys=40`, `fallbackReason=null`.

### Still Open

- No active blocker. If Hub feels too empty with no travellers, add district-level
  aggregate activity badges instead of rendering individual area NPCs on Hub.

## 2026-05-11 — v0.15.28 NPC Intent Text + Local Motion Cadence

### Completed Locally

- Continued the NPC daily-life slice after `v0.15.27` by exposing each NPC's
  deterministic runtime-agent task as a public `intentLine` projection.
- Added server-side localized intent summaries for travel, social interaction,
  player dialog holds, personality nudges, and daily-life activities.
- Threaded `intentLine` through `/api/npcs`, web API/state types, Hub projection,
  Area NPC lists, Building NPC lists, and `NpcDialog` headers.
- Made Hub projection locale-aware so English clients use the English intent text.
- Increased local area waypoint refresh cadence from 12 ticks to 6 ticks, making
  outdoor NPC sub-tile motion refresh about every 30 seconds instead of about
  every minute without changing the authoritative presence tuple.
- Bumped app version from `0.15.27` to `0.15.28`.

### Local Verification

- `npm run build:server` passed.
- `npm run build:web` passed, with the existing Vite chunk-size warning.
- `npm run test -w @greed-island/server -- npcIntent npcEngine` passed: 2 files /
  28 tests.
- `npm run test -w @greed-island/web -- npcProjection` passed: 1 file / 2 tests.
- Final `npm test` passed: server 20 files / 148 tests, web 6 files / 15 tests.
- `npx openspec validate npc-humanity-ai-memory --strict` passed.
- `git diff --check` passed.
- Gemini staged review found and the code addressed Hub locale selection and
  English district-name issues; final review returned `No findings`.

### CI/CD + Live Verification

- Commit `6e73281` pushed to `main`.
- GitHub Actions CI run `25668501760` passed.
- GitHub Actions Deploy Dev run `25668501814` passed.
- Live `v0.15.28` verification after runtime ticks settled:
  - `/healthz`: `version=0.15.28`, tick advanced from `81851` to `81858` during
    the probe window.
  - `/api/npcs`: `50` rows, all `50` with `internalState.agent` and `intentLine`.
  - Agent bootstrap tasks: `0`.
  - English intent district text CJK leakage: `0`.
  - 35-second movement probe: `49` NPCs changed location/sub-tile/activity keys.
  - Activity distribution remained daily-life shaped: `work=30`, `trade=10`,
    `patrol=5`, `idle=5`.

### Still Open

- No active blocker. Next slice can make social/interaction bubbles more visible
  on the map, or add a compact intent overlay to selected NPC sprites.

## 2026-05-11 — v0.15.27 NPC Daily-Life Activity Pass

### Completed Locally

- Started the first `NPC Daily Life Pass` to make deterministic runtime agents
  look less like idle props.
- Confirmed live `v0.15.26` had all `50` NPCs with agent state, but activity
  distribution was still idle-heavy: `idle=40`, `patrol=4`, `trade=3`, `work=2`,
  `move=1`.
- Identified the immediate root cause: many profile routine labels (`office
  tower`, `night-market stall`, `running edition`, `late-night noodle stop`,
  etc.) fell through the label interpreter and became `idle`.
- Expanded deterministic routine-label interpretation into visible daily-life
  activities: `work`, `trade`, `patrol`, and `eat`.
- Changed injected off-duty errand slots to use role/archetype-shaped activity
  instead of always becoming `idle`.
- Added focused `NpcEngine` tests for daily-life label interpretation and
  injected errand activity shaping across common archetypes.
- Bumped app version from `0.15.26` to `0.15.27`.

### Local Verification

- `npm run build:web` passed, with the existing Vite chunk-size warning.
- `npm run build:server` passed.
- `npm test` passed after the review follow-up: server 19 files / 144 tests, web
  6 files / 15 tests.
- `npm run test -w @greed-island/server -- npcEngine` passed after the review
  follow-up: 1 file / 24 tests.
- `npx openspec validate npc-humanity-ai-memory --strict` passed.
- `git diff --check` passed with only Windows LF→CRLF working-copy warnings.
- Gemini staged review found test coverage/maintainability issues on first pass;
  after adding archetype coverage and named label patterns, final review returned
  `No findings`.
- Commit `d0c8fe7` pushed to `main`.
- GitHub Actions CI run `25667528150` passed.
- GitHub Actions Deploy Dev run `25667528128` passed.

### Live Verification

- Initial deploy probe at 23 seconds caught bootstrap/default state (`idle=50`),
  which is expected during availability-first startup before runtime ticks settle.
- After runtime ticks advanced, live `v0.15.27` returned:
  - `/healthz`: `version=0.15.27`, `tick=81612`.
  - `/api/world`: `tick=81612`, `npcCount=50`.
  - `/api/npcs`: `50` rows, all `50` with `internalState.agent`.
  - Agent bootstrap tasks: `0`.
  - Activity distribution: `work=30`, `trade=10`, `patrol=5`, `idle=5`.
- Server logs show availability-first boot from defaults due the large event log,
  then runtime start at `tick=81602`; the new activity projection appears after
  ticks settle.

### Still Open

- Next daily-life slice should improve visible movement frequency and expose
  short task/intent text in the UI; this slice focused on activity diversity.

## 2026-05-11 — v0.15.26 Hub NPC Overview Recovery

### Completed Locally

- Investigated the post-`v0.15.25` report that the fixture badge disappeared but
  many NPCs also disappeared.
- Confirmed live `/api/npcs` still returns all `50` NPCs and `world.npcCount=50`;
  `49` NPCs are outdoors, but none currently have `activity='move'`.
- Identified the frontend projection issue: Hub main-map rendering only included
  `activity === 'move'` NPCs, so a valid world with no travelling NPCs made the
  Hub appear empty even though NPCs were present in districts.
- Changed Hub projection to show all outdoor district NPCs on the world overview,
  while keeping `travelRoute` rendering for NPCs that are actually moving and
  keeping building occupants out of the Hub map.
- Updated focused projection tests and bumped app version from `0.15.25` to
  `0.15.26`.

### Local Verification

- `npm run build:web` passed, with the existing Vite chunk-size warning.
- `npm run build:server` passed.
- `npm test` passed: server 19 files / 141 tests, web 6 files / 15 tests.
- `git diff --check` passed with only Windows LF→CRLF working-copy warnings.
- Gemini staged review returned `No findings`.
- Commit `4f2d007` pushed to `main`.
- GitHub Actions CI run `25666839843` passed.
- GitHub Actions Deploy Dev run `25666843244` passed.

### Live Verification

- During deploy restart, one immediate probe hit the expected transient API
  restart gap; retry after containers settled succeeded.
- `/healthz` and `/api/version` report `0.15.26`.
- `/api/world` reports `npcCount=50`; `/api/npcs` returns `50` rows.
- Hub overview projection now has `49` outdoor district NPC markers and `1`
  moving marker from live data; one remaining NPC is inside a building and stays
  excluded from the Hub map.

### Still Open

- Await user-side iPhone confirmation that Hub NPC density now looks reasonable.

## 2026-05-11 — v0.15.25 Mobile Fixture Recovery

### Completed Locally

- Investigated the recurring iPhone fixture-state report on `v0.15.24`.
- Confirmed live server/API was healthy from desktop probes, and the iPhone loaded
  fresh HTML plus hashed JS/CSS and successfully called `/api/version`, but the
  same iPhone access-log window showed no `/api/world` request before the UI
  remained on fixture data.
- Exposed `refreshWorld()` through `WorldStateContext`, so world loading is no
  longer only reachable from the provider mount/poll effect.
- Added a fixture-state recovery effect in `AtmosphereBar`: while the visible UI
  source is still `fixture`, it immediately calls `refreshWorld()` and retries
  every two seconds until a server world lands.
- Added `visibleFixtureRecovery` unit tests for source-gated startup, immediate
  retry, interval retry, cancellation, and retry-after-failure behavior.
- Bumped app version from `0.15.24` to `0.15.25`.

### Local Verification

- `npm run build:web` passed, with the existing Vite chunk-size warning.
- `npm run build:server` passed.
- `npm test` passed: server 19 files / 141 tests, web 6 files / 15 tests.
- `git diff --check` passed with only Windows LF→CRLF working-copy warnings.
- Gemini staged review found only the initial missing-test gap; the retry helper
  tests were added afterward.
- Final Gemini staged review returned `No findings`.
- Commit `d2d17b3` pushed to `main`.
- GitHub Actions CI run `25666346557` passed.
- GitHub Actions Deploy Dev run `25666346537` passed.

### Live Verification

- During the deploy restart window, `/api/*` briefly returned `502` while the web
  container already served the new HTML. This matches the prior mobile failure
  mode and is now covered by visible fixture-state retry.
- After containers settled, live probes returned:
  - `/healthz`: `version=0.15.25`, `tick=81348`.
  - `/api/version`: `0.15.25`.
  - `/api/world`: `tick=81348`, `eventCount=1397963`, `npcCount=50`.
- `/api/world` response headers returned `200`, `Cache-Control: no-store`,
  `Content-Length`, and no `Content-Encoding`.
- `docker ps` showed `greed-island-web` healthy and `greed-island-server` up.

### Still Open

- Await user-side iPhone reload confirmation that the fixture badge disappears;
  server/proxy/API evidence is healthy at `v0.15.25`.

## 2026-05-11 — v0.15.24 Docker Local Recovery

### Completed Locally

- Bumped app version from `0.15.23` to `0.15.24` after the Hub HUD/dialog-hold
  fixes, so the running UI/API no longer reports the same version as the prior
  batch.
- Recovered the intended Docker local path instead of the temporary Node/Vite
  shell path. `docker compose -f deploy/docker-compose.yml up -d --build` now
  builds and starts `greed-island-server` and `greed-island-web`.
- Worked around workstation Docker TLS/build issues:
  - BuildKit path still fails on Docker Hub frontend pull with `x509: certificate
    signed by unknown authority` for `docker/dockerfile:1.7`.
  - Legacy builder path works with `DOCKER_BUILDKIT=0` /
    `COMPOSE_DOCKER_CLI_BUILD=0`.
  - Node 22's bundled npm failed in legacy Docker builder with `Exit handler
    never called`; both Dockerfiles now pin npm to `10.9.2` inside the builder.
  - npm registry TLS in the builder hit `SELF_SIGNED_CERT_IN_CHAIN`; Dockerfiles
    set npm `strict-ssl=false` before installing npm so this workstation can
    build behind the current TLS interception.

### Local Verification

- Docker compose status: `greed-island-server` up and `greed-island-web` up /
  healthy.
- Docker web endpoint: `http://127.0.0.1:8100/api/version` returned
  `{"version":"0.15.24"}`.

### Still Open

- The Docker TLS trust problem should be fixed at Docker/host trust-store level
  later; the current Dockerfile npm `strict-ssl=false` is a local build recovery
  workaround, not a security-hardening endpoint.
- Browser/Phaser E2E coverage is still missing for two-player Hub presence and
  active-dialog visual hold.

## 2026-05-11 — v0.15.23 In Progress

### Completed Locally

- Investigated the reported map symptom where other online players appeared to
  teleport between positions.
- Confirmed `AreaScene.refreshPeerSprites()` directly called `setPosition()` for
  existing peer player containers on every nearby-player refresh, while NPCs
  already used visual-only tweening from their current rendered position to the
  next server-authoritative target.
- Changed existing Area peer player containers to tween to the latest server
  presence target instead of snapping. New peers still spawn at their
  authoritative target, and vanished peers are destroyed with any active tween
  cleaned up.
- Kept presence coordinates as rendering input only; this change does not make
  the renderer simulation authority.
- Investigated the reported guest-control issue. Server mutation endpoints were
  already behind auth, but Phaser scenes still spawned a controllable local
  player and accepted movement/interaction input for guests, which made the game
  appear playable while logged out.
- Added guest read-only mode to Hub, Area, and Building Phaser scenes. Guests can
  still view public world/read-only pages, but movement, NPC interaction, card
  pickup, building enter/exit scene controls, and indoor controls are disabled
  until login.
- Added visible guest read-only notices on hub, area, and building pages.
- Improved deterministic chronicle fallback output by filtering out internal
  `WORLD_TICK` noise and rendering a paragraph-style summary instead of raw
  `第 X tick` bullets.
- Added the `/timeline` chronicle summary card backed by `/api/world/chronicle`.
- Fixed Hub/main-map local player labeling and peer visibility: `HubPage` now
  posts Hub social presence with the local map coordinates, polls nearby Hub
  players, and passes player names/peer positions into `MapScene`.
- Kept Hub presence separate from area-bound gameplay location by storing main-map
  UI presence in `player_hub_locations` instead of overwriting
  `player_locations`, which combat/shop code still reads for area checks.
- Extended social presence coordinate clamping for `tileId='hub'` to the full
  800x600 main-map canvas while keeping area maps on the existing 600x400
  coordinate contract.
- Fixed a Hub login-state edge case where logging in while already standing in a
  district did not emit the current district CTA until the player moved out and
  back in.
- Reviewed `D:\Projects\ai-agents` and homelab `agent-design` guidance after the
  NPC-agent question. Captured the durable rule in `ARCHITECTURE.md`: every NPC
  is a deterministic runtime agent with identity, memory, goals, permissions,
  task state, and command budget, not a free-form LLM agent.
- Added the first deterministic NPC-agent runtime slice. `NpcEngine` now stores
  per-NPC `agent` state with `profileId`, permission labels, bounded active task,
  and last-decision metadata derived from schedule, deterministic nudge,
  movement, and NPC social interaction state.
- Tightened the NPC-agent slice after review: `social-interaction` active tasks
  are now committed only after the corresponding `NPC_INTERACT` command passes
  Rule Engine validation, remain active until their deterministic expiry tick,
  and legacy hydrated states without `agent` use the hydrated tile as fallback.
- Exposed NPC agent state through `/api/npcs` via `internalState.agent`, so the
  UI/debug surfaces can inspect the agent projection without giving rendering any
  simulation authority.
- Smoothed Hub/main-map peer players and travel NPC rendering. Existing Hub peer
  player containers now tween to the latest social presence target instead of
  snapping, and Hub peer/NPC spawn/despawn paths fade instead of hard flashing.
- Moved the Hub city title/description HUD out of the Phaser map and into a
  compact header above the map, so it no longer covers the left side of the main
  map.
- Added deterministic player-dialog hold for active NPC conversations. Opening an
  authenticated NPC dialog now posts `/api/npc/:npcId/dialog-hold` and refreshes
  it while the dialog is open; the runtime validates `NPC_DIALOG_HOLD` through
  the living-world Rule Engine before persisting a bounded `player-dialog` agent
  task through FACT_SET state, so schedule movement cannot make that NPC walk
  away mid-dialog.
- Updated OpenSpec `npc-humanity-ai-memory` with the new deterministic NPC agent
  state and player-dialog hold requirements, and marked tasks `3.5` and `3.6`
  complete.
- Bumped app version to `0.15.23`.

### Local Verification

- `npm run test -w @greed-island/server -- social` passed: 1 file / 2 tests,
  including Hub presence separation from area `player_locations`.
- `npm run build:web` passed, with the existing Vite chunk-size warning.
- `npm run build:server` passed.
- `npm run test -w @greed-island/server -- npcEngine buildingRuntime` passed: 2
  files / 22 tests.
- `npm run build` passed: server build and web build completed; web build still
  shows the existing Vite chunk-size warning.
- `npm test` passed: server 19 files / 141 tests; web 5 files / 12 tests.
- `npm run test -w @greed-island/server -- npcEngine` passed: 1 file / 21 tests.
- `npm run test -w @greed-island/server -- npc` passed: 6 files / 50 tests.
- `npx openspec validate npc-humanity-ai-memory --strict` passed.
- `git diff --check` passed; output only contained Windows LF→CRLF working-copy
  warnings.
- Local Node runtime restarted from the latest build with
  `JWT_SECRET=local-development-secret-0-15-23` and
  `GREED_ISLAND_DATA_DIR=D:\Projects\_HomeProject\greed-island\deploy\data`.
- Local runtime health passed: `/api/version` and `/healthz` both returned
  `0.15.23`.
- Local `/api/npcs` confirmed `internalState.agent.activeTask` is present.
- Local dialog-hold verification passed: registering a local test account and
  posting `/api/npc/central.broker.gui/dialog-hold` returned `held=true`,
  `expiresAtTick=3848`, and `/api/npcs` then showed
  `activeTask.kind = player-dialog` with `lastDecision.source = player`.
- Local Vite web root `http://127.0.0.1:5173/` returned HTTP `200`.

### Still Open

- Continue the reported social notification investigation: social realtime
  notifications should refresh from canonical social state; SSE/polling is only a
  hint, not source of truth.
- Browser/Phaser E2E coverage is still missing for two-player Hub presence and
  Area/Hub peer tween behavior; current coverage is build/typecheck plus server
  social presence and dialog-hold tests.
- Browser/Phaser E2E coverage is still missing for active-dialog visual hold;
  local API verification confirms the authoritative `player-dialog` task, but no
  automated visual test opens the dialog in a real browser yet.
- Docker compose local deploy remains blocked by Docker Hub TLS certificate
  verification on this workstation.

## 2026-05-11 — v0.15.22 Shipped

### Completed Locally

- Confirmed after v0.15.21 that iPhone `/api/world` completed successfully with
  `200`, `Content-Length`, no `Content-Encoding`, and `Cache-Control: no-store`,
  but the UI still showed fixture data.
- Identified the remaining likely frontend state bug: overlapping mobile refresh
  generations can discard an earlier successful `/api/world` response, leaving
  fixture as the displayed world.
- Changed `WorldStateContext` so any successful authoritative `/api/world`
  response always replaces fixture state. Generation guarding remains useful for
  secondary data, but cannot block the first real world snapshot.
- Bumped app version to `0.15.22`.

### Local Verification

- `npm run build:web` passed, with existing Vite chunk-size warning.
- `npm run build:server` passed.
- `npm test` passed: server 19 files / 132 tests; web 5 files / 12 tests.
- `docker run --rm -v ... caddy:2.8-alpine caddy validate --config /etc/caddy/Caddyfile`
  passed for `packages/web/Caddyfile.internal`.
- `git diff --check` passed.

### CI/CD And Runtime Verification

- Gemini staged review found a test-gap note for the overlapping refresh race;
  accepted for this production hotfix because the repo lacks a mounted React
  provider integration harness.
- Commit `20f08b5` pushed to `main`.
- GitHub Actions CI run `25645997945` passed.
- GitHub Actions Deploy Dev run `25645997952` passed.
- Runtime health verified: `/healthz` returned `version: 0.15.22`.
- Runtime API version verified: `/api/version` returned `0.15.22`.
- Runtime API verified: `/api/world` returned live data with tick `74789`,
  `eventCount=1275697`, and `npcCount=50`.
- User iPhone verification passed after reload: fixture/demo label disappeared
  and authoritative live world data rendered.

## 2026-05-11 — v0.15.21 Shipped

### Completed Locally

- Investigated continued iPhone fixture state after v0.15.20 using live web
  proxy logs from the iPhone client.
- Confirmed the iPhone loaded fresh `v0.15.20` HTML/JS and successfully fetched
  `/api/version`, but did not complete a visible `/api/world` request in the
  same load window.
- Identified a likely transport-layer root cause: internal Caddy globally applied
  `encode zstd gzip`, so proxied `/api/*` JSON could be served as zstd. iPhone
  Safari advertised zstd support, but world-state fetch completion appeared to
  stall while tiny uncompressed `/api/version` still worked.
- Moved `encode zstd gzip` into static HTML/assets handlers only; proxied
  `/api/*` JSON is now no-store and uncompressed.
- Bumped app version to `0.15.21`.

### Local Verification

- `npm run build:web` passed, with existing Vite chunk-size warning.
- `npm run build:server` passed.
- `npm test` passed: server 19 files / 132 tests; web 5 files / 12 tests.
- Caddyfile validate passed.
- `git diff --check` passed.

### CI/CD And Runtime Verification

- Gemini staged review: `No findings`.
- Commit `2558880` pushed to `main`.
- GitHub Actions CI run `25645742538` passed.
- GitHub Actions Deploy Dev run `25645742547` passed.
- Runtime verified: `/api/world` returned `200`, `Cache-Control: no-store`,
  `Content-Length`, and no `Content-Encoding` after deploy.
- iPhone still showed fixture after `/api/world` became successful, which led to
  the follow-up v0.15.22 frontend state fix.

## 2026-05-11 — v0.15.20 Shipped

### Completed Locally

- Investigated why an iPhone could show the v0.15.19 bundle while still seeing
  fixture/demo world data.
- Confirmed latest proxy evidence showed `/api/world` and `/api/cards` returning
  transient `502` during a server restart window, not stale HTML/JS caching.
- Added a fixture-only recovery retry scheduler so the web app retries quickly
  while no authoritative server world has landed yet; successful `/api/world` or
  SSE snapshots cancel the retry.
- Added focused tests for the recovery scheduler: retry while fixture-only, no
  retry once server data arrives, and cancellation/deduplication.
- Bumped app version to `0.15.20`.

### Local Verification

- `npm --workspace @greed-island/web test -- fixtureRecoveryRetry resilientLoad mobileRefreshTriggers refreshGeneration` passed: 4 files / 10 tests.
- `npm --workspace @greed-island/web run build` passed, with existing Vite chunk-size warning.
- `npm run build:web` passed, with existing Vite chunk-size warning.
- `npm run build:server` passed.
- `npm test` passed: server 19 files / 132 tests; web 5 files / 12 tests.
- `git diff --check` passed.

### CI/CD And Runtime Verification

- Gemini staged review found one non-blocking test gap: the extracted recovery
  scheduler is covered, but there is no mounted React provider integration test
  harness for `WorldStateContext` orchestration yet. Accepted for this hotfix.
- Commit `9bae7a2` pushed to `main`.
- GitHub Actions CI run `25645138546` passed.
- GitHub Actions Deploy Dev run `25645138560` passed.
- Runtime health verified: `/healthz` returned `version: 0.15.20`.
- Runtime API version verified: `/api/version` returned `0.15.20`.
- Runtime tick progression verified: tick advanced from `74479` to `74481` over
  10 seconds.
- Runtime API verified: `/api/world` returned live server data with tick `74481`,
  `eventCount=1269017`, and `npcCount=50`.
- Runtime cache headers verified: `/api/world` returned `Cache-Control: no-store`.
- Server logs verified clean boot at tick `74479`, HTTP listening on port 3000,
  and ambient narrator attached with 41 active keys.
- Web proxy logs confirmed the deploy restart window still produces short `502`
  responses; the v0.15.20 client now retries quickly while still fixture-only.

## 2026-05-11 — v0.15.19 Shipped

### Completed Locally

- Investigated continued mobile fixture state after v0.15.18 by checking live web
  proxy logs for the iPhone client.
- Found Safari/iOS requests sending `If-None-Match` for dynamic JSON endpoints;
  several `/api/cards`, `/api/map`, and `/api/npcs` responses returned `304`,
  which the frontend `jsonFetch` treats as a failed JSON response.
- Added `cache: 'no-store'` and `Cache-Control: no-store` to the frontend API
  fetch wrapper so Safari does not conditional-cache dynamic `/api/*` JSON.
- Added `Cache-Control: no-store` to the internal Caddy `/api/*` route.
- Bumped app version to `0.15.19`.

### Local Verification

- `npm run build:web` passed, with existing Vite chunk-size warning.
- `npm run build:server` passed.
- `npm test` passed: server 19 files / 132 tests; web 4 files / 9 tests.
- `docker run --rm -v ... caddy:2.8-alpine caddy validate --config /etc/caddy/Caddyfile`
  passed for `packages/web/Caddyfile.internal`.
- `git diff --check` passed.

### CI/CD And Runtime Verification

- Commit `194385f` pushed to `main`.
- GitHub Actions CI run `25644893980` passed.
- GitHub Actions Deploy Dev run `25644893975` passed.
- Runtime health verified: `/healthz` returned `version: 0.15.19`.
- Runtime tick progression verified: tick advanced from `74372` to `74374`.
- Runtime API verified: `/api/world` returned live server data with tick `74372`,
  `eventCount=1266257`, and `npcCount=50`.
- Runtime cache headers verified: `/api/world` returned `Cache-Control: no-store`.

## 2026-05-11 — v0.15.18 Shipped

### Completed Locally

- Fixed a mobile stale-client/offline-looking failure mode where the bundled web
  `APP_VERSION` still reported `0.15.6` when `/api/version` was temporarily
  unreachable.
- Added internal Caddy cache headers so `/` and `/index.html` are `no-store`,
  while hashed `/assets/*` remain long-lived immutable assets.
- Hardened initial world-state loading for mobile/weak networks with per-request
  timeout, retry/backoff, and refresh on `online`, `pageshow`, and return-to-
  foreground visibility events.
- Bumped app version to `0.15.18`.

### Local Verification

- `npm run build:web` passed, with existing Vite chunk-size warning.
- `npm run build:server` passed.
- `npm run test -w @greed-island/web` passed: 4 files / 9 tests.
- `npm test` passed: server 19 files / 132 tests; web 4 files / 9 tests.
- `docker run --rm -v ... caddy:2.8-alpine caddy validate --config /etc/caddy/Caddyfile`
  passed for `packages/web/Caddyfile.internal`.
- `git diff --check` passed.

### CI/CD And Runtime Verification

- Commit `017f563 fix(web): harden mobile world refresh` pushed to `main`.
- GitHub Actions CI run `25643825872` passed.
- GitHub Actions Deploy Dev run `25643825850` passed.
- Runtime health verified:
  `https://hunter.sisihome.org/healthz` returns `version: 0.15.18`.
- Runtime tick progression verified: health tick advanced from `73900` to
  `73902` over 10 seconds.
- Runtime API verified: `/api/version` returns `0.15.18`; `/api/world` returns
  tick `73900`, `eventCount=1256975`, and `npcCount=50`.
- Runtime cache headers verified: `/` returns `Cache-Control: no-store`, and the
  current hashed JS asset returns `Cache-Control: public, max-age=31536000,
  immutable`.
- Runtime logs verified: server booted from latest tick `73898`, opened HTTP,
  attached ambient narrator with 41 active keys, and did not show crash or tick
  collision errors.

### Still Open

- If Safari still shows stale UI immediately after this deploy, manually
  closing/reopening the tab once may be required to evict the already-loaded old
  JS runtime; subsequent loads should receive fresh HTML due to `no-store`.

## 2026-05-11 — v0.15.17 Shipped

### Completed Locally

- Added bounded chronicle AI rendering attempts with a per-render timeout,
  transient retry/backoff, explicit JSON MIME, and `thinkingBudget=0` structured
  output settings.
- Exposed `chronicle.aiMeta` so success and fallback responses include active key
  count, timeout, max attempts, response MIME, per-attempt status, and fallback
  reason when degraded.
- Kept AI read-only and non-authoritative: timeout, retry exhaustion, and
  ungrounded cited names still return deterministic fallback text without
  changing committed events or world projection.
- Marked OpenSpec task `3.3` complete for key-pool robustness metadata.
- Bumped app version to `0.15.17`.

### Local Verification

- `npm run build:server` passed.
- `npm run build:web` passed, with existing Vite chunk-size warning.
- `npm run test -w @greed-island/server` passed: 19 files / 132 tests.
- `npm test` passed: server 19 files / 132 tests; web 1 file / 2 tests.
- `git diff --check` passed.
- `openspec validate npc-humanity-ai-memory --strict` passed.
- Gemini staged diff reviewer returned `No findings` after adding retry
  exhaustion and non-transient failure regression tests.

### CI/CD And Runtime Verification

- Commit `3f62645 feat(world): add chronicle AI retry metadata` pushed to
  `main`.
- GitHub Actions CI run `25635003178` passed.
- GitHub Actions Deploy Dev run `25635003187` passed.
- Runtime health verified:
  `https://hunter.sisihome.org/healthz` returns `version: 0.15.17`.
- Runtime tick progression verified: health tick advanced from `68948` to
  `68949` over 10 seconds.
- Runtime fallback chronicle verified: `/api/world/chronicle?limit=5` returns
  `source=fallback`, `aiMeta.requested=false`, `activeKeys=41`, and no fallback
  error.
- Runtime AI chronicle verified: `/api/world/chronicle?limit=5&ai=1` returns
  `source=ai`, `aiMeta.requested=true`, `activeKeys=41`, one successful attempt,
  and `fallbackReason=null`.
- Runtime logs verified: server booted from latest tick `68946`, opened HTTP,
  attached ambient narrator with 41 active keys, and did not show crash or tick
  collision errors.

### Still Open

- Follow-up remains: stronger anti-hallucination checks beyond cited-name
  validation.
- Future boot work should add an indexed/latest-fact projection so large logs can
  hydrate richer runtime state without blocking HTTP.

## 2026-05-11 — v0.15.16 Shipped

### Completed Locally

- Added grounded chronicle rendering over recent committed EventLog rows and
  `npc_memory` snippets.
- Added read-only `/api/world/chronicle` endpoint with deterministic fallback by
  default and optional `?ai=1` Gemini JSON rendering.
- Guarded AI chronicle output with an allowed-name list derived from actor ids,
  NPC display names, and memory references; AI output that cites names outside
  the grounded context falls back deterministically.
- Filtered internal `FACT_SET` projection events out of chronicle context so the
  endpoint renders world-facing events rather than state-write noise.
- Marked OpenSpec task `3.2` complete for AI chronicle rendering from committed
  events and memory snippets without granting AI world authority.
- Bumped app version to `0.15.16`.

### Local Verification

- `npm run build:server` passed.
- `npm run build:web` passed, with existing Vite chunk-size warning.
- `npm test` passed: server 19 files / 127 tests; web 1 file / 2 tests.
- `git diff --check` passed.
- `openspec validate npc-humanity-ai-memory --strict` passed.
- Gemini staged diff reviewer returned `No findings` after adding AI-path,
  ungrounded-citation, display-name, and event-filter regression tests.

### CI/CD And Runtime Verification

- Commit `56b0dcf feat(world): render grounded chronicles` pushed to `main`.
- Follow-up commit `138bd27 fix(world): keep chronicle context grounded` pushed
  to `main`.
- GitHub Actions CI runs `25633472890` and `25633662802` passed.
- GitHub Actions Deploy Dev runs `25633472898` and `25633662804` passed.
- Runtime health verified:
  `https://hunter.sisihome.org/healthz` returns `version: 0.15.16`.
- Runtime tick progression verified: health tick advanced from `68184` to
  `68186` over 10 seconds.
- Runtime chronicle verified:
  `/api/world/chronicle?limit=10` returns fallback chronicle text, grounded
  context, NPC display names in `allowedNames`, and no internal `FACT_SET` noise.
- Runtime logs verified: server booted from latest tick `68181`, opened HTTP,
  and did not show crash or tick collision errors.

### Still Open

- Follow-up remains: key-pool robustness metadata for chronicle AI calls and
  stronger anti-hallucination checks beyond cited-name validation.
- Future boot work should add an indexed/latest-fact projection so large logs can
  hydrate richer runtime state without blocking HTTP.

## 2026-05-10 — v0.15.15 Shipped

### Completed Locally

- Extended NPC memory projection so `PLAYER_INTERVENE` events create one
  memory row for each affected NPC.
- Added private player dialog memory persistence: `/api/npc/:npcId/interact`
  now mirrors each saved `personal_events` turn into `npc_memory` when the
  runtime memory projection is attached.
- Kept player dialog memory idempotent through canonical content hashing and
  preserved distinct identical-content memories across different ticks.
- Marked OpenSpec task `3.1` complete for persisted player↔NPC and NPC↔NPC
  interaction facts required by future memory-grounded behavior.
- Bumped app version to `0.15.15`.

### Local Verification

- `npm run build:server` passed.
- `npm run build:web` passed, with existing Vite chunk-size warning.
- `npm test` passed: server 18 files / 120 tests; web 1 file / 2 tests.
- `git diff --check` passed.
- `openspec validate npc-humanity-ai-memory --strict` passed.
- Gemini staged diff reviewer returned `No findings` after adding the
  identical-content/different-tick memory regression test.

### CI/CD And Runtime Verification

- Commit `295f884 feat(npcs): persist player interaction memories` pushed to
  `main`.
- GitHub Actions CI run `25632968113` passed.
- GitHub Actions Deploy Dev run `25632968110` passed.
- Runtime health verified:
  `https://hunter.sisihome.org/healthz` returns `version: 0.15.15`.
- Runtime tick progression verified: health tick advanced from `67832` to
  `67834` over 10 seconds.
- Runtime logs verified: server booted from latest tick `67826`, opened HTTP,
  and did not show crash or tick collision errors.

### Still Open

- Follow-up remains: AI chronicle rendering from committed events and memory
  snippets, with key-pool robustness and anti-hallucination grounding.
- Future boot work should add an indexed/latest-fact projection so large logs can
  hydrate richer runtime state without blocking HTTP.

## 2026-05-10 — v0.15.14 Shipped

### Completed Locally

- Replaced the old permanent role-lock behavior with duty-weighted movement.
- Duty-anchored NPCs such as merchants, guards, priests, craftsmen, and civic
  roles now keep duty windows as the strong movement weight instead of a hard
  identity lock.
- Explicit cross-district routine slots for duty-anchored NPCs are now honored
  instead of being rewritten back to `defaultLocation`.
- NPCs with all-same duty routines receive a short deterministic off-duty errand
  window, while wanderer archetypes keep a longer travel window.
- Added regression coverage for shopkeepers leaving during short off-duty
  errands, priests honoring explicit cross-district routine slots, and guards
  with existing cross-district routines not receiving extra injected errands.
- Bumped app version to `0.15.14`.

### Local Verification

- `npm run build:server` passed.
- `npm run build:web` passed, with existing Vite chunk-size warning.
- `npm test` passed: server 18 files / 116 tests; web 1 file / 2 tests.
- `git diff --check` passed.
- `openspec validate npc-humanity-ai-memory --strict` passed.
- Gemini staged diff reviewer returned `No findings` after the helper rename and
  existing-cross-district-routine regression test were added.

### CI/CD And Runtime Verification

- Commit `5f60ffd fix(npcs): replace role locks with duty-weighted travel`
  pushed to `main`.
- GitHub Actions CI run `25632524896` passed.
- GitHub Actions Deploy Dev run `25632524892` passed.
- Runtime health verified:
  `https://hunter.sisihome.org/healthz` returns `version: 0.15.14`.
- Runtime tick progression verified: health tick advanced from `67605` to
  `67607` over 10 seconds.
- Runtime logs verified: server booted from latest tick `67603`, opened HTTP,
  and did not show continuing tick collision or crash errors.

### Still Open

- Follow-up remains: richer NPC intent selection beyond deterministic schedule
  errands, and memory-backed AI chronicle rendering.
- Future boot work should add an indexed/latest-fact projection so large logs can
  hydrate richer runtime state without blocking HTTP.

## 2026-05-10 — v0.15.13 Shipped

### Completed Locally

- Fixed production tick recovery after availability-first boot skips full runtime
  hydration on very large event logs.
- Added latest committed event-log tick metadata to `readLatestFactSnapshot()` so
  runtime boot resumes from the latest persisted tick even when no `FACT_TICK`
  fact is available.
- Prevented deterministic tick event id collisions that previously caused
  repeated `SQLITE_CONSTRAINT_UNIQUE` failures after booting from defaults.
- Added regression coverage for latest tick discovery, empty event logs, and
  event logs with only null tick values.
- Bumped app version to `0.15.13`.

### Local Verification

- `npm run build:server` passed.
- `npm run build:web` passed, with existing Vite chunk-size warning.
- `npm test` passed.
- `git diff --check` passed.
- Gemini staged diff reviewer returned `No findings` after the null/empty tick
  regression tests were added.

### CI/CD And Runtime Verification

- Commit `d6b67f1 fix(server): resume ticks from latest event log tick` pushed
  to `main`.
- GitHub Actions CI run `25631972227` passed.
- GitHub Actions Deploy Dev run `25631972239` passed.
- Runtime health verified:
  `https://hunter.sisihome.org/healthz` returns `version: 0.15.13`.
- Runtime tick progression verified: health tick advanced from `67308` to
  `67310` over 10 seconds.
- Runtime logs verified: `docker logs --tail 120 greed-island-server` shows boot
  at tick `67294` and no continuing `SQLITE_CONSTRAINT_UNIQUE` tick failures.

### Still Open

- Follow-up remains: real duty-weighted free exploration and richer intent
  selection beyond schedule/personality nudge.
- Future boot work should add an indexed/latest-fact projection so large logs can
  hydrate richer runtime state without blocking HTTP.

## 2026-05-10 — v0.15.12 Shipped

### Completed Locally

- Added server-authoritative `travelRoute` to NPC runtime state for cross-tile
  movement: `fromTile`, `toTile`, `targetTile`, and `startedAtTick`.
- Exposed `travelRoute` through `/api/npcs` and frontend `NpcSummary`.
- Updated Hub map rendering so moving NPCs are drawn on their route segment
  instead of being treated as local Area occupants.
- Updated Area/outdoor projections to exclude `activity = move`, preventing Hub
  and sub-scene duplicate rendering of the same NPC while in transit.
- Added regression coverage for moving NPC route creation, route clearing after
  arrival, and travelling NPCs not appearing in outdoor area occupants.
- Added frontend projection tests so travel NPCs are mapped to Hub route sprites
  and excluded from Area outdoor occupants.
- Bumped app version to `0.15.12`.

### Local Verification

- `npm run build:server` passed.
- `npm run build:web` passed, with existing Vite chunk-size warning.
- `npm test` passed: server 18 files / 112 tests; web 1 file / 2 tests.

### CI/CD And Runtime Verification

- Commit `ba9ca97 fix(npcs): render travel as worldline routes` pushed to `main`.
- GitHub Actions CI run `25631740981` passed.
- GitHub Actions Deploy Dev run `25631740983` passed: Docker images built,
  pushed, desktop containers restarted, and smoke check passed.
- Runtime health verified:
  `https://hunter.sisihome.org/healthz` returns `version: 0.15.12`.
- Runtime NPC projection verified: `/api/npcs` exposes `travelRoute` for every
  NPC, currently `null` for NPCs not in transit.

### Still Open

- Follow-up remains: real duty-weighted free exploration and richer intent
  selection beyond schedule/personality nudge.

## 2026-05-10 — v0.15.11 Shipped

### Completed Locally

- Started OpenSpec change `npc-humanity-ai-memory` for NPC unique presence,
  duty-weighted free exploration, memory-backed behavior, and AI-rendered
  grounded chronicle text.
- Replaced the old durable rule that role NPCs cannot cross districts with the
  new NPC humanity rule: duty is a movement weight, not a permanent hard lock.
- Made building occupant views derive from current NPC presence state instead
  of relying only on the independently hydrated `npcInside` map.
- Updated BuildingPage to use the server NPC projection as the primary source
  for interior NPCs, preventing stale building detail from rendering a duplicate
  when `/api/npcs` says that NPC is elsewhere.
- Added `buildingRuntime` regression coverage for an NPC inside a building not
  appearing in the outdoor NPC list.
- Updated HubPage so the main map shows all surface NPCs, not only NPCs whose
  current activity is `move`; indoor NPCs remain hidden from the hub map to
  prevent duplicates.
- Bumped app version to `0.15.11`.

### Verification

- `npm run build:server` passed.
- `npm run build:web` passed, with existing Vite chunk-size warning.
- `npm run test -w @greed-island/server` passed: 18 files / 110 tests.
- `git diff --check` passed, with Windows LF-to-CRLF warnings only.
- Gemini staged diff reviewer returned `No findings`.

### CI/CD And Runtime Verification

- Commits `b16117f fix(npcs): enforce unique building presence` and
  `0038ee8 fix(web): show outdoor NPCs on hub map` pushed to `main`.
- GitHub Actions CI run `25631221366` passed.
- GitHub Actions Deploy Dev run `25631221360` passed: Docker images built,
  pushed, desktop containers restarted, and smoke check passed.
- Runtime health verified:
  `https://hunter.sisihome.org/healthz` returns `version: 0.15.11`.
- Runtime NPC projection verified: `/api/npcs` returns surface NPCs with
  `buildingId: null` across districts, while indoor NPCs retain a concrete
  `buildingId`.

### Still Open

- Follow-up slices remain: duty-weighted cross-district exploration and
  memory-backed AI chronicle rendering.

## 2026-05-10 — v0.15.10 Shipped

### Completed Locally

- Fixed NPC projection freshness so `/events/stream` now sends an authoritative
  `snapshot` after every simulation tick, not only after narrative events.
- Updated `WorldStateContext` to refresh the authenticated `/npcs` projection
  whenever an SSE snapshot arrives, so `subCol/subRow/buildingId` changes reach
  AreaScene on the backend tick cadence.
- Changed the old 3s full-world polling loop to a 15s fallback for browsers or
  proxies that cannot keep EventSource open.
- Fixed the living-world projection bootstrap check so server boot does not
  rebuild NPC memory/relationship projections on every restart by checking a
  synthetic NPC id that can never exist.
- Changed production boot to skip full runtime hydration for large event logs,
  preserving HTTP availability while new ticks continue from current metadata.
- Bumped app version to `0.15.10` for deployment/runtime verification.

### Local Verification

- `npm run build:server` passed.
- `npm run build:web` passed, with existing Vite chunk-size warning.
- `npm run test -w @greed-island/server` passed: 16 files / 108 tests.
- `git diff --check` passed, with Windows LF-to-CRLF warnings only.

### CI/CD And Runtime Verification

- Commit `6b4dcc3 fix(server): keep boot available on large logs` pushed to
  `main`.
- GitHub Actions CI run `25630222017` passed.
- GitHub Actions Deploy Dev run `25630222015` passed: Docker images built,
  pushed, and desktop containers restarted.
- Runtime health verified:
  `https://hunter.sisihome.org/healthz` returns `version: 0.15.10`.

### Still Open

- v0.15.7 deploy run `25629908799` completed, but public health stayed 502
  because the server container was still rebuilding projections before opening
  port 3000.
- v0.15.8 deploy run `25630060283` completed, but public health stayed 502
  because production event-log hydration was still synchronous and blocked
  before `runtime.start()`.
- v0.15.9 deploy run `25630144174` completed, but public health stayed 502
  because the SQLite latest-fact window query was still too expensive on the
  production event log.
- v0.15.10 restores availability by booting large event logs from defaults;
  future work should add an indexed/latest-fact projection so tick/weather/NPC
  state can hydrate without blocking HTTP.
- Full NPC humanity remains incomplete: private dialog is not yet fully
  grounded in long-term memory, aliases, known-person graph, households,
  faction knowledge, workplace ties, or settlement history.

## 2026-05-10 — v0.15.6 Shipped + CI/CD Restored

### Completed

- Shipped v0.15.6 to `https://hunter.sisihome.org`.
- Restored deployment by moving Greed Island deploy to the kevinhome
  Windows self-hosted runner `DESK-KEVINHOME-greed-island-2`.
- Updated desktop compose to pull Docker Hub images:
  `kevin950805/greed-island-server:dev` and
  `kevin950805/greed-island-web:dev`.
- Moved desktop host port from `7100` to `8100` because Windows excluded
  TCP port range `7032-7131` can reserve `7100` after reboot.
- Updated the active RPi Caddy route for `hunter.sisihome.org` to
  reverse-proxy `100.83.112.20:8100`.

### Verification

- Commit `eeaebf5 fix(deploy): use desktop runner for dev deploy` pushed to
  `main`.
- GitHub Actions Deploy Dev run `25629326859` passed:
  build/push Docker images succeeded and desktop deploy succeeded on the
  self-hosted runner.
- Runtime health verified: `https://hunter.sisihome.org/healthz` returns
  `version: 0.15.6`.

### Still Open

- `homelab-docs` must finish recording the updated Greed Island port and
  self-hosted runner deployment facts.
- NPC movement in AreaScene is still driven by server projection updates
  reaching React/Phaser; SSE currently pushes world snapshots/events but NPC
  lists still rely primarily on polling. Future fix should push or refresh NPC
  projection on each authoritative tick.
- Full NPC humanity remains incomplete: private dialog is not yet fully
  grounded in long-term memory, aliases, known-person graph, households,
  faction knowledge, workplace ties, or settlement history.

## 2026-05-08 — v0.15.6 Ready For Commit

### Completed Locally

- Fixed AreaPage layout jitter near enterable buildings by reserving a
  stable action slot instead of conditionally inserting/removing the
  enter button.
- Exposed current world time in the atmosphere bar using simulation tick
  conversion.
- Exposed player resources in the top bar for signed-in players:
  tide coins, energy, and owned technique-card count.
- Added backend job guard: one player can hold only one active job at a
  time; applying elsewhere returns `ALREADY_HIRED` until they quit.
- Updated BuildingPage to show `已有工作` instead of allowing repeated
  applications when the player already has a job.
- Added NPC dialog anti-hallucination grounding guard for unknown names:
  AI replies that invent facts like “which X / several X” are replaced
  with a deterministic clarification line.
- Added AI dialog prompt grounding: known NPC names are passed to the
  prompt; unknown names/aliases must not be treated as world facts.
- Fixed two-player area presence rendering: presence now carries `x/y/z`,
  peer sprites render from server-returned XYZ, local positions are
  account-scoped, tile switches cannot save old-scene coordinates under
  the new tile, and stale/out-of-order presence requests are ignored
  without publishing false enter/leave events.
- Added canonical world timezone config: `GMT+8` / offset `480`, exposed
  through `/world.worldConfig` and applied by the atmosphere bar clock.
- Hardened transitional `/world.worldConfig` normalization so older server
  payloads do not white-screen the UI while deployments roll forward.
- Added `DEVELOPMENT_CONSTITUTION.md` and architecture rules for
  Autonomous Civilization Evolution.
- Bumped app version to `0.15.6`.

### Local Verification

- `npm run build:server` passed.
- `npm run build:web` passed, with existing Vite chunk-size warning.
- `npm run test -w @greed-island/server` passed: 16 files / 108 tests.
- `git diff --check` passed, with Windows LF-to-CRLF warnings only.
- Reviewer pass after final GMT+8 and XYZ presence fixes: No findings.

### Superseded By 2026-05-10 Handoff

- Commit/push, CI tracking, and deployment verification are complete.
- Remaining product backlog moved to the latest section above.

## 2026-05-08 — v0.15.5 Shipped

### Completed

- Deterministic card drops: `CardDropEngine` no longer uses
  `Math.random()` for spawn checks, card selection, or coordinates.
- Added replay tests for normal tick drops and boot-time seed drops.
- Added `openspec/changes/deterministic-card-drops/` proposal, design,
  specs, and tasks.
- Updated `ARCHITECTURE.md` to mark card-drop randomness addressed while
  keeping `card_action_log` migration as an open non-conformance.
- Added renderer-only map/environment/NPC idle animation improvements.
- Bumped app version to `0.15.5`.

### Verification And CI/CD

- Local `npm run build:web`, `npm run build:server`, full server tests,
  and `git diff --check` passed.
- Commit: `eea3414 fix(world): harden deterministic continuity`.
- CI run `25538968116` passed.
- Deploy Dev run `25538968139` built and pushed Docker images, then
  failed at desktop SSH reachability.

### Known Deployment Blocker

- Deploy Dev still fails at `Verify desktop SSH reachability` because the
  desktop target refuses SSH on the configured host/port.

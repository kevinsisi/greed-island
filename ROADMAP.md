# Greed Island — Roadmap

> 這份 roadmap 是 release-by-release 的工作項摘要。最新狀態在最上面。
> 詳細設計見 `openspec/changes/<change-id>/proposal.md`。
> 架構準則見 `ARCHITECTURE.md` 與 `COMBAT_ARCHITECTURE.md`。
> 程式總計畫（含 phase 順序與成功標準）見 `docs/WORLD_CAPABILITIES.md`。

## v0.16.0 🚧 in progress — 2026-05-14

**主題：Phase E1.1 — Ecosystem predator/prey pressure**

OpenSpec: `ecosystem-predation/`。

- ✅ 新增 `ANIMAL_STARVED` command/event + validators。
- ✅ 新增 `packages/server/src/ecosystem/predation.ts`：從 `animal_population` + species `preyTargets` deterministic 規劃 same-tile predation。
- ✅ Runtime 每 tick 最多規劃一次 ecosystem predation：有 prey 時 emit `ANIMAL_HUNT_STARTED` / `ANIMAL_HUNT_RESOLVED` / `ANIMAL_KILLED`；無 same-tile target prey 時 emit `ANIMAL_STARVED` pressure。
- ✅ Predator kill 走既有 `ANIMAL_KILLED`，所以 `AnimalPopulationProjection` 用同一路徑扣除 prey animal id。
- ✅ Routine predation/starvation events 不進 public recent-event / chronicle surfaces。
- ✅ Focused server tests 52 passed；full `npm test` 326 server + 34 web；`build:server` / `build:web`；`openspec validate --all --strict`（28 passed）全綠。
- 🚧 待 commit / push / CI / Deploy Dev + live smoke。
- ⚠️ Honest scope：同 tile predation pressure only；尚無 migration、reproduction、carrying capacity、predator death、carcass/goods from animal-on-animal kills。

## v0.16.0 🚧 in progress — 2026-05-13

**主題：Phase 2 §35.4 — Market price formation**

OpenSpec: `market-formation/`。

- ✅ 新增 `MARKET_PRICE_DISCOVERED` command/event + validators。
- ✅ 新增 deterministic market pricing policy：以中央聚落 settlement inventory supply + fixed baseline demand 形成價格。
- ✅ 新增 `MarketPricesProjection`，以 `(settlementId, goodsId)` 保存最新價格，支援 replay/canonical hash。
- ✅ `WorldSnapshot.facts.marketPrices` 可讀；`/admin/world` 顯示 supply / demand / price / market，並明確標示不是 NPC purchases 或 player shop。
- ✅ Focused server tests 48 passed；full `npm test` 319 server + 34 web；`build:server` / `build:web`；`openspec validate --all --strict`（27 passed）全綠。
- ✅ Commit `dcf659c` pushed；CI run `25815422835` passed；Deploy Dev run `25815423920` passed；live `/healthz` = `0.16.0` @ tick `120083`；`/api/world.facts.marketPrices` = 4。
- ⚠️ Honest scope：目前只有價格投影；尚無 NPC 購買、家戶預算、玩家買賣 UI、訂單、稅或動態需求。

## v0.16.0 🚧 in progress — 2026-05-13

**主題：Phase 2 §35.3 — Goods production chains**

OpenSpec: `goods-production-chains/`。

- ✅ 新增 deterministic recipe metadata：`salt_marsh_brine -> refined_salt`。
- ✅ 新增 `ProductionChainsProjection`，顯示配方與 processed totals，支援 replay/canonical hash。
- ✅ `SimulationRuntime` 會在 `settlement.t_central` 有足量 `salt_marsh_brine` 時，經 Rule Engine emit `GOODS_PROCESSED`。
- ✅ `WorldSnapshot.facts.productionChains` 可讀；`/admin/world` 顯示 production recipes / totals，並明確標示不是 market price 或 meals。
- ✅ Focused server tests 51 passed；full `npm test` 312 server + 34 web；`build:server` / `build:web`；`openspec validate --all --strict`（26 passed）全綠。
- ✅ Commit `ab54bcd` pushed；CI run `25814013498` passed；Deploy Dev run `25814014812` passed；live `/healthz` = `0.16.0` @ tick `119758`；`/api/world.facts.productionChains.recipes` = 1。
- ⚠️ Honest scope：目前只有第一條生產配方；尚無 market prices、NPC purchases、meals、spoilage 或 warehouse capacity。

## v0.16.0 🚧 in progress — 2026-05-13

**主題：Phase 2 §35.2 — Abstract goods logistics from ecosystem outputs**

OpenSpec: `goods-logistics/`。

- ✅ 新增 `TRADE_ROUTE_OPENED` / `TRADE_ROUTE_CLOSED` / `GOODS_TRANSPORT_STARTED` / `GOODS_TRANSPORT_ARRIVED` / `GOODS_TRANSPORT_LOST` command/event + validators。
- ✅ 新增 `LogisticsProjection`，追蹤 route open/closed 與 transport started/arrived/lost，支援 replay/canonical hash。
- ✅ accepted ecosystem goods outside `t_central` 會開抽象路線、消耗來源庫存、啟動運輸、送抵並存入 `settlement.t_central`。
- ✅ active `weather.storm` 會讓 planned transport 轉成 `GOODS_TRANSPORT_LOST`，不會在本 slice 毀壞城市或建築。
- ✅ `WorldSnapshot.facts.logistics` 可讀；`/admin/world` 顯示 routes/transports，並標示目前仍是 abstract logistics，不含道路、倉庫、價格、pathfinding 或 city damage。
- ✅ Focused server tests 47 passed；full `npm test` 306 server + 34 web；`build:server` / `build:web`；`openspec validate --all --strict`（25 passed）全綠。
- ✅ Commit `16583fd` pushed；CI run `25813214469` passed；Deploy Dev run `25813214497` passed；live `/healthz` = `0.16.0` @ tick `119579`。
- ⚠️ Honest scope：物流只完成第一版抽象 chain；production/cooking、household consumption、market prices 仍在後續 Phase 2 slices。

## v0.16.0 🚧 in progress — 2026-05-13

**主題：Phase 2 §35.1 — Goods primitives sourced from ecosystem outputs**

OpenSpec: `goods-primitives/`。

- ✅ 新增 `GOODS_EXTRACTED` / `GOODS_STORED` / `GOODS_PROCESSED` / `GOODS_CONSUMED` / `GOODS_DESTROYED` command/event + validators。
- ✅ 新增 `GoodsInventoryProjection`，以 `(holderType, holderId, goodsId)` 聚合 inventory，支援 replay/canonical hash，消耗不會扣到負數。
- ✅ accepted `MEAT_HARVESTED` 會產生並存入 NPC 的 `meat` goods。
- ✅ accepted `FISHERY_HARVESTED` 會產生並存入 NPC 的 `fish` goods。
- ✅ `WorldSnapshot.facts.goodsInventory` 可讀；`/admin/world` 顯示貨物、數量、持有者、地點、更新 tick。
- ✅ Focused server tests 57 passed；full `npm test` 301 server + 34 web；`build:server` / `build:web`；`openspec validate --all --strict`（24 passed）全綠。
- ✅ Commit `f9a3365` pushed；CI run `25804686088` passed；Deploy Dev run `25804685682` passed；live `/healthz` = `0.16.0` @ tick `117740`；`/api/world.facts.goodsInventory` exists but had 0 rows before any new post-deploy ecosystem harvest.
- ⚠️ Honest scope：這是 goods substrate；NPC 尚未購買、烹調、吃飯、運輸或形成價格。

## v0.16.0 🚧 in progress — 2026-05-13

**主題：Phase E0.4 follow-up — GM 世界觀測入口 + 漁場可視化**

- ✅ 新增 `/admin/world` 給 GM/admin 直接看 server-authoritative world projections。
- ✅ GM/admin 在桌面側欄與個人資料 staff shortcuts 可進入「GM 世界」。
- ✅ GM 世界頁顯示 `facts.fisheryDensity`：地點、密度條、採收量、狀態、更新 tick。
- ✅ `npm run build:web` passed；`npm run test -w @greed-island/web` 34 passed；OpenSpec all strict passed。
- ✅ Commit `cd3eb0e` pushed；CI run `25802979233` passed；Deploy Dev run `25802979345` passed；live `/healthz` = `0.16.0` @ tick `117385`；`/api/world.facts.fisheryDensity` live had 2 collapsed rows (`t_dock`, `t_temple`)。
- ⚠️ Honest scope：目前漁場仍是 ecological pressure projection；NPC 尚未購買、烹調、儲存或販售魚貨。

## v0.16.0 🚧 in progress — 2026-05-13

**主題：Phase E0.4 — fishery density projection + collapse warning**

OpenSpec: `ecosystem-fishery-density/`。

- ✅ 新增 `FISHERY_HARVESTED` / `FISHERY_COLLAPSED` command/event + validators。
- ✅ 新增 `FisheryDensityProjection`，以 coastal tile id 聚合 density / harvestedTotal / collapsed。
- ✅ fisher/fishmonger/net-mender productive actions 會在 `t_dock` / `t_temple` / `t_salt_marsh` 降低 local fishery density。
- ✅ density 跨過 `FISHERY_COLLAPSE_THRESHOLD = 20` 時 emit `FISHERY_COLLAPSED`。
- ✅ `WorldSnapshot.facts.fisheryDensity` 可讀。
- ✅ Focused tests 45 passed；full `npm test` 296 server + 34 web；`build:server` / `build:web`；`openspec validate --all --strict`（23 passed）全綠。
- ✅ Commit `d7fef26` pushed；CI run `25798295594` passed；Deploy Dev run `25798295660` passed；live `/healthz` = `0.16.0` @ tick `116291`；`/api/world.facts.fisheryDensity` exists and was empty at tick `116293` before any qualifying fisher harvest.

## v0.16.0 🚧 in progress — 2026-05-13

**主題：Phase E0.3 — simple hunting turns wildlife into ecosystem/economy events**

OpenSpec: `ecosystem-simple-hunting/`。

- ✅ 新增 `ANIMAL_HUNT_STARTED` / `ANIMAL_HUNT_RESOLVED` / `ANIMAL_KILLED` / `CARCASS_CREATED` / `MEAT_HARVESTED` command/event + validators。
- ✅ 新增 `packages/server/src/ecosystem/hunting.ts`：hunter-role + food pressure + same-tile edible prey 才會規劃狩獵；hunt id / carcass id / target animal 由 canonical hash 決定。
- ✅ `AnimalPopulationProjection` 支援 `ANIMAL_KILLED` 扣除 animal id；duplicate kill 不會扣到負數。
- ✅ `MEAT_HARVESTED` 經 `withMeatHarvestedRecorded` 轉成 NPC civic gold + civic XP，作為 Phase 2 Goods 前的 placeholder bridge。
- ✅ `SimulationRuntime` 從 hunter productive actions 規劃 simple hunting chain，accepted events fan-out 到 projection/state。
- ✅ Focused tests 75 passed；full `npm test` 292 server + 34 web；`build:server` / `build:web`；`openspec validate --all --strict`（22 passed）全綠。
- ✅ Commit `1e2c188` pushed；CI run `25797518715` passed；Deploy Dev run `25797518707` passed；live `/healthz` = `0.16.0` @ tick `116100`。

## v0.16.0 🚧 in progress — 2026-05-13

**主題：Phase E0.2 — deterministic wildlife spawning + `animal_population` projection**

OpenSpec: `ecosystem-animal-spawning/`。

- ✅ 新增 `ANIMAL_SPAWNED` command/event 與 validator，payload 帶具體 `Animal` + `spawnedAtTick`。
- ✅ 新增 `packages/server/src/ecosystem/animalSpawning.ts`：固定 cadence、每 cadence 只評估一個 active eligible tile、用 canonical hash 決定 species / animal id / sub-tile position。
- ✅ 明確只映射 documented ecosystem regions：`forest` / `mountain` / `desert` / `ruin` / explicit `t_salt_marsh`；generic `grass`、generic `water` 不產生假 species。
- ✅ 新增 `AnimalPopulationProjection`，以 `(speciesId, tileId)` 聚合 `ANIMAL_SPAWNED`，支援 rebuild / incremental project / canonical hash。
- ✅ `SimulationRuntime` 每 spawn cadence push `ANIMAL_SPAWNED` 進 Rule Engine，accepted event fan-out 到 projection，boot 從 EventLog rebuild，`WorldSnapshot.facts.animalPopulation` 可讀。
- ✅ `ANIMAL_SPAWNED` 不進 public recent-event / SSE / chronicle surfaces。
- ✅ Focused tests 49 passed；full `npm test` 287 server + 34 web；`build:server` / `build:web`；`openspec validate --all --strict`（21 passed）全綠。
- ✅ Commit `4ddcdbc` pushed；CI run `25796560338` passed；Deploy Dev run `25796560331` passed；live `/healthz` = `0.16.0` @ tick `115862`；`/api/world.facts.animalPopulation` after next cadence had 1 row @ tick `115872`。

## v0.16.0 🚧 in progress — 2026-05-13

**主題：Phase 1 §33.2 — NPC state 從 FACT_SET 轉向 typed projection**

OpenSpec: `npc-state-typed-projection/`。

- ✅ 新增 `NPC_STATE_RECORDED` command/event。
- ✅ 新增 `NpcStateProjection`，提供 `rebuildFromEvents / project / getByNpcId / getAll / canonicalHash`。
- ✅ `SimulationRuntime` 改為對 NPC state change emit typed event，不再為新 state change 寫 `npc.state.<id>` FACT_SET。
- ✅ boot hydrate 現在優先讀 typed `NpcStateProjection`；舊 `npc.state.<id>` facts 只留 backward-compatible fallback。
- ✅ `NPC_STATE_RECORDED` 不進 public recent-event / chronicle narrative surface。
- ✅ Focused tests 45 passed；full `npm test` 279 server + 34 web；`build:server` / `build:web`；`openspec validate --all --strict`（20 passed）全綠。
- ✅ Commit `c3068f1` pushed；CI run `25794738289` passed；Deploy Dev run `25794738301` passed；live `/healthz` = `0.16.0` @ tick `115399`.

## v0.16.0 🚧 in progress — 2026-05-13

**主題：Phase E0.1 — 第一個 Layer 2.5 substrate 進 codebase（species catalog + Animal domain）**

OpenSpec: `ecosystem-foundation/`。

- ✅ 新增 `packages/server/src/ecosystem/species.ts`。
- ✅ 把 `WORLD_CAPABILITIES.md` §6.4 的 22 種 species 正式編碼成 canonical catalog（5 salt_marsh / 5 forest / 4 mountain / 4 desert / 4 ruin）。
- ✅ 定義 `Species` / `Animal` 與 supporting unions（category / diet / pack behavior / activity window / migration pattern / rarity / lifecycle stage / animal state）。
- ✅ 提供 deterministic read-only helpers：`listSpecies` / `getSpecies` / `requireSpecies` / `listSpeciesByRegion` / `listSpeciesByCategory`。
- ✅ 這一刀不碰 runtime tick、不碰 `ANIMAL_SPAWNED`、不碰 projection；它是 E0 的 substrate slice，不假裝 wildlife engine 已存在。
- ✅ Focused tests 15 passed；full `npm test` 273 server + 34 web；`build:server` / `build:web`；`openspec validate --all --strict`（19 passed）全綠。
- ✅ Commit `cf53455` pushed；CI run `25793089359` passed；Deploy Dev run `25793089369` passed；live `/healthz` = `0.16.0` @ tick `114886`.

## v0.16.0 🚧 in progress — 2026-05-13

**主題：Phase 1 budget gate slice 3b — active/background partition 開始真正影響 NPC 行為**

OpenSpec: `simulation-budget-enforcement/`。

- ✅ `SimulationRuntime` 每 tick 把 `npcPartition.active` 傳進 `NpcEngine.tick(...)`。
- ✅ `NpcTickContext` 新增 `activeNpcSet`，Phase 2 productive actions 與 Phase 3 interactions 改為只看 active NPC。
- ✅ Allow-list continuity overrides：`activity='move'`、active `player-dialog` hold、`personalityOverride.targetTile` 非空 → 不受 bucket 限制，仍視為 active。
- ✅ 補 spec delta：productive gating、interaction gating、allow-list bypass 三個 scenarios。
- ✅ 補測試：`npcEngine.test.ts` 新增 4 個 slice 3b cases；`runtimePresence.test.ts` 更新以適應分群後的 event cadence。
- ✅ `npm test` 266 server + 34 web；`build:server` / `build:web`；`openspec validate --all --strict`（18 passed）全綠。
- ✅ Commit `23cfca6` pushed；CI run `25791664215` passed；Deploy Dev run `25791664183` passed；live `/healthz` = `0.16.0` @ tick `114629`.

## v0.15.47k ✅ shipped — 2026-05-13

**主題：Settlement Domain follow-up verification + projection fan-out fix**

- ✅ Follow-up fix `463341d` wires `settlementsProjection.project(ev)` into `runTick()` accepted-event fan-out, so newly formed settlements appear immediately in runtime/API instead of waiting for reboot hydration.
- ✅ `8c86c59` (settlement domain ship) passed CI `25790844474` + Deploy `25790844483`。
- ✅ `463341d` (fan-out fix) passed CI `25791885567` + Deploy `25791885547`。
- ✅ Live `/api/settlements` returns real settlement rows (e.g. `t_central`, `t_dock`, `t_forest`) under `0.16.0`.

## v0.15.48 🚧 in progress — 2026-05-13

**主題：Phase 0 Architecture Formalization — 六層 Runtime 正式進入 ARCHITECTURE.md**

OpenSpec: `architecture-formalization/`。

這是 `docs/WORLD_CAPABILITIES.md` Part IV 的 Phase 0。它不改 runtime 行為；目標是先把世界演化的六層 vocabulary 寫進 engine-level source of truth，避免後續 Phase 1 / E0 / Phase 2 做出錯誤依賴順序。

### Scope

- ✅ 新增 `ARCHITECTURE.md` §12 "Six Runtime Layers"。
- ✅ 定義 Layer 1 Kernel、Layer 2 Living World、Layer 2.5 Ecosystem、Layer 3 Civilization、Layer 4 Combat、Layer 5 Perception 的 authority boundary。
- ✅ 明確寫入 inter-layer dependency rules：budget gate before growth、typed events before permanence、ecosystem before metabolism、settlement before economy、combat feeds world、cards as rule operators、player is ordinary actor、perception never owns truth。
- ✅ OpenSpec hygiene：proposal-only `player-intervene-and-combat` 移入 archive 保留歷史，不再阻塞 strict validate。
- ✅ OpenSpec hygiene：清掉空的 `construction-motivation-chronicle` active shell。

### Verification

- ✅ `npx openspec validate architecture-formalization --strict`
- ✅ `npx openspec validate --all --strict`（17 passed, 0 failed）
- ✅ Commit `d46a153` pushed; CI run `25786027078` passed; Deploy Dev run `25786027052` passed.

## v0.15.47k ✅ shipped — 2026-05-13

**主題：Phase 1 §33.4 Settlement Domain — 第一個 Layer 3 Civilization Runtime 實體**

- ✅ 新 OpenSpec change `settlement-domain`（validates strict）+ 新 `civilization-runtime` capability spec（18 specs all-pass）。
- ✅ 新 Command `SETTLEMENT_FORMED`，validator 強制 `founderNpcIds` 排序+去重 → replay 確定性。
- ✅ Pure helper `sim/settlementDetection.ts::detectSettlementFormation()` 偵測 sustained co-presence：tile 連續 12 tick 有 ≥3 個 outdoor NPC 同一 cohort 就觸發。
- ✅ `SettlementsProjection`：`rebuildFromEvents` / `project(event)` / `getAll / getById / getByTile / getTilesWithSettlement`，first-write-wins for replay safety。
- ✅ `SimulationRuntime` 整合：boot 時從 EventLog 重建 projection；`runTick()` 在 NPC 階段之後跑偵測、push `SETTLEMENT_FORMED` command 進 rule engine；id 用 `hashCanonicalJson({tileId, formedAtTick, founderNpcIds})` 16 字推。
- ✅ HTTP read-only：`GET /api/settlements` + `GET /api/settlements/:id`（wired between buildings 與 combat routers）。
- ✅ Web client：`ServerSettlement` type + `api.settlements()` / `api.settlementById(id)`。
- ✅ Tests：`settlementDetection.test.ts` 7 個（門檻 / cohort change reset / already-formed skip / lex sort / drop-below clears）；`settlements.test.ts` 8 個（projection rebuild / canonical-hash 相等 / first-write-wins / sort）。
- ✅ `npm test` 262 server + 34 web 全綠；`build:server` / `build:web` 通過；`openspec validate --all --strict` 18 items 過。
- 🚧 待 commit / push / CI / Deploy Dev + 本地 docker rebuild 驗 `/api/settlements`。

## v0.15.47j ✅ shipped — 2026-05-13

**主題：Phase 1 budget gate slice 3a — NPC 確定性 round-robin 分群 + snapshot exposure**

- ✅ `NPC_PARTITION_PERIOD = 4` 加進 `config/world.ts`（50 NPCs / 4 buckets ≈ 12-13 active/tick，每 NPC 每 4 tick 一次 active）。
- ✅ 新 pure helper `sim/npcPartition.ts::partitionNpcsForTick(npcIds, tick, period)` 回 `{ active, period, totalCount, activeCount }`。Content-hash bucketing 用簡單 deterministic char-code mod。
- ✅ `runTick()` 在 tick 開頭算 partition，存 `lastActiveNpcCount`，`WorldSnapshot.npcPartition = { activeCount, totalCount, period }` 暴露給 GM dashboard。
- ✅ **NPC engine 行為不變** — 本 slice 純 classification + observability。Slice 3b 才會把 active set 接進 NpcEngine 的 Phase 2/3 filter。
- ✅ Spec delta 加 1 條新 ADDED Requirement（partition determinism + 每 NPC 每 period 一次 active + snapshot exposure），3 個 scenarios。
- ✅ Tests：`npcPartition.test.ts` 10 個 pure helper tests（含跨 collection order 不變、period 內 coverage、replay 一致性）；`runtimeBudget.test.ts` +2 個整合（snapshot 暴露 / 一個 period 內 activeCount 累加 = totalCount）。
- ✅ `npm test` 247 server + 34 web 全綠；`build:server` / `build:web` 通過；`openspec validate simulation-budget-enforcement --strict` 通過。
- 🚧 待 commit / push / CI / Deploy Dev 驗證。

## v0.15.47i ✅ shipped — 2026-05-13

**主題：Phase 1 budget gate slice 2 — 確定性 hard cap enforcement**

- ✅ `MAX_COMMANDS_PER_TICK_HARD_CAP = 8000` 與 `COMMAND_CAP_REJECTION_CODE = 'COMMAND_CAP_EXCEEDED'` 加進 `config/world.ts`。
- ✅ 新 pure helper `sim/commandBudget.ts::applyCommandHardCap(commands, hardCap)` 回 `{ kept, rejected }`。在 cap 之下 identity-preserving（不排序），超過 cap 時按 `commandId` 升冪排序、取前 N。回傳 frozen array。
- ✅ `SimulationRuntime.runTick()` 在 soft cap 警告後叫 helper；rejected 全部走 `eventStore.recordRejectedCommand(...)` 寫進 `rejected_command_log`（`rejectionCode = 'COMMAND_CAP_EXCEEDED'`，**不影響 WorldState** — 該 table 被 reducer 排除）；下游 rule engine loop 改 iterate `acceptedCommands`。
- ✅ `WorldSnapshot.tickCommandStats` 多 `hardCap` + `hardCapRejectedSinceBoot` 兩欄；web `ServerTickCommandStats` 同步。
- ✅ Spec delta 加 3 條新 ADDED Requirements（enforcement determinism、WorldState invariance under rejection、hardCap exposure）。
- ✅ Tests：`commandBudget.test.ts` 7 個 pure-helper 測試（含跨 collection order 確定性）；`runtimeBudget.test.ts` +1 個確認真實 50-NPC 負載下 `rejected_command_log` 無 `COMMAND_CAP_EXCEEDED` 紀錄。
- ✅ `npm test` 230 server + 34 web 全綠；`build:server` / `build:web` 通過；`openspec validate simulation-budget-enforcement --strict` 通過。
- 🚧 待 commit / push / CI / Deploy Dev 驗證。

## v0.15.47h ✅ shipped — 2026-05-13

**主題：Phase 0 archive + Phase 1 budget gate slice 1（command cap observability）**

- ✅ Phase 0 `architecture-formalization` archive 為 `2026-05-13-architecture-formalization`，spec delta 合進 `openspec/specs/simulation-kernel/spec.md`。
- ✅ 新增 OpenSpec umbrella change `simulation-budget-enforcement`（WORLD_CAPABILITIES.md §33.1）涵蓋 4 個 sub-slice：observability / hard cap enforcement / NPC partitioning / regional activation。本 release 只 ship slice 1。
- ✅ `MAX_COMMANDS_PER_TICK_SOFT_CAP = 5000` 常數加進 `config/world.ts`。
- ✅ `SimulationRuntime` 加 `lastTickCommandCount` / `peakTickCommandCount` / `softCapHitCount`。`runTick()` 在 commands array 組完之後（rule engine dispatch 之前）更新統計，超過 soft cap 時 `console.warn` 一次。**不 reject**。
- ✅ `WorldSnapshot.tickCommandStats = { lastTick, peak, softCap, softCapHitCount }` 自動透過 `/api/world` 與 `/api/dashboard` 對外可見。
- ✅ `runtimeBudget.test.ts` 4 個測試覆蓋：snapshot 暴露 / peak monotonic / 真實 50-NPC 負載下不觸警告 / softCapHitCount 維持 0。
- ✅ `npm test` 223 server + 34 web 全綠；`build:server` / `build:web` 通過；`openspec validate simulation-budget-enforcement --strict` 通過。
- 🚧 待 commit / push / CI / Deploy Dev 驗證。

## v0.15.47g ✅ shipped — 2026-05-13

**主題：World program consolidation + Layer 2.5 Ecosystem Runtime + GM NPC Dashboard**

Runtime version stays `0.15.47`（同 prior 47e/47f 模式 — 47a–47g 是 47 series 內的 micro-slice，code 仍在 0.15.47）。下一個真正 minor bump (v0.15.48) 預留給 Phase 0 architecture-formalization slice。

Doc + 程式雙線：把整個 program 在文件層收斂成單一來源，加進新的 Layer 2.5 ecosystem 軸，並 ship 第一個 GM-facing observability slice。

### Doc consolidation

- ✅ 合併 vision v2 進 `docs/WORLD_CAPABILITIES.md`（Part I 是用戶 constitution、Part II baseline、Part III crosswalk、Part IV 6-phase plan、Part V success criteria）。
- ✅ 把後續的 `docs/WITH_ECO.md`（1030 行）也吃進 WORLD_CAPABILITIES.md，正式加入 Layer 2.5 Ecosystem Runtime。Layer 模型從 5 層升 6 層。
- ✅ Phase plan 從 7 phase（0-6）擴成 **12 phase**（0, 1, E0, 2, E1, 3, E2, 4, 5, E3, 6, E4）— civ 與 ecosystem 交錯，Phase E0 必須在 Phase 2 之前以提供 metabolism substrate。
- ✅ 完成 OpenSpec cleanup：archive 19 個 ✓ Complete / near-complete changes、刪 2 個 dead proposals（`add-living-world-runtime`、`establish-greed-island-platform`）。Active changes 從 25 降到 5；後續 v0.15.48 會再收斂 proposal-only / empty active shells。
- ✅ `DEVELOPMENT_CONSTITUTION.md` 與 `CLAUDE.md` 都加上 `docs/WORLD_CAPABILITIES.md` 引用。

### GM NPC Dashboard slice

- ✅ 新 OpenSpec change `gm-npc-dashboard` (validates strict)。
- ✅ Backend：`GET /api/admin/npc-stats`（GM 或 admin）回傳 `{ totalNpcs, byOrigin: { manual, born }, births: { totalEventCount, recent[] }, households: { totalEventCount, recent[] }, deaths: { available: false, reason, plannedAt }, generatedAtTick }`。`SqliteEventStore.countEventsByKind` 與 `SimulationRuntime.getManualNpcIds` 都是純 additive helper。
- ✅ Frontend：`/admin/npcs` page，6 個 stat cards + births / households tables + deaths "Phase 5 pending" panel + 非 GM/admin 的 access-denied fallback。`AdminPage` 加「進入 NPC 儀表板」連結。
- ✅ i18n zh + en（27 條新 keys）、6 個新 router 測試（auth gate + buildNpcStats）全綠。
- ✅ Honest scope：今天 `byOrigin.born = 0`（NPC_CHILD_BORN 只記在父母身上、子代尚未成為 runtime entity）；`deaths.available = false` 直到 Phase 5.2 NPC_DECEASED 落地。

### Verification

- ✅ `npm test`: 219 server tests + 34 web tests。
- ✅ `npm run build:server` / `build:web` 通過（web 只有既有 chunk-size warning）。
- ✅ `npx openspec validate gm-npc-dashboard --strict` 通過。
- ✅ Commit `ac9e85a` (GM dashboard) → CI run `25782314152` ✅ + Deploy Dev run `25782314113` ✅。
- ✅ Commit `6d1e627` (ECO integration) → CI run `25782668554` ✅ + Deploy Dev run `25782668586` ✅。
- ✅ 本地 docker 重建：`down`（保留 `deploy/data/` SQLite EventLog）→ `up -d --build`，`/healthz` 回 `version: "0.15.47"`，tick 從 11882 接續到 11890（世界歷史未斷），`/api/admin/npc-stats` 匿名回 401（auth gate 正常）。
- ✅ `gm-npc-dashboard` 已在 commit `5864e1a` archive 到 `openspec/changes/archive/2026-05-13-gm-npc-dashboard/`，並 promotion 到 `openspec/specs/gm-npc-dashboard/spec.md`。
- ⚠️ 若需要人工信心，可再用瀏覽器開 `http://127.0.0.1:8100/admin/npcs` 視覺確認 stat cards + tables；本 opencode session 未重跑瀏覽器 smoke。

## v0.15.47 🚧 in progress — 2026-05-12

**主題：civ-evo-construction Slice 4-6 — NPC-initiated 工地可見且可點**

**主題：civ-evo-construction Slice 4-6 — NPC-initiated 工地可見且可點**

- ✅ 新增 `ConstructionProjectsProjection`，支援 `rebuildFromEvents()`、
  `getInProgressByTile()`、`getByProjectId()`，並加 canonical-hash / replay
  一致性測試。
- ✅ `/api/buildings?tileId=X` 回傳 `inProgress`，並把 open NPC-initiated
  project 投影成可進入的 `construction` site view。
- ✅ Hub `constructionActivitiesFor()` 會把 `lifeExpansion` 裡的
  NPC-initiated open projects 轉成 `MapConstructionActivity`，沿用既有
  `MapScene.drawConstructionSites()` 畫工地。
- ✅ B1 demo gate：`CIV_EVO_CONSTRUCTION_DEMO_ECONOMY_THRESHOLD = 80`，讓目前
  economy < 80 的區域可以觸發。
- ✅ 明確保留修正：salt-marsh 是 legacy/system fixed project，不再包裝成
  NPC 自主建造。
- ✅ 本機：targeted tests、`npm test`、server/web build、OpenSpec validate、
  `git diff --check` 通過。
- 🚧 還沒做：browser/live smoke，確認 Hub 看到工地、Area 可點 🚧、進入工地
  interior。

## v0.15.46 🚧 in progress — 2026-05-12

**主題：MapScene 對 scene.restart() 安全：清掉 sprite 引用**

- ✅ Root cause：`scene.restart()` 重用同一個 MapScene 實例，但 class field
  `npcSprites/peerSprites/districtLabels` 等 Maps 還握上一回 scene 的
  destroyed sprite。新 create 跑到 refreshNpcSprites 就在 `setTexture` 上
  炸 `Cannot read properties of undefined (reading 'sys')`。
- ✅ 新 `resetSpriteRegistries()` 清掉所有 sprite 參考。create() 開頭叫一次
  (防禦)，SHUTDOWN / DESTROY 各叫一次。
- ✅ 本機：`npm test` 全綠（server 189 / web 28）、`npm run build` 通過。
- 🚧 還沒做：commit / push / docker rebuild + 你 hard reload 確認 crash 沒了。
- 🚧 後續：為什麼 activeDistrictIds 會頻繁變動 (理論上整 session 應該穩定)
  — 一個 hypothesis：boot hydration 過渡期間 /api/map 偶爾少 tile。

## 2026-05-12 Correction — Salt-Marsh Is Legacy, Not NPC-Autonomous

- ⚠️ User report confirmed: the visible salt-marsh map construction is not true
  NPC-autonomous construction.
- Live `lifeExpansion.constructionProjects.project.salt_marsh_settlement` has
  `initiatedByNpcId: ""`, which means legacy/system project.
- Code path is fixed by constants in `cityLife.ts`:
  `SALT_MARSH_PROJECT_ID`, `SALT_MARSH_TILE_ID`, `SALT_MARSH_BUILDING_ID`, and
  `SALT_MARSH_PROJECT_TARGET`; `withUnlockedExpansion()` always unlocks that
  tile/building.
- NPC productive events currently advance that fixed project, but NPCs do not
  choose the salt-marsh target/building autonomously.
- `civ-evo-construction` Slice 3 only implemented autonomous initiation for
  non-salt-marsh low-economy districts. Slice 4+ projection/API/frontend and
  generic progress/completion are still required before the map can honestly
  show NPC-initiated construction.

## v0.15.45 🚧 in progress — 2026-05-12

**主題：Hub mount latch + since-panel session memory**

- ✅ HubPage：把 v0.15.44 的 `source === 'server'` gate 換成單向 latch
  `hasServerWorld`。一旦掛上，SSE/poll 暫斷不會再 unmount Phaser scene。
  修正 v0.15.44 引發的「卡住要頻繁重整」。
- ✅ HubPage：「不在時的潮鳴市」面板的關閉狀態存進 sessionStorage
  (`gi:hub:since-panel-dismissed:v1`)，本 tab 關過就不再跳；關 tab 重開
  才會再出現，符合「離線重新進入世界才看」的預期。
- ✅ 本機：`npm test` 全綠（server 189 / web 28）、`npm run build` 通過。
- 🚧 還沒做：commit / push / docker rebuild + live 驗證。

## v0.15.44 🚧 in progress — 2026-05-12

**主題：Hub traveller sprite 真的會動 + 區塊標籤閃 "施工中" 修正**

- ✅ Bug 1 修正：`MapScene.computeNpcTarget` 對 routed NPC 改回傳 to-center；
  新 `computeNpcSpawnPosition` 回 from-center；`tweenNpcTo` 加 optional
  `durationMs`，routed traveller 用 `NPC_ROUTED_TWEEN_MS=18000ms` 對齊
  server `NPC_CROSS_TILE_ROUTE_VISIBLE_TICKS=4` (≈20s) 的 visibility hold。
  Sprite 從起點 district 中心 spawn，tween 到目的中心。
- ✅ Bug 2 修正：`HubPage` 等 `useWorldState().source === 'server'` 才
  mount Phaser canvas。Cold load 期間顯示 "載入潮鳴市…" 預留位，避免
  fixture 8 個 tile 缺 `t_salt_marsh` 造成的 "施工中" 閃跳。
- ✅ 本機：`npm test` 全綠（server 189 / web 28）、`npm run build` 通過。
- 🚧 還沒做：commit / push / docker rebuild + 你 reload 後驗證
  「routed NPC 看得到走、districts 不再閃 "施工中"」。

## v0.15.43 🚧 in progress — 2026-05-12

**主題：civ-evo-construction Slice 3 — NPC autonomous initiation policy**

- ✅ `cityLife.ts`：新增 `decideCivEvoConstructionInitiate()` 純函式策略。
  Gating：非 salt-marsh tile、`area.resources.economy < 50`（Slice-3 對
  §11.8 infrastructure 資源的 proxy，尚未真正建模）、同 tile 無 open
  civ-evo 案、同 NPC 無 open civ-evo 案。
- ✅ `runtime.ts`：productive-build event 後叫策略，命中就 push
  `CONSTRUCTION_INITIATE` 進 commands。原 salt-marsh 進度引擎不動。
- ✅ `npcEngine.ts`：`NpcAgentTaskKind` 加 `'build'` 預留（projection
  Slice 用），權威記錄仍在 `lifeExpansion.constructionProjects[].initiatedByNpcId`。
- ✅ `cityLife.test.ts`：7 個新 Slice-3 policy 測試覆蓋每一條 gate。
- ✅ 本機：`npm test`（server 189 / web 28）、`npm run build`、
  `openspec validate civ-evo-construction --strict` 通過。
- 🚧 還沒做：Slice 4+ projection/API/frontend + generic progress/completion。
  不可把 salt-marsh legacy fixed project 包裝成 NPC 自主建造。

## v0.15.42 🚧 in progress — 2026-05-12

**主題：civ-evo-construction Slice 2 — event reducer + deterministic projectId**

- ✅ `cityLife.ts`：`ConstructionProjectRecord` 加入 `initiatedByNpcId`；
  legacy salt-marsh 預設 `''`。`hydrateLifeExpansionState` 同步更新。
- ✅ 新增 `deriveConstructionInitiateProjectId(...)`：以
  `hashCanonicalJson({ scheme, npcId, tileId, buildingId, startedAtTick,
  rulesetVersion })` 推 `project.civ-evo.<24-char hash>`，replay 確定。
- ✅ 新增 `withConstructionInitiated(state, input)`：idempotent — 同
  projectId 已存在則回原 state ref，保 EventLog 重放穩定。
- ✅ `runtime.ts`：command dispatch 加入 `CONSTRUCTION_INITIATE` 分支，
  接 `withConstructionInitiated`。
- ✅ `cityLife.test.ts`：5 個新測試覆蓋 projectId 確定性、record 內容、
  idempotency、不同 NPC + tick 產生 distinct projects、hydrate 往返。
- ✅ 本機：`npm test` 全綠（server 182 / web 28）、`npm run build` 通過、
  `openspec validate civ-evo-construction --strict` 通過。
- 🚧 還沒做：commit / push / docker rebuild；Slice 3 NPC policy 才會
  讓任何 NPC 真的去 emit 這個 command。

## v0.15.41 🚧 in progress — 2026-05-12

**主題：civ-evo-construction Slice 1 — command catalog**

- ✅ `packages/server/src/kernel/livingWorldCommands.ts` 加入 `CONSTRUCTION_INITIATE`
  type、`ConstructionInitiateCmd` payload、`VALIDATORS` 條目。
- ✅ `packages/server/src/kernel/livingWorld.test.ts` 新增 `CONSTRUCTION_INITIATE
  validator` 測試 block + 把新指令加進 catalog-accepts 測試；38 tests 全綠。
- ✅ 本機驗證：`npm test`、`npm run build:server`、`npm run build:web`、
  `openspec validate civ-evo-construction --strict` 通過。
- 🚧 還沒做：commit / push / docker rebuild；Slice 2 reducer + replay test。

## v0.15.40 ✅ shipped — 2026-05-12

**主題：Hub traveller rendering diagnostic instrumentation**

- ✅ 確認 `hubMapNpcs()` → `PhaserGame` → `MapScene.refreshNpcSprites()` →
  `computeNpcTarget()` 整條 pipeline 在 static analysis 下找不到顯然的視覺 bug，
  且 projection 測試 (`npcProjection.test.ts`) 已覆蓋 routed traveller 投影。
  下一步必須 live browser 驗證，故先 ship 診斷儀表。
- ✅ `MapScene.getHubTravellerDiagnostics()` 暴露
  `{ inputCount, routedInputCount, routedInputIds, spriteCount, spriteEntries }`
  其中 `spriteEntries` 包含每 sprite 的 `(x, y, alpha, depth, visible)`。
- ✅ `PhaserGame` 在 mount 時把上面的 getter 設成 `window.__giHubTravellerDiagnostics`，
  unmount 時清掉，方便 production browser devtools 直接呼叫。
- ✅ `MapScene.refreshNpcSprites()` 偵測到輸入有 routed traveller 就送
  `console.debug('[gi:hub-traveller]', …)` 摘要；`HubPage` 也送
  `console.debug('[gi:hub-traveller:react]', …)`，讓 React state / projection / sprite
  三層可分別檢查。
- ✅ 本機驗證：`npm test`、`npm run build:server`、`npm run build:web` 通過；
  web build 仍只有既有 Vite chunk-size warning。
- ✅ Commit `6eebc8e` pushed to `main`; CI run `25718223343` passed; Deploy Dev
  run `25718223330` passed（runner-internal smoke check 通過）。
- 🚧 還未做：live `window.__giHubTravellerDiagnostics()` 取樣後，據此補
  frontend rendering regression test。

## v0.15.40-spec ✅ shipped — 2026-05-12

**主題：propose civilization evolution + combat phase c (OpenSpec)**

- ✅ `openspec/changes/civ-evo-construction/`：ARCHITECTURE §11.8 第一個可實作
  slice。NPC 透過 `CONSTRUCTION_INITIATE` Command → Rule Engine →
  `CONSTRUCTION_INITIATED` Event 自主啟動新建築建設；不引入新 `FACT_SET`
  domain；production chain / settlement / faction 留給後續 slice。
- ✅ `openspec/changes/combat-phase-c-realtime-subtick/`：和
  `combat-phase-b-single-shot/` 平行的 Phase C delta。10 Hz sub-tick + 5-phase
  rule engine + 紋卡 priority table + tie-break + SSE `CombatProjection` +
  reconcile-on-reject。把 CombatStore 變成 EventLog 的 read-only projection，
  關掉 §11.4。
- ✅ 兩個 change 都 `openspec validate --strict` 通過；皆帶有 design.md 內的
  Open Questions block，等待回覆後才能進 `/opsx:apply`。
- ✅ Commit `da88078` pushed to `main`; CI run `25718288400` passed; Deploy Dev
  run `25718288375` passed (docs-only change, no runtime delta)。

## v0.15.39 ✅ shipped — 2026-05-12

**主題：cross-district traveller cadence**

- ✅ Root cause: legal Hub travellers were still too rare after the parent/child
  layer fix. A route-only visibility hold was insufficient because the server
  produced too few cross-district decisions.
- ✅ Cross-tile `travelRoute` state now stays visible for 4 ticks (about 20
  seconds) before the NPC resumes local area presence or proceeds to the next
  route segment.
- ✅ Added deterministic ambient errand decisions so non-low-state NPCs
  periodically choose a neighboring district through NPC policy, creating real
  routed Hub travellers instead of frontend-only duplicates.
- ✅ Preserved the `v0.15.37` parent/child rule: Hub only renders routed
  cross-district travellers, never child area outdoor NPCs.
- ✅ Local verification: focused `npcEngine`, full `npm test`,
  `npm run build:server`, and `npm run build:web` passed; web build still has
  the existing Vite chunk-size warning.
- ✅ Gemini staged review reported no findings.
- ✅ Commit `72f7b7b` pushed to `main`; CI run `25712965531` and Deploy Dev run
  `25712965526` passed.
- ✅ Live verification: `v0.15.39`, 10 consecutive `/api/npcs` samples over ticks
  `93423..93432` each had routed Hub travellers, with counts from `1` to `4`.
- 🚧 If Hub still feels underpopulated, add non-NPC aggregate district activity
  indicators; do not render child area NPCs on the parent map.

## v0.15.37 ✅ shipped — 2026-05-12

**主題：Hub parent/child NPC layer fix**

- ✅ Fixed the `v0.15.36` regression where the parent Hub map rendered child area
  outdoor NPCs.
- ✅ Hub projection now only renders NPCs that are actually crossing districts and
  have a valid `travelRoute`; local/arrived NPCs remain owned by their child area
  map, and building occupants remain owned by building maps.
- ✅ Added regression tests for traveller-only Hub projection and child-map-only
  local/arrived NPCs.
- ✅ Local verification: focused `npcProjection`, full `npm test`,
  `npm run build:server`, and `npm run build:web` passed; web build still has
  the existing Vite chunk-size warning.
- ✅ Gemini staged review reported no findings.
- ✅ Commit `456640b` pushed to `main`; CI run `25711915895` and Deploy Dev run
  `25711915891` passed.
- ✅ Live verification: `v0.15.37`, `/api/map` still includes `t_salt_marsh`, and
  current live data has 47 child-map outdoor NPCs excluded from Hub projection
  with 0 routed Hub travellers.
- 🚧 If the parent Hub feels too empty with zero travellers, add aggregate
  district activity badges or construction summaries, not child NPC sprites.

## v0.15.36 ✅ shipped — 2026-05-12

**主題：restart-safe expansion hydration**

- ✅ Fixed deploy/restart expansion flicker by hydrating selected latest
  `FACT_SET` values on boot instead of relying on an empty availability-first
  snapshot or replaying the full production EventLog.
- ✅ Added targeted latest-fact lookup for expansion, weather, active events,
  building occupants, NPC state, legacy NPC locations, and area state.
- ✅ Covered restart persistence for `world.lifeExpansion`, including unlocked
  `t_salt_marsh` and constructed `b_salt_marsh_field_station`.
- ✅ Hub map now treats the overview as a living-world layer and can show outdoor
  district NPCs rather than only cross-district travellers.
- ✅ Local verification: `npm test`, `npm run build:server`, `npm run build:web`,
  and `git diff --check` passed; web build still has the existing Vite
  chunk-size warning.
- ✅ Commit `299b574` pushed to `main`; CI run `25711337994` and Deploy Dev run
  `25711337993` passed.
- ✅ Live verification after a brief post-deploy public `502` recovered:
  `v0.15.36`, `/api/map` includes `t_salt_marsh`, `/api/world` keeps
  `lifeExpansion` at `12/12` with `t_salt_marsh` and
  `b_salt_marsh_field_station` unlocked, `/api/npcs` returns 47 map-visible
  outdoor district NPCs, and latest sampled events carry server-authored
  motivation payloads.
- 🚧 Next slice: persistent NPC inner life, including memory, expectations,
  routines, fatigue, relationships, goals, and dream/subconscious state, while
  preserving Command -> Rule Engine -> Event authority.

## v0.15.35 ✅ shipped — 2026-05-12

**主題：construction crews + Hub life projection**

- ✅ Kept locked expansion sites visible as construction zones and added
  deterministic construction crew/progress overlays on the Hub map.
- ✅ Added `constructionActivitiesFor()` to project worker count, crew positions,
  and progress text from server facts into frontend map activity.
- ✅ Fixed Hub NPC projection regressions so salt-marsh travellers and arrived
  outdoor NPCs are not hidden by transit-only filtering.
- ✅ Added Hub walkability/spawn helpers so locked expansion districts stay
  non-enterable while still allowing construction visuals.
- ✅ Local verification: `npm test`, `npm run build:server`, `npm run build:web`,
  and `git diff --check` passed; web build still has the existing Vite
  chunk-size warning.
- ✅ Commit `b697fb4` pushed to `main`; CI run `25710687572` and Deploy Dev run
  `25710687605` passed.
- ✅ Live verification: `v0.15.35`, `/healthz` returned `tick=92574`.
- 🚧 Restart hydration flicker found during live validation was fixed in
  `v0.15.36`.

## v0.15.34 ✅ shipped — 2026-05-12

**主題：server event motivation payloads**

- ✅ Added generic `EventMotivation` payload support for living-world commands and
  Rule Engine validation for malformed optional motivation data.
- ✅ New common runtime events now carry deterministic server-authored
  `payload.data.motivation` when context is available, covering NPC
  movement/activity, productive actions, interactions, area pressure,
  weather/season, rare windows, world events, building enter/leave, life goals,
  households, and children.
- ✅ Kept `v0.15.33` Timeline fallback text for older events while letting new rows
  prefer committed server reasons.
- ✅ Local verification: `npm test`, `npm run build:server`, `npm run build:web`,
  `npx openspec validate server-event-motivation-payloads --strict`, and
  `git diff --check` passed; web build still has the existing Vite chunk-size
  warning.
- ✅ Gemini staged review coverage finding was fixed with runtime assertions for
  representative motivated event families; final review reported `No findings`.
- ✅ Commit `1bd24ec` pushed to `main`; CI run `25709754151` and Deploy Dev run
  `25709754147` passed.
- ✅ Live verification: `v0.15.34`, `/api/events?limit=100` sampled 86 committed
  motivation payloads, including `WORLD_EVENT_SPAWN`, `WEATHER_CHANGE`,
  `NPC_INTERACT`, and `NPC_PRODUCTIVE_ACTION`.

## v0.15.33 ✅ shipped — 2026-05-12

**主題：event motivation chronicle**

- ✅ Timeline now shows `事件動機` for public event rows so players can see why an
  event happened, not only what happened.
- ✅ Added explicit deterministic construction motivation payloads for construction
  progress, map unlocks, and building unlocks, tied to NPC life goals/needs and
  project purpose.
- ✅ Added deterministic fallback motivations for current and older event payloads:
  productive actions, NPC interactions, area pressure, life goals, households,
  children, movement/activity, building enter/leave, weather/season, world events,
  rare windows, player interventions, and card events.
- ✅ Raw payload remains available behind the disclosure for debugging.
- ✅ Local verification: `npm test`, `npm run build:server`, `npm run build:web`,
  `npx openspec validate event-motivation-chronicle --strict`, and
  `git diff --check` passed; web build still has the existing Vite chunk-size
  warning.
- ✅ Commit `21113bf` pushed to `main`; CI run `25707720719` and Deploy Dev run
  `25707720708` passed.
- ✅ Live verification: `v0.15.33`, current event window includes motivated event
  families (`AREA_PRESSURE`, `NPC_INTERACT`, `NPC_PRODUCTIVE_ACTION`), and the
  deployed web asset contains `事件動機` plus deterministic motivation fallbacks.
- 🚧 Future depth: move more non-construction motivations into authoritative server
  payloads as richer planning state is added per event domain.

## v0.15.32 ✅ shipped — 2026-05-12

**主題：NPC life goals + expansion foundation**

- ✅ Added deterministic NPC needs and life-goal projections on `/api/npcs`, keeping
  AI as read-only renderer/narrator rather than simulation authority.
- ✅ Added authoritative life/household/child/construction commands and events:
  `NPC_LIFE_GOAL_SET`, `NPC_HOUSEHOLD_FORMED`, `NPC_CHILD_BORN`,
  `CONSTRUCTION_PROJECT_PROGRESS`, `MAP_TILE_UNLOCKED`, and
  `BUILDING_CONSTRUCTED`.
- ✅ Productive NPC actions in build/service/trade/learn domains now advance the
  salt-marsh settlement project and can unlock `t_salt_marsh` plus
  `b_salt_marsh_field_station` through Rule Engine events and replayable facts.
- ✅ Hub navigation and building APIs now honor server-authoritative unlocked map
  and building projections; locked expansion districts are not enterable.
- ✅ Since Last Visit and NPC dialog UI surface life goals, household changes,
  construction progress, and expansion unlocks, with new NPC life labels routed
  through i18n.
- ✅ Local verification: `npm test`, `npm run build:server`, `npm run build:web`,
  `npx openspec validate npc-life-goals-and-expansion --strict`, and
  `git diff --check` passed; web build still has the existing Vite chunk-size
  warning.
- ✅ Gemini staged review findings for multi-household formation and expansion
  building detail lookup were fixed and covered by integration tests.
- ✅ Commit `bd8a3ae` pushed to `main`; CI run `25706302025` and Deploy Dev run
  `25706302028` passed.
- ✅ Live verification: `v0.15.32`, `/api/npcs` includes `life`, `/api/events`
  observed construction/unlock/building events plus the next tick-gated life goal
  and household events, `/api/map` includes `t_salt_marsh`, and direct
  `/api/buildings/b_salt_marsh_field_station` returns `200` with `occupants=[]`.
- 🚧 Optional follow-up: wait for or accelerate a live `NPC_CHILD_BORN` event if
  production evidence for the 90-tick child delay is needed beyond local tests.

## v0.15.31 ✅ shipped — 2026-05-11

**主題：productive city actions**

- ✅ Added deterministic `NPC_PRODUCTIVE_ACTION` events for construction/repair,
  learning/research, trade/supply, and public-service progress.
- ✅ Productive actions now flow through NPC policy → command → rule engine →
  EventLog → memory/catch-up/UI projections, preserving AI-as-read-only-renderer.
- ✅ Rebalanced public event cadence so social arguments are less dominant:
  lower interaction probability, longer social cooldown, and per-tick caps for
  social/productive events.
- ✅ Since Last Visit now surfaces `城市進展` rows from catch-up summaries.
- ✅ Local verification: `npm test`, `npm run build:server`, `npm run build:web`,
  `npx openspec validate npc-humanity-ai-memory --strict`, and `git diff --check`
  passed; web build still has the existing Vite chunk-size warning.
- ✅ Gemini staged review findings for deterministic ordering and NPC memory
  projection tests were fixed; remaining notes were intentional balance/localized
  text tradeoffs.
- ✅ Commit `589ca77` pushed to `main`; CI run `25679493406` and Deploy Dev run
  `25679493433` passed.
- ✅ Live verification: `v0.15.31`, `/api/events?limit=80` included 12
  `NPC_PRODUCTIVE_ACTION` rows versus 3 `NPC_INTERACT` rows, the 100-event window
  included `build`, `learn`, `trade`, and `service`, and catch-up returned
  `summary.productiveActions` in `25ms`.
- 🚧 Optional follow-up: add exhaustive snapshot coverage for every productive
  narration branch if future copy churn becomes risky.

## v0.15.30 ✅ shipped — 2026-05-11

**主題：bounded catch-up availability fix**

- ✅ Root cause: returning-player living-world catch-up paths could synchronously
  scan/sort the large production EventLog, blocking the Node event loop and making
  unrelated `/api/*` requests look offline to mobile clients.
- ✅ `/api/world/catch-up` and authenticated `/api/world/since-last-visit` now use
  a bounded tick-window read instead of full EventLog hydration.
- ✅ EventLog latest boot metadata now avoids `MAX(tick)` scans, and catch-up reads
  use a composite `(event_type, tick, sequence)` index with a bounded fallback for
  large event-type sets.
- ✅ Regression coverage added for bounded tick-window reads and chronological
  ordering across interleaved event types.
- ✅ Local verification: `npm run build:server`, `npm run build:web`, `npm test`,
  `npx openspec validate npc-humanity-ai-memory --strict`, and `git diff --check`
  passed; web build still has the existing Vite chunk-size warning.
- ✅ Gemini staged review returned `No findings` after the bounded fallback and
  interleaved ordering coverage were added.
- ✅ Commits `a18c9cf` and `7c4a542` pushed to `main`; CI run `25674841411` and
  Deploy Dev run `25674841366` passed.
- ✅ Live verification: `v0.15.30`, normal API endpoints returned in `9–123ms`,
  worst-case `/api/world/catch-up?sinceTick=0` returned in `2403ms`, and a
  concurrent `/healthz` during catch-up still completed in `2365ms`, under the
  5-second client timeout.
- 🚧 Optional follow-up: lower `CATCH_UP_EVENT_LIMIT` or add a background summary
  projection if returning-player summaries need sub-second behavior.

## v0.15.29 ✅ shipped — 2026-05-11

**主題：NPC layer uniqueness + chronicle cleanup**

- ✅ Fix Hub projection so parent map no longer renders every area-local NPC.
- ✅ Preserve unique NPC rendering by layer: Hub only shows cross-district
  travellers with `travelRoute`; Area maps show local outdoor NPCs; Building maps
  show building occupants.
- ✅ Timeline/desktop/mobile event tickers now hide internal `WORLD_TICK` and
  no-narration rows instead of presenting them as public story.
- ✅ Timeline chronicle summary now requests AI rendering when available instead
  of forcing deterministic fallback.
- ✅ Focused verification: `npm run test -w @greed-island/web -- npcProjection
  eventVisibility` and `npm run build:web` passed; web build still has the
  existing Vite chunk-size warning.
- ✅ Full verification: `npm run build:server`, `npm run build:web`, `npm test`,
  `npx openspec validate npc-humanity-ai-memory --strict`, and `git diff --check`
  passed; Gemini staged review returned `No findings`.
- ✅ Commit `2559b24` pushed to `main`; CI run `25672281805` and Deploy Dev run
  `25672281818` passed.
- ✅ Live verification: `v0.15.29`, `/api/npcs` returns 50 rows, Hub traveller
  markers expected from live data is 0 because no NPC is currently crossing
  districts, Nighttide has 14 local outdoor NPCs for the area layer, public event
  head is narrated `AREA_PRESSURE` rather than `WORLD_TICK`, and chronicle summary
  returned `source=ai` with `activeKeys=40` and no fallback reason.
- 🚧 If Hub feels too empty when no one is travelling, add aggregate district
  activity badges instead of rendering individual area NPCs on Hub.

## v0.15.28 ✅ shipped — 2026-05-11

**主題：NPC intent text + local motion cadence**

- ✅ Expose deterministic `intentLine` text for current runtime-agent tasks so the
  UI can show what each NPC is doing without AI mutating world state.
- ✅ Thread `intentLine` through `/api/npcs`, frontend state, Area/Building NPC
  lists, and `NpcDialog` headers.
- ✅ Keep Hub intent projection locale-aware so English clients receive English
  task text.
- ✅ Add explicit English district names for server-side intent lines.
- ✅ Increase server-driven local waypoint refresh cadence from 12 ticks to 6
  ticks to make outdoor NPC motion visibly update about every 30 seconds.
- ✅ Local verification: `npm run build:server`, `npm run build:web`, `npm test`,
  `npx openspec validate npc-humanity-ai-memory --strict`, and `git diff --check`
  passed; web build still has the existing Vite chunk-size warning.
- ✅ Gemini staged review returned `No findings` after locale fixes.
- ✅ Commit `6e73281` pushed to `main`; CI run `25668501760` and Deploy Dev run
  `25668501814` passed.
- ✅ Live verification after runtime ticks settled: `v0.15.28`, `/api/npcs` returns
  50 rows, all 50 have agent state and intent lines, English intent text has zero
  CJK district-name leakage, and 49 NPCs changed position/activity keys over a
  35-second probe.
- 🚧 Next slice: make social/interaction bubbles more visible on the map, or add a
  compact intent overlay for selected NPC sprites.

## v0.15.27 ✅ shipped — 2026-05-11

**主題：NPC daily-life activity pass**

- ✅ Root cause: live `v0.15.26` NPC data was complete and agent-backed, but many
  routine labels fell through the deterministic label interpreter and became
  `idle`, producing an idle-heavy world.
- ✅ Expanded routine-label interpretation so ordinary daily-life phrases map to
  visible `work`, `trade`, `patrol`, and `eat` activities.
- ✅ Injected off-duty errands now use role/archetype-shaped activities instead of
  becoming generic idle slots.
- ✅ Added focused `NpcEngine` coverage for label interpretation and errand
  activity shaping across common archetypes.
- ✅ Local verification: `npm run build:web`, `npm run build:server`, `npm test`,
  `npx openspec validate npc-humanity-ai-memory --strict`, and `git diff --check`
  passed; web build still has the existing Vite chunk-size warning.
- ✅ Gemini staged review returned `No findings` after archetype coverage and
  named label patterns were added.
- ✅ Commit `d0c8fe7` pushed to `main`; CI run `25667528150` and Deploy Dev run
  `25667528128` passed.
- ✅ Live verification after runtime ticks settled: `v0.15.27`, `/api/npcs` returns
  50 rows, all 50 have agent state, bootstrap tasks are gone, and activity
  distribution improved to `work=30`, `trade=10`, `patrol=5`, `idle=5`.
- 🚧 Next slice: increase visible movement frequency and expose short task/intent
  text in the UI.

## v0.15.26 ✅ shipped — 2026-05-11

**主題：Hub NPC overview visibility recovery**

- ✅ Root cause: live `/api/npcs` returns all `50` NPCs, but no NPC currently has
  `activity='move'`; Hub projection only rendered moving NPCs, making the main map
  look empty despite valid district presence.
- ✅ Hub world overview now renders all outdoor district NPCs and preserves
  travel-route rendering for actual moving NPCs.
- ✅ Building occupants remain excluded from Hub map and rendered by BuildingPage.
- ✅ Local verification: `npm run build:web`, `npm run build:server`, `npm test`,
  and `git diff --check` passed; web build still has the existing Vite chunk-size
  warning.
- ✅ Gemini staged review returned `No findings`.
- ✅ Commit `4f2d007` pushed to `main`; CI run `25666839843` and Deploy Dev run
  `25666843244` passed.
- ✅ Live verification: `v0.15.26`, `/api/world npcCount=50`, `/api/npcs` returns
  50 rows, and Hub projection yields 49 outdoor district NPC markers plus 1 moving
  marker from current live data.
- 🚧 Await user-side iPhone confirmation that Hub NPC density now looks reasonable.

## v0.15.25 ✅ shipped — 2026-05-11

**主題：mobile fixture-state recovery hardening**

- ✅ Root cause evidence: iPhone loaded fresh `v0.15.24` HTML/assets and
  `/api/version`, but the same access-log window had no `/api/world` request, so
  the visible fixture state could persist even while the live API was healthy.
- ✅ `WorldStateContext` now exposes an imperative `refreshWorld()` path that
  accepts any successful authoritative `/api/world` snapshot.
- ✅ `AtmosphereBar` now treats `source === 'fixture'` as a degraded visible state
  and retries `refreshWorld()` every two seconds until server world data lands.
- ✅ Added focused unit coverage for the visible fixture recovery retry helper.
- ✅ Local verification: `npm run build:web`, `npm run build:server`, `npm test`,
  and `git diff --check` passed; web build still has the existing Vite chunk-size
  warning.
- ✅ Gemini staged review returned `No findings` after focused retry tests were
  added.
- ✅ Commit `d2d17b3` pushed to `main`; CI run `25666346557` and Deploy Dev run
  `25666346537` passed.
- ✅ Live verification: `/healthz` and `/api/version` report `0.15.25`,
  `/api/world` returns live world data with `Cache-Control: no-store` and no API
  compression.
- 🚧 Await user-side iPhone reload confirmation that the fixture badge disappears.

## v0.15.24 🚧 in progress — 2026-05-11

**主題：Docker local recovery + visible version bump**

- ✅ Version bumped to `0.15.24` after the Hub HUD/dialog-hold batch so local UI
  and API can distinguish the latest build from `0.15.23`.
- ✅ Docker local stack now builds with the legacy Docker builder path because
  BuildKit still fails on this workstation when pulling `docker/dockerfile:1.7`
  from Docker Hub due to TLS trust (`x509: certificate signed by unknown
  authority`).
- ✅ Dockerfiles pin builder npm to `10.9.2` and disable npm strict SSL inside the
  build stage to work around the local TLS interception / Node 22 npm failure.
- ✅ Docker compose is up: `greed-island-server` running, `greed-island-web`
  healthy, `http://127.0.0.1:8100/api/version` returns `0.15.24`.

## v0.15.23 🚧 in progress — 2026-05-11

**主題：presence/read-only/chronicle local visibility fixes**

- ✅ Root cause：`AreaScene.refreshPeerSprites()` 對既有 peer player 直接
  `setPosition()`，因此 nearby-player refresh 一到就瞬移。
- ✅ 修正 peer player rendering：既有 peer container 從目前畫面座標 tween 到
  最新 server presence target；新增/消失玩家仍直接 spawn/destroy。
- ✅ 保持 rendering 非 simulation authority：presence `x/y/z` 仍只是 server
  state 的 UI projection input，前端 tween 不回寫世界狀態。
- ✅ Guest read-only mode：server mutation routes already required auth, but Hub /
  Area / Building Phaser scenes now also disable movement and interaction input
  while logged out, with visible read-only notices.
- ✅ Chronicle fallback / Timeline：`WORLD_TICK` internal noise no longer appears
  in deterministic fallback summaries; `/timeline` shows the grounded chronicle
  card backed by `/api/world/chronicle`.
- ✅ Hub main-map presence：local player name now renders on the main map; logged-in
  Hub players post/poll social presence using `tileId='hub'` and render nearby
  player names/positions in `MapScene`.
- ✅ Presence separation：Hub social/UI presence is stored in
  `player_hub_locations`, so it does not overwrite area-bound
  `player_locations` used by combat/shop location checks.
- ✅ Hub coordinate contract：social presence keeps `hub` coordinates across the
  full 800x600 main-map canvas while preserving the existing 600x400 area canvas
  contract for normal districts.
- ✅ NPC deterministic agent slice：每個 NPC 現在有 server-side `agent` projection
  (`profileId`、permissions、activeTask、lastDecision)，由 schedule / nudge /
  movement / social interaction deterministic 推導，並透過 `internalState.agent`
  暴露給讀取端；AI 仍不能決策或改 state。`social-interaction` task 只在
  `NPC_INTERACT` 通過 Rule Engine 後 commit，且會保留到 deterministic expiry。
- ✅ Hub visual smoothing：Hub main-map peer player refresh now tweens existing
  player containers instead of snapping; Hub peer/NPC spawn and disappearance use
  fade transitions so travel-route NPCs no longer hard flash in/out.
- ✅ Hub HUD：城市標題列移到地圖外上方，避免左上角說明遮住主地圖/NPC。
- ✅ Player dialog hold：authenticated dialog open now posts a bounded
  `NPC_DIALOG_HOLD` living-world command, then commits a bounded
  `player-dialog` NPC agent task and refreshes it while the dialog stays open;
  schedule movement cannot move that NPC until the deterministic hold expires or
  is refreshed, and the hold is persisted through FACT_SET state.
- ✅ 本機驗證：`npm run build:web`、`npm run build:server`、`npm run build`、
  `npm test`、`npx openspec validate npc-humanity-ai-memory --strict`、
  `git diff --check` 通過；web build 仍只有既有 Vite chunk-size warning，
  `git diff --check` 只有 Windows LF→CRLF working-copy warnings。
- ✅ Local runtime verification：`/api/version`、`/healthz` 回 `0.15.23`；
  `/api/npcs` exposes `internalState.agent`；`POST /api/npc/:id/dialog-hold`
  makes the NPC active task `player-dialog`；Vite web root responds `200`。
- 🚧 待完成：reviewer pass、browser/Phaser two-player visual E2E、追 social
  notification 即時更新。

## v0.15.22 ✅ shipped — 2026-05-11

**主題：always accept successful authoritative world snapshots**

- ✅ v0.15.21 後確認 iPhone `/api/world` 已經 `200`、uncompressed、no-store，但 UI 仍停在 fixture。
- ✅ 修正 `WorldStateContext`：任何成功 `/api/world` 都必須覆蓋 fixture，不再被 overlapping mobile refresh generation guard 丟棄。
- ✅ 本機驗證：`npm run build:web`、`npm run build:server`、`npm test`、Caddyfile validate、`git diff --check` 通過。
- ✅ Commit `20f08b5` pushed to `main`; CI run `25645997945` passed; Deploy Dev run `25645997952` passed。
- ✅ Live verification: `/healthz` and `/api/version` return `0.15.22`; `/api/world` returns live data; user iPhone reload confirmed fixture/demo label disappeared。

## v0.15.21 ✅ shipped — 2026-05-11

**主題：disable API compression for mobile Safari world fetch**

- ✅ 從 iPhone live proxy logs 確認 fresh `v0.15.20` HTML/JS 與 `/api/version` 成功，但同一輪沒有完成可見的 `/api/world`。
- ✅ Root-cause candidate：internal Caddy global `encode zstd gzip` 讓 `/api/*` JSON 也被 zstd 壓縮；iPhone Safari 宣稱接受 zstd，但 world-state fetch 疑似卡在 response completion/decoding。
- ✅ `/api/*` 保持 `Cache-Control: no-store`，但不再經 internal Caddy compression；zstd/gzip 只保留在 static HTML/assets handlers。
- ✅ 本機驗證、Gemini review、CI run `25645742538`、Deploy Dev run `25645742547` 通過。
- ✅ Live verification: `/api/world` became uncompressed and returned `200`; remaining fixture issue was frontend state acceptance, fixed in v0.15.22。

## v0.15.20 ✅ shipped — 2026-05-11

**主題：recover mobile world UI after deploy-time API 502**

- ✅ 從最新 live proxy logs 確認 iPhone 已載入 v0.15.19 bundle，且 `/api/*` request 已帶 no-store，但 reload 打到 server restart gap，`/api/world` 與 `/api/cards` 回 `502`。
- ✅ 新增 fixture-only recovery retry：只要尚未拿到 authoritative server world，就在 failed refresh 後短間隔重試；成功拿到 `/api/world` 或 SSE snapshot 後取消 retry。
- ✅ 新增 unit tests 覆蓋 fixture-only retry、server data arrived no-retry、pending retry dedupe/cancel。
- ✅ 本機驗證：focused web state tests、`npm run build:web`、`npm run build:server`、`npm test`、`git diff --check` 通過。
- ✅ Gemini staged review noted missing mounted React-provider integration coverage; accepted for this hotfix because the extracted scheduler is unit-tested and the repo does not currently have a React provider test harness。
- ✅ Commit `9bae7a2` pushed to `main`; CI run `25645138546` passed; Deploy Dev run `25645138560` passed。
- ✅ Live verification: `/healthz` and `/api/version` return `0.15.20`; tick advanced from `74479` to `74481`; `/api/world` returns `Cache-Control: no-store` and live server data with `eventCount=1269017`, `npcCount=50`。

## v0.15.19 ✅ shipped — 2026-05-11

**主題：disable dynamic API conditional caching on mobile Safari**

- ✅ 從 live web proxy logs 確認 iPhone 已載入新 bundle，但動態 JSON API 仍帶 `If-None-Match`，部分 endpoint 回 `304` 空 body。
- ✅ 前端 `jsonFetch` 對 `/api/*` 設 `cache: 'no-store'` 與 `Cache-Control: no-store`，避免 Safari 對動態 JSON 做 conditional cache。
- ✅ Internal Caddy `/api/*` response 加 `Cache-Control: no-store`。
- ✅ 本機驗證：`npm run build:web`、`npm run build:server`、`npm test`、Caddyfile validate、`git diff --check` 通過。
- ✅ Commit `194385f` pushed to `main`; CI run `25644893980` passed; Deploy Dev run `25644893975` passed。
- ✅ Live verification: `/healthz` returns `version: 0.15.19`; tick advanced from `74372` to `74374`; `/api/world` returns `Cache-Control: no-store` and live server data with `eventCount=1266257`, `npcCount=50`。

## v0.15.18 ✅ shipped — 2026-05-11

**主題：mobile stale-client and weak-network refresh fix**

- ✅ 修正 web bundled `APP_VERSION` 長期停在 `0.15.6`，避免手機 `/api/version` 短暫失敗時顯示舊版本。
- ✅ Internal Caddy 對 `/` 與 `/index.html` 加 `Cache-Control: no-store`，hashed `/assets/*` 保持 immutable cache。
- ✅ WorldState 初始載入新增 timeout + retry/backoff，並在手機回前景、pageshow、online 時主動 refresh，降低弱網直接掉到「示意資料」的機率。
- ✅ 新增 `resilientLoad` unit tests，覆蓋 retry success、retry exhaustion 與 timeout。
- ✅ 新增 mobile refresh trigger unit tests，覆蓋 online、pageshow、visibilitychange 與 cleanup。
- ✅ 新增 refresh generation guard test，避免舊 refresh 慢回來覆蓋較新的 world state。
- ✅ 本機驗證：`npm run build:web`、`npm run build:server`、`npm test`、Caddyfile validate、`git diff --check` 通過。
- ✅ Commit `017f563` pushed to `main`; CI run `25643825872` passed; Deploy Dev run `25643825850` passed。
- ✅ Live verification: `https://hunter.sisihome.org/healthz` returns `version: 0.15.18`; tick advanced from `73900` to `73902`; `/` returns `Cache-Control: no-store`; current hashed JS asset returns immutable cache; `/api/world` returns live server data.

## v0.15.17 ✅ shipped — 2026-05-11

**主題：chronicle AI key-pool robustness metadata**

- ✅ `/api/world/chronicle?ai=1` 的 AI rendering 現在有 chronicle 層級 timeout、transient retry/backoff、JSON MIME structured output 與 `thinkingBudget=0`。
- ✅ 回應新增 `chronicle.aiMeta`，可觀測 requested、active key count、timeout、max attempts、response MIME、每次 attempt 成敗與 fallback reason。
- ✅ AI 仍是 read-only narrator：AI timeout、retry exhaustion、或 ungrounded citation 都只降級 deterministic fallback，不會改 EventLog 或 world projection。
- ✅ OpenSpec `3.3` completed：key-pool robustness metadata 已接上 chronicle rendering。
- ✅ 本機驗證：`npm run build:server`、`npm run build:web`、`npm test`、`git diff --check`、OpenSpec strict validate 通過；Gemini staged reviewer `No findings`。
- ✅ Commit `3f62645` pushed to `main`; CI run `25635003178` passed; Deploy Dev run `25635003187` passed。
- ✅ Live verification: `https://hunter.sisihome.org/healthz` returns `version: 0.15.17`; tick advanced from `68948` to `68949`; fallback and AI chronicle endpoints both expose `aiMeta` with 41 active keys, and `?ai=1` succeeded on one attempt.

## v0.15.16 ✅ shipped — 2026-05-11

**主題：grounded chronicle rendering from events + memory**

- ✅ 新增 `/api/world/chronicle` read-only endpoint，從 recent committed events 與 `npc_memory` snippets 組 grounded chronicle context。
- ✅ 預設 deterministic fallback；`?ai=1` 可走 Gemini JSON rendering，但 AI 不寫 Event、不改 state、不創造 world facts。
- ✅ AI cited names 必須落在 grounded allow-list；allow-list 由 actor ids、NPC 顯示名、memory references 組成，不合格輸出自動 fallback。
- ✅ chronicle context 排除 internal `FACT_SET` state-write noise，只保留 living-world command events。
- ✅ OpenSpec `3.2` completed：AI chronicle rendering 已接上 committed events + memory snippets。
- ✅ 本機驗證：`npm run build:server`、`npm run build:web`、`npm test`、`git diff --check`、OpenSpec strict validate 通過；Gemini staged reviewer `No findings`。
- ✅ Commits `56b0dcf` and `138bd27` pushed to `main`; CI runs `25633472890` / `25633662802` passed; Deploy Dev runs `25633472898` / `25633662804` passed。
- ✅ Live verification: `https://hunter.sisihome.org/healthz` returns `version: 0.15.16`; tick advanced from `68184` to `68186`; `/api/world/chronicle?limit=10` returns grounded fallback text without `FACT_SET` noise.

## v0.15.15 ✅ shipped — 2026-05-10

**主題：NPC memory foundation for player interactions**

- ✅ `PLAYER_INTERVENE` 事件會投影成兩位受影響 NPC 的 `npc_memory` interaction rows。
- ✅ 私人 `/api/npc/:npcId/interact` 對話在寫入 `personal_events` 後，也會同步寫入該 NPC 的 memory projection。
- ✅ 記憶寫入 idempotent；同內容同 tick 不重複，同內容不同 tick 仍保留為不同記憶。
- ✅ OpenSpec `3.1` completed：player↔NPC 與 NPC↔NPC interaction facts 已可作為後續 memory-grounded behavior 基礎。
- ✅ 本機驗證：`npm run build:server`、`npm run build:web`、`npm test`、`git diff --check`、OpenSpec strict validate 通過；Gemini staged reviewer `No findings`。
- ✅ Commit `295f884` pushed to `main`; CI run `25632968113` passed; Deploy Dev run `25632968110` passed。
- ✅ Live verification: `https://hunter.sisihome.org/healthz` returns `version: 0.15.15`; tick advanced from `67832` to `67834` over 10 seconds; server logs show clean boot at tick `67826`.

## v0.15.14 ✅ shipped — 2026-05-10

**主題：NPC duty-weighted free exploration slice**

- ✅ 移除 permanent role-lock：祭司、商人、工匠、守衛、公務 NPC 不再因角色身份被永久壓回 `defaultLocation`。
- ✅ 職責改為強權重：明確跨區 routine 會被尊重；all-same duty routine 只注入短 off-duty errand；wanderer archetype 保留較長 travel window。
- ✅ 新增 regression tests：shopkeeper 可短暫離開、priest 明確跨區 routine 不被覆寫、已有跨區 guard routine 不會被額外注入 errand。
- ✅ 本機驗證：`npm run build:server`、`npm run build:web`、`npm test`、`git diff --check`、OpenSpec strict validate 通過；Gemini staged reviewer `No findings`。
- ✅ Commit `5f60ffd` pushed to `main`; CI run `25632524896` passed; Deploy Dev run `25632524892` passed。
- ✅ Live verification: `https://hunter.sisihome.org/healthz` returns `version: 0.15.14`; tick advanced from `67605` to `67607` over 10 seconds; server logs show clean boot at tick `67603`.

## v0.15.13 ✅ shipped — 2026-05-10

**主題：production tick recovery after availability-first boot**

- ✅ `readLatestFactSnapshot()` 會回傳 event log 最新 committed tick，空表或 null tick event log 則安全回 `0`。
- ✅ Runtime 在大型 production event log 跳過 full hydrate 時，若沒有 `FACT_TICK` fact，會從 latest event-log tick 恢復 `currentTick`。
- ✅ 修復 deterministic tick event id 重複，避免 boot from defaults 後每 tick 都撞 `event_log.event_id` unique constraint。
- ✅ 新增 regression tests：latest tick discovery、empty event log、null tick event log。
- ✅ 本機驗證：`npm run build:server`、`npm run build:web`、`npm test`、`git diff --check` 通過；Gemini staged reviewer `No findings`。
- ✅ Commit `d6b67f1` pushed to `main`; CI run `25631972227` passed; Deploy Dev run `25631972239` passed。
- ✅ Live verification: `https://hunter.sisihome.org/healthz` returns `version: 0.15.13`; tick advanced from `67308` to `67310` over 10 seconds; server logs no longer show continuing `SQLITE_CONSTRAINT_UNIQUE` tick failures.

## v0.15.12 ✅ shipped — 2026-05-10

**主題：NPC worldline route slice**

- ✅ NPC state 新增 `travelRoute`，跨區移動時公開 from/to/target/start tick。
- ✅ Hub 只渲染 travel route 上的 NPC，並用 route segment 位置表達「在路上」。
- ✅ Area/outdoor projection 排除 `activity === 'move'`，避免同一 NPC 同時出現在 Hub 與 sub 場景。
- ✅ 新增 regression tests：移動 NPC 有 route、抵達後 route 清空、traveling NPC 不算 outdoor occupant；前端 projection 也覆蓋 Hub/Area 去重。
- ✅ 本機驗證：`npm run build:server`、`npm run build:web`、`npm test`、`git diff --check`、OpenSpec strict validate 通過。
- ✅ Commit `ba9ca97` pushed to `main`; CI run `25631740981` passed; Deploy Dev run `25631740983` passed。
- ✅ Live verification: `https://hunter.sisihome.org/healthz` returns `version: 0.15.12`.

## v0.15.11 ✅ shipped — 2026-05-10

**主題：NPC humanity slice 1 — unique presence authority**

- ✅ 新增 OpenSpec change `npc-humanity-ai-memory`：規劃 NPC 唯一 presence、duty-weighted 自由探索、記憶與 AI grounded chronicle。
- ✅ 將舊的 role-lock durable rule 改為「職責是移動權重，不是永久鎖」。
- ✅ Building occupants 改由當前 NPC presence 推導，避免室內/室外 projection 漂移。
- ✅ BuildingPage 以 `/api/npcs` 的 `buildingId` 作為 server 模式室內 NPC 主要來源，避免 stale building detail 造成同名 NPC 分身。
- ✅ HubPage 主地圖改顯示所有地表 NPC，不再只顯示 `activity === 'move'` 的 NPC；室內 NPC 仍只在建築內顯示避免分身。
- ✅ 新增 regression test：建築內 NPC 不會出現在戶外 NPC list。
- ✅ 本機驗證：`npm run build:server`、`npm run build:web`、`npm run test -w @greed-island/server`（18 files / 110 tests）、`git diff --check` 通過。
- ✅ Commit `0038ee8` pushed to `main`; CI run `25631221366` passed; Deploy Dev run `25631221360` passed。
- ✅ Live verification: `https://hunter.sisihome.org/healthz` returns `version: 0.15.11`.

## v0.15.10 ✅ shipped — 2026-05-10

**主題：NPC projection SSE tick refresh + availability-first boot**

- ✅ `/api/events/stream` 在每個 simulation tick 後推送新的 world `snapshot`，不再只靠 narrative event 才更新 snapshot。
- ✅ `WorldStateContext` 收到 SSE snapshot 後立即用目前 auth token refresh `/api/npcs`，讓 NPC `subCol/subRow/buildingId` projection 跟著後端 tick cadence 到前端。
- ✅ 原 3s full polling 改成 15s fallback，保留 EventSource 失效時的恢復路徑。
- ✅ 修 living-world projection boot guard：改查 projection table row count，不再用永遠不存在的 `__bootstrap_check__` NPC id 導致每次重啟都重建 projection。
- ✅ 修 production boot：大型 event log 不再開機前做 full hydrate / latest-fact window query；先用 event metadata 啟動 HTTP，避免 deploy 後 502。
- ✅ 本機驗證：`npm run build:server`、`npm run build:web`、`npm run test -w @greed-island/server`（16 files / 108 tests）通過。
- ✅ Commit `6b4dcc3`；CI run `25630222017` passed；Deploy Dev run `25630222015` passed。
- ✅ Live verification: `https://hunter.sisihome.org/healthz` returns `version: 0.15.10`.
- ⚠️ Availability-first tradeoff：大型 production event log 目前從 defaults 啟動；後續需要 indexed/latest-fact projection 來恢復非阻塞 state hydration。

## v0.15.9 ⚠️ superseded — 2026-05-10

**主題：fast boot hydration attempt**

- ✅ Commit `2780173` pushed SQLite latest-fact hydration.
- ✅ CI run `25630144184` passed; Deploy Dev run `25630144174` completed.
- ⚠️ Superseded before final live verification: public `/healthz` still returned 502 because the latest-fact query was too expensive on the production event log.

## v0.15.8 ⚠️ superseded — 2026-05-10

**主題：boot projection guard**

- ✅ Commit `766d8ed` pushed projection rebuild guard.
- ✅ CI run `25630060285` passed; Deploy Dev run `25630060283` completed.
- ⚠️ Superseded before final live verification: public `/healthz` still returned 502 because event-log hydration itself was synchronous and blocked before `runtime.start()`.

## v0.15.7 ⚠️ superseded — 2026-05-10

**主題：NPC projection SSE tick refresh**

- ✅ Commit `7e44bba` pushed SSE tick snapshot + `/npcs` refresh.
- ✅ CI run `25629908802` passed; Deploy Dev run `25629908799` completed.
- ⚠️ Superseded before final live verification: public `/healthz` returned 502 because server boot was still rebuilding projections before listening on port 3000.

## v0.15.6 ✅ shipped — 2026-05-10

**主題：資源/時間可見性 + 工作規則 + NPC 反幻覺補強 + 開發憲法**

- ✅ AreaPage 靠近可進入建築時不再因 CTA 插入/移除造成 layout 抖動；進入按鈕保留固定 action slot。
- ✅ AtmosphereBar 顯示目前世界時間（由 simulation tick 派生）。
- ✅ 登入玩家頂部顯示潮幣、體力、術式持有數。
- ✅ 後端限制玩家同時間只能有一份工作；重複應徵回 `ALREADY_HIRED`。
- ✅ BuildingPage 在玩家已有工作時顯示 `已有工作`，不再讓 UI 看起來可以狂應徵。
- ✅ NPC dialog prompt 加 known NPC names grounding；未知稱呼不可被 AI 當成世界事實。
- ✅ Server-side sanitizer 擋掉「哪個 X / 有幾個 X」這類未知稱呼幻覺回覆。
- ✅ `DEVELOPMENT_CONSTITUTION.md` 建立 AI 接手必讀的開發憲法；`PROGRESS.md` 建立手續進度紀錄。
- ✅ `ARCHITECTURE.md` 新增 Civilization Evolution Rule，並列出文明演化與 NPC 私人對話 grounding 尚未完成的 backlog。
- ✅ 本機驗證：`npm run build:web`、`npm run build:server`、`npm run test -w @greed-island/server`（16 files / 108 tests）、`git diff --check` 通過。
- ✅ Commit `2ff81ad` shipped v0.15.6 continuity fixes.
- ✅ Deploy pipeline restored in commit `eeaebf5`: GitHub Actions builds/pushes Docker Hub images, then deploys on kevinhome via self-hosted runner `DESK-KEVINHOME-greed-island-2`.
- ✅ Live verification: `https://hunter.sisihome.org/healthz` returns `version: 0.15.6`.

## v0.15.5 ✅ shipped — 2026-05-08

**主題：Deterministic Card Drops + renderer-only 地圖生命感**

- ✅ `CardDropEngine` 移除 `Math.random()`，spawn chance、rank/entry selection、coordinates 改 deterministic hash rolls。
- ✅ Seed drops 與 normal tick drops 都有 replay tests。
- ✅ 新增 OpenSpec change：`openspec/changes/deterministic-card-drops/`。
- ✅ `ARCHITECTURE.md` 標記 card-drop randomness addressed，但保留 `card_action_log` 尚未併入 canonical `event_log` 的 non-conformance。
- ✅ MapScene 加 renderer-only environment/NPC idle animation，不改 server authority。
- ✅ Commit `eea3414`；CI run `25538968116` passed；Deploy Dev Docker build/push passed but desktop SSH failed。

## v0.15.4 ✅ shipped — 2026-05-08

**主題：地圖 UI 修整 + NPC 記憶/身份 + 三維位置一致性**

- ✅ **城市與區域 UI 修整**
  - HubPage「進入 X」CTA 移出 Phaser canvas，避免遮住 NPC / 碼頭區
  - `t_dock` 可見名稱統一為「碼頭區」
  - AreaPage tab 列移到內容面板上方，切換資訊不再每次捲過 panel
- ✅ **NPC 對話記憶與玩家身份**
  - `personal_events.player_message` 持久化玩家當時說的內容
  - NPC AI dialog prompt 帶玩家 `displayName/accountId/email` 與雙向歷史
  - 「我是誰 / 你是誰」走 deterministic identity reply，AI 不參與世界事實判定
- ✅ **世界資料載入與 Phaser 後載入穩定化**
  - `WorldStateContext.refreshAll()` 改分段 `Promise.allSettled` 套用，避免單一 API 慢/失敗拖住 NPC/map
  - Phaser scene 尚未 active 時短暫 retry external update
  - AreaScene 支援建築後載入並用內容簽章避免 polling 重畫閃爍
- ✅ **NPC 室內/室外與三維位置一致性**
  - `NpcRuntimeState` / `/api/npcs` / frontend state 新增 `buildingId`、`subZ`
  - AreaPage 只渲染 `!npc.buildingId` 的室外 NPC，避免同一 NPC 室內外分身
  - `NPC_INTERACT` 只允許雙方同 tile、室外、`subCol/subRow/subZ` 足夠接近，payload 保留雙方位置證據
- ✅ **所有子場景都有場景內出口 hotspot**
  - AreaScene 新增「出口」hotspot，點擊或靠近後按 `E` / `SPACE` 可回城市總覽
  - BuildingScene 新增門口/「離開」hotspot，靠近後按 `E` / `SPACE` 或點擊可回建築所屬區域
- ✅ **驗證**
  - `npm run build:web` 通過（Vite chunk size warning 既有）
  - `npm run build:server` 通過
  - `npm run test -w @greed-island/server`：13 files / 102 tests 通過
  - `git diff --check` 無 whitespace error；Windows line-ending warning 既有

## v0.15.3 ✅ shipped — 2026-05-07

**主題：AI 反幻覺 + 編年史多樣化 + 角色職責綁定 home tile**

- ✅ **Ambient prompt 強化反幻覺**（`packages/server/src/sim/ambientNarrator.ts`）
  - System prompt 加 ⚠️ 嚴禁虛構 區塊：禁止虛構任何具名 NPC（即使聽似合理的「祭司 / 守衛 / 商人」）、禁止虛構建築結構名（「拱門」「第一層」「鐘樓」）
  - User prompt 列「在場 NPC」清單時加註「你只能引用這些名字，其它人物用『行人 / 攤主 / 巡邏的人』」
  - 新增 `presentBuildingNames` 欄位（`runtime.buildAmbientContext` 從 `BuildingRuntime.snapshotForTile` 拉），列出本 tile 可命名建築；空清單時明確指示「不要使用任何具體建築名」
  - WorldEvent narration prompt 同步加禁構句約束
  - 修使用者回報 AI 編出「祭司瑟拉守在第一層的拱門前」這種虛構場景
- ✅ **Role-locked NPC 永遠不跨區**（`npcEngine.deriveSchedule` + `isRoleLockedToHomeTile`）
  - archetype ∈ {mystic, shopkeeper, craftsman, guard, civic, cleric} → lock
  - role.zh 含「祭司 / 僧 / 住持 / 主教 / 守衛 / 衛兵 / 店長 / 老闆 / 鑄 / 匠 / 修士 / 醫 / 工坊 / 員工 / 司祭」→ lock
  - role.en 含 abbot / cleric / priest / guard / shopkeeper / smith → lock
  - lock 後即使 profile JSON 寫了「council attendance → t_central」這種跨區 slot，整段壓回 defaultLocation
  - 修使用者回報「祭司的職責在地脈層就應該永遠在地脈層」
- ✅ **編年史敘事多樣化**（`composeInteractionNarration`）
  - 句型池從 ~12 句擴充到 50+ 句，依 archetype 組合分支：mystic / shopkeeper / craftsman / guard / civic / outsider / 同派系 / 跨派系 / 預設池
  - seed 加入 `tick + weather`：同一對 NPC 同一 tile 不同 tick 拿到不同句子，不再「每條都長一樣」
  - 雨天 / 微風 / 晴 / 陰 各自加情境句（「簷下避雨」「風口聊」「陽光下站著」）
  - 修使用者回報「編年史太罐頭、每條都是『氣氛緊繃』」
- ✅ NPC interact 502 — 經查 logs 為 deploy 期間 Caddy 短暫上行；server 沒 crash，handler 已 try/catch AI 失敗 fallback。Gemini key 全部 INVALID_ARGUMENT 是另一回事（需 `/settings` 換 key）
- ✅ 100 tests pass / web build 1.62 MB

## v0.15.2 ✅ shipped — 2026-05-07

**主題：AreaPage UI 修整 — 地圖純畫面 + NPC idle 呼吸 + 縮短 polling**

- ✅ **地圖上不疊任何 HTML 按鈕**（`packages/web/src/pages/AreaPage.tsx`）
  - 「← 返回」按鈕 + 區域名稱 pill 從 `absolute top-2` overlay → 改放在地圖**上方**的正常 block flow
  - 新增 HTML「進入 X →」按鈕在地圖**下方**：玩家走到建築旁時 fire；用 `nearbyBuilding.def.placement.glyph + nameZh` 顯示
  - 地圖區現在只剩 Phaser canvas（tile + NPC + 環境物件 + 天氣 VFX），跟 NPC sprite / 建築不再被按鈕擋住
- ✅ **AreaScene 新 callback `onNearbyBuildingChange`**（`packages/web/src/game/AreaScene.ts`）
  - `checkBuildingProximity` 在 `nearbyBuildingId` 變動時 fire 一次（不是每 tick），React 只在進入/離開範圍 re-render
- ✅ **「靜態」debug badge 移除** — `area.scene` tab 不再顯示 `AI` / `靜態` 標籤；fallback 文字直接顯示，使用者看不到 source
- ✅ **NPC idle 呼吸動畫**（`AreaScene.attachNpcIdleAnimation`）
  - 每位 NPC sprite spawn 時套上 scaleY 0.93→1.06 yoyo tween（1.2s 週期）
  - phase delay 用 npcId hash 避免每位同步呼吸
  - **修玩家進入區域場景時 NPC 完全靜止的觀感**：以前要等下次 polling 拉到不同 subCol/subRow 才會啟動位置 tween；現在 spawn 那一刻就動
  - idle tween 改 scaleY，跟位置 tween 改 x/y 不互斥，可同時存在
- ✅ **WorldStateContext polling 8s → 3s**（`packages/web/src/state/WorldStateContext.tsx`）
  - 後端 tick 5s；polling 短於 tick 確保最多 ≈3s 後 NPC subCol/subRow 變動就送到前端
  - AreaScene `tweenNpcTo` 4500ms 能順暢接上下一輪位置變動
- ⚠️ **AI ambient 為 fallback**：production 兩把 Gemini key 全部回 HTTP 400 `API key not valid`。需要去 `/settings` 換掉 key；code 沒問題、`tickRefresh` 邏輯已就位
- ✅ tests 100 pass / web build 1.62 MB JS / gzip 452 KB

## v0.15.1 ✅ shipped — 2026-05-07

**主題：場景動態化 — AI ambient 主動刷新 + Phaser 天氣 VFX + 環境動畫**

- ✅ **AI ambient 主動刷新** (`packages/server/src/sim/ambientNarrator.ts`)
  - 新增 `AmbientNarrator.tickRefresh(currentTick, getContext)`：每 tick 由 runtime tick listener 主動呼叫
  - 每個 tile 紀錄 `lastRequestedTickByTile`；最近 12 tick 內被玩家 polled 過的 tile 才會被推進下一輪 refresh，避免無人觀察時浪費 Gemini quota
  - 既有 30-tick cache TTL 保留；改善的是「cache 過期那一刻」會立刻在背景跑 refresh，下次 polling 拿到的就是新的 AI 文字
  - 修原本的「AreaPage 上看到同一段 ambient 文字 60+ tick 才換」靜態感
- ✅ **runtime.buildAmbientContext** 抽出共用 helper (`packages/server/src/sim/runtime.ts`)：buildings router 與 ambient tickRefresh 共用同一份 context 組裝邏輯，避免兩處失同步
- ✅ **Phaser 天氣 VFX** (`packages/web/src/game/AreaScene.ts`)
  - 新 `applyWeather(weather)` + `disposeWeather()` + `weatherLayer` container（depth=200）
  - 5 種天氣：晴 → 暖色覆蓋 + 太陽暈呼吸；陰 → 灰罩 + 飄移雲層；霧雨 → 薄霧斑 + 30 條細雨；驟雨 → 60 條雨線 + 偶發閃電；微風 → 飄落 🍃/🌸
  - 由 `world.facts['weather']` (後端 fact) 驅動；`normaliseWeather` 把中文字串轉成 enum
- ✅ **環境動畫** (`AreaScene.attachEnvAnimation`)
  - 樹/植物 (🌲🌳🌵) → 左右搖擺 ±4°
  - 燈籠/神社/招牌 (🪔⛩🏯🪧) → alpha 閃爍 0.7-1.0
  - 海/船/港 (⚓⛵🛟🪝🐟🐚) → 上下漂浮 ±2px
  - 結晶 (✦◈✧) → scale + alpha 同步脈動
  - 廢墟/岩石 (🪨🏚⛰🏔) → 偶爾微抖
  - tween phase 用 (col,row) hash 避免相鄰物件動作完全同步
- ✅ **NPC 移動驗證**：v0.13.0 已實作（NpcEngine 每 tick 寫 subCol/subRow → AreaPage polls → AreaScene `tweenNpcTo` 4500ms tween）；本版檢查無 regression
- ✅ tests：100 tests pass；full build (server tsc + vite) 通過

## v0.15.0 ✅ shipped — 2026-05-07

**主題：紋卡系統大重設計 + 戰鬥系統 Phase B**

- ✅ **定序卡 100 張完整重設計**
  - Rank 從 SS/S/A/B/C/D/E/F/G/H 收斂為 S/A/B/C/D（5 階）
  - 10 大分類（潮源系 / 食飲系 / 技藝系 / 地景系 / 潮器系 / 生靈系 / 契約系 / 秘聞系 / 潮術系 / 深淵系），各 10 張 (1×S, 2×A, 3×B, 2×C, 2×D)
  - 新欄位：`category` / `maxCopies` / `effectDescription` / `acquisitionMethod` / `acquisitionDetail`
  - 取得方式 enum：`main_quest` / `side_quest` / `affinity_bond` / `combat_victory` / `shop_purchase` / `location_trigger` / `puzzle_solve` / `random_drop`
  - 高階卡（S/A/B）絕不會隨機掉落 — 必須走任務 / 戰鬥 / 好感度 / 解謎；只有 D 階共 20 張進 random_drop 池子
- ✅ **掉落率大幅調低**
  - 基準 spawn chance 從 1.2% → 0.24% per-tile per-tick（5×降低）
  - 大潮日 (rare window) ×1.8、雨天 ×1.3
  - tile category boosts：鏽灣區→技藝系/秘聞系；潮聲區→地景系/食飲系；霓港區→潮器系/食飲系；地脈層→深淵系/潮術系；浪花區→生靈系
- ✅ **15 張術式卡完整設計** (`packages/server/src/cards/techniques.ts`)
  - 戰鬥型 7 / 探索型 5 / 社交型 3
  - 不掉落，只能在「天際百貨」(t_temple, 霓港區) 用潮幣購買
  - 每張有具體效果 mechanic 描述（Phase C 才接戰鬥引擎 hook）
  - 新表 `player_techniques` 記錄玩家持有
- ✅ **天際百貨商店 router** (`packages/server/src/http/techniqueShopRouter.ts`)
  - `GET /api/shop/techniques`、`POST /api/shop/techniques/:id/buy`、`GET /api/me/techniques`
  - 必須在 t_temple tile + 足夠潮幣 + 未達持有上限
- ✅ **戰鬥系統 Phase B：單擊判決** (`packages/server/src/combat/`)
  - `commands.ts`：`COMBAT_INITIATE` / `COMBAT_PLAYER_ACTION` (attack/defend/flee) / `COMBAT_RESOLVE`，加進 `LIVING_WORLD_COMMAND_TYPES`
  - `ruleEngine.ts`：deterministic 公式 + `hashSeed(combatId, actorId, round)` 暴擊；逃跑永遠成功；玩家輸 energy=0、NPC 輸 incapacitated 5 秒
  - `combatStore.ts`：`combat_sessions` + `combat_log` + in-memory NPC incap map
  - `http/combatRouter.ts`：`POST /api/combat/initiate`、`POST /api/combat/:id/action`、`GET /api/combat/active`、`GET /api/combat/:id`
  - 同 tile 才能戰鬥；player energy=0 不可挑戰；玩家同時只能有一場 active
- ✅ **Web 戰鬥 HUD** (`packages/web/src/components/game/CombatHud.tsx`)
  - 三按鈕（攻擊 / 防禦 / 逃跑）+ 雙方 hp bar + 上回合 result row
  - `NpcDialog` 在 `trust ≤ 30 + npc.health > 0` 時出現「挑戰開戰」按鈕
- ✅ **Personality + history-aware AI greet** (`packages/server/src/npcs/greetLine.ts` + `/api/npc/:id/greet`)
  - 依 trust / interactionCount / sinceTickGap 派生不同 bucket（fresh / hostile / familiar / bonded / reconnect）
  - 仍 deterministic（不靠 AI），但每位玩家對每位 NPC 的招呼會根據關係階段動態變
- ✅ **Architecture 合規**：所有戰鬥動作都產生 typed Command 經 `LivingWorldRuleEngine` 寫進 EventLog（`COMBAT_INITIATE` / `COMBAT_PLAYER_ACTION` / `COMBAT_RESOLVE` 三型）；CombatStore 是 SQLite projection；無 `Math.random()` 進 deterministicKey
- ✅ tests：`combat/ruleEngine.test.ts` 7 tests、`cards/catalog.test.ts` 9 tests，全 100 tests pass

OpenSpec: `combat-phase-b-single-shot/`（archived） + `card-catalog-redesign/`（new for v0.15）

## v0.14.1 ✅ shipped — 2026-05-07

**主題：NPC dialog 空狀態 personality-based + 戰鬥 Phase B OpenSpec**

- ✅ NPC dialog 空狀態 placeholder 從單一 i18n string「看了你一眼，沒有開口」改成 server 派生、依 personality 因人而異
  - 新 `packages/server/src/npcs/greetLine.ts`：6 個 bucket（reserved / temple / guild / cheerful / greedy / gruff / neutral），用 profile.personality (calmness / patience / greed / factionLean) 決定，profile id hash 挑句子（deterministic）
  - `SimNpcState.greetLine` + `NpcSummary.greetLine` 透傳到 web；`NpcDialog.tsx` 在 `turns.length===0` 顯示這句話而不是 i18n fallback
  - 修 v0.14.0 後使用者誤判「dialog 還在壞」（其實是空狀態占位符跟舊 fallback 視覺一致造成的誤會）
  - 7/7 unit tests 過
- ✅ `openspec/changes/combat-phase-b-single-shot/`：把 v0.15 戰鬥 Phase B 從 `combat-system/` 規劃單抽出來變獨立可實作 ticket，列出 Open Questions 等 reviewer 答覆再進實作
- ✅ frame-processor docker stack 確認上線（`100.83.112.20:8533` web / worker+postgres+redis healthy）

## v0.14.0 ✅ shipped — 2026-05-07

**主題：World Pressure 視覺化 + Dialog 修復 + 介入爭執走 Rule Engine + 戰鬥系統規劃**

- ✅ Gemini-2.5-flash `thinkingBudget=0` 修 NPC dialog 全部 fallback
- ✅ HubPage MapScene 只畫 `activity=move` 的 NPC（區域內 NPC 只在 AreaPage 顯示）
- ✅ MapScene tile 視覺化：safety<40 暗紅 / economy>70 金 / dominantFaction 派系外框
- ✅ AreaScene NPC mood<30 灰名 / health<30 🤕
- ✅ NPC 互動事件排除建築內 NPC（修「鏽灣區起爭執但 NPC 在建築內」）
- ✅ Cross-tile schedule 改 role-based（商店 / 工匠 / 公務 不被硬塞跨區）
- ✅ AreaState 持久化 `pressureCooldowns` + recovery / faction.rising threshold-crossing 事件
- ✅ `SinceLastVisitPanel` modal 取代單行 toast，事件 row 點擊跳區域
- ✅ 玩家介入 NPC 爭執（自由文字 + AI 意圖分類）走 Command → Rule Engine → Event 管線
  - 新 `PLAYER_INTERVENE` 命令型別 + `runtime.submitLivingWorldCommand` 對外入口
  - Gemini classify message → mediate / provoke / watch / threaten
- ✅ 戰鬥系統規劃文件：`COMBAT_ARCHITECTURE.md` + `openspec/changes/combat-system/`

OpenSpec: `world-pressure-and-dialog-fixes/` + `player-intervene-and-combat/` + `combat-system/`

## v0.15.x — Phase B 後續強化（暫無排程）

**Goal：v0.15.0 Phase B 已 ship；以下是 Phase B 範圍內未做的補強**

- [ ] 玩家介入爭執前端 UI（HubPage / AreaPage 看到 argument 時跳出 modal，4 按鈕 + message 輸入框）
- [ ] 戰鬥事件接 `summarizeWindow` → `SinceLastVisitPanel` 顯示「不在時打了 N 場」
- [ ] 戰鬥失敗的世界副作用更完整：玩家 carry slot 隨機掉一張卡、NPC 倒地進 buildings 拉長至更可感知的時間
- [ ] 100 張定序卡與術式卡的紋典 UI 分組（按 category）+ 商店 / 任務獎勵 hook 上線

## v0.16 — 戰鬥系統 Phase C：實時 sub-tick + 紋卡

**Goal：升級到實時戰鬥 + 紋卡互動優先級**

- [ ] sub-tick loop（10 Hz 預設，可調 5~20 Hz）
- [ ] 紋卡 commands：`COMBAT_CARD_PLAY` / `COMBAT_DAMAGE` / `COMBAT_STATUS_*` / `COMBAT_PHASE_SHIFT` / `COMBAT_TARGET_LOCK*` / `COMBAT_FLEE_ATTEMPT` / `COMBAT_DEFEAT`
- [ ] 5-phase 結構：STATUS_TICK → CARD_PLAY → DAMAGE/HEAL → DEFEAT → RESOLVE
- [ ] 卡牌優先級表 + tie-break (`actorId, commandId`)
- [ ] `web` `CombatScene.ts` (Phaser) + `CombatProjection`（訂閱 SSE，純 derive）
- [ ] Client prediction + reconcile（server reject → 回滾 + toast）
- [ ] `tickDigest` hash sanity check + snapshot fallback

## v0.17 — 戰鬥系統 Phase D：世界回饋迴圈

**Goal：戰鬥結果完整融入世界**

- [ ] `COMBAT_RESOLVE.worldEffects` 完整定義 + reducer 消化
- [ ] NPC defeated → `incapacitated` 1h；玩家 defeated → energy=0 + carry slot 隨機掉卡
- [ ] `cardLootSpawns` 走既有 `CARD_DROP_SPAWN`
- [ ] `factionShifts` 套到 `area.state.<tile>.factionControl`
- [ ] 歷史卷軸：`world_history` 表 + `SinceLastVisitPanel` 加「戰鬥」section
- [ ] AI ambient narrator pre/mid/post combat narration
- [ ] EventLog retention：戰鬥結束 7 天後 sub-tick 細節 → `COMBAT_HISTORY_COMPACT`

## 已 shipped（往前的 release）

- **v0.13.0** — 紋卡 Rule Engine 管線（`CardActionPipeline`）+ 天氣/區域 spawn + 精力 timer 誤差 + Since-Last-Visit + 長按實體化 + MapScene tween
- **v0.12.1** — MapScene / BuildingScene 共用 `npcVisuals`；後端 NPC color + activity 推到三場景
- **v0.12.0** — NPC sprite 完全後端驅動（subCol/subRow exploration）+ 角色色四色 + 活動 emoji；AI dialog parser 寬鬆化
- **v0.11.0** — Living Deterministic World：Command/Event/Rule Engine 雙路徑、NPC Memory + Relationships 投影、AI dialog on-topic
- **v0.10.0** — World Pressure（AreaStateEngine）+ Buildings + AI Ambient Narrator
- **v0.9.x** — NpcEngine schedule + activity；紋卡掉落 + 紋典 + 紋卡交易（60 秒法則 + RANK_EXISTENCE_CAP）

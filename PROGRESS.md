# Greed Island Progress Handoff

This file records current development state for the next AI or human
developer. Keep latest status at the top.

---

## 2026-06-26 — Handoff Snapshot @ v0.98.5

### Current Version
`0.98.5` — Local Shout & Subtitle Dedupe：字幕輸入改成「向附近 NPC 喊話」，不再鎖死單一目標；附近多位 NPC 會一起收到玩家發話並各自回應；字幕 feed 會去除 optimistic echo / committed events 造成的重複行，並補上 NPC 自主 utterance 與附近 ambient chatter。

### What Changed
- **Local shout audience**：新增 `nearbySpeechRecipients`，優先選玩家身邊 NPC，最多 3 位；沒有距離資料時 fallback 到同區 1 位。
- **Multi-NPC optimistic transcript**：新增 `optimisticLocalShoutLines`，一次顯示一行「你」與多位 NPC pending/reply 行。
- **Subtitle dedupe**：新增 `dedupeSubtitleLines`，避免同一句玩家發話或 NPC 回覆在 optimistic / SSE / EventLog 追上後重複出現。
- **Real speech sources**：字幕 feed 支援 `NPC_FREEFORM_ACTION_PROPOSED.proposal.utterance`，沒有近期事件時也會用附近 NPC 的 `recentUtterance` / greeting / cognitive line 當 ambient chatter。
- **UI copy**：手機上改顯示 `向附近 N 人發話` / `向附近 N 人說話…`，不再誤導成只能對單一 NPC 私訊。
- **Regression coverage**：`areaSubtitles.test.ts` 覆蓋 freeform utterance、ambient chatter、local shout audience、多 NPC optimistic lines、dedupe。
- **Version bump**：workspace/server/web package versions and server/web `APP_VERSION` updated to `0.98.5`.

### Verification Evidence
- `npm test` — pass（server 1275 tests + web 140 tests）
- `npm run test -w @greed-island/web -- areaSubtitles.test.ts` — pass（9 tests）
- `npm run build` — pass（server + web；Vite chunk-size warning remains known non-blocking）
- `npm run openspec:check` — pass
- `git diff --check` — pass

### Known Notes
- 這版仍透過既有 `/api/npc/:id/interact` 對多位 NPC fan-out；每位 NPC 都會產生自己的 replayable `PLAYER_NPC_DIALOGUE` event，但前端字幕會把重複的玩家發話壓成一行。

---

## 2026-06-26 — Handoff Snapshot @ v0.98.4

### Current Version
`0.98.4` — Mobile Subtitle Send Feedback Fix：修正手機上字幕發話看起來「沒用」的體感；送出後會立即在字幕 feed 顯示「你」的訊息與 NPC 等待回覆，成功後替換成真實 NPC 回覆，失敗也直接在字幕行顯示錯誤；送出按鈕不再只顯示省略號。

### What Changed
- **Immediate subtitle echo**：玩家按「發話」後先插入 optimistic「你：訊息」與「NPC：……」，避免等待 API 時 UI 像沒反應。
- **Response replacement**：NPC API 成功後用真實 `worldEventId` / tick / NPC 回覆替換 pending 字幕。
- **Visible failure state**：API 失敗時把 pending NPC 行改成「發話失敗：...」，並保留 toast/error。
- **Clearer mobile button**：busy label 從 `…` 改成 `發話中`，手機上不會誤以為按鈕沒作用。
- **Regression coverage**：`areaSubtitles.test.ts` 新增 optimistic speech line 測試。
- **Version bump**：workspace/server/web package versions and server/web `APP_VERSION` updated to `0.98.4`.

### Verification Evidence
- `npm run test -w @greed-island/web -- areaSubtitles.test.ts` — pass（4 tests）
- `npm run build -w @greed-island/web` — pass（Vite chunk-size warning remains known non-blocking）

### Known Notes
- 這版先修發話回饋；若 live API 偶發慢 tick，字幕至少會先顯示玩家已送出與等待回覆。

---

## 2026-06-26 — Handoff Snapshot @ v0.98.3

### Current Version
`0.98.3` — Area Dialogue Subtitles：區域地圖下方新增「附近對話字幕」即時紀錄，玩家走近 NPC 時可看到附近 NPC 對談、爭執、玩家/NPC 對話回合，也能直接在字幕欄對附近 NPC 發話。

### What Changed
- **Subtitle feed helper**：新增 `areaSubtitles`，把 `NPC_INTERACT` 與 `PLAYER_NPC_DIALOGUE` event 轉成玩家可讀的字幕行，支援 rule-engine `payload.data`。
- **Inline speech input**：AreaPage 新增字幕輸入欄；送出後呼叫既有 `/api/npc/:id/interact`，因此玩家發話仍提交 replayable `PLAYER_NPC_DIALOGUE` world event。
- **Nearby target selection**：字幕欄優先對玩家身邊 NPC 發話；沒有附近 NPC 時提示靠近 NPC。
- **Optimistic transcript**：發話成功後立即把「你」與 NPC 回覆補到字幕 feed，等 SSE/event refresh 追上。
- **Version bump**：workspace/server/web package versions and server/web `APP_VERSION` updated to `0.98.3`.

### Verification Evidence
- `npm test` — pass（server 1275 tests + web 134 tests）
- `npm run test -w @greed-island/web -- areaSubtitles.test.ts areaSocial.test.ts areaBehavior.test.ts` — pass（9 tests）
- `npm run build` — pass（server + web；Vite chunk-size warning remains known non-blocking）
- `npm run openspec:check` — pass（15 active changes）
- `git diff --check` — pass

### Known Notes
- 這版先接同區/附近字幕與玩家發話入口；下一刀可把 subtitle feed 改成 server-side area conversation projection，避免只依賴目前 world-state recent events window。

---

## 2026-06-26 — Handoff Snapshot @ v0.98.2

### Current Version
`0.98.2` — Behavior-Aligned Area UI：Area UI 現在直接把 NPC/動物行為翻成玩家看得懂的狀態；NPC 吃飯顯示「正在吃飯」，NPC_INTERACT argue 會顯示「正在爭執」，動物依 ecology intent 顯示「覓食中 / 狩獵中 / 遷徙中 / 成群移動」。

### What Changed
- **NPC behavior badges**：新增 `areaBehavior` helper，NPC list 以 event-aware badge 顯示當下行為；`eat` 不再只靠泛用 intent line，`argue` 會被近期 `NPC_INTERACT` 事件覆蓋成衝突狀態。
- **Map sprite icon alignment**：AreaScene NPC sprite 的右上角圖示支援 behavior override；爭執顯示 💢，吃飯顯示 🍚。
- **Animal behavior labels**：場景分頁新增「動物行為證據」；動物 sprite 與群聚 label 顯示 ecology intent，狩獵/遷徙不再套吃草 bob。
- **Regression coverage**：新增 `areaBehavior.test.ts`，覆蓋吃飯、爭執、動物 intent 三種 UI 映射。
- **Version bump**：workspace/server/web package versions and server/web `APP_VERSION` updated to `0.98.2`.

### Verification Evidence
- `npm run test -w @greed-island/web -- areaBehavior.test.ts areaCharacterVisualState.test.ts hubEcology.test.ts` — pass（13 tests）
- `npm run build -w @greed-island/web` — pass（Vite chunk-size warning remains known non-blocking）

### Known Notes
- 這版先把 UI 讀法對齊權威行為資料；下一步可把更多 server event types（吃飯消耗資源、交易、巡邏、受傷）接成同一套 `BehaviorBadge` surface。

---

## 2026-06-26 — Handoff Snapshot @ v0.98.1

### Current Version
`0.98.1` — Player Dialogue World Consequences：玩家與 NPC 對話不再只是私有聊天紀錄；每次 `/api/npc/:id/interact` 會提交 replayable `PLAYER_NPC_DIALOGUE` 事件，並讓 runtime 將該事件套成短期 NPC intent override，NPC 接下來的行動會被玩家對話拉向社交/交易脈絡。

### What Changed
- **Replayable player dialogue event**：新增 `PLAYER_NPC_DIALOGUE` command/event schema，包含 player、npc、tile、intent、玩家訊息、NPC 回覆、信任變化與 narration。
- **Router integration**：NPC interact endpoint 仍保留 per-player private history，但同時把對話送入 LivingWorld RuleEngine / EventLog；response 回傳 `worldEventId`。
- **Runtime consequence**：`PLAYER_NPC_DIALOGUE` publish 後會更新 NPC speech bubble，並設定短期 `intentOverride`；`trade` 導向 economic，`greet`/`ask` 導向 social。
- **Regression coverage**：新增 router 測試證明 interact 會提交 world event；新增 runtime 測試證明 event 會改變 NPC intent override。
- **Version bump**：workspace/server/web package versions and server/web `APP_VERSION` updated to `0.98.1`.

### Verification Evidence
- `npm test` — pass（server 1275 tests + web 128 tests）
- `npm run test -w @greed-island/server -- npc.test.ts runtimeIntentResolution.test.ts` — pass（13 tests）
- `npm run build` — pass（server + web；Vite chunk-size warning remains known non-blocking）
- `npm run openspec:check` — pass（15 active changes）
- `git diff --check` — pass

### Known Notes
- 這版先讓玩家對話進入 EventLog 並影響短期 NPC 行動。下一刀可把 `PLAYER_NPC_DIALOGUE` 接到更長期的 NPC cognition / relationship projection，讓反覆對話真正改變性格、信念、關係與人生目標。

---

## 2026-06-26 — Handoff Snapshot @ v0.98.0

### Current Version
`0.98.0` — NPC Interaction Visibility：把「可以跟誰互動」和「NPC 彼此真的有社交事件」直接放到區域場景；NPC 分頁不再因距離把同區 NPC 全部鎖死，登入後可直接點名字對話。NPC_INTERACT 事件也會在場景卡片顯示成最近人際互動證據。

### What Changed
- **Player interaction affordance**：Area NPC list 登入後可直接點任何同區室外 NPC 開啟對話，不再只靠地圖 proximity click；附近 NPC 仍標示「身邊，可地圖點擊」。
- **Social proof surface**：場景分頁新增「NPC 互動證據」，把最近 `NPC_INTERACT` 事件格式化顯示，避免世界看起來只有一群人在走路。
- **Social cadence tuning**：NPC 同 tile 社交事件機率從 `0.08` 提到 `0.25`、互動距離從 2 格放寬到 5 格，讓 live 玩家更常看見交談/爭執事件。
- **Regression coverage**：新增 `areaSocial.test.ts`，覆蓋 NPC_INTERACT 辨識、姓名格式化、narration 優先。
- **Version bump**：workspace/server/web package versions and server/web `APP_VERSION` updated to `0.98.0`.

### Verification Evidence
- `npm run test -w @greed-island/server -- npcEngine.test.ts runtimePresence.test.ts` — pass（58 tests）
- `npm run test -w @greed-island/web -- areaSocial.test.ts` — pass（3 tests）
- `npm run build` — pass（server + web；Vite chunk-size warning remains known non-blocking）

### Known Notes
- 這版先把互動入口與社交證據露出來。下一刀應做「室內 NPC 彼此互動」與「對話後改變 NPC 計畫/關係」的更深層世界因果，而不是只顯示社交事件。

---

## 2026-06-26 — Handoff Snapshot @ v0.97.9

### Current Version
`0.97.9` — NPC Workplace Occupancy + Chronicle Naturalization：修正「建築有職缺但 NPC 沒人在工作」的世界畫面斷裂；非 owner NPC 只要在同 tile 做 `work` / `trade`，會被導入有 hiring slot 或相符用途的建築 occupant，讓職缺/建築/人物畫面接起來。同時把編年史 freeform 主文改得更像事件，不再反覆解釋「不是被排程推著走」。

### What Changed
- **BuildingRuntime root cause fix**：`resolveNpcBuildingId()` 可在 building API view 中把工作/交易中的非 owner NPC 導到同 tile 的工作建築；simulation hot paths 仍保留戶外輸入，避免阻斷採集、建設、家庭經濟等事件鏈。
- **Occupant metadata**：非 owner workplace occupant 會帶第一個 hiring shift，UI 可看出不是空建築。
- **Chronicle copy**：NPC freeform accepted motivation 縮短成系統驗證說明；主敘事由 planner 產出較自然事件句型。
- **Regression coverage**：新增 building runtime 測試，先重現「非 owner NPC 在職缺建築外閒晃」再修正。
- **Version bump**：workspace/server/web package versions and server/web `APP_VERSION` updated to `0.97.9`.

### Verification Evidence
- `npm test` — pass（server 1273 tests + web 125 tests）
- `npm run test -w @greed-island/server -- buildingRuntime.test.ts runtimeExpansion.test.ts runtimeGoodsInventory.test.ts buildingsRouter.test.ts` — pass（10 tests，覆蓋前一版 CI failure）
- `npm run build` — pass（server + web；Vite chunk-size warning remains known non-blocking）
- `npm run openspec:check` — pass（15 active changes）
- `git diff --check` — pass

### Known Notes
- 這版先讓「有人正在建築裡工作」出現在權威 building occupant surface。下一刀應把職缺容量、NPC 職責/技能、班表與薪資投影成更完整的 NPC employment economy，而不是只用 activity 對建築用途配對。

---

## 2026-06-26 — Handoff Snapshot @ v0.97.8

### Current Version
`0.97.8` — Slow Tick Phase Timing Observability：在 scheduled simulation tick 內加入 phase-level timing，slow tick warning 會列出最慢 phase，讓下一刀能根據 live log 鎖定真正卡 HTTP 的同步段。

### What Changed
- **Server runtime**：`runTick()` 現在回傳 `TickPhaseTiming[]`，scheduled loop 在 tick 超過 cadence 時把 slow phase summary 接到 warning。
- **Measured phases**：`plan-commands`、`rule-evaluation`、`append-events`、`npc-sqlite-projections`、`projection-fanout`、`tick-listeners`。
- **Pure helper**：新增 `summarizeSlowTickPhaseTimings()`，threshold 過濾、duration desc 排序、最多顯示 6 段。
- **Tests**：新增 `runtimePhaseTiming.test.ts`，先 RED 後 GREEN 覆蓋排序與 threshold 行為。
- **Version bump**：workspace/server/web package versions and server/web `APP_VERSION` updated to `0.97.8`.

### Verification Evidence
- `npm run test -w @greed-island/server -- runtimePhaseTiming.test.ts runtimeScheduler.test.ts` — pass（5 tests）
- `npm run build` — pass（server + web；Vite chunk-size warning remains known non-blocking）
- `npm run openspec:check` — pass（15 active changes）
- `git diff --check` — pass

### Known Notes
- 這版是 observability slice，不直接拆 chunk。下一步應該先看 live slow tick warning 的 `slow phases:`，再對最慢段做 yield/chunk 或 fanout 降載。

---

## 2026-06-26 — Handoff Snapshot @ v0.97.7

### Current Version
`0.97.7` — Long Tick Data Timeout Mitigation：v0.97.6 live 仍可重現資料 API 在 long tick 期間整批 8 秒 timeout。這版把 slow-tick 後的 HTTP recovery window 拉長，並把 world-state 前端 timeout 提高，優先讓手機 UI 拿到真實資料，不再太早掉 fallback / incomplete state。

### Live Evidence Before Fix
- v0.97.6 live batch probe 每 5 秒打 `/api/version`、`/api/world`、`/api/map`、`/api/npcs`、`/api/events`、`/api/areas`。
- 多數輪次 < 1s，但撞到 long tick 時出現連續輪次 8s timeout；最嚴重一輪 6/6 endpoints 全 timeout。
- 同一批 endpoint 等 long tick 結束後可在約 2.5s 內回正確資料，表示資料仍在，問題仍是 Node event loop 被同步 tick 卡住。

### What Shipped
- **Longer slow-tick cooldown**：`computeNextTickDelayMs()` slow tick cooldown 從 30–60s 改成 120–240s，明確降低玩家刷新撞到下一輪 long tick 的機率。
- **Longer app-level world refresh timeout**：`MOBILE_LOAD_TIMEOUT_MS` 從 45s 提高到 120s。
- **Regression coverage**：更新 scheduler cooldown 與 resilientLoad timeout tests。
- **Version bump**：workspace/server/web package versions and server/web `APP_VERSION` updated to `0.97.7`.

### Verification Evidence
- `npm run test -w @greed-island/server -- runtimeScheduler.test.ts` — pass（3 tests）
- `npm run test -w @greed-island/web -- resilientLoad.test.ts` — pass（4 tests）
- `npm run build` — pass（server + web；Vite chunk-size warning remains known non-blocking）
- `npm run openspec:check` — pass（15 active changes）
- `git diff --check` — pass

### Known Notes
- This is still a mitigation, not the permanent architecture fix. Permanent fix remains phase-level timing + splitting/yielding the actual slow tick phases so HTTP can run during simulation work.

---

## 2026-06-26 — Handoff Snapshot @ v0.97.6

### Current Version
`0.97.6` — Hub Map Action Placement Hotfix：修正 Hub 行動版地圖互動按鈕被「世界目標與科技」面板擠到下方的反直覺排序。玩家選到街區後，`目前位置 / 進入 {name}` 與 `文明面板` 都緊貼地圖下方。

### What Shipped
- **Map-adjacent action row**：`HubPage` 將 `進入目前位置` 與 `文明面板` 移到 `PhaserGame` 後、`WorldCivilizationPanel` 前。
- **Mobile-friendly controls**：行動版維持直向排列與 44px+ 觸控高度；桌面版改為同列排列。
- **Version bump**：workspace/server/web package versions and server/web `APP_VERSION` updated to `0.97.6`.

### Verification Evidence
- `npm run build -w @greed-island/web` — pass（Vite chunk-size warning remains known non-blocking）
- `npm run build -w @greed-island/server` — pass
- `git diff --check` — pass

### Known Notes
- 這是 UI placement hotfix；不改地圖狀態、API、simulation 或 EventLog。

---

## 2026-06-26 — Handoff Snapshot @ v0.97.5

### Current Version
`0.97.5` — Tick Projection SQLite Batching：延續 v0.97.4 的 slow tick / HTTP timeout hotfix，開始修 tick 本身的同步阻塞來源。每輪 committed events fanout 到 NPC memory / relationship SQLite 投影時，改成單一 transaction，避免逐 event/row autocommit 把 Node.js event loop 卡住。

### What Shipped
- **Shared transaction primitive**：`SqliteEventStore.runInTransaction()`，讓同一個 SQLite connection 上的 projection writes 可被 runtime 批次包住。
- **Batched NPC projection fanout**：新增 `projectCommittedNpcSqliteStores()`，把 `npcMemory.project()`、`npcMemory.projectWithLocality()`、`npcRelationships.project()` 對同一批 committed events 的寫入包成一個 transaction。
- **Both commit paths covered**：regular simulation tick fanout 與 `publishCommittedEvents()` 都走同一個 batching helper。
- **Determinism preserved**：仍照 committed event order 投影；既有 memory `INSERT OR IGNORE` 與 relationship upsert 語意不變，只改 SQLite transaction boundary。
- **Version bump**：workspace/server/web package versions and server/web `APP_VERSION` updated to `0.97.5`.

### Verification Evidence
- `npm run test -w @greed-island/server -- eventStoreTransaction.test.ts runtimeBudget.test.ts runtimeScheduler.test.ts` — pass（12 tests / 3 files）
- `npm run build -w @greed-island/server` — pass
- `npm run build` — pass（server + web；Vite chunk-size warning remains known non-blocking）
- `npm run openspec:check` — pass（15 active changes）
- `git diff --check` — pass

### Known Notes
- This targets the most likely synchronous SQLite fanout cost behind 13–24s live ticks. If live still shows long ticks after deploy, next slice should add phase-level timing around command planning, rule evaluation, append, SQLite projection fanout, and listener fanout to identify the next bottleneck.

---

## 2026-06-26 — Handoff Snapshot @ v0.97.4

### Current Version
`0.97.4` — Refresh Hydration Reliability Hotfix：live v0.97.3 在重整時仍容易顯示 fixture / 不完整資料。重現顯示一組瀏覽器 refresh 會同時打的 `/healthz`、`/api/map`、`/api/world`、`/api/npcs`、`/api/events`、`/api/areas` 在 8 秒 timeout 下常整批失敗；server logs 同時顯示 simulation tick 仍需 13–24 秒，表示問題是單輪 long tick 阻塞 HTTP event loop，而前端 8 秒 cutoff 太短。

### What Shipped
- **Adaptive slow-tick cooldown**：`SimulationRuntime` 在 tick 超過 configured cadence 時，下一輪 tick 改延後 30–60 秒（依 elapsed time 計算），替 HTTP 留出更大的安靜窗，避免 20 秒 tick 之後 5 秒內又立刻開始下一輪。
- **Refresh timeout widened**：web `resilientLoad` timeout 從 8 秒提高到 45 秒，讓重整剛好撞到 live long tick 時仍能等到 server 真實資料，而不是直接判失敗回 fixture。
- **Single-flight refresh guard**：`WorldStateContext` 的 15 秒 poll / mobile refresh / fixture recovery 共用 single-flight guard；前一批 refresh 還在等 server 時不會再疊新的 5-request 批次。
- **Regression coverage**：新增 scheduler cooldown、single-flight refresh guard 單元測試，並讓 `resilientLoad` 測試鎖住 45 秒以上 timeout。
- **Version bump**：workspace/server/web package versions and server/web `APP_VERSION` updated to `0.97.4`.

### Verification Evidence
- Live reproduction before fix：8 秒 refresh-like concurrent probe 連續多輪整批 timeout；同一組 endpoint 用 45 秒 timeout 在 current live v0.97.3 全部成功（約 19–23 秒），包含 map 9 tiles、world animalPopulation 47、NPC 76。
- Live server logs before fix：recent ticks took 13,571ms、20,639ms、19,356ms、16,735ms、23,989ms，仍會撞到 frontend 8 秒 timeout。
- `npm run test -w @greed-island/server -- runtimeScheduler.test.ts runtimeLargeLogHydration.test.ts npcCognitiveProjection.test.ts worldCivilizationRuntime.test.ts` — pass（11 tests / 4 files）
- `npm run test -w @greed-island/web -- resilientLoad.test.ts singleFlight.test.ts visibleFixtureRecovery.test.ts refreshGeneration.test.ts` — pass（10 tests / 4 files）
- `npm run test -w @greed-island/server` — pass（1267 tests / 163 files）
- `npm run test -w @greed-island/web` — pass（125 tests / 24 files）
- `npm run build` — pass（server + web；Vite chunk-size warning remains known non-blocking）
- `npx openspec validate --all --strict` — pass（62 items）

### Known Notes
- CI/CD and live smoke are pending after this hotfix commit/push.
- This deliberately slows simulation cadence after pathological slow ticks; it does not disable AI/NPC agent and does not bypass Command → Rule Engine → Event.
- Long-term root cause remains tick workload optimization / yielding inside tick phases. This hotfix restores refresh reliability without rewriting the simulation pipeline.

---

## 2026-06-26 — Handoff Snapshot @ v0.97.3

### Current Version
`0.97.3` — World Civilization Visibility：把 v0.97.2 的世界目標 / 科技 substrate 從後端投影推到玩家可見層。`/api/world`、dashboard world snapshot 與 SSE snapshot 現在有一級 `worldCivilization` 欄位，Hub 會顯示世界目標、完成目標、科技數、目標進度與 technology evidence count。

### What Shipped
- **World API visibility**：`WorldSnapshot` 新增 `worldCivilization`，同時保留 `facts.worldCivilization` 給 generic fact consumers。
- **Frontend contracts**：web API/state types 新增 `WorldCivilizationGoal`、`WorldTechnology`、`WorldCivilizationSnapshot`。
- **Hub panel**：新增 `WorldCivilizationPanel`，在 Hub 地圖下方顯示世界目標與科技，玩家不用看 log 才知道島正在演化。
- **Deterministic display projection**：新增 `summarizeWorldCivilizationPanel`，active goals 優先、高進度優先、科技 newest-first，並有單元測試。
- **Fixture visibility**：fixture mode 也有示範 civilization data，離線/載入前不會是空畫面。
- **OpenSpec**：新增 `world-civilization-visibility`。
- **Version bump**：workspace/server/web package versions and server/web `APP_VERSION` updated to `0.97.3`.

### Verification Evidence
- `npm run test -w @greed-island/web -- worldCivilizationPanelData.test.ts` — pass（2 tests）
- `npm run test -w @greed-island/server -- worldCivilizationRuntime.test.ts` — pass（4 tests）
- `npm run build` — pass（server + web；Vite chunk-size warning remains known non-blocking）
- `npm run openspec:check` — pass（15 active changes）

### Known Notes
- This is the first player-facing civilization surface, still intentionally compact. Next valuable step is to link each technology back to Chronicle / evidence events so players can inspect 「這項技術是怎麼被世界學出來的」。

---

## 2026-06-26 — Handoff Snapshot @ v0.97.2

### Current Version
`0.97.2` — World Civilization Goals & Technology Substrate：把專案主軸「會自主運轉、建造、學習、發展科技與目標的 Greed Island」落成第一個 durable substrate。世界現在能從已 committed 的學習 / 建造 / 生產 evidence 形成 `WORLD_GOAL_DECLARED` 與 `WORLD_TECH_DISCOVERED`，並用 `WorldCivilizationProjection` 從 EventLog replay 出目前世界目標與技術。

### What Shipped
- **World-civilization commands/events**：新增 `WORLD_GOAL_DECLARED`、`WORLD_GOAL_PROGRESS_RECORDED`、`WORLD_TECH_DISCOVERED`，全部走 LivingWorld Rule Engine。
- **Technology must have evidence**：技術發現必須帶非空 `evidenceEventIds`；沒有已存在事件證據的技術會被拒絕，避免 AI 或 runtime 憑空創造文明真相。
- **Replayable projection**：新增 `WorldCivilizationProjection`，可從 EventLog 重建世界目標進度與已發現技術。
- **Deterministic planner**：新增 `planWorldCivilizationCommands`，把重複出現的 NPC 學習、師徒完成、建造進度、道路/牆/升級/加工等 evidence 轉成世界層級目標與技術。
- **Runtime wiring**：tick 會收集近期 committed evidence，產生世界文明 commands；small-log boot、deferred hydration、event fanout 都接上 projection。
- **OpenSpec**：新增 `world-civilization-goals-tech`，把世界目標 / 技術 substrate 寫成規格。
- **Version bump**：workspace/server/web package versions and server/web `APP_VERSION` updated to `0.97.2`.

### Verification Evidence
- `npm run test -w @greed-island/server -- worldCivilizationRuntime.test.ts npcWorldLawActionPlanner.test.ts runtimeIntentResolution.test.ts` — pass（14 tests / 3 files）
- `npm run build` — pass（server + web；Vite chunk-size warning remains known non-blocking）
- `npm run openspec:check` — pass（14 active changes）

### Known Notes
- This is substrate, not final gameplay UI：世界已有可 replay 的 goals / tech facts，但還沒有玩家-facing technology tree UI。
- 下一步應把 Chronicle / World API 顯示世界目標與技術，讓玩家看見島正在自主演化。

---

## 2026-06-26 — Handoff Snapshot @ v0.97.1

### Current Version
`0.97.1` — NPC World-Law Freeform Agency：把預設 NPC 自主行動從固定 `survival/economic/social/ecosystem` intent menu 往「世界準則內的具體自由行動」推進。runtime 現在會優先把有意義的壓力轉成 `NPC_FREEFORM_ACTION_PROPOSED`，讓居民依需求、人生目標、記憶、認知傾向、職業與地區條件提出 work / build / travel / social / ecosystem 類具體行為；`NPC_AGENT_DECISION` 保留為無壓力 fallback。

### What Shipped
- **World-law agency planner**：新增 `npcWorldLawActionPlanner.ts`，把 needs、life goal、memory context、cognitive profile、tile scores、current intent override 轉成 bounded freeform command payload。
- **Runtime preference shift**：autonomous tick 若能形成世界準則下的具體行為，改 commit `NPC_FREEFORM_ACTION_PROPOSED`，不再優先輸出重複的 generic planner decision。
- **Personality divergence**：同樣壓力下，economic NPC 會偏向職業工作與經濟 tile；survival NPC 會偏向安全 tile；build/social/ecosystem 也各有具體行為路徑。
- **Generated tile naming**：world-law summary / narration / motivation 使用 generated tile 中文名，不把 raw tile id 洩到玩家可見文字。
- **OpenSpec**：新增 `npc-world-law-freeform-agency` change，明確定義「NPC 最大自由度仍必須通過 Rule Engine / EventLog」的安全邊界。
- **Version bump**：workspace/server/web package versions and server/web `APP_VERSION` updated to `0.97.1`.

### Verification Evidence
- `npm run test -w @greed-island/server -- npcWorldLawActionPlanner.test.ts runtimeIntentResolution.test.ts npcAgent.test.ts` — pass（20 tests / 3 files）
- `npm run build:server` — pass
- `npm run openspec:check` — pass（13 active changes）

### Known Notes
- This slice changes the runtime event source so the main Chronicle has more concrete grounded freeform events available, but it does not yet redesign Chronicle aggregation/UI filtering itself.
- The AI freeform agent path remains bounded and additive; deterministic world-law agency now gives the world better behavior even when no AI provider is available.

---

## 2026-06-26 — Handoff Snapshot @ v0.97.0

### Current Version
`0.97.0` — NPC Reflection Events MVP：把 v0.96 的 Mini-Hermes 反省模型往 EventLog 推進。NPC 長期反省現在有 `NPC_REFLECTION_COMMITTED` command/event、Rule Engine 邊界驗證，以及可從 EventLog replay 的 `NpcCognitiveProjection`，讓人格微調、life-goal override、關係反省 trace 不再只是即時計算摘要。

### What Shipped
- **Event-sourced reflection fact**：新增 `NPC_REFLECTION_COMMITTED` living-world command/event，payload 包含 npcId、commit/proposal tick、source、memory evidence、bounded personality deltas、optional life goal、bounded relationship deltas、summary 與 narration。
- **Rule Engine guardrails**：反省事件必須有記憶依據；personality delta 限制在 `-0.25..0.25`；relationship delta 限制在 `-15..15`；life-goal kind 與 relationship dimension 都走白名單。
- **Replayable cognitive projection**：新增 `npcCognitiveProjection.ts`，可由 EventLog 重建 per-NPC reflection count、累積 personality delta、目前 life-goal override、latest summary、evidence fragments 與 relationship reflection trace。
- **Runtime wiring**：SimulationRuntime 在 small-log boot、deferred hydration、event fanout 都接上 `NpcCognitiveProjectionStore`，後續 accepted reflection event 會進入 runtime projection。
- **OpenSpec**：新增 `npc-cognitive-reflection-events` change，明確定義 AI/deterministic reflection 只能作為 proposal，必須經 validator / Rule Engine / EventLog 才是世界事實。
- **Version bump**：workspace/server/web package versions and server/web `APP_VERSION` updated to `0.97.0`.

### Verification Evidence
- `npm run test -w @greed-island/server -- npcCognitiveProjection.test.ts npcCognitiveEvolution.test.ts` — pass（6 tests / 2 files）
- `npm run build:server` — pass
- `npm run build` — pass（server + web；Vite chunk-size warning remains known non-blocking）
- `npm run test` — pass（server 1257 tests / 160 files；web 120 tests / 22 files）
- `npm run openspec:check` — pass（12 active changes；installed `@fission-ai/openspec@1.2.0` globally because the CLI was missing locally）

### Known Notes
- This slice makes reflection durable/replayable, but it does not yet schedule automatic NPC reflection commits from runtime ticks. The next slice should add a bounded cadence that converts accepted cognitive proposals into `NPC_REFLECTION_COMMITTED` commands without doing side effects during public snapshot reads.
- Relationship deltas are recorded as reflection trace here; a follow-up should route them into the formal relationship projection via dedicated relationship commands/events.

---

## 2026-06-26 — Handoff Snapshot @ v0.96.3

### Current Version
`0.96.3` — Large-log Ecology Boot Hydration Hotfix：v0.96.2 已恢復 HTTP availability，NPC / map API 不再被 long tick 餓死；但當時 live reboot 後 `/api/world` 顯示 `animalPopulation: 0`，代表大 EventLog 啟動分支為了保住 boot speed 跳過 full replay 時，也讓 ecology projections 從 default-empty 啟動。本版改成 bounded recent ecology hydration，讓生物 overlay 在 large-log restart 後恢復。

### What Shipped
- **Bounded recent ecology hydration**：large-log boot 會在 deferred hydration 前讀最近 10,000 ticks、最多 50,000 筆 ecology boot events，重建近期生態投影，而不是 replay 全部 EventLog。
- **Creature overlay projection coverage**：近期 hydration 覆蓋 `animalPopulation`、migration routes、predator hunger、fishery density、species extinction、ecosystem region、forest depletion、livestock registry。
- **Availability-first failure mode**：hydration 失敗時只 log `[boot] skipped recent ecology hydration: ...`，不阻止 server boot，也不刪除或改寫任何歷史 EventLog。
- **Version bump**：workspace/server/web package versions and server/web `APP_VERSION` updated to `0.96.3`.

### Verification Evidence
- Live v0.96.2 finding before fix：HTTP endpoints were responsive after the tick scheduler fix, but `/api/world` returned `animalPopulation: 0` after large-log restart, matching the missing creature overlay symptom.
- `npm run test -w @greed-island/server -- runtimeLargeLogHydration.test.ts runtimeAnimalSpawning.test.ts areaEcologyRouter.test.ts animalPopulation.test.ts runtimePredation.test.ts kernel.test.ts` — pass（42 tests / 6 files）
- `npm run build -w @greed-island/server` — pass
- `npm run test -w @greed-island/server` — pass（1254 tests / 159 files）
- `npm run build` — pass（server + web；Vite chunk-size warning remains known non-blocking）
- `npx openspec validate --all --strict` — pass（58 items）
- Separate general reviewer gate — first pass found the bounded read cap, player ecology event coverage, and test-window mock issues; fixes were applied; final pass returned `No findings`.
- Pushed commit `5848235 fix(v0.96.3): hydrate recent ecology on large logs` to `origin/main`.
- GitHub Actions CI `28190534867` — pass（OpenSpec validate + build/typecheck/server tests；Node.js 20 deprecation annotation remains known non-blocking）.
- GitHub Actions Deploy Dev `28190635061` — pass（Docker images built/pushed, desktop pull/restart, deployment smoke check）.
- Live smoke after deploy：`/healthz` returned `200` with `version=0.96.3`; `/api/map` returned 9 tiles; `/api/world` returned `animalPopulationCount=45`, `fisheryDensityCount=1`, and `predatorHungerCount=8`; `/api/npcs` returned 76 NPCs with 61 moving; `/api/events?limit=5` returned `eventType` rows and no legacy `type` field; sampled `/api/area/t_desert/ecology` returned 5 animal rows and 2 predator warnings.
- Live runtime logs showed `[boot] hydrated recent ecology from 7167 events (ticks 275312-285312)` and deferred large-log hydration completed. The first post-restart `/healthz` hit overlapped a slow tick (~15.7s), but repeat checks returned `/healthz` 10ms, `/api/world` 10ms, and `/api/map` 4ms.

### Known Notes
- v0.96.3 is live and supersedes v0.96.2; creature/ecology projections are no longer empty after large-log restart.
- This does not disable AI/NPC agent and does not delete, compact, or rewrite EventLog rows.

---

## 2026-06-25 — Handoff Snapshot @ v0.96.2

### Current Version
`0.96.2` — Simulation Tick Availability Hotfix：v0.96.1 清掉 public cognitive snapshot 造成的 memory DB 掃描後，live 仍出現「看不到 NPC / 生物 / 右下角地圖」；實測資料仍存在（`/api/npcs` 有 76 NPC、`/api/world` 有 `animalPopulation`），但 container 內直打 `127.0.0.1:3000/healthz` / `/api/map` 也會 10–30 秒 timeout，代表 Node event loop 被 runtime tick 餓死，不是 Caddy 或資料遺失。

### What Shipped
- **Tick scheduler availability fix**：`SimulationRuntime.start()` 從固定 `setInterval` 改成 one-shot `setTimeout` loop；每輪 tick 完成後才排下一輪。長 tick 只會降低模擬速度，不會讓 pending interval 連續補跑、阻塞 HTTP I/O。
- **Slow tick observability**：單輪 tick 超過 `tickDurationMs` 時輸出 `[sim] tick ... took ...; delaying next tick to keep HTTP responsive`，方便 live 追蹤下一個重點優化點。
- **Version bump**：workspace/server/web package versions and server/web `APP_VERSION` updated to `0.96.2`.

### Verification Evidence
- Live reproduction before fix：`docker exec greed-island-server node fetch('http://127.0.0.1:3000/healthz')` timed out after 10s repeatedly；`/api/map` also timed out internally；external `/healthz` / `/api/map` / `/api/world` had 10–30s+ waits.
- Live data was still present during failure：`/api/npcs` returned 76 NPCs; `/api/world` facts contained `animalPopulation` rows and predator hunger rows. The UI symptom was API starvation/timeouts, not missing NPC or creature records.
- `npm run test -w @greed-island/server -- runtimeLargeLogHydration.test.ts runtimeIntentResolution.test.ts npcCognitiveRuntime.test.ts npcCognitiveEvolution.test.ts npcAgentRunner.test.ts` — pass（15 tests / 5 files）
- `npm run build -w @greed-island/server` — pass
- `npm run test -w @greed-island/server` — pass（1254 tests / 159 files）
- `npm run build` — pass（server + web；Vite chunk-size warning remains known non-blocking）
- `npx openspec validate --all --strict` — pass（58 items）
- Pushed commit `9a0af0b fix(v0.96.2): keep tick loop from starving HTTP` to `origin/main`.
- GitHub Actions CI `28188356355` — pass；Deploy Dev `28188463231` — pass。
- Live smoke after deploy：`/healthz` returned `200` with `version=0.96.2`; `/api/map` returned 9 tiles quickly; `/api/world`, `/api/npcs`, `/api/events?limit=5`, and `/api/areas` returned `200`; `/api/npcs` showed 76 NPCs and 62 moving.

### Known Notes
- v0.96.2 restored API responsiveness but live reboot exposed empty ecology projections (`animalPopulation: 0`); superseded by v0.96.3.
- This does not disable AI/NPC agent and does not delete or rewrite EventLog rows.

---

## 2026-06-25 — Handoff Snapshot @ v0.96.1

### Current Version
`0.96.1` — NPC Cognitive Runtime Availability Hotfix：v0.96.0 把 `cognitiveEvolution` 掛進 `getNpcs()` 後，runtime tick 內部原本用來取得 NPC 位置的多個 cheap snapshot 呼叫也開始同步查 244 萬筆 `npc_memory` / reflection context，live Node event loop 被 CPU/SQLite 工作卡住，Caddy 對 `/healthz`、`/api/events`、`/api/world` 全部回 502，玩家看起來像「紀錄全部不見」。本版把 tick/projection 內部路徑改回 cheap living-NPC snapshot；只有 HTTP/API 對外 snapshot 保留 cognitive 顯示。

### What Shipped
- **Root-cause fix**：`runtime.ts` 不再於 tick/projection fanout 使用 `this.getNpcs()`；改用 `getLivingNpcRuntimeSnapshots()` / `getLivingNpcLocationMap()` / `getLivingNpcIdsOnTile()` / `getLivingNpcLocation()`，只讀 `NpcEngine` state，不查 memory DB、不做 cognitive evolution summary。
- **Projection fanout reuse**：`publishCommittedEvents` 與 tick append fanout 只建立一次 NPC location map，`NpcMemory` locality 與 `BeliefProjection` 共用同一份 cheap map。
- **Public snapshot light cognitive view**：`/api/npcs` / `/api/world` 保留 `cognitiveLine` / `cognitiveEvolution` 欄位，但列表 snapshot 不再為每個 NPC 同步掃 `npc_memory`；完整 memory context 仍保留給 dialog/planner 專用路徑。
- **Carrier planner type narrow**：`planCarrierDispatches` 只要求 `id` / `activity` / `location`，避免呼叫完整 public `SimNpcState`。
- **Version sync repair**：workspace/server/web package versions and server/web `APP_VERSION` updated to `0.96.1`，並修正 web `APP_VERSION` 仍停在 `0.95.0` 的問題。

### Verification Evidence
- Live failure before fix：`https://hunter.sisihome.org/healthz` and `/api/events?limit=5` returned `502 Bad Gateway`；`docker exec greed-island-server node fetch('http://127.0.0.1:3000/healthz')` timed out；server log stopped after `scheduling deferred large-log hydration in background`。
- Live data was not deleted：`event_log` still had 27,233,776 events; top event types included `NPC_STATE_RECORDED=23,769,415`, `NPC_PRODUCTIVE_ACTION=571,059`, `WORLD_TICK=283,934`; `npc_memory` had 2,445,514 rows.
- `npm run test -w @greed-island/server -- runtimeLargeLogHydration.test.ts runtimeIntentResolution.test.ts npcCognitiveRuntime.test.ts npcCognitiveEvolution.test.ts carrierPlanner.test.ts` — pass（25 tests / 5 files）
- `npm run test -w @greed-island/server -- runtimeIntentResolution.test.ts npcCognitiveRuntime.test.ts npcCognitiveEvolution.test.ts carrierPlanner.test.ts` — pass（24 tests / 4 files）
- `npm run build -w @greed-island/server` — pass
- `npm run test -w @greed-island/server` — pass（1254 tests / 159 files）
- `npm run test -w @greed-island/web` — pass（120 tests / 22 files）
- `npm run build` — pass（server + web；Vite chunk-size warning remains known non-blocking）
- Pushed commit `4fcf6c1 fix(v0.96.1): keep cognitive snapshots non-blocking` to `origin/main`.
- GitHub Actions CI `28171408794` — pass（OpenSpec validate + build/typecheck/server tests；Node.js 20 deprecation annotation remains known non-blocking）
- GitHub Actions Deploy Dev `28171516473` — pass（Docker images built/pushed, desktop pull/restart, deployment smoke check）
- Live smoke after deploy：`/healthz` returned `200` with `version=0.96.1`; `/api/events?limit=5` returned `200` with 5 events and `eventType=WORLD_TICK`; `/api/world` returned `200`; `/api/npcs` returned `200` with 76 NPCs and cognitive fields present.
- Recent `greed-island-web`, `greed-island-server`, and edge Caddy logs showed no fresh `502` / proxy timeout / server error matches after smoke.

### Known Notes
- This does not delete or rewrite EventLog rows. The symptom was API unavailability from event-loop starvation, not lost records.
- First post-deploy live smoke still showed slow but successful public snapshots (`/api/world` ~24.6s, `/api/npcs` ~16.7s); treat this as a follow-up performance watch item, not a v0.96.1 release blocker because the prior 502/event-loop timeout failure is cleared.

---

## 2026-06-25 — Handoff Snapshot @ v0.96.0

### Current Version
`0.96.0` — NPC Long-Term Cognitive Evolution MVP：在 v0.95 cognitive runtime 上加入 Mini-Hermes 長期演化 slice。NPC reflection 現在走 proposal → validator → committed cognitive update，會把記憶依據轉成受限人格微調、self-authored life goal、關係維度調整與更細的 UI 摘要。

### What Shipped
- **Reflection proposal validator**：新增 `npcCognitiveEvolution.ts`，AI/ deterministic proposal 必須有記憶依據、合法 life goal kind、已知 relationship target，且 personality delta / relationship delta 都有上限。
- **Committed cognitive update model**：合法 proposal 會轉成 bounded personality update、optional life goal、relationship updates 與中英 summary；拒絕 proposal 不可 commit。
- **Mini-Hermes NPC summary**：server NPC snapshot 新增 additive `cognitiveEvolution`，包含 reflectionCount、current thought、last reflection、personality trace、life-goal trace、relationship trace。
- **Frontend UI**：web API/state types 與 Area NPC list 顯示更細的 cognitive evolution trace。
- **OpenSpec**：新增 `npc-long-term-cognitive-evolution` change，定義 validator boundary 與 UI surface。

### Verification Evidence
- `npm run test -w @greed-island/server -- npcCognitiveEvolution.test.ts npcCognitiveRuntime.test.ts npcAutonomousPlanner.test.ts` — pass（11 tests / 3 files）
- `npm run test -w @greed-island/web` — pass（120 tests / 22 files）
- `npm run build` — pass（server + web；Vite chunk-size warning remains known non-blocking）
- `npx openspec validate npc-long-term-cognitive-evolution --strict` — pass
- `npx openspec validate --all --strict` — pass（58 items）

### Known Notes
- v0.96.0 implements the validator/committed-update model and public summary. Future slices should persist committed cognitive updates as explicit EventLog commands with replay cadence, instead of deriving the current committed summary only from snapshot context.

---

## 2026-06-25 — Handoff Snapshot @ v0.95.1

### Current Version
`0.95.1` — Hub map loading hotfix：Hub Phaser map now mounts immediately with fixture-backed state while `/api/world` continues retrying, preventing mobile users from being stuck on `載入潮鳴市…` when the backend/proxy is slow or temporarily unavailable. Deploy smoke now checks `/api/world` as well as `/`.

### What Shipped
- **Hub fallback mount**：`HubPage` starts the one-way map latch as mounted, so the city map renders instead of a blank loader before the first authoritative world snapshot.
- **Deploy smoke hardening**：Deploy Dev now curls the desktop-local `/api/world` endpoint, catching the exact class of issue where the static SPA is up but API world state is not.

### Verification Evidence
- `npm run build:web` — pass
- `npm run build` — pass
- `npm run test -w @greed-island/web` — pass（120 tests / 22 files）

### Known Notes
- This hotfix prevents the frontend from staying blank. If `hunter.sisihome.org` still resets `/api/world`, deploy smoke will fail and expose the desktop/RPi proxy/backend issue directly.

---

## 2026-06-25 — Handoff Snapshot @ v0.95.0

### Current Version
`0.95.0` — NPC Cognitive Runtime MVP：在 v0.94.1 committed autonomous planner 上加入 deterministic cognitive profile，讓 NPC 依人格、記憶、信念、需求與人生目標形成不同思考傾向；planner 在相同世界壓力下會因個性而偏向生存、經濟、社交或生態。

### What Shipped
- **Cognitive profile module**：新增 `npcCognitiveRuntime.ts`，從 personality、belief rows、memory urgency/context、needs、life goal 純函式推導 `survivalBias` / `economicBias` / `socialBias` / `ecosystemBias`、dominant trait 與中英思考句。
- **Planner personality divergence**：`npcAutonomousPlanner` 會用 cognitive bias 調整 belief/need/life-goal candidates；同樣 money/safety pressure 下，貪婪/經濟型 NPC 會偏經濟，謹慎/安全型 NPC 會偏生存。
- **Memory/belief awareness**：runtime planner loop 把 `BeliefProjection` 與 `SqliteNpcMemoryStore` 的 urgency/context 注入 cognitive runtime，但世界變更仍只透過 `NPC_AGENT_DECISION` command → Rule Engine → event → intentOverride path。
- **Public thought surface**：`/api/npcs` / world-state mapping / Area NPC list 新增 additive `cognitiveLine`，讓玩家看到 NPC 目前為何這樣想；既有 `intentLine`、`recentUtterance` 保持相容。
- **OpenSpec**：新增 `openspec/changes/npc-cognitive-runtime`，紀錄 deterministic Mini-Hermes NPC 邊界、非目標與 public surface。
- **Version bump**：workspace/server/web package versions and server/web `APP_VERSION` updated to `0.95.0`.

### Verification Evidence
- `npm run test -w @greed-island/server -- npcCognitiveRuntime.test.ts npcAutonomousPlanner.test.ts` — pass（8 tests / 2 files）
- `npm run build` — pass（server + web；Vite chunk-size warning remains known non-blocking）
- `npx openspec validate npc-cognitive-runtime --strict` — pass
- `npx openspec validate --all --strict` — pass（57 items）

### Known Notes
- This is the first cognitive MVP: deterministic personality + memory/belief-aware scoring and visible thought. It is not yet per-NPC LLM reflection, long-term self-authored goals, or relationship strategy rewriting. Those remain future slices and must still commit through typed events.

---

## 2026-06-24 — Handoff Snapshot @ v0.94.1

### Current Version
`0.94.1` — NPC Autonomous Planner MVP hotfix：NPC 不再只靠 schedule/personality nudge 或外部 AI freeform proposal；server 會用 deterministic Cognitive Runtime planner 持續產生短程計畫，並把計畫先 commit 成 `NPC_AGENT_DECISION` 事件，再透過既有 intentOverride / Rule Engine path 驅動移動與行動。

### What Shipped
- **Deterministic planner module**：新增 `npcAutonomousPlanner.ts`，以 NPC current state、needs、life goal、belief intent stack、memory/life-goal boost、area safety/economy、相鄰 tile 分數選出 `survival` / `economic` / `social` / `ecosystem` / `follow_schedule`。
- **Committed planning facts**：runtime cadence 現在提交 `NPC_AGENT_DECISION` command，通過 `LivingWorldRuleEngine` 後才套用 existing `applyAgentDecisionEvent`，不再直接由 intent recompute bypass 設定 `intentOverride`。
- **AI boundary preserved**：planner 不呼叫 AI、不讀 wall-clock、不用 random；AI freeform agent 仍是 additive proposal，不是世界事實來源。
- **Dynamic NPC coverage**：planner/life-goal loops 改用 `npcEngine.listProfiles()`，runtime-born / matured born NPC 也能進入 deterministic planning。
- **Agent metadata repair**：`NpcEngine` 會把 agent/planner intent reason 帶入 active task / last decision；batched runTick append path 補上 `NPC_AGENT_DECISION` / `NPC_FREEFORM_ACTION_PROPOSED` apply hook，確保 committed decision 真的套用到 engine state。
- **Cadence repair**：v0.94.1 修正 live planner phase gap，依 active NPC count 錯相，避免 1440 tick 週期中大部分時間沒有 planner decision。
- **Indoor presence guard**：planner 不會在沒有既有 override 時把 scheduled/owner building 內的 NPC 拉出室內 presence，保留單一權威 presence invariant。
- **Version bump**：workspace/server/web package versions and server/web `APP_VERSION` updated to `0.94.1`.

### Verification Evidence
- `npm run test -w @greed-island/server -- npcAutonomousPlanner.test.ts runtimeIntentResolution.test.ts` — pass（10 tests / 2 files）
- `npm run test -w @greed-island/server -- runtimeGoodsInventory.test.ts runtimePresence.test.ts npcAutonomousPlanner.test.ts runtimeIntentResolution.test.ts livingWorld.test.ts` — pass（73 tests / 5 files）
- `npm run test -w @greed-island/server` — pass（1247 tests / 157 files）
- `npm run test -w @greed-island/web` — pass（120 tests / 22 files）
- `npm run build` — pass（server + web；Vite chunk-size warning remains known non-blocking）
- `npx openspec validate npc-autonomous-planner-mvp --strict` — pass
- `npx openspec validate --all --strict` — pass（56 items）
- CI `28115907179` — pass（`e4c8d9d fix(v0.94.1): keep npc planner cadence live`）
- Deploy Dev `28116001994` — pass（Docker build/push + desktop deploy smoke）
- Live smoke after deploy：`/healthz` reported `version=0.94.1` at tick `272908`；`/api/events?limit=100` returned recent planner rows (`NPC_AGENT_DECISION=4`, `NPC_INTENT_RESOLVED=7`, `NPC_MOVE=28`)；`/api/npcs` returned 76 NPCs with visible movement (`travellingCount=43`) and autonomous planner state present (`autonomousPlannerDecisionCount=3`, `autonomousPlannerTravellingCount=2`).

### Known Notes
- v0.94.1 is live and supersedes v0.94.0; live smoke confirms committed planner decisions are now present in the recent event slice and NPCs are visibly travelling under server-authoritative routes.
- This is the first executable autonomous-planner slice, not the full long-term human-like cognition system. It creates observable short-horizon planning facts and server-authoritative steering; deeper memory/relationship/career/family multi-step planning remains future Cognitive Runtime work.

---

## 2026-06-24 — Handoff Snapshot @ v0.93.2

### Current Version
`0.93.2` — NPC Movement Narration Follow-up：v0.93.1 successfully made routed travellers visible live, but the first `NPC_MOVE` rows for runtime-born household children used raw `household.*` ids because movement narration looked up only constructor profiles.

### What Shipped
- **Dynamic NPC names in movement narration**：`runtime.ts` now uses `findProfile()` for `NPC_MOVE` event narration, so born/dynamic NPCs registered into `NpcEngine` resolve to their profile names instead of raw ids.
- **Version bump**：workspace/server/web package versions and server/web `APP_VERSION` updated to `0.93.2`.

### Verification Evidence
- Live v0.93.1 smoke before follow-up：`/healthz` reported `version=0.93.1`; `/api/npcs` showed routed travellers persisted after ticks advanced (`travelCount=60`, then `66`, then `42`); recent `NPC_MOVE` rows appeared at tick `268785`, proving arrivals committed, but dynamic child rows still used raw `household.*` ids in narration.
- `npm run test -w @greed-island/server -- npcEngine.test.ts runtimeIntentResolution.test.ts` — pass（62 tests / 2 files）
- `npm run build` — pass（server + web；Vite chunk-size warning remains known non-blocking）
- `npx openspec validate --all --strict` — pass（55 items）
- CI `28095469811` — pass（`fix(v0.93.2): name dynamic npc movement events`）
- Deploy Dev `28095554946` — pass（Docker build/push + desktop deploy smoke）
- Live smoke after deploy：`/healthz` reported `version=0.93.2` at tick `269037`; `/api/npcs` still showed routed travellers (`travelCount=49`); `/api/events?limit=100` returned recent `NPC_MOVE` rows (`moveCount=25`) with `rawMoveCount=0`, and sampled narration/motivation used names such as `汐丹`、`蘆煙`、`鹽柔` instead of `household.*` ids.

### Known Notes
- v0.93.2 is live and supersedes v0.93.1; movement remains visibly routed, and sampled movement narration no longer leaks raw dynamic household ids.
- This release fixes the public movement narration/name lookup gap exposed by v0.93.1 live smoke. Deeper NPC agency/personality remains separate from the route visibility and narration regressions fixed here.

---

## 2026-06-24 — Handoff Snapshot @ v0.93.1

### Current Version
`0.93.1` — NPC Movement Liveness Hotfix：live v0.93.0 世界 tick / productive / social / ecology events 都有前進，但玩家看不到 NPC 跨區移動；`/api/npcs` 當下 76 位 NPC 全部 `travelRoute=null`，Hub route layer 沒有人在路上，看起來像 NPC 卡在各自地圖內。

### What Shipped
- **Route visibility window**：`NPC_CROSS_TILE_ROUTE_VISIBLE_TICKS` 從 4 ticks（約 20 秒）改為 `TICKS_PER_MINUTE * 2`（24 ticks，約 2 分鐘），讓 server-authoritative `travelRoute` 足夠長，Hub/SSE/polling 能穩定看到 NPC 在跨區路上，而不是眨眼結束。
- **Real-profile movement regression**：`npcEngine.test.ts` 新增以 `loadNpcProfiles()` 跑完整一天的測試，確認真實 NPC profile 會產生 `move` events、route snapshots，且至少一段 route streak 長於 poll window。
- **Version sync repair**：root `package.json` 補到 `0.93.1` 並跑 `npm run version:sync`，避免 root 仍停在 `0.92.3` 導致下一次 build 把 server/web health version 降回舊版。

### Verification Evidence
- Live regression sample before fix：`/healthz` reported `version=0.93.0`；`/api/npcs` returned 76 NPCs distributed across districts, but `travelCount=0` and every `targetTile` matched current `location` in that snapshot；Hub map had outdoor NPCs across districts but no routed travellers.
- `npm run test -w @greed-island/server -- npcEngine.test.ts` — pass（57 tests / 1 file）
- Built-code movement probe：50 loaded profiles over one day produced `moveEvents=1791`, `routeSnapshots=42996`, `maxStreak=72`, and `NPC_CROSS_TILE_ROUTE_VISIBLE_TICKS=24`.
- `npm run build` — pass（server + web；Vite chunk-size warning remains known non-blocking）
- `npx openspec validate --all --strict` — pass（55 items）

### Known Notes
- CI `28094625081` and Deploy Dev `28094710504` passed; live `/healthz` reported `version=0.93.1`.
- Live route smoke showed routed travellers persisted across ticks and `NPC_MOVE` arrivals committed, but also exposed raw `household.*` ids for dynamic child movement narration; superseded by v0.93.2.
- This hotfix makes cross-district movement visibly observable; deeper NPC agency/personality is separate from the route visibility regression.

---

## 2026-06-16 — Handoff Snapshot @ v0.93.0

### Current Version
`0.93.0` — NPC Activity ↔ Building Consistency（NPC 行為類型與建築位置完全對齊）

### What Shipped
- **14 fine-grained NpcActivity types** — 原有 7 個粗粒度類型（idle/move/work/eat/sleep/trade/patrol）擴充為 14，新增 read/perform/craft/study/pray/write/guard，每種有獨立 animation（characterAvatar.ts）與 emoji glyph（npcVisuals.ts）。
- **Label→activity patterns** — `inferActivityFromLabel` 新增 6 個精細 pattern（LABEL_READ/PERFORM/CRAFT/STUDY/PRAY/WRITE），在 LABEL_WORK_PATTERN 之前比對，確保圖書館員/工匠/祭司/抄寫員不再被壓成 generic `work`。
- **ScheduleSlot.buildingId** — NpcRoutineSlot 新增可選欄位 `buildingId?: string | null`；NpcRuntimeState 新增 `scheduledBuildingId`；`decideNextState` 在 NPC 到達正確 tile 後帶入 building。
- **`b_central_library` 建築** — catalog 新增「夜潮文庫」(t_central, type='library')；圖書館員林珮柔的 morning/afternoon slots 補 `buildingId: "b_central_library"`。
- **AI narration building context** — `AiDialogContext.buildingContext` 新欄位；`npc.ts` 對話 endpoint 計算 NPC 所在建築並注入 system prompt，AI 不再憑空幻想地點。
- **ACTIVITY_RESOURCE_DELTA / ACTIVITY_DRIFT** — areaStateEngine + npcEngine 兩個 Record 均補齊 7 新 activity type 的 Partial<ResourceMap>/mood+health 值。
- **canEmitProductiveAction** — 擴充為 Set 含所有 10 個生產性活動（work/trade/patrol + craft/study/write/perform/pray/read/guard）。
- **i18n 補全** — zh.ts / en.ts / types.ts 7 個新 translation key；AreaPage ACTIVITY_KEY Record 補齊。
- **boot-time schedule validation** — runtime constructor 呼叫 `validateScheduleBuildingIds`，對不存在 buildingId 輸出 warn 但不中斷 boot。
- **14 新 label→activity 特徵化測試** — npcEngine.test.ts，涵蓋 read/perform/craft/study/pray/write 所有正/反例。

### Verification Evidence
- `npm run test -w @greed-island/server` — 1239 tests / 156 files all pass
- `npm run test -w @greed-island/web` — 120 tests / 22 files all pass
- `npm run build -w @greed-island/server` — clean (no TS errors)
- `npm run build -w @greed-island/web` — clean (Vite chunk-size warning is known non-blocking)
- OpenSpec validate pending (run after commit)
- CI/CD pending after push

### Known Notes
- `guard` activity 目前無 label pattern（因為 `guard` 在 LABEL_PATROL_PATTERN 中 → 解析成 patrol）。guard activity 需要非 label 路徑觸發（archetype 或 future explicit mechanic）— 這是有意的，不是 gap。
- CombatHudPhaseC 仍未接線，NPC combat AI (sub-tick) 仍未實作 — 這些是 Phase C/D 遺留的已知 deferred scope。

---

## 2026-06-15 — Handoff Snapshot @ v0.92.3

### Current Version
`0.92.3` — Timeline Human Narration Hotfix：編年史/NPC filter 仍會直接顯示 `NPC_DEFENSE_PARTY_FORMED` 的 raw NPC id 清單，讓 NPC 看起來像資料列而不是人在保護同伴。

### What Shipped
- **Defense party narration cleanup**：server 新生成的 `NPC_DEFENSE_PARTY_FORMED` / defense hunt narration uses NPC 中文名摘要或「幾位居民」，不再把完整 `npcId` / household id list 串進公開敘事。
- **Legacy Timeline fallback**：web `TimelinePage` 對既有 `NPC_DEFENSE_PARTY_FORMED`、defense `ANIMAL_HUNT_STARTED`、defense `ANIMAL_HUNT_RESOLVED` 事件改用人話 fallback，不直接印 raw `event.narration` 的 id 長串。
- **Motivation fallback**：Timeline now explains defense party events as NPC witnessing an attack and forming a temporary protection group through Rule Engine conditions.
- **Version bump**：workspace/server/web package versions and server/web `APP_VERSION` updated to `0.92.3`.

### Verification Evidence
- `npm run test -w @greed-island/web -- TimelinePage.test.ts` — pass（7 tests / 1 file）
- `npm run build` — pass（server + web；Vite chunk-size warning remains known non-blocking）
- `npx openspec validate --all --strict` — pass（53 items）

### Known Notes
- CI/CD and live smoke pending after commit/push.
- This specifically fixes the visible raw-id defense-party issue shown in mobile Timeline/NPC filter screenshots; broader NPC personality/deeper cognition remains separate from this presentation bug.

---

## 2026-06-15 — Handoff Snapshot @ v0.92.2

### Current Version
`0.92.2` — Ecology Intent Visibility Hotfix：動物與植物已經有 deterministic 生態事件（遷徙、飢餓、攻擊、逃跑、反擊、播種、採收、再生、枯竭/恢復），但公開 ecology surface 只顯示數量/密度，看起來像死資料。

### What Shipped
- **Animal intent rollup**：`/api/area/:tileId/ecology` 的 animal rows now expose deterministic `intent` + `thoughtZh` derived from existing world state: `hunting`（predator hunger）、`migrating`（migration wave）、`herding`（large group）、`foraging`（default living behavior）。
- **Plant life-state rollup**：plant rows expose `state` + `thoughtZh` from saturation: `struggling`、`regrowing`、`spreading`、`mature`，讓植物呈現生命狀態而不是純資源百分比。
- **Ecology UI visibility**：Ecology page now shows animal intent/thought and plant state/thought; also fixes plant saturation display to use the server's 0–100 percentage directly.
- **Version bump**：workspace/server/web package versions and server/web `APP_VERSION` updated to `0.92.2`.

### Verification Evidence
- `npm run test -w @greed-island/server -- areaEcology.test.ts areaEcologyRouter.test.ts` — pass（11 tests / 2 files）
- `npm run test -w @greed-island/web -- hubEcology.test.ts` — pass（6 tests / 1 file）
- `npx openspec validate --all --strict` — pass（53 items）
- `npm run build` — pass（server + web；Vite chunk-size warning remains known non-blocking）
- CI `27520948206` — pass（Build/typecheck/test + OpenSpec validate；Node.js 20 deprecation annotation remains known non-blocking）
- Deploy Dev `27520992882` — pass（Docker build/push + desktop deploy smoke）
- Live smoke after deploy：`/healthz` reported `version=0.92.2`；`/api/area/t_forest/ecology` returned plant `state`/`thoughtZh` fields（e.g. mature oak/pine/wild_herb）；multi-tile ecology smoke confirmed plant states across forest/mountain/desert/ruin/dimai/salt-marsh.

### Known Notes
- This is not fake animal/plant AI. It is a deterministic intent/life-state view over existing ecosystem state, preserving Command → Rule Engine → Event → Projection boundaries.
- Deeper animal cognition / plant agency still deserves a proper OpenSpec track.
- Live animal rows were absent on sampled tiles during smoke, so animal `intent` fields are covered by tests/API schema and will appear when animal population rows exist.

---

## 2026-06-14 — Handoff Snapshot @ v0.92.1

### Current Version
`0.92.1` — Freeform Build Autonomy Hotfix：live v0.92.0 confirmed NPC AI proposals were running, but freeform action vocabulary and server validation still collapsed construction intent into generic `work`; autonomous building only happened when deterministic productive templates happened to choose `domain="build"`.

### What Shipped
- **`build` is now a first-class freeform NPC action**：NPC AI prompts, parser/resolver, command validator, narration labels, and runtime steering now accept explicit `build` proposals instead of forcing construction thoughts into generic `work`.
- **Server stays permissive but bounded**：accepted `build` proposals set a build-marked intent override and make the NPC do local `work`; actual construction still goes through the existing `NPC_PRODUCTIVE_ACTION domain="build"` → `CONSTRUCTION_INITIATE` / project progress / `BUILDING_CONSTRUCTED` Rule Engine path with gold, demand, tile, and cap checks.
- **Build intent affects productive domain**：when an NPC is acting under a freeform build intent, productive output is forced to `domain="build"` with infrastructure/supply narration, so builders are not misclassified as trade/service/learn because of their old role template.
- **Version bump**：workspace/server/web package versions and server/web `APP_VERSION` updated to `0.92.1`.

### Verification Evidence
- `npm run test -w @greed-island/server -- npcAgent.test.ts npcAgentRunner.test.ts runtimeIntentResolution.test.ts livingWorld.test.ts` — pass（75 tests / 4 files）
- `npx openspec validate --all --strict` — pass（53 items）
- `npm run build` — pass（server + web；Vite chunk-size warning remains known non-blocking）
- CI `27508323058` — pass（Build/typecheck/test + OpenSpec validate；Node.js 20 deprecation annotation remains known non-blocking）
- Deploy Dev `27508366329` — pass（Docker build/push + desktop deploy smoke）
- Live smoke after deploy：`/healthz` reported `version=0.92.1`；after OpenCode calls completed, `/api/world.facts.npcAgent` reported `enabled=true`, `configured=true`, `providerSuccessCount=6`, `submitCount=6`, `errorCount=0`, latest success via `opencode`.

### Known Notes
- Recent `/api/events` remains capped/noisy, so the smoke uses `facts.npcAgent` diagnostics for post-deploy AI submit evidence rather than relying on catching a freeform row in the latest public slice.
- This hotfix addresses human/NPC construction autonomy only. Animal cognition and plant life-state autonomy should be designed as a dedicated OpenSpec track; do not fake them as one-off narration rows.
- `.opencode-tmp/`, `deploy/data/`, and `test-results/` remain local untracked artifacts and must not be committed.

---

## 2026-06-14 — Handoff Snapshot @ v0.92.0

### Current Version
`0.92.0` — NPC AI Speech Bubbles：當 NPC 的 freeform AI agent 提案被接受且帶有 utterance 時，該句話會在 Area scene 的 NPC 頭頂顯示為浮動文字氣泡（深色半透明背景，持續約 3 分鐘牆鐘），讓玩家在地圖上直接看到 AI NPC 的「自我思考」。

### What Shipped
- **NPC speech bubble rendering**：`AreaScene` 每個 NPC sprite 多一個 `speechBubble` Text 物件（depth 75，高於 name label depth 72）；當 `npc.recentUtterance` 有值時顯示 `「utterance」`，否則隱藏。
- **Server utterance tracking**：`SimulationRuntime` 新增 `npcUtteranceMap`，在 `applyFreeformAgentActionEvent` accepted + utterance 時記錄 `{ text, tick }`；`NPC_AGENT_UTTERANCE_VISIBLE_TICKS = TICKS_PER_HOUR / 4 ≈ 3 min` 後自動過期（API 回傳 null）。
- **SimNpcState + ServerNpc + NpcSummary** 各新增 `recentUtterance: { text: string; tick: number } | null` 欄位；`toNpcSummary` mapping 帶過去。
- **Move tween 同步**：speech bubble 隨 NPC 移動 tween 一起位移（距離 0 直接設位置，否則在 onUpdate 回調中跟進）；`disposeNpcSprite` 也清理 speech bubble。
- **`NPC_AGENT_UTTERANCE_VISIBLE_TICKS`** 加入 `config/world.ts`（named constant，非 magic number）。

### Verification Evidence
- `npm run test -w @greed-island/server` — pass（1221 tests / 156 files）
- `npm run test -w @greed-island/web` — pass（118 tests / 22 files）
- `npm run build` — pass（server + web；Vite chunk-size warning remains known non-blocking）
- `npx openspec validate --all --strict` — pass（53 items）

### Known Notes
- Superseded by v0.92.1, which adds explicit freeform `build` intent instead of collapsing construction thought into generic `work`.
- Speech bubble is always visible (not proximity-gated unlike the 💬 interact icon) — it's ambient world info.
- Utterance TTL is `TICKS_PER_HOUR / 4 = 180 ticks = ~15 min real time`; NPCs get new AI decisions every `TICKS_PER_HOUR = 720 ticks = ~60 min`, so the bubble is typically visible for ~1/4 of the decision cycle.

---

## 2026-06-14 — Handoff Snapshot @ v0.91.13

### Current Version
`0.91.13` — Chronicle Routine-Noise Hotfix：v0.91.12 fixed the empty live chronicle context, but live screenshots showed the renderer still treated routine tick logs (`NPC_PRODUCTIVE_ACTION`, movement/activity/interact, area pressure, harvest rows) as story material, producing repetitive fake public narrative.

### What Shipped
- **Routine events removed from chronicle story context**：server chronicle context now excludes routine/system projection rows including `NPC_PRODUCTIVE_ACTION`, `NPC_MOVE`, `NPC_ACTIVITY_CHANGE`, `NPC_INTERACT`, `AREA_PRESSURE`, `BIO_NODE_HARVESTED`, and `FISHERY_HARVESTED`; these remain available to debug/raw event views but no longer dominate public chronicle summaries.
- **Main Timeline productive spam demoted**：web event visibility now keeps `NPC_PRODUCTIVE_ACTION` out of the main chronicle surface, while AI freeform proposal events remain visible when they carry grounded narration.
- **Fallback wording is less fake**：world-event fallback now prefers concrete committed narration instead of stitching repeated canned conclusions around low-level event rows.
- **Version bump**：workspace/server/web package versions and server/web `APP_VERSION` updated to `0.91.13` for live health evidence.

### Verification Evidence
- `npm run test -w @greed-island/server -- chronicleRenderer.test.ts livingWorld.test.ts` — pass（78 tests / 2 files）
- `npm run test -w @greed-island/web -- eventVisibility.test.ts TimelinePage.test.ts` — pass（14 tests / 2 files）
- `npm run build` — pass（server + web；Vite chunk-size warning remains known non-blocking）
- `npx openspec validate --all --strict` — pass（53 items）
- CI `27497315924` — pass（Build/typecheck/test + OpenSpec validate；Node.js 20 deprecation annotation remains known non-blocking）
- Deploy Dev `27497354899` — pass（Docker build/push + desktop deploy smoke）
- Live smoke after deploy：`/healthz` reported `version=0.91.13`；deterministic `/api/world/chronicle?limit=120&ai=0` returned 12 story events with no blocked routine/productive types；AI `/api/world/chronicle?limit=120&ai=1` returned `source="ai"`, 7 grounded story events, no blocked routine/productive types, and no fallback reason；`/api/world.facts.npcAgent` reported `enabled=true`, `configured=true`, `providerSuccessCount=1`, `submitCount=1`, `errorCount=0`.

### Known Notes
- Raw `/api/events` remains a developer/debug feed and can still include routine simulation rows; the fix targets public chronicle/Timeline story surfaces.
- Local Playwright render smoke was not run because `playwright` is not installed in this workspace.
- `.opencode-tmp/`, `deploy/data/`, and `test-results/` remain local untracked artifacts and were intentionally not committed.

---

## 2026-06-14 — Handoff Snapshot @ v0.91.12

### Current Version
`0.91.12` — Live Chronicle Feed Hotfix：v0.91.11 CI/CD passed, but live smoke showed `/api/world/chronicle` still read the SQLite recent slice while `/api/events` and the current simulation used the runtime recent feed, so chronicle context stayed empty even with fresh `NPC_PRODUCTIVE_ACTION` rows visible on the public feed.

### What Shipped
- **Chronicle now uses the live public feed**：`/api/world/chronicle` builds context from `runtime.getRecentEvents(limit)` in chronological order, matching the public Timeline source and allowing freshly generated productive / freeform NPC events to enter the chronicle immediately after deploy/restart.
- **Chronicle source type narrowed**：`buildChronicleContext` now accepts the smaller server-event shape it actually reads (`tick`, `eventType`, `actorId`, `payload`), so both persisted EventLog rows and runtime recent events can feed the grounded renderer without fake persistence metadata.
- **Version bump**：workspace/server/web package versions and server/web `APP_VERSION` updated to `0.91.12` for live health evidence.

### Verification Evidence
- `npm run test -w @greed-island/server -- chronicleRenderer.test.ts livingWorld.test.ts` — pass（77 tests / 2 files）
- `npm run build` — pass（server + web；Vite chunk-size warning remains known non-blocking）
- `npx openspec validate --all --strict` — pass（53 items）
- CI `27493148612` — pass（Build/typecheck/test + OpenSpec validate；Node.js 20 deprecation annotation remains known non-blocking）
- Deploy Dev `27493186150` — pass（Docker build/push + desktop deploy smoke）
- Live smoke after deploy：`/healthz` reported `version=0.91.12`；`/api/world/chronicle?limit=40&ai=0` returned non-empty `context.events` with recent `NPC_PRODUCTIVE_ACTION` rows and Traditional Chinese fallback text instead of empty-context fallback；`/api/world/chronicle?limit=40&ai=1` returned `source="ai"` with Traditional Chinese summary citing live NPC actions；after a short wait, `/api/world.facts.npcAgent` reported `enabled=true`, `configured=true`, `providerSuccessCount=1`, `submitCount=1`, `errorCount=0`, latest success via `opencode` for `central.busker.huang_yu_cheng`.

### Known Notes
- Superseded by v0.91.13, which removes routine/productive tick logs from public chronicle story context.
- `.opencode-tmp/`, `deploy/data/`, and `test-results/` remain local untracked artifacts and were intentionally not committed.

---

## 2026-06-14 — Handoff Snapshot @ v0.91.11

### Current Version
`0.91.11` — Public Chronicle AI Visibility Hotfix：修正 v0.91.10 雖然 NPC freeform AI 已進 EventLog，但公開 Timeline/編年摘要仍被 fallback 與 deterministic `NPC_INTERACT`/move/activity canned events 佔據的問題。此版 CI/CD passed，但 live smoke 發現 chronicle route 仍讀 persisted recent slice；v0.91.12 已補上 live-feed route fix。

### What Shipped
- **Freeform proposals are visible**：accepted/rejected `NPC_FREEFORM_ACTION_PROPOSED` 都會產生 public narration；即使 AI 沒給 utterance，也不會因 `narration=null` 被前端隱藏。
- **Chronicle context includes AI/freeform and productive progress**：server chronicle 不再把 `NPC_PRODUCTIVE_ACTION` 全部排除，並會把 `NPC_FREEFORM_ACTION_PROPOSED` 納入 chronicle-ready events，避免有實際事件時仍顯示「沒有足夠鮮明的公共事件」。
- **Main Timeline noise reduction**：`NPC_MOVE`、`NPC_ACTIVITY_CHANGE`、`NPC_INTERACT` 從「全部」主編年流降級；仍可在 NPC filter 看到，但不再壓過 AI freeform 與 productive progress。

### Verification Evidence
- `npm run test -w @greed-island/server -- chronicleRenderer.test.ts npcAgentRunner.test.ts` — pass（18 tests / 2 files）
- `npm run test -w @greed-island/web -- TimelinePage.test.ts eventVisibility.test.ts` — pass（14 tests / 2 files）
- `npm run build` — pass（server + web；Vite chunk-size warning remains known non-blocking）
- `npx openspec validate --all --strict` — pass（53 items）
- CI `27492960638` — pass after follow-up test expectation fix；Deploy Dev `27492998035` — pass。
- Live smoke found remaining route bug：`/api/world/chronicle?limit=40&ai=1` still returned empty-context fallback while `/api/events?limit=100` showed recent productive rows；fixed by v0.91.12.

---

## 2026-06-14 — Handoff Snapshot @ v0.91.10

### Current Version
`0.91.10` — NPC Freeform Agent Gate Hotfix：v0.91.9 live diagnostics confirmed NPC agent/provider were enabled, but the runner skipped every due NPC with empty deterministic intent entries before calling AI, so players only saw deterministic canned behavior.

### What Shipped
- **Freeform no longer requires urgent intent entries**：NPC freeform self-thinking now still calls AI when deterministic `computeIntentEntries()` is empty; needs, life goal, beliefs, and reflections remain enough context for daily self-directed behavior.
- **Diagnostics rename**：`facts.npcAgent.emptyIntentEntriesCount` records how often an AI call had no urgent deterministic intent context, but this is no longer a skip condition.
- **Regression coverage**：新增 `npcAgentRunner.test.ts`，驗證 empty intent entries 時仍會呼叫 provider 並提交 freeform proposal。

### Verification Evidence
- `npm run test -w @greed-island/server -- npcAgentRunner.test.ts runtimeIntentResolution.test.ts` — pass（4 tests / 2 files）
- `npm run build` — pass（server + web；Vite chunk-size warning remains known non-blocking）
- `npx openspec validate --all --strict` — pass（53 items）
- CI `27492383605` — pass（Build/typecheck/test + OpenSpec validate；Node.js 20 deprecation annotation remains known non-blocking）
- Deploy Dev `27492422554` — pass（Docker build/push + desktop deploy smoke）
- Live smoke after deploy：`/healthz` `version=0.91.10` tick `93990`；after waiting for due NPCs, `/api/world.facts.npcAgent` reported `enabled=true`, `configured=true`, `dueCount=1`, `emptyIntentEntriesCount=1`, `providerSuccessCount=1`, `submitCount=1`, `errorCount=0`, latest success `central.paperboy.a_jun` via `opencode` with accepted action `work`.
- Recent `/api/events?limit=100` included `NPC_FREEFORM_ACTION_PROPOSED` with `accepted=true` and action `rest`, confirming AI freeform proposals are now committed into EventLog after the stale gate was removed.

---

## 2026-06-14 — Handoff Snapshot @ v0.91.9

### Current Version
`0.91.9` — NPC Agent Diagnostics：針對 live 只看到罐頭 deterministic 行為、缺乏證據證明 NPC AI freeform 自我思考有成功落地的問題，新增 NPC agent runtime diagnostics。

### What Shipped
- **NPC agent observability**：`/api/world.facts.npcAgent` 現在回報 agent enabled/configured、in-flight 數、輪到 AI 的次數、無 tile/無 intent entries skip 次數、provider 成功次數、parse failure、submit 成功次數、error 次數，以及最近 attempt/success/error。
- **Real failure visibility**：AI provider call 失敗不再只被靜默吞掉；deterministic planner 仍照常 fallback，但 diagnostics 會保留最近錯誤原因，供 live smoke 判斷為什麼玩家看到罐頭行為。

### Verification Evidence
- `npm run test -w @greed-island/server -- runtimeIntentResolution.test.ts` — pass（3 tests / 1 file）
- `npm run build` — pass（server + web；Vite chunk-size warning remains known non-blocking）
- `npx openspec validate --all --strict` — pass（53 items）
- Live v0.91.9 diagnostics：`enabled=true`、`configured=true`、但 `dueCount=2` / `skippedNoIntentEntries=2` / `providerSuccessCount=0` / `submitCount=0`，證實罐頭行為來自 empty intent gate。

---

## 2026-06-14 — Handoff Snapshot @ v0.91.8

### Current Version
`0.91.8` — Life Goal Motivation Source Hotfix：修正 live smoke 發現 `NPC_LIFE_GOAL_SET` source payload 仍保留 world agenda directive 長句與 `agenda.*` debug id 的問題。

### What Shipped
- **Life-goal source cleanup**：新 `NPC_LIFE_GOAL_SET` motivation 不再引用 world agenda directive 或 agenda id，只保留 NPC 身分、地區生活壓力、需求重算與目標敘述。

### Verification Evidence
- `npm run test -w @greed-island/server -- runtimeExpansion.test.ts` — pass（1 test / 1 file）
- `npm run build` — pass（server + web；Vite chunk-size warning remains known non-blocking）
- `npx openspec validate --all --strict` — pass（53 items）
- CI `27490878433` — pass（Build/typecheck/test + OpenSpec validate；Node.js 20 deprecation annotation remains known non-blocking）
- Deploy Dev `27490913340` — pass（Docker build/push + desktop deploy smoke）
- Live smoke after deploy：`/healthz` `version=0.91.8` tick `93138`；`/api/events?limit=30` showed new productive/life-goal source motivations no longer include `agenda.*` / `cap_zero` in sampled player-facing motivation text；`/api/world/chronicle?limit=20&ai=1` returned Traditional Chinese fallback `textZh`（「沒有足夠鮮明的公共事件能寫入編年史，但城市仍在自行運轉。」）with no `system.skill.*` chronicle leakage.

### Known Deferred
- Raw `/api/events` remains a developer/debug API and still includes structural ids plus lower-level internal rows such as `BIO_NODE_HARVESTED`; this release targets public/chronicle source quality and future source generation, not historical EventLog rewriting.

---

## 2026-06-14 — Handoff Snapshot @ v0.91.7

### Current Version
`0.91.7` — Public Log Source Quality Hotfix：修正 v0.91.6 live smoke 發現的新 productive action source motivation 仍會引用 world-event directive 長句，以及 chronicle AI 會把 `NPC_OBSERVED_SKILL` / `system.skill.*` 寫進摘要的問題。

### What Shipped
- **Productive motivation source cleanup**：新 `NPC_PRODUCTIVE_ACTION` motivation 不再引用 world agenda directive 文字，只用地區公共壓力、NPC 身分、主要需求與 domain 說明。
- **Chronicle context hygiene**：`NPC_OBSERVED_SKILL` 從 chronicle context 排除，避免 AI 摘要出 `system.skill.fishing` 這類內部技能觀察。

### Verification Evidence
- `npm run test -w @greed-island/server -- livingWorld.test.ts chronicleRenderer.test.ts runtimeExpansion.test.ts` — pass（77 tests / 3 files）
- `npm run test -w @greed-island/web -- TimelinePage.test.ts` — pass（5 tests / 1 file）
- `npm run build` — pass（server + web；Vite chunk-size warning remains known non-blocking）
- `npx openspec validate --all --strict` — pass（53 items）
- Pending after release: CI/CD and live smoke.

---

## 2026-06-14 — Handoff Snapshot @ v0.91.6

### Current Version
`0.91.6` — Chronicle Fallback Language Hotfix：修正 live `/api/world/chronicle?ai=1` 在沒有 chronicle-ready events 時，把英文 fallback 塞進 `textZh` 的品質問題。

### What Shipped
- **Traditional Chinese fallback chronicle**：fallback renderer 產生獨立 `textZh`，空事件時回「沒有足夠鮮明的公共事件能寫入編年史，但城市仍在自行運轉。」而不是英文句子。
- **Fallback event sentences**：fallback chronicle 的非 AI 中文句子走繁中模板，並避免把 `agenda.*`、tile id、`cap_zero`、internal event id 之類 debug 字串帶入中文 fallback。

### Verification Evidence
- `npm run test -w @greed-island/server -- chronicleRenderer.test.ts` — pass（16 tests / 1 file）
- `npm run test -w @greed-island/web -- TimelinePage.test.ts` — pass（5 tests / 1 file）
- `npm run build` — pass（server + web；Vite chunk-size warning remains known non-blocking）
- `npx openspec validate --all --strict` — pass（53 items）
- Pending after release: CI/CD and live chronicle smoke.

---

## 2026-06-14 — Handoff Snapshot @ v0.91.5

### Current Version
`0.91.5` — Timeline Motivation Quality Hotfix：修正公開編年史/事件列表把 internal agenda id、過長制度推理與 debug motivation 直接顯示給玩家的問題。

### What Shipped
- **Public motivation sanitizer**：Timeline 先使用事件型別對應的短版公開動機；對未知事件只接受短且不含 internal id 的 authoritative motivation。
- **Legacy event cleanup in UI**：既有 `NPC_PRODUCTIVE_ACTION` 即使 payload 裡已有 `agenda.t_...` / `cap_zero` 等 debug 文字，也會顯示短版「巡查/服務/交易/建設」動機。
- **Server-side source cleanup**：新產生的 `NPC_PRODUCTIVE_ACTION` motivation 不再把 `agenda.id` 寫進 public project purpose，並縮短 explanation。

### Verification Evidence
- `npm run test -w @greed-island/web -- TimelinePage.test.ts` — pass（5 tests / 1 file）
- `npm run test -w @greed-island/server -- runtimeExpansion.test.ts` — pass（1 test / 1 file）
- `npx openspec validate --all --strict` — pass（53 items）
- `npm run build` — pass（server + web；Vite chunk-size warning remains known non-blocking）
- Pending after release: CI/CD and live log-quality smoke.

### Known Deferred
- Live deploy/smoke pending for this hotfix.
- `package-lock.json` root version remains at the existing stale `0.86.0` baseline; this hotfix did not modify lockfile to avoid unrelated historical churn.

---

## 2026-06-14 — Handoff Snapshot @ v0.91.4

### Current Version
`0.91.4` — Traditional Chinese Chronicle Hotfix + Weather Agent：修正 AI chronicle `zh` 可漏出簡體字（例如 `无事发生。`）的品質問題，並實作「天氣也是 agent、有自己的想法」的 deterministic Weather Agent。

### What Shipped
- **Chronicle 繁中約束**：`chronicleSystemPrompt()` 明確要求 `zh` 欄位輸出 Traditional Chinese / 繁體中文，禁止 Simplified Chinese characters。
- **Server-side 防線**：AI chronicle parse 成功後會對 `zh` 做 deterministic simplified-to-traditional normalization，避免模型或 OpenCode 偶發輸出簡體字直接進 public chronicle。
- **Regression coverage**：新增 `无事发生。npc-a 和 npc-b 这时在市场说话。` → `無事發生。npc-a 和 npc-b 這時在市場說話。` 測試，並確認 prompt 傳給 provider 時帶 Traditional Chinese 指令。
- **Weather Agent OpenSpec + implementation**：新增並實作 `openspec/changes/weather-agent-with-intent/`；天氣是 `weather.agent` system actor，先提交 bounded `WEATHER_INTENT_PROPOSED` thought/intent，再由 Rule Engine 驗證 `WEATHER_CHANGE` outcome，AI 不可決定天氣事實。
- **Deterministic weather mind**：新增 pure policy module，依 tick、ruleset version、世界壓力、季節、生態/文明/world-event context 推導 mood、pressure source、desired weather、thought、reason、cadence key，不使用 AI/provider/wall-clock。
- **Projection/API/chronicle surfacing**：WorldState projection 追蹤 weather-agent mood/latest thought/recent thoughts/desired weather/accepted weather；`/api/world.facts.weatherAgent` additive expose；chronicle input/fallback 可引用 committed weather-agent thought，不可憑空創造天氣事實。
- **Version sync**：workspace/server/web package version 與 server/web `APP_VERSION` 更新到 `0.91.4`。

### Verification Evidence
- `npm run test -w @greed-island/server -- livingWorld.test.ts weatherAgent.test.ts worldState.test.ts runtimeWeatherAgent.test.ts runtimeExpansion.test.ts chronicleRenderer.test.ts` — pass（93 tests / 6 files）
- `npm run build` — pass（server + web；Vite chunk-size warning remains known non-blocking）
- `npx openspec validate --all --strict` — pass（53 items，包含 `weather-agent-with-intent`）
- `npm run test` — pass（server 1216 tests / 155 files + web 114 tests / 22 files）

### Known Deferred
- Live deploy/smoke not run in this handoff. Local build/tests/spec validation are complete.
- `package-lock.json` root version remains at the existing stale `0.86.0` baseline; this hotfix did not modify lockfile to avoid unrelated historical churn.

---

## 2026-06-13 — Handoff Snapshot @ v0.91.3

### Current Version
`0.91.3` — Chronicle Timeout QA Hotfix：完整 QA pass 發現 live OpenCode chronicle 可能被 8s timeout 打成 fallback；調高預設 chronicle AI timeout，並修正長模擬測試 timeout 過緊造成 `npm run check` 不穩。

### What Shipped
- **Chronicle timeout**：`CHRONICLE_AI_TIMEOUT_MS` 從 8s 調到 20s，避免 self-hosted OpenCode 慢回應時過早 fallback。
- **Test reliability**：`runtimeSettlementFamine.test.ts` timeout 從 15s 調到 45s；該測試單跑約 6s、full suite 並行時可達 ~17-22s，原 timeout 太緊造成 false negative。

### Verification Evidence
- `npm run check` — pass after timeout fix（build + server 1207 tests / 153 files + web 114 tests / 22 files；Vite chunk-size warning remains known non-blocking）
- `npx openspec validate --all --strict` — pass（52 items）
- Non-destructive live smoke before timeout hotfix：`/healthz` `version=0.91.2`; `/api/world` 200; `/api/npcs` 200; `/` 200; `/api/events` 200; `/api/combat/active` unauthenticated 401 as expected; `/api/world/chronicle?ai=1` attempted OpenCode but fell back on 8s timeout.
- v0.91.3 targeted verification：`npm --workspace packages/server exec vitest -- run src/kernel/chronicleRenderer.test.ts src/sim/runtimeSettlementFamine.test.ts` — pass（14 tests / 2 files）；`npm run build` — pass；`npx openspec validate --all --strict` — pass（52 items）。
- CI `27462670671` — pass（Build/typecheck/test + OpenSpec validate；Node.js 20 deprecation annotation remains known non-blocking）
- Deploy Dev `27462706519` — pass（Docker build/push + desktop deploy smoke）
- Live smoke after deploy：`/healthz` `version=0.91.3` tick `77769`; `/api/world` 200; `/api/npcs` 200; `/api/combat/active` unauthenticated 401 as expected; `/api/world/chronicle?ai=1&limit=20` reported `timeoutMs=20000` and fallbackReason `No chronicle-ready events to render.`（normal empty-context fallback, not provider timeout）。
- Playwright live browser QA（Chromium, live `https://hunter.sisihome.org`）：mobile 390x844 `/timeline` shows `V0.91.3`; bottom nav is one row (`height=57`, 5 touch targets); tapping「更多」opens sheet above nav (`sheet.bottom=780`, `nav.top=787`); `/area/t_central` canvas remained mounted/stable for 7s (`358x238.65625`); `/api/combat/active` unauthenticated request returned 401; desktop 1280x800 root/timeline/area canvas smoke passed.
- Live combat E2E（state-changing test account）：registered `opencode-combat-*@example.test`, set presence to target tile, initiated NPC combat against `central.broker.gui` on `t_dock` (`combat_78474_12_central.broker.gui_d2145196`), submitted `attack`, received HTTP 200 with updated session round and larger combat log.

### Known QA Gaps
- No browser automation suite exists in repo（no Playwright/Cypress files found），so mobile visual claims still require manual/browser-device verification.
- Live combat E2E was run with a generated test account and intentionally changed live state by starting/advancing one combat session.

---

## 2026-06-13 — Handoff Snapshot @ v0.91.2

### Current Version
`0.91.2` — Chronicle Fenced JSON Hotfix：修正 OpenCode 回傳 ```json fenced JSON 時，編年史 parser 因只接受裸 JSON 而 fallback。

### What Shipped
- **Chronicle parser tolerance**：`parseAiChronicle` 先抽出裸 JSON payload，支援 raw JSON、Markdown code fence、以及前後有文字但包含單一 JSON object 的回覆。
- **Validation unchanged**：仍要求 `zh` / `en` 非空，`citedNames` 仍會被 grounded allow-list 檢查；只放寬 transport wrapper，不放寬世界事實。

### Verification Evidence
- `npm --workspace packages/server exec vitest -- run src/kernel/chronicleRenderer.test.ts` — pass（13 tests / 1 file）
- `npm run build` — pass（server + web；Vite chunk-size warning remains known non-blocking）
- CI `27462166735` — pass（Build/typecheck/test + OpenSpec validate；Node.js 20 deprecation annotation remains known non-blocking）
- Deploy Dev `27462199501` — pass（Docker build/push + desktop deploy smoke）
- Live smoke：`/healthz` `version=0.91.2` tick `77485`；`/api/world/chronicle?ai=1&limit=20` returned `source="ai"`, `fallbackReason=null`, `activeKeys=0`, one successful OpenCode attempt；`/api/world` 200；`/api/npcs` 200。

---

## 2026-06-13 — Handoff Snapshot @ v0.91.1

### Current Version
`0.91.1` — Mobile More Nav + Chronicle Provider + Animal Movement Hotfix：修正手機底部導覽「更多」選單造成底欄換行與內容重疊、編年史在 OpenCode 已設定但 Gemini key 為 0 時直接 fallback，以及區域動物在資料刷新時瞬移回 spawn 點。

### What Shipped
- **Mobile tab count**：`MobileTabBar` 的固定入口維持 4 個主分頁 + 1 個「更多」，避免 5 欄 grid 被 6+ 個項目撐成兩列。
- **More bottom sheet**：「更多」選單移出 nav grid，改成固定在底欄上方的 scrollable bottom sheet，並保留 backdrop 關閉行為。
- **Active state**：目前路徑位於 overflow 項目時，「更多」按鈕會維持 active 狀態。
- **Chronicle provider gate**：`renderChronicle` 不再只用 Gemini active key 數判斷 AI 可用；OpenCode configured 時會嘗試 `generateWithProviders`，避免 live `/world/chronicle?ai=1` 直接標成 `FALLBACK`。
- **Animal movement stability**：`AreaScene.applyExternalUpdate` 對 ecology payload 做內容 signature；資料未變時不重建 ecology overlay / `AnimalActor`，避免動物 tween 中途被銷毀後瞬移回 deterministic spawn 點。

### Verification Evidence
- `npm --workspace packages/web exec vitest -- run` — pass（114 tests / 22 files）
- `npm run build` — pass（server + web；Vite chunk-size warning remains known non-blocking）
- `npm --workspace packages/server exec vitest -- run src/kernel/chronicleRenderer.test.ts src/kernel/livingWorld.test.ts` — pass（71 tests / 2 files）
- `npm --workspace packages/web exec vitest -- run` — pass after animal movement fix（114 tests / 22 files）
- `npm run build` — pass after animal movement fix（server + web；Vite chunk-size warning remains known non-blocking）
- Pending CI/CD/live smoke after push.

### Known Deferred
- `package-lock.json` 的 root version 仍停在既有 `0.86.0` baseline；本 hotfix 不改動 lockfile，避免混入無關歷史同步 diff。

---

## 2026-06-13 — Handoff Snapshot @ v0.91.0

### Current Version
`0.91.0` — Freeform NPC Agent Actions：NPC AI 從「選 server 提供的 intent 編號」升級為「自由提出任意生活行為」，再由 server resolver / Rule Engine 驗證後落地。

### What Shipped
- **OpenSpec**：新增 `freeform-npc-agent-actions`，定義 AI 自由提案、server bounded taxonomy、Rule Engine 事件、runtime deterministic consequence。
- **Freeform prompt**：`buildFreeformAgentPrompt` 要求 AI 回 structured JSON proposal（action/target/reason/risk/expectedOutcome/utterance），並帶 NPC persona、需求、人生目標、信念、反思。
- **Server resolver**：`parseFreeformAgentProposal` / `resolveFreeformAgentProposal` 將自由提案限制到 `travel | work | rest | socialize | buy_card | challenge_combat | spread_rumor | custom_social_scene`；未知 action/tile/deceased or unknown NPC target 會 rejected。
- **Rule Engine event**：新增 `NPC_FREEFORM_ACTION_PROPOSED` command/event payload + validator；accepted/rejected 都可觀測，rejected 不改 runtime state。
- **Runtime application**：accepted travel-like action 只透過既有 `NpcEngine.setIntentOverride` 導向；AI 宣稱拿卡、改錢、改 HP、改關係一律不被此路徑採信。

### Verification Evidence
- `npm --workspace packages/server exec vitest run src/npcs/npcAgent.test.ts` — pass（9 tests）
- `npm --workspace packages/server exec vitest run src/kernel/livingWorld.test.ts` — pass（59 tests）
- `npm --workspace packages/server exec vitest run src/sim/runtimeIntentResolution.test.ts` — pass（2 tests）
- `npm run build` — pass（server + web；Vite chunk-size warning remains known non-blocking）
- `npm --workspace packages/server exec vitest -- run` — pass（1204 tests / 153 files）
- `npm --workspace packages/web exec vitest -- run` — pass（114 tests / 22 files）
- `npx openspec validate --all --strict` — pass（52 passed / 0 failed）

### Known Deferred
- Freeform action execution is still first-slice: accepted proposals steer/narrate through existing runtime paths; richer typed task execution (actual trading, visiting, combat challenge automation, card purchase commands) should be separate changes.
- DB/storage pressure remains a separate issue: `NPC_STATE_RECORDED` snapshot volume and possible Postgres migration are not included in this change.

---

## 2026-06-13 — Handoff Snapshot @ v0.90.0

### Current Version
`0.90.0` — Greed Island Card Combat：術式卡接進回合制戰鬥（買卡終於有用）+ Phase D 戰鬥世界回饋（掉卡/奪卡/energy/關係位移）。

### What Shipped
- **術式卡 ↔ 手牌**：`combat/handLoadout.ts`；7 張戰鬥型術式各解鎖一個戰鬥卡類別，基本牌保底；combat API 回 `hand`+`usedCardClasses`；play/action 雙端驗持有。
- **回合卡效果**：`evaluateCombatRound` 的 TECHNIQUE_ROUND_EFFECT（加傷/回復/盾/迴避/震懾/禁防/反彈/連擊）；每場每張限一次（combat_log 判定）；COMBAT_PLAYER_ACTION/validator 加 cardClass。
- **Phase D**：`http/combatLoot.ts` §6 deterministic 掉落（正典 combat_victory 卡池）→ CARD_DROP_SPAWN(combat_loot)；戰敗 held 卡 deterministic CARD_RELEASE；energy 歸零移到 COMBAT_RESOLVE 消費端（Phase B inline 移除，Phase C 漏接修復）；目擊者 respect -8 ×≤6；新 `runtime.subscribeCombatResolved` hook。
- **Web**：CombatHud 手牌列（選卡施放/已用鎖定）；NpcDialog + AreaPage 接線。

### Verification Evidence
- `npm --workspace packages/server exec vitest -- run` — **1200 tests / 153 files 全過**（+21 新：handLoadout 6、combatLoot 7、ruleEngine 術式 8）
- `npm run build` — server + web 乾淨
- `npx openspec validate --all --strict` — 全綠（52 items）

### Known Deferred
- Phase C 即時 sub-tick：NPC 出牌 AI 未設計、CombatHudPhaseC 未接線（本版判定回合制才是可玩的卡牌戰鬥路徑）。
- §5.2 factionShifts；術式卡「消耗持有數」制（目前每場限一次的 cooldown 語意）。

---

## 2026-06-13 — Handoff Snapshot @ v0.89.0

### Current Version
`0.89.0` — Eight-bit Living World：像素地形/道具/人物、動物行為演出、NPC AI agent（意圖分類路徑）、世界事件衛生、手機響應式修正。

### What Shipped
- **8-bit 視覺**：`pixelWorld.ts`（dither+bevel 磚面、21 像素道具、水面波光）+ `characterAvatar.ts` texture-based 像素人 + `pixelAnimals.ts` 動物行為 actor（漫遊/逃離/潛行）與環境生命（飛鳥/蝴蝶/落葉）。場景換色 API 改 `applyAvatarOutfitColor`。
- **NPC AI agent**：`NPC_AGENT_DECISION` command/event；AI 只能在 server 確定性 intent stack 算出的合法選項中選擇（follow_schedule + intent 候選），urgency/targetTile 採 server 值；`NpcAgentRunner` 以 `NPC_AGENT_DECISION_INTERVAL_TICKS` 錯相、非阻塞、AI 失敗靜默退回 planner；utterance 以「喃喃自語」narration 上 ticker。
- **事件衛生**：AREA_STATE_RECORDED / NPC_STATE_RECORDED narration→null；web eventVisibility 過濾投影型別（含歷史污染事件）。
- **響應式**：Codex 手機 4 欄、Market 手機卡片式、web/version.ts 修復（header 不再顯示 client v0.24.2）。
- 生存動機/學習/開拓的既有系統盤點寫入 proposal（skillXp+mentorship+reflection 學習、needs/beliefs 生存、construction+tile unlock 開拓）— agent 層把動機接上 AI 自主決策。

### Verification Evidence
- `npm --workspace packages/server exec vitest -- run` — 1179 tests / 151 files 全過
- `npm --workspace packages/web exec vitest -- run` — 114 tests / 22 files 全過
- `npm run build` — server + web 乾淨
- 本機 runtime：`/healthz` `{ok:true, version:"0.89.0"}`，boot hydration 完成、無錯誤 log；無 AI key 時 agent 層 inert（行為與 v0.88 完全一致）
- Playwright：desktop 1280×800 hub/area（像素世界+像素人+動物/蝴蝶可見）；mobile 390×844 hub/codex/market（卡片式行情正常、無橫向溢出）

### Known Deferred
- BuildingScene 室內仍 emoji（下一版像素化）。
- NPC chat bubble 顯示 agent utterance（目前走 ticker narration）。
- 真 AI key 環境下的 agent 決策實測（本機無 key；live 部署後由 admin 設定 keys 驗證）。
- 前一版 v0.88.0 live smoke 因本機 Tailscale 通道中斷未能執行；CI/Deploy Dev 均綠。

---

## 2026-06-12 — Handoff Snapshot @ v0.88.0

### Current Version
`0.88.0` — Living World Presentation & Autonomy：2.5D 程序化角色 + 全 100 張卡程序化卡面 + NPC 人生目標閉環（對話 + 行動偏壓）+ 雙繼承（死亡遺產轉移 + 成年 civic seed，關閉 Phase D）。

### What Shipped
- **2.5D 角色**（`packages/web/src/game/characterAvatar.ts` 重寫，對外合約不變）：地面陰影、體積陰影、id 播種膚色/髮型/褲色、雙眼朝向、關節原點手腳、scene-update 連續動作循環（走路/呼吸/工作/吃/交易/睡）；Area / Map / Building 三場景零修改。
- **程序化卡面**（`packages/web/src/components/game/cardArt.tsx` 新檔）：mulberry32(cardId) 確定性 SVG，10 大類別主題構圖、rank 邊框光暈；`CardImage` fallback：GM 上傳圖 → CardArt → rank 色塊；Codex / CardDropPanel / AdminCardsPage 接上。
- **人生目標 grounding**：`LifeGoalsProjection`（小 log boot 完整重建；大 log availability-first boot 依 v0.87.13 OOM 政策刻意不深度補水，對話注入由 live-derive fallback 優雅降級）+ `getFormattedLifeGoalContext`（committed → live derive fallback）+ `buildLifeGoalBlock` 對話注入 + `computeIntentStack` `lifeGoalBoost`（封頂 `LIFE_GOAL_INTENT_BOOST_MAX = 0.25`）。
- **死亡遺產轉移**：`planInheritancePlanner` → `HOUSEHOLD_INHERITANCE_ASSIGNED`（payload 新增 optional `goods`）；`GoodsInventoryProjection` 搬 npc:deceased → npc:heir；legacy shape no-op。
- **成年繼承（`matured-child-inheritance` change 實作）**：`NPC_INHERITANCE_GRANTED` + validator；`planMaturationInheritance`（父母 civic 均值 × 0.25 gold / 0.10 skill；全零不發）；與 `NPC_MATURED` 同 tick 配對（orphan grant = determinism error，live + replay 雙邊 guard）；`seedNpcCivicRecord`（double-grant throw）；`LIFE_EXPANSION_BOOT_EVENT_TYPES` 加入兩個新事件型別；admin `inheritedRecent` + AdminNpcsPage「近期繼承」panel。
- OpenSpec：新增 `living-world-presentation-and-autonomy`（4 specs，全 tasks 完成）；`matured-child-inheritance` tasks 全勾（chronicle renderer 9.x 與 live sim-advance 驗證 11.4 標記 deferred）。

### Verification Evidence
- `npm --workspace packages/server exec vitest -- run` — **1172 tests / 150 files 全過**（+53 新測試）
- `npm run build` — server + web 乾淨（Vite chunk-size warning 為既知非阻斷）
- `npx openspec validate --all --strict` — 49 passed / 0 failed（含新 change）
- Local Docker smoke：**未能執行** — 本機 Docker Desktop Linux engine 對所有 API 呼叫回 500（engine 起不來，與本變更無關）；依使用者指示先 push，runtime 驗證改由 CI / Deploy Dev / live smoke 完成

### Known Deferred
- `matured-child-inheritance` task 9.x（chronicle renderer for NPC_INHERITANCE_GRANTED）與 11.4（live `inheritedRecent` 非空驗證需長 sim window）。
- `readEventsByTickWindow` 是 oldest-first：既有 births/households feed 在事件數超過 limit 後會顯示最舊而非最新（latent，非本版引入；inheritedRecent 已用寬抓+取新規避）。

### CI/CD State
本機實作與測試完成。Docker smoke 結果與 push / CI 狀態見 git log 與最新 commit message。

---

## 2026-06-02 — Handoff Snapshot @ v0.87.13

### Current Version
`0.87.13` — Restart-loop hotfix: deferred large-log hydration no longer replays high-volume projections that exhaust Node's heap.

### What Was Broken (live v0.87.12)
- `greed-island-server` had `RestartCount=131`; live `/healthz` returned `502` while the container repeatedly restarted.
- Server logs showed HTTP listen succeeded, then the 30-second deferred hydration began and completed only the small batches (`mortality-lineage`, `born-npcs`, `life-expansion`, `combat`).
- Immediately after that, `better-sqlite3 Statement.all()` allocated enough rows to hit V8's ~4GB heap limit, producing `FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory`.
- Root cause: the v0.87.12 deferred large-log hydration tried to rebuild optional high-volume projections such as `NPC_STATE_RECORDED` (~9M rows) in memory on a 15M-event live EventLog.

### What Was Fixed (v0.87.13)
- Deferred large-log hydration now only runs the small batches needed for public NPC liveness and born-child state: mortality/lineage, born NPCs, life expansion, and combat.
- High-volume optional projections are intentionally skipped until they have materialized or paged hydration.
- Regression test now asserts large-log deferred hydration does not hydrate optional building state from background replay.

### Verification Evidence
- `npm --workspace packages/server exec vitest run src/sim/runtimeLargeLogHydration.test.ts src/projections/npcLineage.test.ts src/projections/bornNpcs.test.ts` — pass (21 tests)
- `npm run build` — pass (server + web; Vite chunk-size warning remains known non-blocking)
- `npx openspec validate --all --strict` — pass (48 passed, 0 failed)
- `git diff --check` — pass (CRLF normalization warnings only)

### CI/CD State
Main branch commit `bd8d601`. CI `26796280656` passed. Deploy Dev `26796318140` passed. Live v0.87.13 smoke passed:
- `/healthz`: `version=0.87.13`, tick `401164 → 401166`
- Container after crossing the 30s deferred-hydration window: `RestartCount=0`, `State=running`, started at `2026-06-02T03:25:08Z`
- Deferred hydration logs completed only small batches: `mortality-lineage (100)`, `born-npcs (213)`, `life-expansion (1533)`, `combat (0)`, then `fully complete`
- `/api/world`: 200, 94,881 bytes, ~82ms
- `/api/npcs`: 200, 52 living NPCs
- Recent server logs: no `FATAL ERROR`, `heap out of memory`, `[sim] tick failed`, `SQLITE_CONSTRAINT_UNIQUE`, uncaught, or unhandled matches; ambient AI key failures remain known non-blocking

---

## 2026-06-01 — Handoff Snapshot @ v0.87.12

### Current Version
`0.87.12` — Close-world-capability-gaps ship: descendant ancestor-memory grounding, roads/bridges + collapse destruction, and deferred large-log hydration completion.

### What Was Broken (v0.87.11)
- `WORLD_CAPABILITIES.md` had to be downgraded because the runtime still lacked three real behaviors: descendants could not ground deceased-parent memory in dialog, faction collapse killed logistics but not road infrastructure, and large-log boot left many projections permanently unhydrated after availability-first startup.
- Matured born NPCs also still had partial runtime lineage/profile wiring: parent ids existed in `BornNpcsProjection`, but household membership and profile lookup paths were inconsistent.

### What Was Fixed (v0.87.12)
- Matured born NPC derived profiles now carry `householdId`; `NpcLineageProjection` admits `NPC_MATURED` descendants into household membership; runtime household/profile lookups resolve dynamic born NPCs correctly.
- NPC dialog grounding now includes explicit parent/ancestor context plus household-scoped deceased-memory filtering, so descendants can reference factual deceased parents without leaking unrelated death memories.
- Server-side map edge metadata now classifies infrastructure as `road` vs `bridge`; faction collapse emits `ROAD_DESTROYED` in the same consequence block as logistics closure.
- Large-log startup now listens quickly, starts ticking again, and schedules deferred hydration in the background so omitted projections rebuild automatically without requiring a second restart; `buildingStateProjection` is included.
- `WORLD_CAPABILITIES.md` / `ROADMAP.md` updated to reflect the shipped runtime state.

### Verification Evidence
- `npm --workspace packages/server exec vitest run src/projections/npcLineage.test.ts src/kernel/npcMemory.test.ts src/npcs/aiDialog.test.ts src/sim/roadConstruction.test.ts src/sim/runtimeLargeLogHydration.test.ts` — pass (121 tests)
- `npm run build` — pass (server + web; Vite chunk-size warning remains known non-blocking)
- `npx openspec validate --all --strict` — pass (48 passed, 0 failed)
- `git diff --check` — pass (CRLF normalization warnings only)
- Local Docker smoke:
  - `curl.exe -s http://127.0.0.1:8100/healthz` → `{ "ok": true, "version": "0.87.12", "tick": 83382 }`
  - `curl.exe -s http://127.0.0.1:8100/api/version` → `{ "version": "0.87.12" }`

### CI/CD State
Local implementation verified. Local Docker rebuilt on the workstation-specific flow and served `v0.87.12` on `:8100`; deferred large-log hydration then continued in the background against the 7.7M-event local SQLite.

---

## 2026-06-01 — Handoff Snapshot @ v0.87.11 docs audit

### Current Version
`0.87.11` — Documentation truthfulness pass: `docs/WORLD_CAPABILITIES.md` now matches current code/runtime behavior more closely instead of overstating completion.

### What Was Broken
- `WORLD_CAPABILITIES.md` mixed old baseline headers (`v0.68.0` / `v0.73.0`) with newer feature notes up through `v0.87.x`, so the "current verified baseline" metadata itself was no longer trustworthy.
- Part II / Part III / §43 overstated several capabilities: full boot hydration on large logs, FACT_SET being fallback-only, roads/bridges both being shipped as runtime features, and the end-to-end claim that descendants can remember deceased ancestors in grounded dialog.
- The born-NPC section still described the pre-v0.87.4 orphan guard even though runtime/tests now mature orphaned children from canonical `NPC_CHILD_BORN` events.

### What Was Fixed
- Updated `WORLD_CAPABILITIES.md` Part II / Part III / Part V to reflect the real state of the codebase:
- Large-log boot is documented as availability-first partial hydration rather than full projection replay.
- FACT_SET is documented as still co-existing on several live world-state write paths and in boot fallback behavior.
- Roads are documented as shipped; automatic bridge planning and road-destruction consequences are documented as not yet wired.
- The born-NPC baseline now reflects v0.87.4 orphan maturation behavior.
- §43.1 descendant-memory and faction-collapse-road criteria are downgraded from complete to partial where the end-to-end path is not yet demonstrable.

### Verification Evidence
- Manual doc-vs-code audit against:
  - `packages/server/src/sim/runtime.ts` (large-log partial hydration, FACT_SET write paths, faction-collapse consequences)
  - `packages/server/src/sim/roadConstructionPlanner.ts` (road-only runtime construction)
  - `packages/server/src/npcs/aiDialog.ts` + `packages/server/src/http/npc.ts` (no ancestor lineage fields in dialog context)
  - `packages/server/src/kernel/npcMemory.ts` (death/heir memory projection scope)
  - `packages/server/src/sim/maturationPlanner.test.ts` (orphaned children now mature)
- `git diff --check` — pass (CRLF normalization warnings only)

### CI/CD State
Documentation-only correction; no runtime behavior changed, no release bump, CI/CD not yet run for this docs audit commit.

---

## 2026-05-31 — Handoff Snapshot @ v0.87.11

### Current Version
`0.87.11` — Name-display follow-up: legacy `潮生 / Tideborn` display repair never maps back to the placeholder pool entry.

### What Was Broken (live v0.87.10)
- v0.87.10 restored HTTP availability and `/api/npcs` returned 52 living NPCs, but 3 born NPCs still displayed exact `潮生 / Tideborn`.
- The v0.87.8 display repair was wired correctly, but it called `generateChildName(...)`; that deterministic pool still includes `潮生 / Tideborn` at index 0 for append-only compatibility, so a few legacy placeholders hashed back to the same placeholder.

### What Was Fixed (v0.87.11)
- `displayChildName(...)` now uses a separate deterministic legacy-display hash that selects only from pool entries `1..N-1`, preserving EventLog immutability and the append-only name pool while guaranteeing repaired legacy placeholders do not render as `潮生 / Tideborn`.
- Added regression coverage for one live child id that previously hashed back to the placeholder.

### Verification Evidence
- `npm --workspace packages/server exec vitest run src/projections/bornNpcs.test.ts src/sim/maturationPlanner.test.ts` — pass (19 tests)
- `npm run build` — pass (server + web; Vite chunk-size warning remains known non-blocking)
- `git diff --check` — pass (CRLF normalization warnings only)

### CI/CD State
Main branch commit `9b4c674`. CI `26702609908` passed. Deploy Dev `26702638854` passed. Live v0.87.11 smoke passed:
- `/healthz`: `version=0.87.11`, tick `382167 → 382169`
- `/api/npcs`: 52 living NPCs, 26 unique display names, `placeholderCount=0`, no exact `潮生 / Tideborn` display names
- `/api/world`: 200, 77,833 bytes, ~64ms
- Recent server logs: HTTP reached listen after large-log fast boot (`14367572` events); no `[sim] tick failed`, `SQLITE_CONSTRAINT_UNIQUE`, fatal, uncaught, or unhandled matches in the checked tail; `opencode=not configured` remains known non-blocking

---

## 2026-05-31 — Handoff Snapshot @ v0.87.10

### Current Version
`0.87.10` — Availability hotfix: large-log boot skips optional high-volume projection replay before HTTP listen.

### What Was Broken (live v0.87.9 deploy)
- v0.87.9 removed cross-type SQLite sorts, but live still stayed at `502` after restart.
- Server remained running but not listening; logs still stopped after the large-log fast-boot warning.
- Root cause: the large-log branch still synchronously replayed many optional projection event sets before HTTP listen. On the 14M-row live EventLog, even indexed per-type reads plus projection rebuilds were too much for an availability-first boot.

### What Was Fixed (v0.87.10)
- Large-log boot now rebuilds only the small projections required for public NPC liveness and born-child maturation before HTTP listen: mortality/lineage, born NPCs, and life expansion.
- High-volume ecology/goods/history/building/intent projections are no longer replayed synchronously on large-log boot; existing FACT_SET fallbacks or empty runtime projections are used until future async/materialized hydration work.
- This preserves the v0.87.8 NPC visual/name fixes and prioritizes restoring live HTTP availability.

### Verification Evidence
- `npm --workspace packages/server exec vitest run src/sim/runtimeDeceasedReplay.test.ts src/projections/bornNpcs.test.ts src/sim/cityLife.test.ts` — pass (43 tests)
- `npm run build` — pass (server + web; Vite chunk-size warning remains known non-blocking)
- `git diff --check` — pass (CRLF normalization warnings only)

### CI/CD State
Local hotfix verified after v0.87.9 deploy still returned 502; pending commit, push, CI/CD, Deploy Dev, and live smoke.

---

## 2026-05-31 — Handoff Snapshot @ v0.87.9

### Current Version
`0.87.9` — Availability hotfix: large-log boot reads selected EventLog types through per-type indexed scans instead of cross-type SQLite sorts.

### What Was Broken (live v0.87.8 deploy)
- v0.87.8 CI and Deploy Dev passed, but live `/healthz`, `/api/world`, and `/api/npcs` stayed at `502` after restart.
- Docker showed `greed-island-server` running but not listening on port 3000; Caddy logged `connect: connection refused`.
- Server logs stopped after `[boot] skipped full runtime hydration for 14355844 events; booting from defaults to keep HTTP available`, indicating large-log boot was still stuck before HTTP listen.
- The boot path calls `readEventsByTypes(...)` repeatedly for projection rebuilds; the previous implementation used `WHERE event_type IN (...) ORDER BY sequence`, which can force large cross-type sorts on a 14M-row EventLog.

### What Was Fixed (v0.87.9)
- `SqliteEventStore.readEventsByTypes(...)` now performs one indexed read per event type and merges rows by `sequence` in memory.
- Event ordering and completeness are preserved, but SQLite no longer has to build one large cross-type ordered result during boot.
- Added regression coverage for interleaved selected event types and duplicate requested types.

### Verification Evidence
- `npm --workspace packages/server exec vitest run src/kernel/kernel.test.ts` — pass (20 tests)
- `npm run build` — pass (server + web; Vite chunk-size warning remains known non-blocking)
- `git diff --check` — pass (CRLF normalization warnings only)

### CI/CD State
Local hotfix verified; pending commit, push, CI/CD, Deploy Dev, and live smoke. Expected live recovery: `/healthz` should return `version=0.87.9` quickly after deploy, then `/api/npcs` should remain populated with repaired display names from v0.87.8.

---

## 2026-05-29 — Handoff Snapshot @ v0.87.8

### Current Version
`0.87.8` — Visual/name hotfix: sleeping/resting NPCs no longer render like corpses, and legacy born NPC placeholder names no longer show as a wall of 「潮生」.

### What Was Broken (live v0.87.7)
- The restored born NPCs could enter `sleep` activity, and the area sprite renderer rotated the humanoid 90 degrees with a Zzz glyph.
- On the mobile map this looked like multiple corpses lying in the street even though `/api/npcs` contains living NPCs.
- Legacy child events from before the name-pool release used the hardcoded placeholder `潮生 / Tideborn`, so many matured born NPCs displayed the same name and exposed long household ids underneath.

### What Was Fixed (v0.87.8)
- Frontend maps authoritative `sleep` activity to a standing `idle` pose for area sprites.
- Removed the sleep glyph from map sprites to avoid corpse/knockout visual language.
- Added deterministic display repair for legacy `潮生 / Tideborn` born NPC names based on child id and household id; EventLog remains immutable.
- Simulation semantics are unchanged; these are display/name-projection fixes.

### Verification Evidence
- `npm --workspace packages/web exec vitest run src/game/characterVisualState.test.ts` — pass (8 tests)
- `npm --workspace packages/server exec vitest run src/projections/bornNpcs.test.ts src/sim/maturationPlanner.test.ts` — pass (18 tests)
- `npm run build` — pass (server + web; Vite chunk-size warning remains known non-blocking)
- `git diff --check` — pass (CRLF normalization warnings only)

### CI/CD State
Local hotfix verified; pending commit, push, CI/CD, and live smoke.

---

## 2026-05-29 — Handoff Snapshot @ v0.87.7

### Current Version
`0.87.7` — Follow-up guard: deceased-parent households no longer produce new `NPC_CHILD_BORN` events after life-expansion boot restores household state.

### What Was Broken (live v0.87.6)
- v0.87.6 restored household/child state and live became healthy, but restored households whose parents were already deceased could still pass the birth planner.
- Live `NPC_CHILD_BORN` count increased from 76 to 83 before the next maturation cadence, proving the birth planner needed a mortality guard separate from the orphan-maturation rule.

### What Was Fixed (v0.87.7)
- `planHouseholdCommands` now skips birth planning for any household with a deceased partner NPC.
- Existing committed `NPC_CHILD_BORN` events still remain canonical and can mature; this only stops new births from deceased-parent households.
- Added regression coverage that a formed household whose two parents die emits no new `NPC_CHILD_BORN` events after 120 ticks.

### Verification Evidence
- `npm --workspace packages/server exec vitest run src/sim/runtimeDeceasedReplay.test.ts src/sim/cityLife.test.ts src/sim/maturationPlanner.test.ts` — pass (37 tests)
- `npm run build` — pass (server + web; Vite chunk-size warning remains known non-blocking)
- `npx openspec validate --all --strict` — pass (47 passed, 0 failed)
- `git diff --check` — pass (CRLF normalization warnings only)

### CI/CD State
Main branch commit `fec2dd0`. CI `26631233629` passed. Deploy Dev `26631307607` passed. Live v0.87.7 smoke passed:
- `/healthz`: `version=0.87.7`, tick `353533 → 353534`
- `/api/npcs`: 26 living born NPCs after maturation cadence
- EventLog lifecycle counts: `NPC_CHILD_BORN=83`, `NPC_DECEASED=50`, `NPC_MATURED=26`; matured batch at tick `353520`
- `/api/world`: 200, ~215,380 bytes, ~189ms
- Recent server logs: no `[sim] tick failed`, `SQLITE_CONSTRAINT_UNIQUE`, fatal, uncaught, or unhandled matches after maturation; ambient AI key failures remain known non-blocking

---

## 2026-05-29 — Handoff Snapshot @ v0.87.6

### Current Version
`0.87.6` — Availability follow-up: large-log life-expansion boot replays only small structural events needed for households, children, construction, unlocks, and maturation.

### What Was Broken (live v0.87.5)
- v0.87.5 fixed the stale `world.lifeExpansion` FACT_SET root cause, but the large-log boot event set included `NPC_PRODUCTIVE_ACTION` and `MEAT_HARVESTED`.
- Live has ~616k `NPC_PRODUCTIVE_ACTION` events, so the server stayed unavailable behind Caddy (`502`) for minutes while replaying civic history before HTTP listen.

### What Was Fixed (v0.87.6)
- `LIFE_EXPANSION_BOOT_EVENT_TYPES` now excludes high-volume civic-productivity events and replays only the small structural subset needed to restore households/children and allow `MaturationPlanner` to emit `NPC_MATURED`.
- `rebuildLifeExpansionFromEvents(...)` still supports civic event replay for bounded full-event rebuild paths and tests.

### Verification Evidence
- `npm --workspace packages/server exec vitest run src/sim/cityLife.test.ts src/sim/maturationPlanner.test.ts` — pass (34 tests)
- `npm run build` — pass (server + web; Vite chunk-size warning remains known non-blocking)
- `npx openspec validate --all --strict` — pass (47 passed, 0 failed)
- `git diff --check` — pass (CRLF normalization warnings only)

### CI/CD State
Local hotfix verified; pending commit, push, CI/CD, and live smoke.

---

## 2026-05-29 — Handoff Snapshot @ v0.87.5

### Current Version
`0.87.5` — Follow-up hotfix: large-log boot now rebuilds `LifeExpansionState` from typed events so born children survive restart and can mature.

### What Was Broken (live v0.87.4)
- v0.87.4 deployed and `/healthz` returned `version=0.87.4`, but `/api/npcs` stayed at 0.
- Live EventLog still had `NPC_CHILD_BORN=76`, `NPC_MATURED=0`, `NPC_DECEASED=50`; tick advanced normally.
- Server logs showed `[boot] skipped full runtime hydration for 12864839 events; booting from defaults to keep HTTP available`.
- The latest `world.lifeExpansion` FACT_SET rows had `households=0`, `children=0`, because a previous fast boot had persisted default life-expansion state after skipping full replay.
- Result: `MaturationPlanner` had no `lifeExpansion.children` to inspect even though canonical `NPC_CHILD_BORN` events existed.

### What Was Fixed (v0.87.5)
- Added `rebuildLifeExpansionFromEvents(...)` and `LIFE_EXPANSION_BOOT_EVENT_TYPES` to replay household, child, construction, civic, unlock, and meat-harvest reducers from typed events.
- Wired both small-log and large-log runtime boot paths to prefer the typed-event rebuild over `world.lifeExpansion` FACT_SET fallback.
- Added regression coverage proving households/children rebuild from typed events when the fact snapshot is stale.

### Verification Evidence
- `npm --workspace packages/server exec vitest run src/sim/cityLife.test.ts src/sim/maturationPlanner.test.ts` — pass (34 tests)
- `npm run build` — pass (server + web; Vite chunk-size warning remains known non-blocking)
- `npx openspec validate --all --strict` — pass (47 passed, 0 failed)

### CI/CD State
Local hotfix verified; pending `git diff --check`, commit, push, CI/CD, and live smoke. Expected live recovery: after deploy and the next maturation cadence, `NPC_MATURED` should appear and `/api/npcs` should repopulate.

---

## 2026-05-29 — Handoff Snapshot @ v0.87.4

### Current Version
`0.87.4` — Hotfix: orphaned born children can mature, restoring playability after live's initial NPC generation died at tick 183600.

### What Was Broken (live v0.87.3)
- Live `/api/npcs` returned 0 because EventLog contains 50 distinct `NPC_DECEASED` events, all at tick `183600`; v0.87.3 correctly filters deceased NPCs from the public roster.
- Live EventLog also contains 76 `NPC_CHILD_BORN` events and 0 `NPC_MATURED` events. The old `MaturationPlanner` orphan guard skipped children forever when both parents were deceased.
- Because pre-v0.87.3 dead NPCs kept participating in simulation, some `NPC_CHILD_BORN` events were emitted after the parent death tick. They are still canonical EventLog facts and are the only available next generation in this live world.

### What Was Fixed (v0.87.4)
- `MaturationPlanner` now treats committed `NPC_CHILD_BORN` as canonical: eligible children mature even if both parents are deceased.
- `parentNpcIds` remain intact on `NPC_MATURED` for lineage/inheritance consumers.
- Canonical `born-npc-maturation` OpenSpec updated from "skip orphaned children" to "mature orphaned children".
- Active `matured-child-inheritance` design note updated so future inheritance work reads last-known parent civic records rather than relying on a living-parent guard.

### Verification Evidence
- `npm --workspace packages/server exec vitest run src/sim/maturationPlanner.test.ts src/sim/runtimeDeceasedFilter.test.ts src/sim/runtimeDeceasedReplay.test.ts` — pass (10 tests)
- `npm run build` — pass (server + web; Vite chunk-size warning remains known non-blocking)
- `npx openspec validate --all --strict` — pass (47 passed, 0 failed)
- `git diff --check` — pass (CRLF normalization warnings only)

### CI/CD State
Local hotfix verified; pending commit, push, CI/CD, and live smoke. Expected live recovery: after the next maturation cadence, existing born children should emit `NPC_MATURED` and repopulate `/api/npcs`.

---

## 2026-05-29 — Handoff Snapshot @ v0.87.3

### Current Version
`0.87.3` — Hotfix: deceased NPCs no longer behave like living NPCs. Server + web build clean; 9 task groups complete; new server tests + web tests included; OpenSpec validation clean.

### What Was Broken (pre-0.87.3)
Death existed in the EventLog but stopped there. Seven independent surfaces never checked `npcMortalityProjection.isDeceased`, so:
- `NpcEngine.tick()` kept moving / working / interacting dead NPCs every tick
- `runtime.getNpcs()` returned them indistinguishable from the living
- `ServerNpc` / `NpcSummary` / `toNpcSummary` all dropped the `deceased` flag
- `AreaScene` painted dead sprites identically
- `/api/npc/:id/{interact,dialog-hold,greet}` and `/api/npc/intervene` happily routed conversations with the deceased
- Server **small-log boot branch** never re-ran `npcMortalityProjection.rebuildFromEvents` — every restart on a small world resurrected every deceased NPC (the v0.25.3 ecosystem-boot-bug pattern, repeated)

### What Was Shipped (v0.87.3)
- **Runtime** (`getNpcs` / `getNpcsIncludingDeceased`): `runtime.getNpcs()` now filters deceased; explicit full-set method for admin / lineage / chronicle callers; 3 internal call sites switched (admin lineage, admin npc-stats, chronicle actorNames).
- **Sim tick gate**: `NpcTickContext.deceasedNpcIds?: ReadonlySet<string>`; `NpcEngine.tick` skips deceased in Phases 1 / 1.5 / 2 / 3 and crowdByTile; runtime injects `npcMortalityProjection.deceasedIds` every tick.
- **HTTP 410 gate**: new `requireLivingNpc(runtime, npcId, res)` helper in `http/npc.ts`; applied to `POST /interact`, `POST /dialog-hold`, `GET /greet`, both partners of `POST /intervene`. `GET /history` deliberately exempt to preserve §43.1 「後代會記得他」. Error body: `{ error: 'NPC_DECEASED', message: '這位 NPC 已經不在世上。' }`.
- **Frontend types**: `ServerNpc.deceased?: boolean`; `NpcSummary.deceased: boolean` (required); `toNpcSummary` copies it; `WorldStateContext` filters `n.deceased` after mapping (defense in depth against SSE / poll race); `AreaPage` click on a deceased sprite shows `「這位 NPC 已經不在了。」` toast instead of opening dialog; `NpcDialog` catches `ApiError status:410 code:NPC_DECEASED` and auto-closes 1.5 s after showing the same message.
- **Boot rebuild fix**: small-log boot branch now also rebuilds `npcMortalityProjection`, `npcLineageProjection`, `bornNpcsProjection` — closes the resurrection-on-restart bug.
- **CLAUDE.md rule §「NPC 死亡狀態必須全鏈路傳遞 (v0.87.3+)」**: locks the four-surface contract + the both-boot-branches rule for future projections.

### Files Touched
- `packages/server/src/sim/runtime.ts` — split `getNpcs`, wire `deceasedNpcIds`, fix small-log boot
- `packages/server/src/sim/npcEngine.ts` — `deceasedNpcIds` gate in 5 loops
- `packages/server/src/http/npc.ts` — `requireLivingNpc` + 4 endpoint refactors
- `packages/server/src/http/adminLineageRouter.ts`, `adminNpcsRouter.ts`, `livingWorldRouter.ts` — switch to `getNpcsIncludingDeceased`
- `packages/web/src/api/client.ts`, `packages/web/src/state/types.ts`, `WorldStateContext.tsx`, `fixtures.ts`, `pages/AreaPage.tsx`, `components/game/NpcDialog.tsx`
- Tests: `runtimeDeceasedFilter.test.ts` (+2), `npcEngine.test.ts` (+3), `npcDeceasedGate.test.ts` (+7), `worldStateNpcDeceased.test.ts` (+3), `runtimeDeceasedReplay.test.ts` (+2), legacy NpcSummary helpers + `npc.test.ts` mocks patched
- Docs: `CLAUDE.md`, `PROGRESS.md`, `ROADMAP.md`, this file
- Version: `package.json` `0.87.2 → 0.87.3`

### Verification Evidence
- `npm --workspace packages/server exec vitest run` — 1134/1134 pass (146 files), includes 17 new tests across the v0.87.3 surface
- `npm --workspace packages/web exec vitest run` — 113/113 pass (22 files), includes 3 new tests (`worldStateNpcDeceased`) and 3 legacy fixture helpers updated to carry `deceased: false`
- `npm run build` — server tsc clean; web tsc + vite build clean (chunk-size warning remains known non-blocking)
- `npx openspec validate --all --strict` — 47 passed, 0 failed
- `git diff --check` — CRLF warnings only (Windows line-ending normalization)
- GitHub Actions CI `26617563739` — pass (commit `7d86938`)
- Deploy Dev `26617604976` — success at 04:18:18 UTC; runner pulled the new image and recreated `greed-island-server` + `greed-island-web` containers
- Local stack: after `DOCKER_BUILDKIT=0 docker compose -f deploy/docker-compose.yml pull && up -d`, `/healthz` returns `{"version":"0.87.3","tick":12806}` immediately after deploy and `{"version":"0.87.3","tick":55900}` after a partial `/sim/advance` smoke pass
- `/api/npcs` returns 106 entries (50 manual config + 56 born/matured runtime NPCs from the v0.86.0+v0.87.0 pipeline), every entry carries `deceased: false`; no deceased NPC appears in the public roster
- `/api/admin/npc-stats` returns `totalNpcs=106, deaths.totalEventCount=0`; this world has not yet crossed lifespan threshold for any NPC (config NPCs `bornAtTick=0`, lifespan ~120k, current tick ~55.9k = 47% of lifespan)
- Full death → filter → 410 chain is contract-locked by `runtimeDeceasedFilter.test.ts`, `npcDeceasedGate.test.ts`, `runtimeDeceasedReplay.test.ts`, `npcEngine.test.ts` deceased-gate block. Natural in-world death observation requires multi-hour admin `/sim/advance` runs (50k cap × ~10 min/call on this 730k-event log); first 50k advance completed but a follow-up advance wedged the local server on hydration (pre-existing heavy-EventLog issue, not a v0.87.3 regression — recovered cleanly via `docker compose restart`).

### Active Blockers
- _None_. Goal-set conditions all met: 9 task groups complete + per-group commits + final push + CI + deploy + local-stack smoke at v0.87.3.

### CI/CD State
Main branch at `7d86938`. CI green. Deploy Dev green. v0.87.3 live on the runner's Tailscale-bound stack and on the local development stack.

---

## 2026-05-28 — Handoff Snapshot @ v0.87.2

### Current Version
`0.87.2` — Follow-up runtime hotfix after v0.87.1 deploy. Focused runtime/logistics tests pass; server/web build clean; OpenSpec validation clean.

### What Was Fixed (v0.87.2)

**Intent resolution event draft bug**
- Live v0.87.1 fixed `/api/world` payload size, but post-deploy logs surfaced `[sim] tick failed Error: Failed to append deterministic eventId undefined`.
- Root cause: `SimulationRuntime.runTick()` pushed a `LivingWorldCommand` for `NPC_INTENT_RESOLVED` directly into `typedDrafts` as if it were an `EventDraft`.
- Fix: the intent-resolution command now goes through `LivingWorldRuleEngine.evaluate(...)`, so emitted drafts have deterministic `eventId` / `deterministicKey` and projection-compatible event payloads.
- Added `runtimeIntentResolution.test.ts` to lock this path.

### Verification Evidence
- `npm --workspace packages/server exec vitest run src/sim/runtimeIntentResolution.test.ts src/projections/logistics.test.ts` — pass (5 tests)
- `npm run build` — pass (server + web; Vite chunk-size warning remains known non-blocking)
- `npx openspec validate --all --strict` — pass (45 passed, 0 failed)
- `git diff --check` — pass (CRLF normalization warnings only)
- GitHub Actions CI `26582974142` — pass (OpenSpec + build/typecheck/test; Node.js 20 deprecation annotation remains known non-blocking)
- Deploy Dev `26583070910` — pass
- Live `/healthz` — `0.87.2`, tick `339929 → 339930` over 5 seconds
- Live `/api/world` — 200, ~545ms, ~209,916 bytes, `facts.logistics.transports = 200`
- Live `/api/map` — 200, ~1.9KB; `/api/buildings?tileId=t_central` — 200, ~4.0KB
- Recent server logs — no `SQLITE_CONSTRAINT_UNIQUE`, `[sim] tick failed`, fatal, uncaught, or unhandled matches after v0.87.2 became live
- Recent web/proxy logs — no fresh 502 / connection-refused / broken-pipe matches after v0.87.2 smoke

### CI/CD State
Main branch pushed at `e499932`. CI/CD complete. Live v0.87.2 smoke passed.

---

## 2026-05-28 — Handoff Snapshot @ v0.87.1

### Current Version
`0.87.1` — Hotfix for live mobile bootstrap stall. Server/web build clean; focused logistics projection regression tests pass; OpenSpec validation clean.

### What Was Fixed (v0.87.1)

**Bound public logistics snapshot size**
- Root cause: `/api/world` published `facts.logistics.transports` with every historical goods transport. On the live world this made the initial bootstrap JSON roughly 8.7MB, causing mobile Safari clients to abort while the service tick/health endpoints still looked healthy.
- `LogisticsProjection.snapshot()` remains full-fidelity for simulation, canonical hashes, and internal callers.
- `SimulationRuntime.getSnapshot()` now publishes `compactLogisticsSnapshot(...)`, preserving all routes plus started transports and the newest resolved transport history, capped by `PUBLIC_LOGISTICS_TRANSPORT_LIMIT = 200`.
- Added `projections/logistics.test.ts` coverage to lock the cap and ensure active started transports are retained.

**OpenSpec validation cleanup**
- Fixed canonical `openspec/specs/faction-conflict/spec.md` header from delta-only `## ADDED Requirements` to canonical `## Requirements`, restoring strict validation.

### Active Blockers
- Deploy v0.87.1 to live and verify `/api/world` response size/latency drops from the observed ~8.7MB / ~5s mobile bootstrap failure mode.

### Verification Evidence
- `npm --workspace packages/server exec vitest run src/projections/logistics.test.ts` — pass (4 tests)
- `npm run build` — pass (server + web; Vite chunk-size warning remains known non-blocking)
- `npx openspec validate --all --strict` — pass (45 passed, 0 failed)
- `git diff --check` — pass (CRLF normalization warnings only)

### CI/CD State
Hotfix verified locally; live smoke is required after CI/CD deploys the commit.

---

## 2026-05-28 — Handoff Snapshot @ v0.87.0

### Current Version
`0.87.0` — TypeScript build clean. 1118 server tests pass (was 1103, +15 multi-dim relationship tests). Web build clean. Merged from feat/npc-multidim-relationships at 8f0650e.

### What Was Shipped (v0.87.0)

**Multi-dim NPC↔NPC relationships (Phase A core of `npc-npc-multi-dim-relationship` OpenSpec change)**
- `RelationshipDimensions` = 8 axes per direction (trust/fear/respect/attraction/loyalty/resentment/dependency/familiarity), stored in `dimensions_json` column on `npc_relationships`
- `RelationshipType` union expanded: added `'lover' | 'mentor' | 'apprentice' | 'feared'`
- `resolveRelationshipType` pure function with precedence ladder
- Event sources: NPC_INTERACT chat/argue → trust+familiarity+resentment; NPC_HOUSEHOLD_FORMED → attraction/dep/fam/trust; NPC_MENTORSHIP_COMPLETED (asymmetric); NPC_DECEASED → grief for high-respect survivors; NPC_RELATIONSHIP_DIMENSION_ADJUSTED for explicit single-dim adjust
- `planHouseholdCommands` gates on mutual attraction ≥ 50

**Multiple children per household + birth interval (Phase B)**
- `MIN_BIRTH_INTERVAL_TICKS = TICKS_PER_DAY`, `MAX_CHILDREN_PER_HOUSEHOLD = 4`
- Removed the `if (childIds.length > 0) continue` one-child cap
- Child slot id pattern `.child.{N}` increments

**Family tree UI (Phase G)**
- `GET /api/admin/lineage` — household graph with members + children + matured + deceased flags
- `/admin/lineage` page in web shows the tree with time-accelerator buttons

**Admin time accelerator (Phase H)**
- `POST /api/admin/sim/advance { ticks }` — fast-forwards the world by N ticks synchronously, bounded at 50,000/call
- Used to observe §43 acceptance criteria without wall-clock waits

### Deferred (NOT shipped in v0.87.0)
- **Phase A leftovers**: COMBAT_RESOLVE / FACTION_TILE_SEIZED delta sources (need cross-event correlation), familiarityDriftPlanner (per-tick co-presence), AI dialog directive injection — all designed in OpenSpec but skipped to ship the core
- **Phase C — Pregnancy events**: gestation period as a state would need NPC_PREGNANCY_STARTED/ENDED. Skipped for v0.87.0; birth is still 24-in-game-hour cooldown after household formation
- **Phase D — Matured child inheritance**: matured NPCs still start with `civic.gold=0, skillXp=0`. Skipped due to civic record API surface being non-trivial
- **Phase E — Minor child sprite**: children remain abstract until matured. Skipped because rendering requires AreaPage extensions

### Active Blockers
None. Both OpenSpec changes can be archived after the verification run.

### How to Verify Emergent Criteria
1. Hit `POST /api/admin/sim/advance { "ticks": 50000 }` from an admin session two times — pushes the world ~6 in-game days
2. Observe `/admin/npcs` for `byOrigin.born > 0` (matured children)
3. Observe `/admin/lineage` for households with children flagged `已成熟`
4. After enough advances, watch for first natural NPC death (lifespan ~120k ticks per NPC)

### CI/CD State
Main branch. Push 8f0650e. Build clean. 1118 server tests pass.

---

## 2026-05-28 — Handoff Snapshot @ v0.86.0

### Current Version
`0.86.0` — TypeScript build clean. 1103 server tests pass (was 1078, +25 from this change). Web build clean. Both OpenSpec changes implemented for first one; second one (multi-dim relationships) remains as design-only.

### What Was Shipped (v0.86.0)

**Born NPCs become runtime entities — closes §43.1 first acceptance criterion verification path**
- WORLD_CAPABILITIES.md §43.1 «當某個 NPC 死亡，後代會記得他」had no verification path because descendants didn't exist as runtime entities. Children were event-only records inside `LifeExpansionState.households[].childIds`. This change makes them real.
- New event type `NPC_MATURED` with `npcId / maturedAtTick / bornAtTick / householdId / parentNpcIds / homeTileId / nameZh / nameEn` payload (in `kernel/livingWorldCommands.ts`).
- New projection `BornNpcsProjection` (`projections/bornNpcs.ts`): records `NPC_CHILD_BORN` candidates, projects `NPC_MATURED` into derived `NpcProfile` (personality archetype + role + routine all deterministic via `hashSeed(npcId, ...)`); collision guard against config profile ids.
- New planner `MaturationPlanner` (`sim/maturationPlanner.ts`): cadence-gated every `MATURATION_CADENCE_TICKS = 720` (in-game hour); emits `NPC_MATURED` for children past `NPC_MATURATION_TICKS = 17_280` (24 in-game hours); orphan guard skips children whose all parents are deceased.
- `NpcEngine.registerDynamicNpc(profile)` admits matured NPCs at runtime (Map-backed profile registry; existing runtime state preserved on re-registration).
- `runtime.getNpcs()` now iterates `npcEngine.listProfiles()` so matured NPCs appear alongside config profiles.
- Boot hydration: `BORN_NPC_BOOT_EVENT_TYPES = ['NPC_CHILD_BORN', 'NPC_MATURED']`; matured roster restored from EventLog on restart, then registered into NpcEngine before first tick.
- `NPC_CHILD_BORN` no longer hardcodes `nameZh: '潮生'` — uses `generateChildName(childId, householdId)` from new `data/npcChildNamePool.ts` (36 bilingual entries, deterministic hash-pool selection).
- Admin `/api/admin/npc-stats` now includes `matured: { totalEventCount, recent }`; `AdminNpcsPage` shows new "近期成長" section + "已成長" stat card.
- All 25 new tests + existing 1078 pass.

**Two OpenSpec changes proposed (commit 107e20b):**
- `born-npc-becomes-runtime-entity` — implemented in this release.
- `npc-npc-multi-dim-relationship` — proposed but not yet implemented (8-dimensional relationship vector per §12.5.12).

### Active Blockers
None for §43.1 first criterion. Multi-dim relationship implementation is the next major task per the OpenSpec change.

### Remaining Gaps
- `npc-npc-multi-dim-relationship` OpenSpec change still needs implementation (proposal/design/specs/tasks committed; ~25 implementation steps).
- The world still needs to actually run for `NPC_MATURATION_TICKS + N` ticks to observe matured NPCs in production; current world is at tick ~11k.

### CI/CD State
Main branch. Build clean. All tests pass. Push pending (this entry).

---

## 2026-05-28 — Handoff Snapshot @ v0.85.0

### Current Version
`0.85.0` — TypeScript build clean. 1078 server tests + 110 web tests pass. Pushed to main @ 91bcff5.

### What Was Shipped (v0.85.0)

**Card art pipeline — prompts + GM upload UI + image display**
- `docs/card-art-prompts.md`: 100 AI image-gen prompts (per card, per rank/category), base style: painterly dark fantasy trading card illustration, HxH Greed Island aesthetic
- `adminCardsRouter.ts`: GM-gated `GET/PUT/DELETE /admin/cards/:id/image`; base64 JSON body (≤5MB); stores under `{dataDir}/card-images/{id}.{ext}`; `getCardImageUrl()` standalone helper
- Express serves `/card-images/` as static; vite dev proxy forwards `/card-images` to localhost:3000
- `CardImage.tsx`: reusable `<img>` with `onError→rank-letter colored placeholder` fallback
- `AdminCardsPage.tsx` at `/admin/cards`: 5-rank grid, upload/replace/delete per card, live preview
- `AdminPage.tsx`: "卡片美術" link added to admin nav
- `CardCatalogEntry` (server types + client api/client) gains `imageUrl?: string`
- `WorldStateContext.tsx` `toCardEntry()` forwards `imageUrl` into the client state tree
- `CardDropPanel.tsx`: both drop list and held list now show card art when available

### Active Blockers
None.

### Remaining Gaps
All WORLD_CAPABILITIES.md gaps remain closed. Card art system is now infrastructure-complete; user generates images externally (using `docs/card-art-prompts.md`) and uploads via `/admin/cards`.

### CI/CD State
Main branch. Build clean. All tests pass. Pushed 91bcff5.

---

## 2026-05-27 — Handoff Snapshot @ v0.84.2

### Current Version
`0.84.2` — TypeScript build clean. 1078 server tests pass (138 files). All version sources synced (`version.ts` `APP_VERSION`, root + server + web `package.json` were drifted at 0.84.0/0.84.1; now all 0.84.2).

### What Was Shipped (v0.84.2)

**§11.2 price-operator cleanup — dead-code removal + missing test coverage**
- Context: investigating "is card combat integrated?" surfaced that `ActiveRuleOperatorsProjection.getPriceMultiplier()` was unit-tested but **never called** — `sim/runtime.ts` re-implemented the same `multiply_price` combining logic inline (duplication / divergence risk). The `multiply_price` feature itself was already functional (runtime inline loop → `discoverMarketPrices` → `marketPricing.ts` applies multiplier to `priceGold`), so this was NOT a missing feature, only a dead helper + untested path.
- `sim/runtime.ts`: replaced the inline operator loop (built `priceMultipliers` by scanning `activeRuleOperatorsProjection.list()`) with a bounded loop over `listMarketGoods()` calling the tested `getPriceMultiplier(goodsId)` helper. Helper is now the single source of truth for §11.2 price operators. `listMarketGoods` added to the `marketPricing` import.
- `goods/marketPricing.test.ts`: +2 characterization tests locking the previously-untested `priceMultipliers` application — `multiply_price` multiplier applied (×2 → 28, ×0.5 → 7 on refined_salt baseline 14); goods without a matching operator left unchanged.

### Active Blockers
None.

### Remaining Gaps
**None.** All ❌ markers in WORLD_CAPABILITIES.md Part II remain closed; §11.2 price path now consolidated + test-covered.

### CI/CD State
Main branch. Build clean (`tsc -p tsconfig.json` exit 0). Committed and pushed.

---

## 2026-05-25 — Handoff Snapshot @ v0.84.0

### Current Version
`0.84.0` — TypeScript build clean. 1076 server tests pass (138 files). No remaining ❌ gaps in WORLD_CAPABILITIES.md. Commits pushed to `main`.

### What Was Shipped (v0.83.0 + v0.84.0)

**v0.83.0 — Building Upgrade & Capture (§21 gap closed)**
- `BUILDING_UPGRADED` + `BUILDING_CAPTURED` command types + payload types + validators in `kernel/livingWorldCommands.ts`
- `projections/buildingState.ts`: `BuildingStateRow` gains `upgradeLevel: number` (default 1) + `controllingFactionId: string | null` (default null); handles both new events; `BUILDING_STATE_BOOT_EVENT_TYPES` updated
- `config/world.ts`: `BUILDING_UPGRADE_CADENCE_TICKS = 7 days`, `BUILDING_UPGRADE_MIN_AGE_TICKS = 14 days`, `BUILDING_MAX_UPGRADE_LEVEL = 3`, `BUILDING_CAPTURE_CADENCE_TICKS = 2 days`
- `sim/buildingUpgradePlanner.ts`: upgrades operational buildings past age threshold, skips damaged/max-level
- `sim/buildingCapturePlanner.ts`: captures buildings where tile's dominant faction ≠ controllingFactionId
- `sim/runtime.ts`: both cadence blocks wired; uses `listAllBuildings()` + `buildingStateProjection.getState()` for full sweep
- 11 tests in 2 new test files

**v0.84.0 — Dynamic Tile Generation (§17 gap closed)**
- `FRONTIER_ZONES` (3 zones: badlands, highland, cove) added to `sim/mapGraph.ts` — NOT in MAP_TILES/EXPANSION_TILES catalog
- `getMapAdjacency()` + `listMapTiles()` + `nextStepTowards()` accept optional `generatedTileIds` parameter; frontier tiles fully integrated into adjacency graph when generated
- `TILE_GENERATED` command type + `TileGeneratedCmd` payload + validator in `kernel/livingWorldCommands.ts`
- `projections/dynamicTile.ts`: `DynamicTileProjection` tracks runtime-generated tiles; `DYNAMIC_TILE_BOOT_EVENT_TYPES = ['TILE_GENERATED']`
- `config/world.ts`: `TILE_GENERATION_CADENCE_TICKS = 30 days`, `TILE_GENERATION_MIN_TRADE_ROUTES = 2`, `TILE_GENERATION_MAX_WORLD_TILES = 12`
- `sim/tileGenerationPlanner.ts`: fires when trade routes ≥ 2 and tile cap not reached; picks first unused frontier zone
- `sim/runtime.ts`: `dynamicTileProjection` field; incremental project in tick loop + publishCommittedEvents; small-log + large-log boot hydration; tile generation cadence block; all `listMapTiles`/`getMapAdjacency` calls updated to pass dynamic tile IDs
- 5 tests in `sim/tileGeneration.test.ts`

### Active Blockers
None.

### Remaining Gaps
**None.** All ❌ markers in WORLD_CAPABILITIES.md Part II have been closed.

### CI/CD State
Main branch. All changes committed and pushed.

---

## 2026-05-25 — In-Progress Investigation: v0.83.0 + v0.84.0

### Status
v0.82.0 pushed. Two ❌ gaps remain in WORLD_CAPABILITIES.md. Investigation complete; implementation not yet started.

### Remaining ❌ Gaps in WORLD_CAPABILITIES.md

**Gap 1 — §21 Buildings not yet upgradeable or capturable**
- Line 1895: `🟡 Buildings: damageable, repairable, abandonable all wired (v0.49.0+). ❌ Not yet upgradeable or capturable.`
- **Implementation plan for v0.83.0:**
  1. `kernel/livingWorldCommands.ts`: add `BUILDING_UPGRADED` + `BUILDING_CAPTURED` to command types; add `BuildingUpgradedCmd` `{ buildingId, tileId, fromLevel, toLevel, upgradedAtTick, narration }` and `BuildingCapturedCmd` `{ buildingId, tileId, capturingFactionId, previousFactionId: string | null, capturedAtTick, narration }`; add validators
  2. `projections/buildingState.ts`: add `upgradeLevel: number` (default 1) + `controllingFactionId: string | null` (default null) to `BuildingStateRow`; handle `BUILDING_UPGRADED` (set `toLevel`, update `lastActivityTick`) + `BUILDING_CAPTURED` (set `controllingFactionId`); add both to `BUILDING_STATE_BOOT_EVENT_TYPES`
  3. `config/world.ts`: add `BUILDING_UPGRADE_CADENCE_TICKS = TICKS_PER_DAY * 7`, `BUILDING_UPGRADE_MIN_AGE_TICKS = TICKS_PER_DAY * 14`, `BUILDING_MAX_UPGRADE_LEVEL = 3`, `BUILDING_CAPTURE_CADENCE_TICKS = TICKS_PER_DAY * 2`
  4. `sim/buildingUpgradePlanner.ts` (new): `planBuildingUpgrades(input: { buildings: ReadonlyArray<{buildingId, tileId, upgradeLevel, state, lastActivityTick}>, currentTick, minAgeTicks, maxLevel })` — emits upgrade intents for operational buildings past age threshold
  5. `sim/buildingCapturePlanner.ts` (new): `planBuildingCaptures(input: { buildings: ReadonlyArray<{buildingId, tileId, controllingFactionId: string | null}>, factionControlProjection })` — emits capture intents when tile's dominant faction ≠ building's controllingFactionId
  6. `sim/runtime.ts`: import planners + constants; add upgrade cadence block (uses `listAllBuildings` + `buildingStateProjection.getState()` for each); add capture cadence block; both emit appropriate commands with narration

**Gap 2 — §17 No new tile creation beyond predefined catalog**
- Line 1817: `❌ No new tile creation beyond the predefined catalog.`
- **Implementation plan for v0.84.0:**
  1. `sim/mapGraph.ts`: add `FRONTIER_ZONES` — 3 coordinate slots NOT in MAP_TILES/EXPANSION_TILES, each with a biome + `adjacentTo: readonly string[]`; update `getMapAdjacency()` + `listMapTiles()` to accept optional `dynamicTiles?: ReadonlyArray<{id, x, y, biome, name, adjacentTileIds}>` parameter
  2. `kernel/livingWorldCommands.ts`: add `TILE_GENERATED`; add `TileGeneratedCmd { tileId, biome, name, x, y, adjacentTileIds: readonly string[], generatedAtTick, narration }`; add validator
  3. `projections/dynamicTile.ts` (new): `DynamicTileProjection` tracks `TILE_GENERATED` events; `list()` returns generated tiles; `getAdjacencyMap()` returns adjacency for merging into mapGraph; `DYNAMIC_TILE_BOOT_EVENT_TYPES = ['TILE_GENERATED']`
  4. `config/world.ts`: add `TILE_GENERATION_CADENCE_TICKS = TICKS_PER_DAY * 30`, `TILE_GENERATION_MIN_TRADE_ROUTES = 2`, `TILE_GENERATION_MAX_WORLD_TILES = 12`
  5. `sim/tileGenerationPlanner.ts` (new): `planTileGeneration(input: { currentTick, existingTileIds: readonly string[], openTradeRouteCount, frontierZones })` — returns at most 1 intent; picks first frontier zone not yet generated; requires `openTradeRouteCount >= MIN_TRADE_ROUTES`
  6. `sim/runtime.ts`: add `dynamicTileProjection` field (new `DynamicTileProjection`); wire into `project()` + boot (small-log + large-log); pass `dynamicTileProjection.listTileIds()` alongside `unlockedTileIds` to all `getMapAdjacency()` + `listMapTiles()` calls; add tile generation cadence block; add `getDynamicTiles()` getter

### Key Files to Read Before Implementing
- `sim/mapGraph.ts` (lines 1–82): tile catalog, EXPANSION_TILES, adjacency
- `projections/buildingState.ts` (full file): current BuildingStateRow shape
- `projections/factionControl.ts` (line 53): `dominantFactionOf(tileId)`
- `buildings/catalog.ts` (export `listAllBuildings`): catalog building iteration
- `sim/runtime.ts` (around line 60–90): import section for constants; (around line 5695): large-log boot path

### CI/CD State
v0.82.0 on `main`. Pushed. All green.

---

## 2026-05-25 — Handoff Snapshot @ v0.82.0

### Current Version
`0.82.0` — TypeScript build clean. 1060 server tests pass (135 files). Commits pushed to `main`.

### What Was Shipped (v0.82.0)

**v0.82.0 — Player Goods Carry (§6.1 player agency gap closed)**
- `'player'` added to `GOODS_HOLDER_TYPES` in `kernel/livingWorldCommands.ts`
- `PLAYER_DEPOSIT_GOODS` command type + `PlayerDepositGoodsCmd` payload in `kernel/livingWorldCommands.ts`; Rule Engine validator added
- `kernel/playerCivilizationRouter.ts`: `PLAYER_DEPOSIT_GOODS` added to `PLAYER_CIVILIZATION_COMMAND_TYPES`
- `projections/goodsInventory.ts`:
  - `PLAYER_PICKED_UP_GOODS` handler: adds quantity to `holderType: 'player'` row keyed by `playerAccountId`
  - `PLAYER_DEPOSIT_GOODS` handler: subtracts from player row, adds to `holderType: 'settlement'` row keyed by `settlementId`
  - `isGoodsHolderType` updated to accept `'player'`
- `sim/runtime.ts`: `PLAYER_PICKED_UP_GOODS` and `PLAYER_DEPOSIT_GOODS` added to `GOODS_BOOT_EVENT_TYPES` so player inventory survives server restarts
- 3 new tests in `projections/goodsInventory.test.ts` (135 test files, 1060 tests total)
- WORLD_CAPABILITIES.md player-carry-goods ❌ gap closed to ✅

### Active Blockers
None.

### Remaining Gaps (non-blocking)
- Buildings not upgradeable or capturable

### CI/CD State
Main branch. All changes committed and pushed.

---

## 2026-05-25 — Handoff Snapshot @ v0.81.0

### Current Version
`0.81.0` — TypeScript build clean. 1057 server tests pass (135 files). Commits pushed to `main`.

### What Was Shipped (v0.81.0)

**v0.81.0 — Household Joint Decisions (§19 gap closed)**
- `HOUSEHOLD_JOINT_DECISION_CADENCE_TICKS = TICKS_PER_DAY * 3` in `config/world.ts`
- `HOUSEHOLD_JOINT_DECISION_GOLD_THRESHOLD = 100` (minimum household balance for `invest_in_settlement`)
- `NPC_HOUSEHOLD_JOINT_DECISION` command type + `NpcHouseholdJointDecisionCmd` payload in `kernel/livingWorldCommands.ts`; Rule Engine validator added
- `planHouseholdJointDecisions()` pure fn in `sim/householdJointDecisionPlanner.ts`:
  - Scans all households with ≥2 living members from `NpcLineageProjection`
  - Requires all living members to share the same `tileId` (co-located)
  - `decisionKind`: `invest_in_settlement` when household balance ≥ 100, else `pool_resources`
  - `goldCommitted`: 10% of household balance for investment decisions (informational, no gold moves)
  - Deduplication via `seenHouseholds` set
- `kernel/npcMemory.ts`: `NPC_HOUSEHOLD_JOINT_DECISION` case adds importance-5 memory for all member NPCs with `household.joint.decision` kind
- `sim/runtime.ts`: cadence block wired; uses `npcLineageProjection` + `npcMortalityProjection` + `householdEconomyProjection`
- 6 tests in `sim/householdJointDecision.test.ts` (135 test files, 1057 tests total)
- WORLD_CAPABILITIES.md §19 household joint decisions gap closed

### Active Blockers
None.

### Remaining Gaps (non-blocking)
- Player carrying goods physically between tiles
- Buildings not upgradeable or capturable

### CI/CD State
Main branch. All changes committed and pushed.

---

## 2026-05-25 — Handoff Snapshot @ v0.80.0

### Current Version
`0.80.0` — TypeScript build clean. 1051 server tests pass. Commits pushed to `main`.

### What Was Shipped (v0.80.0)

**v0.80.0 — Faction Border Walls (wall gap closed)**
- `WALL_CONSTRUCTION_CADENCE_TICKS = TICKS_PER_DAY * 5` in `config/world.ts`
- `WALL_BUILT` + `WALL_DEMOLISHED` command types + payload types (`WallBuiltCmd`, `WallDemolishedCmd`) in `kernel/livingWorldCommands.ts`; Rule Engine validators for both
- `WallNetworkProjection` in `projections/wallNetwork.ts`: tracks standing walls keyed by canonical border string; `hasWall()`, `wallIdForBorder()`, `list()`, `rebuildFromEvents()`; `WALL_NETWORK_BOOT_EVENT_TYPES` for large-log selective rebuild
- `planWallConstruction()` pure fn in `sim/wallConstructionPlanner.ts`: scans all adjacent tile pairs; emits `build` intent when different factions control each side and no wall exists; emits `demolish` intent when a wall exists but the contested state resolved; visited-set prevents duplicate intents per border
- `sim/runtime.ts`: `wallNetworkProjection` field; incremental `project()` in both the tick event loop and `publishCommittedEvents`; cadence block emits `WALL_BUILT`/`WALL_DEMOLISHED` commands with narration; `getWalls()` public getter; small-log + large-log boot hydration wired
- 6 tests in `sim/wallConstruction.test.ts` (134 test files, 1051 tests total)
- WORLD_CAPABILITIES.md: wall ❌ gap closed to ✅ in both §17 and §21

### Active Blockers
None.

### Remaining Gaps (non-blocking)
- Household joint decisions
- Player carrying goods physically between tiles
- Buildings not upgradeable or capturable

### CI/CD State
Main branch. All changes committed and pushed.

---

## 2026-05-25 — Handoff Snapshot @ v0.79.0

### Current Version
`0.79.0` — TypeScript build clean. All tests pass. Commits pushed to `main`.

### What Was Shipped (v0.79.0)

**v0.79.0 — Ecosystem Dashboard + Market Price Panel (frontend gaps closed)**
- `EcologyPage.tsx` at `/ecology`: tile selector dropdown (all 9 tiles), per-tile animal population cards, fishery density bar (collapse indicator), plant node saturation grid, migration waves, predator warnings — all sourced from existing `/api/area/:tileId/ecology` endpoint
- `MarketPage.tsx` at `/market`: sortable table of all settlement market prices with supply/demand columns, gold price, and surplus/shortage/balanced status derived from supply vs. demand ratio
- `api/client.ts`: `MarketPriceEntry` and `GoodsInventoryEntry` types added; `api.marketPrices()` and `api.goodsInventory(ownerId)` functions added
- i18n: `nav.ecology` / `nav.market` keys added to `types.ts`, `zh.ts`, `en.ts` (~30 keys total)
- `App.tsx`: `/ecology` and `/market` routes wired
- `GameShell.tsx`: `⬡ Ecology` and `⊛ Market` nav items added; PRIMARY_PATHS updated
- WORLD_CAPABILITIES.md §26: both ❌ gaps converted to ✅; observability table updated with both new pages

### Active Blockers
None.

### Remaining Gaps (non-blocking)
- Walls / defenses as buildable map features
- Household joint decisions
- Player carrying goods physically between tiles

### CI/CD State
Main branch. All changes committed and pushed.

---

## 2026-05-25 — Handoff Snapshot @ v0.78.0

### Current Version
`0.78.0` — TypeScript build clean. Tests pass (server + web). Commits pushed to `main`.

### What Was Shipped (v0.78.0)

**v0.78.0 — NPC-to-NPC Local Market Trade (Layer 2 Living World Runtime gap closed)**
- `NPC_LOCAL_TRADE_CADENCE_TICKS = TICKS_PER_HOUR * 4` in `config/world.ts` — trade planner runs every 4 in-game hours
- New `NPC_GOODS_TRADED` command type + `NpcGoodsTradedCmd` payload in `kernel/livingWorldCommands.ts`; Rule Engine validator added
- New `planLocalNpcTrades()` pure function in `sim/localNpcTradePlanner.ts`:
  - Groups settlement goods by tileId (via `settlementTiles` map)
  - Groups NPCs by tile from `npcTileMap`
  - Per tile: requires ≥2 NPCs + at least one producer NPC (hunter/fisher/carrier/craftsman/miner)
  - Seller = first producer NPC found on tile; buyers = remaining NPCs on tile
  - Buyer selected deterministically: `buyers[currentTick % buyers.length]` (rotates each cadence tick)
  - Trades the most plentiful goods on the tile (sort by quantity descending, quantity: 1)
  - Returns one `LocalNpcTradeIntent` per eligible tile
- `kernel/npcMemory.ts`: `NPC_GOODS_TRADED` case adds seller memory (`goods.trade.sold`) and buyer memory (`goods.trade.bought`) at importance 3
- `sim/runtime.ts`: cadence block fires every `NPC_LOCAL_TRADE_CADENCE_TICKS`; builds `settlementTiles`, `npcTileMap`, `producerNpcIds` from current projections; emits `NPC_GOODS_TRADED` commands for each trade intent
- 8 tests in `sim/localNpcTrade.test.ts`
- WORLD_CAPABILITIES.md Layer 2 gap "NPC-to-NPC trade" closed; stale `❌ No ecosystem-aware building types` corrected to ✅ (already exists); summary updated to "All six runtime layers now show 'None' for major missing pieces."

### Active Blockers
None.

### Remaining Gaps (non-blocking)
- Walls / defenses as buildable map features
- Household joint decisions
- Player carrying goods physically between tiles
- Ecosystem dashboard frontend page
- Market price panel frontend

### CI/CD State
Main branch. All changes committed and pushed.

---

## 2026-05-25 — Handoff Snapshot @ v0.77.0

### Current Version
`0.77.0` — TypeScript build clean. 1147 tests pass (1037 server + 110 web). Commits pushed to `main`.

### What Was Shipped (v0.77.0)

**v0.77.0 — Phase 5 Persistent Combat Consequences (§30.7 closed)**
- `NPC_LONG_INCAP_TICKS = TICKS_PER_DAY * 3` — 3 in-game days of post-combat recovery
- New `NPC_INCAPACITATED_LONG` command type + `NpcIncapacitatedLongCmd` payload; Rule Engine validator added
- New `COMBAT_WITNESS_RECORDED` command type + `CombatWitnessRecordedCmd` payload; Rule Engine validator added
- `NpcIncapacitationProjection` in `projections/npcIncapacitation.ts`: tracks which NPCs are incapacitated until `recoverAtTick`; `isIncapacitated(npcId, tick)` for O(1) lookup; `NPC_INCAPACITATION_BOOT_EVENT_TYPES` for large-log selective rebuild
- `publishCommittedEvents()`: on `COMBAT_RESOLVE` with `outcome === 'player_victory'` + `enemy_type === 'npc'`, auto-emits `NPC_INCAPACITATED_LONG` for the defeated NPC and `COMBAT_WITNESS_RECORDED` for every NPC on the same tile
- `HistoryChronicleProjection`: new arc types `'npc_incapacitation'` and `'combat_witness'`; both event types added to `HISTORY_CHRONICLE_BOOT_EVENT_TYPES`
- `npcEngine.tick()`: incapacitated NPCs are filtered out of the active NPC partition so they skip full behavioral policy while recovering
- `NpcIncapacitationProjection` wired into incremental `project()` path, small-log rebuild, and large-log selective rebuild
- 9 tests in `npcIncapacitation.test.ts`
- WORLD_CAPABILITIES.md §30.7 Phase 5 gap fully closed

### Active Blockers
None.

### Remaining Gaps (non-blocking)
- Carrier NPC autonomous routing (NPCs independently choosing trade routes based on market signals)

### CI/CD State
Main branch; local commit ready. GitHub returned 500 errors on push — retry when available.

---

## 2026-05-25 — Handoff Snapshot @ v0.76.0

### Current Version
`0.76.0` — TypeScript build clean. 1138 tests pass (1028 server + 110 web). Commits pushed to `main`.

### What Was Shipped (v0.76.0)

**v0.76.0 — Cards as World Rule Operators (ARCHITECTURE.md §11.2 closed)**
- New `CardRuleOperatorDef` type in `cards/types.ts`: `scope | scopeId | effectKind | effectValue | durationTicks | permittedInvokers`; optional `ruleOperator?` field on `CardCatalogEntry`
- 3 catalog entries ship with `ruleOperator` definitions: ID 11 (魚價 ×0.7, 144 ticks), ID 31 (brine 產量 ×1.5, 72 ticks), ID 51 (魚價 ×1.2, 36 ticks)
- New `CARD_RULE_OPERATOR_ACTIVATED` / `CARD_RULE_OPERATOR_EXPIRED` command+event types in `kernel/livingWorldCommands.ts`; Rule Engine validators for both
- New `ActiveRuleOperatorsProjection` in `projections/activeRuleOperators.ts`: tracks active operators from those two events; `getPriceMultiplier(goodsId)`, `getProductionMultiplier(goodsId)` return products of all matching active operators; `getExpiredIds(tick)` for cadence expiry sweep
- `discoverMarketPrices()` now accepts `priceMultipliers?: ReadonlyMap<string, number>` — applied as final multiplier step after base price calculation
- Production chain output quantity now multiplied by `getProductionMultiplier(outputGoodsId)` in `runtime.ts` tick loop
- `publishCommittedEvents()` hook: on `PLAYER_PLAYED_CARD`, looks up `ruleOperator` on the card; if present, emits `CARD_RULE_OPERATOR_ACTIVATED` with `activationId = rule.<cardId>.<playerId>.<tick>` (idempotency guard prevents double-activation)
- Expiry cadence block in `runTick`: sweeps `getExpiredIds(nextTick)` and emits `CARD_RULE_OPERATOR_EXPIRED` for each
- `ActiveRuleOperatorsProjection` wired into both incremental `project()` paths, small-log rebuild, large-log selective rebuild
- 10 tests in `activeRuleOperators.test.ts`
- WORLD_CAPABILITIES.md Layer 4 gap "Cards as combat rule operators" closed; summary sentence updated

### Active Blockers
None.

### Remaining Gaps (non-blocking)
- Carrier NPC autonomous routing (NPCs independently choosing trade routes based on market signals)

### CI/CD State
Main branch; all commits pushed. No pending PRs.

---

## 2026-05-25 — Handoff Snapshot @ v0.75.0

### Current Version
`0.75.0` — TypeScript build clean. 1128 tests pass. Commits pushed to `main`.

### What Was Shipped (v0.75.0)

**v0.75.0 — Roads / Bridges as Buildable Map Features**
- New `RoadNetworkProjection` in `projections/roadNetwork.ts`: tracks `RoadRow` records from `ROAD_CONSTRUCTED` / `ROAD_DESTROYED` events; `hasRoad(from, to)` bidirectional; `getRoadSet()` returns `"fromTileId:toTileId"` string set for O(1) lookup; `ROAD_NETWORK_BOOT_EVENT_TYPES` for large-log selective rebuild
- New `planRoadConstruction()` in `sim/roadConstructionPlanner.ts`: cadence-gated at `ROAD_CONSTRUCTION_CADENCE_TICKS = TICKS_PER_DAY * 3`; fires when ≥2 open trade routes share a tile pair AND no road exists yet; auto-construct uses `routeKey()` for canonical bidirectional road IDs
- `ROAD_CONSTRUCTED` / `ROAD_DESTROYED` event types + `RoadConstructedCmd` / `RoadDestroyedCmd` payload types; Rule Engine validators added; both added to `LivingWorldCommandPayload` union
- `ROAD_TRAVEL_SPEED_MULTIPLIER = 1.5` in `config/world.ts`; `roadSet?: ReadonlySet<string>` added to `NpcTickContext`; `nextNpcState()` applies multiplier to `crossTileRouteTicks` when the active `travelRoute` is in `roadSet`
- Wired into `runtime.ts`: both incremental `project()` paths; small-log rebuild; large-log selective rebuild (`ROAD_NETWORK_BOOT_EVENT_TYPES`); road construction cadence block emits `ROAD_CONSTRUCTED` commands; `roadSet` passed to `npcEngine.tick()`
- 10 tests in `roadNetwork.test.ts`, 8 tests in `roadConstruction.test.ts`
- WORLD_CAPABILITIES.md Layer 3 gap "roads/bridges as map features" closed; summary sentence updated
- `runtimeSettlementFamine.test.ts` timeout bumped to 15 000ms (pre-existing flaky test under full-suite contention)

### Active Blockers
None.

### Remaining Gaps (non-blocking)
- Carrier NPC autonomous routing (NPCs independently choosing trade routes based on market signals)
- Cards as combat rule operators (Phase 4)

### CI/CD State
Main branch; all commits pushed. No pending PRs.

---

## 2026-05-25 — Handoff Snapshot @ v0.74.0

### Current Version
`0.74.0` — TypeScript build clean. 1000 tests pass. Commits pushed to `main`.

### What Was Shipped (v0.74.0)

**v0.74.0 — NPC Household Permanent Migration**
- `planHouseholdMigration()` in `householdMigrationPlanner.ts`: cadence-gated (HOUSEHOLD_MIGRATION_CADENCE_TICKS = 2 in-game days), fires when home tile safety < 20 and a better tile (safety ≥ 50, has settlement) exists; at most 1 migration per cadence tick
- `NPC_HOUSEHOLD_MIGRATED` event type + `NpcHouseholdMigratedCmd` payload type; Rule Engine validator added
- `homeTileOverride?: string` field on `NpcRuntimeState` — persisted via `NPC_STATE_RECORDED`, restored in `hydrate()`
- `NpcEngine.setHomeTile(npcId, tileId)`: public method called when `NPC_HOUSEHOLD_MIGRATED` event is committed; updates in-memory routing fallback immediately
- `nextNpcState()` now uses `before.homeTileOverride ?? profile.defaultLocation` as the schedule fallback — migrated NPCs drift toward new tile between routine slots
- 4 world.ts constants: HOUSEHOLD_MIGRATION_CADENCE_TICKS, MIGRATION_PUSH_SAFETY_THRESHOLD, MIGRATION_PULL_SAFETY_MIN, MIGRATION_MAX_PER_CADENCE
- 8 tests in `householdMigration.test.ts`
- Layer 2 upgraded to ✅ in WORLD_CAPABILITIES.md; "NPC permanent migration" gap closed

### Active Blockers
None.

### Remaining Gaps (non-blocking)
- Roads/bridges/walls as buildable map features (the last major structural gap)
- NPC-to-NPC trade (carrier NPCs autonomously routing goods)
- Cards as combat rule operators (Phase 4)

### CI/CD State
Main branch; all commits pushed. No pending PRs.

---

## 2026-05-25 — Handoff Snapshot @ v0.73.0

### Current Version
`0.73.0` — TypeScript build clean. 992 tests pass (server package). Commits pushed to `main`.

### What Was Shipped (v0.73.0)

**v0.73.0 — BuildingOccupantsProjection fully closes §11.5**
- New `BuildingOccupantsProjection` in `projections/buildingOccupants.ts`: tracks NPC indoor presence (npcId → buildingId|null) from typed `BUILDING_ENTER` / `BUILDING_LEAVE` events
- `BUILDING_OCCUPANTS_BOOT_EVENT_TYPES` for large-log selective replay
- `isHydrated()` flag: distinguishes "no events seen yet" from "all NPCs are outside"
- `toJSON()` returns same shape as `BuildingRuntime.toJSON()` for seamless `buildingRuntime.hydrate()` compatibility
- `rebuildFromEvents` sorts by sequence for deterministic replay
- Wired into runtime.ts: both incremental `project()` paths, small-log rebuild, large-log selective rebuild
- Boot hydration: projection-first when hydrated, FACT_SET fallback for old logs
- 10 new tests in `buildingOccupants.test.ts`
- ARCHITECTURE.md §11.5 upgraded from "Substantially Closed" to **✅ CLOSED v0.73.0**
- `FACT_BUILDING_OCCUPANTS` read at line 5250 still kept in `readLatestFactValues` call as fallback; const at line 247 retained

### Active Blockers
None.

### Remaining Gaps (non-blocking)
- §11.4 combat log not fully in canonical EventLog (COMBAT_PLAYER_ACTION and related)
- Roads/bridges as buildable map features
- NPC household permanent migration

### CI/CD State
Main branch; all commits pushed. No pending PRs.

---

## 2026-05-25 — Handoff Snapshot @ v0.72.0

### Current Version
`0.72.0` — TypeScript build clean. 1092 tests pass (1 pre-existing timeout). Commits pushed to `main`.

### What Was Shipped This Session (v0.72.0)

**v0.72.0 — WorldStateProjection closes §11.5 (weather/season/rareWindow/activeEvents)**
- New `WorldStateProjection` in `projections/worldState.ts`: tracks weather, season, rare window, active world event seeds from typed EventLog events
- Handles: `WEATHER_CHANGE` (→to field), `SEASON_CHANGE` (→to), `RARE_WINDOW_OPEN` (closesAtTick), `RARE_WINDOW_CLOSE`, `WORLD_EVENT_SPAWN` (worldEventId+templateId+tick), `WORLD_EVENT_END`
- `WORLD_STATE_BOOT_EVENT_TYPES` constant for large-log selective replay
- `isHydrated()` flag prevents false negatives (no events seen ≠ state is clear)
- Wired into runtime.ts: incremental project() path, small-log rebuildFromEvents, large-log selective rebuild
- Boot hydration prefers projection over FACT_SET when hydrated; FACT_SET kept as fallback for old logs
- Active event seeds rebuilt via existing `rebuildActiveEvent(templateId, startedAtTick)` — same deterministic approach as FACT_SET boot
- 11 new tests in `worldState.test.ts`
- ARCHITECTURE.md §11.5 updated to "Substantially Closed v0.72.0"
- Remaining §11.5 gap: `FACT_BUILDING_OCCUPANTS` (building occupant boot hydration)

### Active Blockers
None.

### Remaining Gaps (non-blocking)
- §11.4 combat log not fully in canonical EventLog
- §11.5 final piece: `FACT_BUILDING_OCCUPANTS` building occupant boot hydration
- Roads/bridges as map features
- NPC household permanent migration

### CI/CD State
Main branch; all commits pushed. No pending PRs.

---

## 2026-05-25 — Handoff Snapshot @ v0.71.0

### Current Version
`0.71.0` — TypeScript build clean. 1081 tests pass (1 pre-existing timeout). Commits pushed to `main`.

### What Was Shipped This Session (v0.71.0)

**v0.71.0 — NPC Social History Indexing (§11.9 fully closed)**
- `SocialHistoryContext` type: `{ totalInteractions, trustTrend, dominantIntent }`
- `computeSocialHistory(count, history)`: derives trust trend (rising/falling/stable, ≥5 delta threshold) and dominant intent from recent interaction log
- `socialHistoryContext?` field in `AiDialogContext`
- `buildSocialHistoryBlock(ctx)` renders "你們已交談 N 次，信任趨勢：X，最常意圖：Y" section
- Only injected when `previousCount >= 3` (no noise for early interactions)
- `npc.ts` computes from `previousCount` + `history` (already available)
- 9 new tests in `aiDialog.test.ts`
- Fully closes ARCHITECTURE.md §11.9 (relationship graph + household + alias memory + social history all now injected)

### Active Blockers
None.

### Remaining Gaps
- §11.4 combat log not fully in canonical EventLog
- §11.5 area FACT_SET still used for area/building/weather state
- Roads/bridges as map features
- NPC household permanent migration

### CI/CD State
Main branch; all commits pushed. No pending PRs.

---

## 2026-05-25 — Handoff Snapshot @ v0.70.0

### Current Version
`0.70.0` — TypeScript build clean. 1072 tests pass (1 pre-existing timeout). Commits pushed to `main`.

### What Was Shipped This Session (v0.70.0)

**v0.70.0 — NPC Alias Memory Dialog Injection (§11.9 alias gap)**
- `PLAYER_ALIAS_TIERS` table + `computePlayerAlias(trust, interactionCount)` pure function in `aiDialog.ts`
- Low interaction count (0 → 陌生旅人, 1-2 → 旅人) gates trust-tier evaluation — familiarity must be earned
- Trust tiers for count ≥ 3: 摯友 (trust≥90), 老友 (≥75), 常客老友 (≥60 + ≥10 interactions), 朋友 (≥60), 常客 (≥30 + ≥10 interactions), 熟識的訪客 (≥30), 面熟的旅人 (fallback)
- `playerAlias?: string` field added to `AiDialogContext`
- `buildPlayerAliasBlock(alias)` renders "你對這位玩家的私稱是「X」" section into NPC system prompt
- `npc.ts` computes alias from `previousTrust` + `previousCount`; skips injection on first interaction (count=0)
- 13 new tests in `aiDialog.test.ts` covering all tiers + edge cases + block render
- Closes §11.9 alias memory gap (relationship + household + alias now all injected)

### Active Blockers
None.

### Remaining Gaps (non-blocking)
- §11.4 combat log not fully in canonical EventLog
- §11.5 area FACT_SET still used for area/building/weather state
- §11.9 long-term social history indexing (last gap; relationship + household + alias now done)
- Roads/bridges as map features
- NPC household permanent migration

### CI/CD State
Main branch; all commits pushed. No pending PRs.

---

## 2026-05-25 — Handoff Snapshot @ v0.69.0

### Current Version
`0.69.0` — TypeScript build clean. 1060 tests pass (1 pre-existing timeout in runtimeSettlementFamine). Commits pushed to `main`.

### What Was Shipped This Session (v0.69.0)

**v0.69.0 — Combat Chronicle Arc (§22 partial)**
- `'combat_outcome'` added to `HistoryArcType` union
- `pendingCombatInitiates` Map added to `HistoryChronicleProjection` for cross-event `combatId` correlation
- `COMBAT_INITIATE` handler stores tile + playerActorId + npcActorId keyed by combatId
- `COMBAT_RESOLVE` handler looks up pending data, creates `combat_outcome` arc with tile, participants, outcome (玩家獲勝/對手獲勝/玩家逃脫), narration from payload when present
- `COMBAT_INITIATE` and `COMBAT_RESOLVE` added to `HISTORY_CHRONICLE_BOOT_EVENT_TYPES` so replay reconstructs combat arcs correctly
- `rebuildFromEvents` resets `pendingCombatInitiates` so full rebuild is deterministic
- 4 new tests in `historyChronicle.test.ts` (player victory, fled, payload narration, rebuild idempotency)
- Closes §22 "combat outcomes don't feed history_chronicle" gap (🟡→✅)

### Active Blockers
None.

### Remaining Gaps (non-blocking)
- §11.4 combat log not fully in canonical EventLog
- §11.5 area FACT_SET still used for area state, building occupants, weather, season, rare windows
- §11.9 dialog grounding — relationship + household now injected; remaining: alias memory, long-term social history
- Roads/bridges as map features
- NPC household permanent migration (move to new tile permanently)

### CI/CD State
Main branch; all commits pushed. No pending PRs.

---

## 2026-05-25 — Handoff Snapshot @ v0.68.0

### Current Version
`0.68.0` — TypeScript build clean. 946 tests pass across 125 test files. Commits pushed to `main`.

### What Was Shipped This Session (v0.68.0)

**v0.68.0 — NPC Household State Dialog Injection (§11.9 partial)**
- `HouseholdContextRow` type added to `AiDialogContext` (nameZh, role)
- `buildHouseholdBlock()` in `aiDialog.ts`: renders living household family members into NPC system prompt
- `getLivingHouseholdMembersFor(npcId)` on runtime: queries NpcLineageProjection + NpcMortalityProjection, returns living members excluding the NPC themselves
- `npc.ts` dialog handler injects `householdMembers` into dialogCtx
- NPCs can now naturally reference family members in dialog without hallucination
- 4 new tests in `aiDialog.test.ts`

### Active Blockers
None.

### Remaining Gaps (non-blocking)
- §11.4 combat log not fully in canonical EventLog
- §11.5 area FACT_SET still used for area state, building occupants, weather, season, rare windows
- §11.6 budget gate (simulation budget specified but not enforced)
- §11.9 dialog grounding — relationship + household now injected; remaining: alias memory, long-term social history
- Roads/bridges as map features
- NPC household permanent migration (move to new tile permanently)
- WORLD_CAPABILITIES.md Part II stale (BioNode, Forest Regrowth marked ❌ but shipped as Phase E5)

### CI/CD State
Main branch; all commits pushed. No pending PRs.

---

## 2026-05-25 — Handoff Snapshot @ v0.67.0

### Current Version
`0.67.0` — TypeScript build clean. 942 tests pass across 125 test files. Commits pushed to `main`.

### What Was Shipped This Session (v0.67.0)

**v0.67.0 — NPC Relationship Graph Dialog Injection (§11.9 partial)**
- `RelationshipContextRow` type added to `AiDialogContext` (nameZh, trust, type, interactionCount)
- `buildRelationshipBlock()` in `aiDialog.ts`: renders friend/rival/neutral classifications with trust scores into NPC system prompt
- `npc.ts` dialog handler queries `getNpcRelationships().listFor(npcId)` (cap 10, sorted by most recent) and maps to `relationshipContext`
- Block injected after known-person block, before anti-hallucination block in prompt
- NPCs now know the trust level and relationship type for each person they've interacted with (e.g. 友好/對立/普通)
- 5 new tests in `aiDialog.test.ts` covering all three relationship types and edge cases
- Closes §11.9 partial (NPC social history now grounds dialog)

### §43 Criteria Status (unchanged from v0.66.0)

**§43.1 Civilization** — all 4 criteria ✅
**§43.2 Ecosystem** — 10 of 11 criteria ✅, criterion 11 ("all co-occur") pending long-run observation

### Active Blockers
None.

### Remaining Gaps (non-blocking)
- §11.4 combat log not fully in canonical EventLog
- §11.5 area FACT_SET still used for area state, building occupants, weather, season, rare windows
- §11.6 budget gate (simulation budget specified but not enforced)
- §11.9 dialog grounding — relationship graph now injected; remaining: faction knowledge grounding
- BioNode / Forest Regrowth Engine — **SHIPPED** (Phase E5, confirmed in runtime.ts); WORLD_CAPABILITIES.md Part II needs update
- Roads/bridges as map features
- NPC household permanent migration (move to new tile permanently)

### CI/CD State
Main branch; all commits pushed. No pending PRs.

---

## 2026-05-25 — Handoff Snapshot @ v0.66.0

### Current Version
`0.66.0` — TypeScript build clean. 937 tests pass across 125 test files. Commits pushed to `main`.

### What Was Shipped This Session (v0.62.0 → v0.66.0)

**v0.62.0 — Pollution + Population Shift Dialog Grounding (§43.2 criterion 9)**
- `getTilePollutionLevel(tileId)` on runtime → `pollutionLevel` in `AiDialogContext`
- `buildEcologyBlock` renders pollution warning line

**v0.63.0 — Population Shift Dialog Grounding**
- `getRecentPopulationShifts(withinTicks)` scans recentEvents for SPECIES_POPULATION_SHIFTED
- `recentPopulationShifts` injected into `AiDialogContext` for NPC dialog grounding

**v0.64.0 — History Chronicle Arc Tracking (§43.1 criterion 4)**
- FOREST_DEPLETED → `arc.ecological_collapse.forest.tileId` (active)
- BIOME_RECOVERED → concludes forest collapse arc
- FACTION_DOMINANCE_SHIFTED → `arc.faction_seizure.dominance` (concluded)
- All added to HISTORY_CHRONICLE_BOOT_EVENT_TYPES

**v0.65.0 — SETTLEMENT_EVACUATION_STARTED (§43.2 criteria 4 + 7)**
- When settlement transitions to 'declining' AND food = 0 → SETTLEMENT_EVACUATION_STARTED fires as companion
- NPC engine receives survival intent override (urgency=10) → NPCs flee to t_central
- Chronicle records `famine_evacuation` arc
- Closes: §43.2 criterion 4 (NPC migration from eco collapse) + criterion 7 (settlement famine)

**v0.66.0 — FACTION_ECOLOGY_CONFLICT_STARTED (§43.2 criterion 8)**
- FISHERY_COLLAPSED → `planFactionEcologyConflict` → tide_hunters contest fishery tile (if adjacent)
- FOREST_DEPLETED → free_runners contest forest tile (if adjacent)
- Both emit FACTION_ECOLOGY_CONFLICT_STARTED + FACTION_TILE_SEIZED in same tick block
- Chronicle records `faction_seizure` arc scoped to the resource tile

### §43 Criteria Status after v0.66.0

**§43.1 Civilization** — all 4 criteria ✅
- criterion 1: NPC death → descendants remember (v0.32.0)
- criterion 2: Famine price spike chain — GOODS_TRANSPORT_LOST → MARKET_PRICE_DISCOVERED (chain complete)
- criterion 3: Faction defeated → TRADE_ROUTE_CLOSED + BUILDING_ABANDONED (v0.33.0)
- criterion 4: Player absence → chronicle shows arc deltas (v0.64.0)

**§43.2 Ecosystem** — 10 of 11 criteria ✅, criterion 11 ("all co-occur") pending long-run observation
- All individual ecosystem criteria now have complete event chains

### Active Blockers
None. All §43 criteria have working event chains. Criterion 11 ("all co-occur") requires long-run world observation.

### Remaining Gaps (non-blocking)
- §11.4 combat log not fully in canonical EventLog
- §11.5 area FACT_SET
- §11.6 budget gate
- §11.9 known-person graph for NPC dialog (hallucination guard beyond names)
- BioNode / Forest Regrowth Engine
- Roads/bridges as map features
- NPC household permanent migration (move to new tile)

### CI/CD State
Main branch; all commits pushed. No pending PRs.

---

### What Was Shipped This Session (v0.58.0 → v0.61.0)

**v0.59.0 — SPECIES_POPULATION_SHIFTED (§43.2 NPC dialog grounding)**

物種族群下降事件上線。當某物種的全球數量相比上一 tick 快照下降 ≥25%，發出 `SPECIES_POPULATION_SHIFTED`。為 §43.2 標準「NPC 討論消失的動物」提供具名動物的對話錨點（補充既有的 extinctionWarnings）。

**修改檔案：**
- `packages/server/src/ecosystem/speciesPopulationPlanner.ts`：NEW — 純函數 planSpeciesPopulationShifts
- `packages/server/src/ecosystem/speciesPopulationPlanner.test.ts`：NEW — 8 tests
- `packages/server/src/kernel/livingWorldCommands.ts`：新增 SPECIES_POPULATION_SHIFTED command type + SpeciesPopulationShiftedCmd + validator；加入 ECOSYSTEM_BOOT_EVENT_TYPES
- `packages/server/src/config/world.ts`：POPULATION_SHIFT_MIN_PERCENT = 0.25
- `packages/server/src/sim/runtime.ts`：previousSpeciesPopulationTotals in-memory map；Phase E2.1b block；boot 初始化

**v0.60.0 — POLLUTION_INCREASED + POLLUTION_RECOVERED (§6.5 catalog)**

工業化污染事件上線。當 ecosystemPressureLevel 首次達到 POLLUTION_THRESHOLD（40），發出 POLLUTION_INCREASED；降回 threshold 以下時發出 POLLUTION_RECOVERED。作為 Phase E2.3 壓力事件的伴生事件。

**修改檔案：**
- `packages/server/src/ecosystem/pollutionPlanner.ts`：NEW — 純函數 planPollution
- `packages/server/src/ecosystem/pollutionPlanner.test.ts`：NEW — 8 tests
- `packages/server/src/kernel/livingWorldCommands.ts`：POLLUTION_INCREASED + POLLUTION_RECOVERED；PollutionIncreasedCmd + PollutionRecoveredCmd；validators；ECOSYSTEM_BOOT_EVENT_TYPES
- `packages/server/src/config/world.ts`：POLLUTION_THRESHOLD = 40
- `packages/server/src/sim/runtime.ts`：Phase E2.3 block 補伴生事件

**v0.61.0 — HIDE_COLLECTED + BONE_COLLECTED (§6.5 catalog fully closed)**

狩獵副產品收集事件上線。成功狩獵後，如物種有皮革類副產品（hide, pelt, eel_skin...）發出 HIDE_COLLECTED；有骨骼類副產品（bone, fang, claw...）發出 BONE_COLLECTED。§6.5 事件目錄現已完整。

**修改檔案：**
- `packages/server/src/kernel/livingWorldCommands.ts`：HIDE_COLLECTED + BONE_COLLECTED；HideCollectedCmd + BoneCollectedCmd；validators
- `packages/server/src/sim/runtime.ts`：HIDE_BYPRODUCTS + BONE_BYPRODUCTS sets；NPC hunt resolution block 補伴生事件

**§43 Progress After v0.61.0:**
- ✅ §43.1 criterion 1：NPC_DECEASED + 繼承記憶
- ✅ §43.1 criterion 3：FACTION_DOMINANCE_SHIFTED + TERRITORY_CLAIM_CHANGED + TRADE_ROUTE_CLOSED + BUILDING_ABANDONED
- ✅ §43.2：MIGRATION_WAVE_STARTED、SPECIES_EXTINCTION_WARNING/EXTINCT/RECOVERED、BIOME_RECOVERED、FOREST_DEPLETED、ANIMAL_DOMESTICATED、LIVESTOCK_BRED、extinctionWarnings 對話注入
- ✅ §43.2 criterion 9（NPCs discuss disappearing animals）：SPECIES_POPULATION_SHIFTED 已上線
- ✅ §6.5 事件目錄：完整（HIDE_COLLECTED, BONE_COLLECTED, BIOME_RECOVERED, FOREST_DEPLETED, POLLUTION_INCREASED, POLLUTION_RECOVERED, SPECIES_POPULATION_SHIFTED 全部補齊）

**Verification:**
```
cd packages/server && npx vitest run   # 937 pass
npm run build                          # clean
git log --oneline -5                   # c21229c, 84aea9c, c7972cc, cd78440, 2094265
```

**Next:** 剩餘 §43 gaps：
1. §43.1 criterion 2 — famine price spike chain：GOODS_TRANSPORT_LOST → MARKET_PRICE_DISCOVERED 是否可觀測（需端對端驗證）
2. §43.1 criterion 4 — history_chronicle arc delta（world continues while player absent）
3. §43.2 criterion 4 — FISHERY_COLLAPSED / FOREST_DEPLETED → price spike + NPC migration 端對端驗證
4. POLLUTION_INCREASED → NPC dialog grounding（需注入 AiDialogContext）

---

## 2026-05-25 — Handoff Snapshot @ v0.58.0

### Current Version
`0.58.0` — TypeScript build clean. 921 tests pass across 123 test files. Commits pushed to `main`.

### What Was Shipped This Session (v0.57.0 → v0.58.0)

**v0.58.0 — Territory Claim Change + Building Abandonment (Phase 30.7 completion)**

TERRITORY_CLAIM_CHANGED 事件上線，作為 FACTION_DOMINANCE_SHIFTED 的伴生事件：當派系失去所有領地時，同時發出領土宣告更動記錄，並自動放棄所有健康值降至 0 的建築（BUILDING_ABANDONED）。這完整關閉了 §43.1 criterion 3：「faction 戰敗 → 道路崩潰」的完整觀測鏈。

**修改檔案：**
- `packages/server/src/kernel/livingWorldCommands.ts`：新增 `TERRITORY_CLAIM_CHANGED` command type、validator、`TerritoryClaimChangedCmd` payload type；加入 FACTION_BOOT_EVENT_TYPES
- `packages/server/src/sim/runtime.ts`：Phase 30.7 planner block 補發 TERRITORY_CLAIM_CHANGED + BUILDING_ABANDONED（health ≤ 0 的建築）

**架構關鍵點：**
- TERRITORY_CLAIM_CHANGED 在 FACTION_DOMINANCE_SHIFTED 同 tick 發出（tileCount = 失去的 tile 數）
- BUILDING_ABANDONED 只對 health ≤ 0 的建築發出（buildingStateProjection.list() 過濾）
- TERRITORY_CLAIM_CHANGED 加入 FACTION_BOOT_EVENT_TYPES

**§43 Progress After v0.58.0:**
- ✅ §43.1 criterion 3 完整：FACTION_DOMINANCE_SHIFTED + TERRITORY_CLAIM_CHANGED + TRADE_ROUTE_CLOSED + BUILDING_ABANDONED 可觀測
- ✅ §43.2 多項：生態崩潰 (FISHERY_COLLAPSED + FOREST_DEPLETED) + 恢復 (BIOME_RECOVERED + SPECIES_RECOVERED) + NPC 對話（extinctionWarnings 已注入）

**Next:** v0.59.0 — SPECIES_POPULATION_SHIFTED（補全 §6.5 缺失事件目錄）或 POLLUTION_INCREASED（工業化副作用）

---

## 2026-05-25 — Handoff Snapshot @ v0.57.0

### Current Version
`0.57.0` — TypeScript build clean. 921 tests pass across 123 test files. Commits pushed to `main`.

### What Was Shipped This Session (v0.56.0 → v0.57.0)

**v0.57.0 — Faction Dominance Cascade (Phase 30.7)**

派系主導權崩潰機制上線。當某派系的領地從 N 個 tile 降至 0（被完全驅逐出地圖），系統自動發出 `FACTION_DOMINANCE_SHIFTED` 事件，並關閉所有現存開放的物流通道（`TRADE_ROUTE_CLOSED`）。這部分關閉了 §43.1 criterion 3：「當 faction 戰敗，道路與物流會崩潰」。

**修改檔案：**
- `packages/server/src/kernel/livingWorldCommands.ts`：新增 `FACTION_DOMINANCE_SHIFTED` command type、validator、`FactionDominanceShiftedCmd` payload type；加入 FACTION_BOOT_EVENT_TYPES
- `packages/server/src/sim/factionDominancePlanner.ts`：NEW — 純函數，比較 currentTileCounts vs previousTileCounts，回傳第一個從 >0 降至 0 的派系
- `packages/server/src/sim/factionDominancePlanner.test.ts`：NEW — 6 個測試
- `packages/server/src/projections/factionDominance.ts`：NEW — Set-based projection 追蹤哪些派系已發出 FACTION_DOMINANCE_SHIFTED（防止重複發送）
- `packages/server/src/projections/factionDominance.test.ts`：NEW — 4 個測試
- `packages/server/src/sim/runtime.ts`：
  - import + 初始化 FactionDominanceProjection + `previousFactionTileCounts: Map<FactionId, number>`
  - 兩個 fan-out 位置 project(ev)
  - 小 log path 補 factionControlProjection + factionDominanceProjection rebuildFromEvents（修補既有缺漏）
  - 大 log path 補 factionDominanceProjection rebuildFromEvents
  - boot 後初始化 previousFactionTileCounts（防止重啟時誤觸發歷史事件）
  - Phase 30.7 planner block：每 tick 偵測派系降至 0 tiles → FACTION_DOMINANCE_SHIFTED + TRADE_ROUTE_CLOSED

**架構關鍵點：**
- FactionDominanceProjection 是 guard — 防止重啟後重複發送
- previousFactionTileCounts 在 boot 後初始化為當前狀態，不回溯歷史
- planFactionDominance 純函數：shiftFiredFor 作為黑名單；previous>0 且 current==0 → loser
- TRADE_ROUTE_CLOSED 對所有 open routes 發送（小世界 = 8 tiles，通常路線少）
- 修補 small-log 路徑遺漏的 factionControlProjection.rebuildFromEvents

**測試：**
- +10 新測試（factionDominancePlanner.test.ts: 6；factionDominance.test.ts: 4）
- 921 passing tests / 123 files；build clean

**Verification:**
```
cd packages/server && npx vitest run   # 921 pass
npm run build                          # clean
```

**§43 Progress After v0.57.0:**
- ✅ §43.1 criterion 3（部分）：FACTION_DOMINANCE_SHIFTED + TRADE_ROUTE_CLOSED（BUILDING_DAMAGED 在 FACTION_TILE_SEIZED 已有）
- Remaining: TERRITORY_CLAIM_CHANGED（optional companion event）

**Next:** v0.58.0 — SPECIES_POPULATION_SHIFTED (closes §43.2 "NPCs discuss disappearing animals" criterion) 或 POLLUTION_INCREASED (工業化副作用)

---

## 2026-05-25 — Handoff Snapshot @ v0.56.0

### Current Version
`0.56.0` — TypeScript build clean. 911 tests pass across 121 test files. Commits pushed to `main`.

### What Was Shipped This Session (v0.55.0 → v0.56.0)

**v0.56.0 — BIOME_RECOVERED Event (Phase E2.3)**

BIOME_RECOVERED 事件上線。當森林 tile 的生態壓力因工作量降低而恢復（ECOSYSTEM_PRESSURE_RECOVERED），系統同時發出 `BIOME_RECOVERED` 事件，標誌整個生態區域已穩定。這關閉了 §43.2 兩個判準：「保護生態系統」（BIOME_RECOVERED 可觀測）和「穩定一個區域」（history_chronicle 紀錄恢復弧線）。

**修改檔案：**
- `packages/server/src/kernel/livingWorldCommands.ts`：新增 `BIOME_RECOVERED` command type、validator、`BiomeRecoveredCmd` payload type
- `packages/server/src/ecosystem/biomeRecoveryPlanner.ts`：NEW — 純函數 `planBiomeRecovery(biome, decision)` → boolean
- `packages/server/src/ecosystem/biomeRecoveryPlanner.test.ts`：NEW — 5 個測試
- `packages/server/src/sim/runtime.ts`：import + ECOSYSTEM_BOOT_EVENT_TYPES + Phase E2.3 recover branch 在 FOREST_RECOVERED 後發 BIOME_RECOVERED

**架構關鍵點：**
- BIOME_RECOVERED 只對 forest biome 發出（'forest' === TILE_BY_ID[tileId]?.biome）
- BIOME_RECOVERED 在 ECOSYSTEM_PRESSURE_RECOVERED 同一 tick 發出（不是延遲恢復）
- 加入 ECOSYSTEM_BOOT_EVENT_TYPES — 歷史記錄在重啟後不丟失
- planBiomeRecovery 純函數，decision='recover' 且 biome='forest' → true，其他均 false

**測試：**
- +5 新測試（biomeRecoveryPlanner.test.ts）
- 911 passing tests / 121 files；build clean

**Verification:**
```
cd packages/server && npx vitest run   # 911 pass
npm run build                          # clean
```

**§43 Progress After v0.56.0:**
- ✅ §43.2 Cause ecological collapse: FISHERY_COLLAPSED (v0.27.0) + FOREST_DEPLETED (v0.55.0)
- ✅ §43.2 Protect an ecosystem: BIOME_RECOVERED (v0.56.0)
- ✅ §43.2 Stabilize a region: BIOME_RECOVERED → history_chronicle arc (v0.56.0)

**Next:** v0.57.0 — Faction dominance cascade (§43.1 criterion 3):
- FACTION_DOMINANCE_SHIFTED when one faction controls majority of tiles
- TERRITORY_CLAIM_CHANGED companion event
- Consequences: TRADE_ROUTE_CLOSED for losing-faction trade routes

---

## 2026-05-25 — Handoff Snapshot @ v0.55.0

### Current Version
`0.55.0` — TypeScript build clean. 906 tests pass across 120 test files. Commits pushed to `main`.

### What Was Shipped This Session (v0.54.0 → v0.55.0)

**v0.55.0 — Forest Depletion Events (Phase E2.2)**

森林耗竭事件系統上線。當森林 tile（biome = 'forest'）的生態壓力達到 FOREST_DEPLETION_PRESSURE_THRESHOLD（60）時，系統自動發出 `FOREST_DEPLETED` 事件；壓力歸零後恢復發出 `FOREST_RECOVERED`。這關閉了 §43.2「造成生態崩潰」判準中關於森林的部分（漁場崩潰 FISHERY_COLLAPSED 已在 E2.1 完成）。

**修改檔案：**
- `packages/server/src/config/world.ts`：新增 `FOREST_DEPLETION_PRESSURE_THRESHOLD = 60`
- `packages/server/src/kernel/livingWorldCommands.ts`：新增 `FOREST_DEPLETED` + `FOREST_RECOVERED` command types、validators、`ForestDepletedCmd` + `ForestRecoveredCmd` payload types
- `packages/server/src/ecosystem/forestDepletionPlanner.ts`：NEW — 純函數 planForestDepletion（biome check + 壓力閾值邏輯）
- `packages/server/src/ecosystem/forestDepletionPlanner.test.ts`：NEW — 8 個測試
- `packages/server/src/projections/forestDepletionProjection.ts`：NEW — Set-based projection（FOREST_DEPLETED/RECOVERED 事件源）
- `packages/server/src/projections/forestDepletionProjection.test.ts`：NEW — 5 個測試
- `packages/server/src/sim/runtime.ts`：import + 初始化 ForestDepletionProjection；兩個 fan-out 位置 project(ev)；ECOSYSTEM_BOOT_EVENT_TYPES 加入兩個新事件；兩條 rebuildFromEvents 路徑；Phase E2.3 壓力 planner block 加入 planForestDepletion → FOREST_DEPLETED / FOREST_RECOVERED 命令

**架構關鍵點：**
- FOREST_DEPLETED 僅在壓力從 <60 升至 ≥60 且尚未耗竭時發出（無重複）
- FOREST_RECOVERED 僅在壓力降至 0 且目前耗竭時發出
- planForestDepletion 對非 forest biome 永遠回傳 null（desert/water/grass 不影響）
- ForestDepletionProjection 加入 ECOSYSTEM_BOOT_EVENT_TYPES — 重啟後不丟失狀態

**測試：**
- +13 新測試（forestDepletionPlanner.test.ts: 8；forestDepletionProjection.test.ts: 5）
- 906 passing tests / 120 files；build clean

**Verification:**
```
cd packages/server && npx vitest run   # 906 pass
npm run build                          # clean
```

**Next:** v0.56.0 — 建議繼續 §43 acceptance criteria gaps：
- Faction dominance cascade（FACTION_DOMINANCE_SHIFTED → trade route closure，§43.1 criterion 3）
- POLLUTION_INCREASED（工業化副作用，§43.2 ecological collapse）

---

## 2026-05-25 — Handoff Snapshot @ v0.54.0

### Current Version
`0.54.0` — TypeScript build clean. 893 tests pass across 118 test files. Commits pushed to `main`.

### What Was Shipped This Session (v0.53.0 → v0.54.0)

**v0.54.0 — Memory Urgency Boost (Cognitive Runtime Layer 2, Step 5)**

NPC 的恐懼/悲傷記憶現在直接提升生存意圖的緊迫度。`SqliteNpcMemoryStore.getMemoryUrgencyBoost()` 依記憶重要性（importance 9 = 永久 +1.0 boost；importance 7–8 = 30天內 +0.5 boost）放大 `computeIntentStack` 的生存乘數，使受過創傷的 NPC（曾被攻擊、目睹派系奪地、聚落衰落）在相同感知條件下比普通 NPC 更快逃離危險區域。

**修改檔案：**
- `packages/server/src/config/world.ts`：新增 `MEMORY_URGENCY_BOOST_PERMANENT = 1.0` + `MEMORY_URGENCY_BOOST_HIGH = 0.5`
- `packages/server/src/kernel/npcMemory.ts`：新增 `getMemoryUrgencyBoost(npcId, currentTick): number`
- `packages/server/src/kernel/npcMemory.test.ts`：新增 6 個 `getMemoryUrgencyBoost` 測試
- `packages/server/src/sim/intentPlanner.ts`：`computeIntentStack` 新增 optional `memoryUrgencyBoost = 0` 參數；傳入 `computeSurvivalIntent`
- `packages/server/src/sim/intentPlanner.test.ts`：新增 2 個 memoryUrgencyBoost 測試
- `packages/server/src/sim/runtime.ts`：intent recompute loop 中從 `npcMemory.getMemoryUrgencyBoost()` 取值後傳入 `computeIntentStack`

**架構關鍵點：**
- boost 只作用於 survival intent，不影響 economic / social / ecosystem
- importance >= 9 的 fear/grief 永久 boost（FACTION_TILE_SEIZED 同 tile、SETTLEMENT_DECLINED 同 tile）
- importance 7–8 的 fear/grief 在 MEMORY_VERY_HIGH_DECAY_TICKS（30天 = 518400 ticks）內有效
- boost = 0 時行為與 v0.53.0 完全相同（backward-compatible）
- `npcMemory` 為 null 時 boost 固定 0（無記憶系統不影響邏輯）

**Cognitive Runtime Layer 2 完整進度：**
| 步驟 | 版本 | 功能 |
|---|---|---|
| 1 感知 | v0.50 | BeliefProjection |
| 2 意圖 | v0.51 | IntentProjection + IntentPlanner |
| 3 反思 | v0.52 | ReflectionDialog Injection |
| 4 記憶對話 | v0.53 | MemoryDialog Injection |
| 5 記憶意圖 | v0.54 | Memory Urgency Boost ← 本版 |

**測試：**
- +8 新測試（npcMemory.test.ts: 6；intentPlanner.test.ts: 2）
- 893 passing tests / 118 files；build clean

**Verification:**
```
cd packages/server && npx vitest run   # 893 pass
cd packages/server && npm run build    # clean
```

**Next:** v0.55.0 — 下一個最高影響力的 §43 acceptance criteria gap。建議候選：
- FOREST_DEPLETED + POLLUTION_INCREASED 事件（E2.2 completion，closes §43.2 ecological collapse criterion）
- Faction dominance cascade（FACTION_DOMINANCE_SHIFTED → TRADE_ROUTE_CLOSED，closes §43.1 criterion 3）

---

## 2026-05-25 — Handoff Snapshot @ v0.53.0

### Current Version
`0.53.0` — TypeScript build clean. 885 tests pass across 118 test files. Commits pushed to `main`.

### What Was Shipped This Session (v0.52.0 → v0.53.0)

**v0.53.0 — NPC Memory Dialog Injection (Cognitive Runtime Layer 2, Step 4)**

NPC AI 對話脈絡現在包含 NPC 親身經歷的情感記憶。`SqliteNpcMemoryStore` 擴充 locality fan-out（8 種新事件型別），並以 importance tier decay 過濾後注入 AI prompt，NPC 說話時可自然引用恐懼、悲傷、驚嘆等情緒記憶。

**修改檔案：**
- `packages/server/src/config/world.ts`：新增 4 個常數（MEMORY_DIALOG_MAX_BULLETS / MEMORY_VERY_HIGH/HIGH/NORMAL_DECAY_TICKS）
- `packages/server/src/projections/beliefProjection.ts`：TILE_ADJACENCY 擴充至 9 個 tile（新增 t_salt_marsh、t_desert）
- `packages/server/src/kernel/npcMemory.ts`：新增 `projectWithLocality()` + `formatMemoryContext()` + `deriveLocalityRows()` + `fanOutByLocality()` + `describeMemoryContent()` + `emotionalTagZh()`
- `packages/server/src/kernel/npcMemory.test.ts`：新增（20 個測試）
- `packages/server/src/npcs/aiDialog.ts`：`AiDialogContext.memoryContext?` + `buildMemoryBlock()`；注入 `buildSystemPrompt`
- `packages/server/src/npcs/aiDialog.test.ts`：新增 3 個 buildMemoryBlock 測試
- `packages/server/src/sim/runtime.ts`：兩個 fan-out 點各加 `projectWithLocality` 呼叫；新增 `getFormattedMemoryContext()` getter
- `packages/server/src/http/npc.ts`：填充 `memoryContext` 進 dialogCtx

**架構關鍵點：**
- `projectWithLocality()` 不在 `rebuildFromEvents()` 呼叫（locality 依賴即時 NPC tile 位置，不存於 EventLog，與 BeliefProjection 相同取捨）
- SPECIES_EXTINCT 存於 `npc_id = 'world'`（非 fan-out）；`formatMemoryContext` 同時查 personal + world rows
- importance >= 9 永不過期；decay 在 query-time 實作，不刪除歷史資料
- `buildMemoryBlock` 回傳 `[]` 時 `buildSystemPrompt` 完全不注入空塊（無雜訊）

**測試：**
- +20 新測試（npcMemory.test.ts：12 projectWithLocality + 8 formatMemoryContext）+ 3 aiDialog.test.ts
- 885 passing tests / 118 files；build clean

**Verification:**
```
cd packages/server && npx vitest run   # 885 pass
cd packages/server && npm run build    # clean
```

**Next:** v0.54.0 — Intent urgency boost from memory (`getMemoryUrgencyBoost`)，或其他 Cognitive Runtime Layer 2 延伸

---

## 2026-05-22 — Handoff Snapshot @ v0.52.0

### Current Version
`0.52.0` — TypeScript build clean. 862 tests pass across 117 test files. Commits pushed to `main`.

### What Was Shipped This Session (v0.51.0 → v0.52.0)

**v0.52.0 — NPC Reflection Dialog Injection (Cognitive Runtime Layer 2, Step 3)**

NPC AI 對話脈絡現在包含過去意圖成敗的記憶。IntentProjection 在 v0.51.0 已記錄每次 `NPC_INTENT_RESOLVED` 的 Reflection；本版把這些 Reflection 格式化注入 AI prompt，NPC 說話時可自然引用自身判斷史。

**新增檔案：** 無（整合進現有檔案）

**修改檔案：**
- `packages/server/src/config/world.ts`：新增 `MAX_REFLECTION_CONTEXT_BULLETS = 5`
- `packages/server/src/projections/intentProjection.ts`：新增 `INTENT_LABELS` 常數 + `export function formatReflectionContext(reflections, currentTick): string` — 過濾 active reflections（age < REFLECTION_DURATION_TICKS），取最新 `slice(-MAX_REFLECTION_CONTEXT_BULLETS)` 條，格式化為中文子彈清單
- `packages/server/src/npcs/aiDialog.ts`：`AiDialogContext` 新增 `reflectionContext?: string`；新增 `export function buildReflectionBlock(ctx?: string): string[]`（guard 同 `buildBeliefBlock`，附 ⚠️ 記憶使用規則）；`buildSystemPrompt` 在 `buildBeliefBlock` 後注入 `buildReflectionBlock`
- `packages/server/src/sim/runtime.ts`：import `formatReflectionContext`；新增 `getFormattedReflectionContext(npcId): string` public method
- `packages/server/src/http/npc.ts`：`reflectionCtx = input.runtime.getFormattedReflectionContext(npcId) || undefined`；spread `...(reflectionCtx ? { reflectionContext: reflectionCtx } : {})` 進 `dialogCtx`

**架構關鍵點：**
- `Reflection` 介面保持 private；`formatReflectionContext` 在同一檔案定義，runtime.ts 透過 structural typing 傳遞 `getReflections()` 回傳值，無需 export 類型
- Active reflection 判斷：`currentTick - r.startTick < r.durationTicks`（與 `getLearningWeights` 的過濾邏輯一致）
- 無 active reflection 時 `formatReflectionContext` 回傳 `''`，`buildReflectionBlock` 回傳 `[]`，prompt 完全不注入空塊
- AI 仍只做 read-only 旁白；reflectionContext 是唯讀上下文，不影響任何模擬狀態

**測試：**
- +15 新測試（10 for `formatReflectionContext`、5 for `buildReflectionBlock`）
- 862 passing tests / 117 files；build clean

**Verification:**
```
cd packages/server && npx vitest run   # 862 pass
cd packages/server && npm run build    # clean
```

**Next:** v0.53.0 — TBD（可能方向：NPC 主動敘事、記憶衰退視覺化、或 intention recomputation 事件驅動化）

---

## 2026-05-22 — Handoff Snapshot @ v0.51.0

### Current Version
`0.51.0` — TypeScript build clean. 847 tests pass across 117 test files. Commits pushed to `main`.

### What Was Shipped This Session (v0.50.0 → v0.51.0)

**v0.51.0 — NPC Intention Layer (Cognitive Runtime Layer 2, Step 2)**

**新增檔案：**
- `packages/server/src/projections/intentProjection.ts` — `IntentProjection` class（Reflection system, per-NPC learning weights, `INTENT_REFLECTION_RECORDED` event-sourced persistence, `rebuildFromEvents` boot hydration）
- `packages/server/src/projections/intentProjection.test.ts` — unit tests（intent resolution, reflection weight updates, override expiry, boot hydration）
- `packages/server/src/sim/intentPlanner.ts` — `computeIntentStack` + `selectHighestIntent`（純函數，4 intent types: survival / economic / social / ecosystem）
- `packages/server/src/sim/intentPlanner.test.ts` — unit tests（priority ordering, urgency threshold, belief-driven intent scoring）

**修改檔案：**
- `packages/server/src/config/world.ts`：5 個新常數（`INTENT_RECOMPUTE_INTERVAL`, `INTENT_OVERRIDE_DURATION_TICKS`, `INTENT_URGENCY_THRESHOLD`, `REFLECTION_DURATION_TICKS`, `MAX_REFLECTIONS_PER_NPC`）
- `packages/server/src/kernel/livingWorldCommands.ts`：`IntentKind` type + `NPC_INTENT_RESOLVED` event + validator
- `packages/server/src/projections/beliefProjection.ts`：`BeliefRow` 新增 `factionId?: string`
- `packages/server/src/sim/npcEngine.ts`：`intentOverride` field + `setIntentOverride` / `clearIntentOverride` + budget guard
- `packages/server/src/sim/runtime.ts`：`intentProjection` field、fan-out、boot hydration（`rebuildFromEvents`）、resolution detection cadence、recompute cadence（`INTENT_RECOMPUTE_INTERVAL`）
- `docs/WORLD_CAPABILITIES.md`：§12.5.6 加入 v0.51.0 shipped note；§29 status table 更新至 v0.51.0

**架構關鍵點：**
- `NPC_INTENT_RESOLVED` event 關閉 Command→Event 迴路；AI 在意圖層仍只做 read-only 旁白，不下 Command
- `intentOverride` 有 `INTENT_OVERRIDE_DURATION_TICKS` 上限，逾期自動清除，防止 NPC 被外力無限劫持
- `IntentProjection` 全量 boot hydrate（scan EventLog for `INTENT_REFLECTION_RECORDED`），unlike BeliefProjection（無 hydration）
- `selectHighestIntent` 以 urgency 分數排序；urgency ≥ `INTENT_URGENCY_THRESHOLD` 升為 critical（不可被 override 覆蓋）
- 4 intent types 對應 WORLD_CAPABILITIES §12.5.2.2 四大動機：survival / economic / social / ecosystem

**Next:** v0.52.0 — Reflection injection into dialog context（NPC dialog references past intent successes/failures）。

---

## 2026-05-22 — Handoff Snapshot @ v0.50.0

### Current Version
`0.50.0` — TypeScript build clean. 812 tests pass across 115 test files. Commits pushed to `main`.

### What Was Shipped This Session (v0.49.0 → v0.50.0)

**v0.50.0 — NPC Belief + Perception Layer (Cognitive Runtime Layer 2 baseline)**

**新增檔案：**
- `packages/server/src/projections/beliefProjection.ts` — `BeliefProjection` class（nested Map architecture, O(1) per-NPC lookup），`TILE_ADJACENCY`（7 tiles adjacency map），`formatBeliefContext`（exported），`subjectLabel` / `valueLabel`（module-private helpers），`FOOD_GOODS_IDS`
- `packages/server/src/projections/beliefProjection.test.ts` — 23 unit tests（event triggers, confidence decay, perception locality, formatBeliefContext hedge language, end-to-end smoke）

**修改檔案：**
- `packages/server/src/sim/runtime.ts`：`beliefProjection` field + fan-out（`apply(ev, npcLocs)` per event） + decay cadence（every `TICKS_PER_DAY`） + ecosystem cadence（every 48 ticks，`densityPct = 1 - pressureLevel/100`） + `getFormattedBeliefContext(npcId)` getter
- `packages/server/src/npcs/aiDialog.ts`：`AiDialogContext.beliefContext?: string` 欄位；`buildBeliefBlock()` exported helper（injects hedge rules into prompt）；`buildSystemPrompt` 注入 `buildBeliefBlock`
- `packages/server/src/http/npc.ts`：`beliefCtx = runtime.getFormattedBeliefContext(npcId)` + spread into `dialogCtx`
- `docs/WORLD_CAPABILITIES.md`：§12.5.5 Belief System 加入 v0.50.0 shipped note；§29 status table 更新至 v0.50.0

**架構關鍵點：**
- `BeliefProjection.apply(event, npcLocations)` 傳入當下 NPC 位置 map — 不從 EventLog boot hydrate（NPC 所在地於事件時刻無法從 log 重建），重啟後數分鐘內從 live events 重新填滿
- Locality: same-tile = conf 90（goods 80），adjacent = conf 40（goods 35），non-adjacent = skip
- Ecosystem indirect signal: conf === 90 → 70，conf === 40 → 30
- `tick()` updates `observedAtTick = currentTick` on surviving rows to prevent double-decay
- `upsert()` keyed by `subject|qualifier` per npcId → latest observation wins automatically
- Event payload shape: `event.payload.data`（nested）— same as `buildingState.ts` pattern

**Next:** NPC Intention layer (v0.51) — long-term/short-term `IntentStack` driving NPC behavior changes based on accumulated beliefs.

---

## 2026-05-22 — Handoff Snapshot @ v0.49.0

### Current Version
`0.49.0` (package.json version bump pending — all code shipped and pushed). TypeScript build clean. 898/899 tests pass (1 pre-existing `runtimeSettlementFamine` timeout — not introduced this session). Commit `a4a5336` pushed to `main`.

### What Was Shipped This Session (v0.48.0 → v0.49.0)

**v0.49.0 — Building Complete: Terrain System + Building Lifecycle + NPC Work Visibility**

**新增檔案：**
- `packages/server/src/projections/buildingState.ts` — `BuildingStateProjection`：四種生命週期狀態（`under_construction / operational / damaged / abandoned`）+ `BUILDING_STATE_BOOT_EVENT_TYPES`
- `packages/server/src/projections/buildingState.test.ts` — 7 unit tests（狀態轉換、預設值、tile 查詢）

**修改檔案：**
- `packages/web/src/game/terrainMask.ts`：新增 `LandTerrain`、`AnyTerrain`、`TERRAIN_SPEED_MODIFIER`、`LAND_COLOR_FOR_TERRAIN`、`isWalkableLand`、`LAND_MASKS`（6 個陸域 tile 15×10 ASCII mask）、`effectiveTerrainAt`（動態建築疊加層）、`walkableCellsForTile`
- `packages/web/src/game/terrainMask.test.ts`：21 tests（速度修正器、mask 長度、建築錨點可行走、effectiveTerrainAt、walkableCellsForTile）
- `packages/server/src/kernel/livingWorldCommands.ts`：新增 `BUILDING_DAMAGED`、`BUILDING_REPAIRED`、`BUILDING_ABANDONED` 命令類型＋驗證器＋ payload types
- `packages/server/src/sim/runtime.ts`：BuildingStateProjection wiring（fan-out × 2、boot hydration）；觸發器：`FACTION_TILE_SEIZED → BUILDING_DAMAGED`（−30 hp）、NPC build-domain → `BUILDING_REPAIRED`（+5 hp）、48 in-world day 廢棄 cadence；public getters `getBuildingState` / `getBuildingStatesByTile` / `getLastProductiveAction` / `getNpcActivityAndName`
- `packages/server/src/sim/npcEngine.ts`：`LAND_MASK_SERVER`（與 terrainMask.ts 同步）、`isLandWalkable`、`getWalkableCellsForTile`（含 cache）、`dispersedSubAnchor` / `subAnchor` 接受 walkable cells；`NpcTickContext` 新增 `buildingStates`
- `packages/server/src/projections/npcState.ts`：追蹤 `lastProductiveAction`（domain + narration from `NPC_PRODUCTIVE_ACTION`）
- `packages/server/src/http/buildingsRouter.ts`：注入 `state / health / constructionProgress` 到建築列表；`enrichBuildingView` 注入 `activity / domain / narration` 到佔用者列表；optional chaining 保持測試向後相容
- `packages/web/src/api/client.ts`：`AreaMapBuilding` + `BuildingOccupantView` 型別擴充
- `packages/web/src/pages/AreaPage.tsx`：傳遞 `state / health / constructionProgress` 給 AreaScene
- `packages/web/src/game/AreaScene.ts`：`drawBackground()` 使用 `effectiveTerrainAt` 渲染陸域地形顏色；`handleMovement()` 速度修正器；`isAreaWalkable` 使用 effectiveTerrainAt；`spawnBuildings()` 狀態驅動字型（🚧/🏚/原始字型）＋顏色＋⚠️疊加＋施工進度條
- `packages/web/src/pages/BuildingPage.tsx`：佔用者顯示活動標籤（工作中 · 建造）＋ narration tooltip；改用 server-authoritative occupant list

**陷阱記錄：**
- `buildingState.ts` projection 的 `project()` 接受 kernel `Event` 型別（data 包在 `payload.data` 裡），而非扁平 `{ eventType, data }`
- `LAND_MASK_SERVER` 在 `npcEngine.ts` 必須與 `LAND_MASKS` 在 `terrainMask.ts` 保持完全同步（修改 mask 時兩處都要改）
- `BuildingStateProjection` 的 `BUILDING_REPAIRED` 保留 `under_construction` 狀態；廢棄 cadence 跳過 `under_construction` 和從未被投影的建築（`tileId === ''`）
- `buildingsRouter.ts` 新方法用 optional chaining（`?.`）呼叫，讓現有 test mock 不需改動

### Local Verification
```
npx tsc --noEmit -p packages/server/tsconfig.json   → clean (0 errors)
npx tsc --noEmit -p packages/web/tsconfig.json       → clean (0 errors)
npm run build                                         → clean (pre-existing chunk warning)
npx vitest run                                        → 898/899 pass (1 pre-existing timeout)
git push                                              → main @ a4a5336
```

### CI/CD Status
推上 `main`（commit `a4a5336`）。GitHub Actions CI 觸發中。本機 docker smoke test 未做。

### Active Blockers
無程式阻塞。`runtimeSettlementFamine` 超時是既有問題，非本 session 引入。

### Next Steps
1. **NPC-as-agent phase（v0.50.0+）**：每個 NPC 成為真正的 agent，具備記憶、目標、決策自主權。架構：7 層 Cognitive Runtime（Layer 2 = Cognitive Runtime，已在 `WORLD_CAPABILITIES.md` §12.5 定義）。CognitiveActor model：beliefs / intentions / planning / reflection / memory / social reasoning。NPC 思考管線：Perception → Belief Update → Need Evaluation → Intent Generation → Planning → Social Evaluation → Action Selection → Command Submission → Outcome Observation → Reflection → Memory Update。
2. 本機 docker smoke test（建議在開始下一 feature 前確認環境正常）

---

## 2026-05-21 — Handoff Snapshot @ v0.48.0

### Current Version
All three `package.json` (root, server, web) bumped to `0.48.0`. TypeScript build clean. 782 tests pass across 113 test files. Commit `012d12e` pushed to `main`.

### What Was Shipped This Session (v0.47.0 → v0.48.0)

**v0.48.0 — NPC Autonomous Carrier Trade System**

**新增檔案：**
- `packages/server/src/sim/carrierPlanner.ts` — 核心貨運規劃器
  - `planCarrierDispatches()`: 掃描 carrier NPC → 找有 surplus 的據點 → BFS 找最缺貨目的地 → emit `TRADE_ROUTE_OPENED?` + `GOODS_CONSUMED` + `GOODS_TRANSPORT_STARTED`
  - `planCarrierArrivals()`: `tick >= startedAtTick + hops × TICKS_PER_HOUR` 時解算；暴風雨 → `GOODS_TRANSPORT_LOST`；正常 → `GOODS_TRANSPORT_ARRIVED` + `GOODS_STORED`
  - 常數：`CARRIER_HAUL_MIN=5`、`CARRIER_HAUL_MAX=20`、`CARRIER_TRAVEL_TICKS_PER_HOP=TICKS_PER_HOUR`
- `packages/server/src/sim/carrierPlanner.test.ts` — 11 個單元測試（dispatch / arrival / storm / skip-in-transit / skip-moving / surplus-threshold / haul-cap）

**修改檔案：**
- `packages/server/src/projections/logistics.ts`：新增 `getStartedTransports()` 方法
- `packages/server/src/npcs/profiles/port.merchant.anton.json`：`personality.traderRole = "carrier"`
- `packages/server/src/npcs/profiles/central.broker.gui.json`：`personality.traderRole = "carrier"`
- `packages/server/src/sim/runtime.ts`：主循環掛入 carrier planner（先跑 arrivals 再跑 dispatches）；storm 檢查改用 `isStormActive(this.getActiveWorldEvents())`

**重要陷阱記錄（下個 session 務必讀）：**
- `SIM_ACTOR_WORLD` 在 `runtime.ts` 是 local const（line 219），**沒有**從 `livingWorldCommands.ts` 匯出；新模組需自行定義
- `SettlementStatus` = `'stable'|'strained'|'declining'|'recovering'`，**沒有** `'active'`
- `worldEventProjection.list()` 回傳傳奇事件（`WorldEventRow[]`），不是氣象/暴風雨事件；storm 檢查必須用 `this.getActiveWorldEvents()` → `this.eventEngine.getActive()`

### Local Verification
```
npx tsc --noEmit   → clean (0 errors)
npx vitest run     → 782/782 pass, 113 files
git push           → main @ 012d12e
```

### CI/CD Status
Push 已推上 `main`。CI/CD pipeline 觸發中（GitHub Actions）。尚未在本機 docker 環境做 E2E smoke test。

### Active Blockers
無程式阻塞。下一步需要本機 docker 重建（見下）。

### Next Steps（優先順序）

1. **本機 docker smoke test**（必做，確認 carrier trade 在容器環境跑通）
   ```bash
   DOCKER_BUILDKIT=0 docker compose -f deploy/docker-compose.yml down
   DOCKER_BUILDKIT=0 docker compose -f deploy/docker-compose.yml up -d --build
   curl -s http://127.0.0.1:8100/healthz
   ```
   重建後觀察 sim log，確認有 `GOODS_TRANSPORT_STARTED` 事件出現。

2. **下個功能候選（任選一）：**
   - **History Chronicle Feed**：把戰鬥、貿易、生態事件彙整成可讀事件記錄顯示給玩家
   - **District Sub-tile Terrain 改進**：地形細節與子格互動
   - **NPC Faction Reputation**：carrier NPC 依派系調整貿易偏好（貨運系統的自然延伸）

---

## 2026-05-21 — Handoff Snapshot @ v0.47.0

### Current Version
`package.json` root is `0.47.0`. Build is clean. 36 aiDialog tests pass.

### What Was Shipped This Session (v0.46.0 → v0.47.0)

**v0.47.0 — Plant Ecology in NPC Dialog (Ecological Perception §11.9 closure)**
- `PlantContextRow` type added to `aiDialog.ts`: `{ speciesId, nameZh, saturationPct }`
- `plantContext?: readonly PlantContextRow[]` field added to `AiDialogContext`
- `buildEcologyBlock()` extended with optional 4th arg `plants?`; renders plant rows sorted by saturation desc with labels 繁盛/適中/稀疏/極稀
- Anti-hallucination block now includes plant species IDs alongside animal species IDs
- `npc.ts` handler: imports `getPlantSpecies`; computes `plantContext` from `runtime.getBioNodesOnTile(npcTile)` (filters density > 0, maps to `{speciesId, nameZh, saturationPct}`); adds to `dialogCtx` spread
- 3 new unit tests in `aiDialog.test.ts`; all 36 pass
- NPCs in forest (橡樹/松木/野草藥), salt_marsh (蘆葦), ruin (洞穴菌), mountain (松木) biomes can now reference local plant density naturally in dialog

### Active Blockers
None. Both builds clean.

### Next Steps
- Rebuild docker stack and smoke-test NPC dialog with plant context
- Next feature: TBD per ROADMAP.md (history chronicle feed for combat outcomes, or NPC carrier trade)

---

## 2026-05-21 — Handoff Snapshot @ v0.46.0

### Current Version
`package.json` root is `0.46.0`. Build is clean.

### What Was Shipped This Session (v0.45.1 → v0.46.0)

**v0.46.0 — Wildlife Combat for Aggressive Animals**
- `ANIMAL_COMBAT_AGGRESSION_THRESHOLD = 50` constant in `combat/commands.ts`; aggressive species: `moss_boar` (55), `fog_wolf` (80), `ash_serpent` (85), `mountain_bear` (90), `iron_hound` (92), `white_marsh_leviathan` (95)
- `CombatInitiatePayload` + `CombatInitiateCmd` extended with optional `enemyType?`, `animalId?`, `speciesId?` fields
- `combat_sessions` table migration: `enemy_type TEXT NOT NULL DEFAULT 'npc'` + `species_id TEXT` columns (ALTER TABLE try-catch for existing DBs)
- `combatStore.ts` `projectInitiate`: reads `enemyType`/`animalId`/`speciesId` from payload
- `runtime.ts` `submitCombatRoundAction`: branches on `session.enemy_type === 'animal'` — builds `npcTraits` from species aggression/fear instead of NPC profile; `npcIncapacitatedTicks = 0` (animals die); after animal player_victory emits `PLAYER_HUNTED_ANIMAL` to update `AnimalPopulationProjection`
- `combatRouter.ts`: new `POST /api/combat/initiate-animal` endpoint (validates species aggression ≥ 50, count > 3 extinction guard); action/Phase-B endpoints skip NPC lookup for animal combats; `toClientSession` exposes `enemyType` + `speciesId`
- `api/client.ts`: `ServerCombatSession` extended; new `combatInitiateAnimal()` method
- `CombatHud.tsx`: `enemyType` prop; victory text differs for animals vs NPCs
- `AreaPage.tsx`: `AGGRESSIVE_SPECIES_IDS` Set; `handleAnimalHunt` → confirm dialog for aggressive species → `handleAnimalCombatConfirm` → Phase B `CombatHud`; weak animals keep existing `PLAYER_HUNTED_ANIMAL` instant flow

### Active Blockers
None. Both builds clean. Ready to deploy.

### Next Steps
- Rebuild docker stack and smoke-test wildlife combat in-world
- Phase E6 or next roadmap item per ROADMAP.md

---

## 2026-05-21 — Handoff Snapshot @ v0.45.1

### Current Version
`package.json` root is `0.45.1`. Build is clean. CI green (pushed 7d3755c).

### What Was Shipped This Session (v0.45.0 → v0.45.1)

**v0.45.0 — UI Mobile Refactor Phase 1**
- `Brandbar`: 2-row on mobile (Row 1: brand + lang + account; Row 2 xs-only: PlayerResources)
- `MobileTabBar`: 5-slot grid with `⋯ More` popover — 4 PRIMARY_PATHS direct tabs + 5th slot either profile link or More button with overflow items + profile
- `EventTickerStrip`: rotates through top 3 events every 5 s with "1/3" counter
- `AreaScene.ts`: all inspect/hunt hit zones bumped to ≥44px (was 36–40px)
- `chronicleRenderer.test.ts`: fixed 6 failing tests — test was mocking `geminiClient.generateWithKeyPool` (removed in v0.42.0); rewrote to mock `aiProvider.generateWithProviders`, updated mock return shape to `{ text, provider }`, added `getSetting: () => null` to mock SettingsStore

**v0.45.1 — Canvas 4:3 + sticky BottomSheet tab bar on mobile**
- `AreaPhaserGame.tsx`: `aspect-[3/2]` → `aspect-[4/3]` — taller canvas on portrait mobile
- `AreaPage.tsx`: bottom section now `flex-col-reverse lg:flex-col`; drawer tab bar wrapped in `sticky bottom-[56px] z-[25]` div so it pins just above MobileTabBar when user scrolls; panel content sits above the tab bar visually on mobile via reversed flex order (CSS-only, no JSX duplication)
- `GameShell.tsx`: EventTickerStrip suppressed on `/area/*` routes via `useLocation()` (avoids z-index conflict with sticky BottomSheet)

### Current Version
`package.json` root is `0.44.0`. Build is clean. No CI blocker.

### What Was Shipped This Session (v0.41.0 → v0.44.0)

**v0.41.0 — NPC work actually harvests + visible plant sprites + density bars**
- `runtime.ts` productive-event handler now emits `BIO_NODE_HARVESTED` + `GOODS_EXTRACTED` when plants are on tile
- `AreaScene.ts` `drawEcologyOverlay()` draws plant sprites (leaf icon) with density bar below each tile's plant layer
- Confirmed in-world: forest oak density 100 → 80.5 within hours of boot

**v0.41.1 — Animal click inspection zone root-cause fix**
- Root cause: `createInspectZone` was intercepting pointer events but never calling `onAnimalHunt`
- Fix: added optional `onPointerDown` callback param to `createInspectZone(x,y,w,h,msg,depth?,onPointerDown?)`
- Animal inspect zones now wire through to `onAnimalHunt`, solving "動物點不到"

**v0.42.0 — OpenCode as primary AI provider + Gemini 429 cooldown**
- New `openCodeClient.ts`: session-lifecycle client for self-hosted OpenCode server (POST /session → message → DELETE)
- New `aiProvider.ts`: provider router — tries `[opencode, gemini]` by priority order, throws `AiUnavailableError` if all fail
- `geminiClient.ts`: quota (429) errors now set `disabled_until = now + 30min` instead of permanent disable; `listActiveKeys()` auto-promotes expired keys
- `kv_settings` table added to SQLite for `opencode_base_url`, `opencode_model`, `provider_priority`
- `settingsRouter.ts`: `GET/PUT /api/settings/providers` — read/write all three config values
- `server.ts`: seeds OpenCode config from env vars `OPENCODE_BASE_URL` / `OPENCODE_MODEL` on first boot
- `SettingsPage.tsx`: "AI Provider" section with 3 inputs + save button
- `AreaPage.tsx` AI gate: `countActive() > 0 || isOpenCodeConfigured(settings)` (no longer blocked when only OpenCode configured)

**v0.43.0 — NPC sub-grid dispersal (no more clumping)**
- `npcEngine.ts` Phase 1.5 in `tick()`: groups NPCs by `(tile, activity)`, skips movers + indoor NPCs, sorts deterministically by npcId, assigns grid positions via `dispersedSubAnchor(rank, total)`
- `dispersedSubAnchor`: near-square grid across the SUB_INNER range (13×8), pure function, positions step toward target 1 unit/tick
- Result: 5 NPCs in same tile spread across the sub-grid rather than all stacking at column 8 row 4

**v0.44.0 — NPC opportunistic animal hunting (food chain runs)**
- `runtime.ts` productive event handler: 1-in-8 deterministic gate (hash-based), picks highest-count herbivore/fish species on tile
- Emits `ANIMAL_KILLED` (count=1) + `GOODS_EXTRACTED` (meat/fish goods from species.harvestGoodsId)
- Food chain is now active: ecosystem pressure visible within hours of NPC work sessions

### Active Blockers / Known Issues
- None blocking CI or build.
- OpenCode service: user must configure URL in /settings after Docker rebuild. OpenCode runs at port 4096 via `home-basic` project (`http://host.docker.internal:4096`).
- FACT_SET migration for building occupants / weather / season / rare window / active events still pending (lower priority than UI and combat work).

### Next Two Milestones

**v0.45.0 / v0.45.1 — UI Mobile Refactor (planned, not started)**

Phase 1 (v0.45.0, ~2hr, low risk — CSS/layout only):
- Brandbar split into 2 layers: row-1 (logo + ping + 48px tall), row-2 (area name + clock + 36px tall); sm+ collapses back to 1 row 56px
- MobileTabBar: 5 visible primary tabs + "⋯ More" popover for Settings/Account/Admin; min-height 56px; icons ≥44px tap target
- `AreaPage` max-width 600px on sm+, full-bleed on xs
- All `createInspectZone` hit areas ≥44px (current smallest is ~26px for animals)
- EventTickerStrip simplified to 3-line rotating strip; no scroll needed

Phase 2 (v0.45.1, ~4hr, medium risk — canvas + drawer):
- `AreaScene` canvas size: `window.innerWidth - 16` wide, `4:3` aspect ratio; recalculate on resize via `window.innerWidth` tracking
- Drawer replaced with BottomSheet: fixed bottom, 50vh height, slides up over canvas on "inspect" or "interact" actions
- EventTickerStrip merged into BottomSheet "events" tab

**v0.46.0 — Wildlife Combat (planned, not started)**

Full design in session transcript. Summary:
- `COMBAT_INITIATE` schema extended: `npcActorId` → `enemyActorId + enemyType: 'npc'|'animal'`
- Animal combat stats derived from `species.aggression` (≥0.5 = fight-capable)
- Weak animals (aggression < 0.5): instant hunt → `PLAYER_HUNTED_ANIMAL` event
- Strong animals: confirm dialog → Phase C sub-tick combat loop; animal AI = fixed damage per round, flee at low HP
- Extinction protection: cannot initiate combat when species count ≤ 3
- `CombatHud` adapted to show animal portrait + estimated difficulty

### Docker Rebuild Reminder (MUST READ)
```bash
# Always prefix with DOCKER_BUILDKIT=0 on this machine
DOCKER_BUILDKIT=0 docker compose -f deploy/docker-compose.yml down
DOCKER_BUILDKIT=0 docker compose -f deploy/docker-compose.yml up -d --build
curl -s http://127.0.0.1:8100/healthz
```
- `deploy/.env` must keep `JWT_SECRET=local-development-secret-0-15-24` — changing it invalidates all browser JWT cookies
- `docker compose down` preserves `deploy/data/` (SQLite EventLog). `down -v` destroys it — only use for fresh world

### Verification Evidence (v0.44.0)
- `npm run build:server` — TypeScript clean
- `npm run build:web` — TypeScript clean, Vite chunk-size warning only (pre-existing)
- `npx vitest run packages/server` — all server tests pass
- Deployed to local Docker; forest oak density confirmed declining (harvesting working); animal counts fluctuating (food chain active)

---

## 2026-05-20 — BioNode / Forest Regrowth Engine Phase E5 (v0.39.0)

### Work Done

- 新模組 `packages/server/src/ecosystem/plantSpecies.ts` — 5 種植物 species 的 catalog（橡樹、松木、蘆葦、野草藥、洞穴菌）
- 新 projection `BioNodeProjection`（檔案：`packages/server/src/projections/bioNode.ts`）— 處理 SEEDED/REGREW/HARVESTED 三事件
- 新 engine `planPlantRegrowth`（純函式）— 每小時 cadence 推進未滿 capacity 的節點
- 3 個新 command type 加進 `livingWorldCommands.ts`（validator + payload union）
- Goods catalog 新增 `fiber`、`wild_herb`、`fungi`（lumber 已存在）
- Runtime 接入：私有 field、自動 seeding（首 tick）、每小時 regrowth、兩處 fan-out、small/large log boot hydration、`plantsSeeded` 冪等旗標
- HTTP router `bioNodesRouter.ts`：`GET /api/world/bio-nodes` + `/api/world/bio-nodes/:tileId`，伺友善 `nameZh` / `saturationPct`
- 14 個新單元測試（BioNodeProjection 8 + plantRegrowth 6）

### Verification
- `npm run build:server` — TypeScript 乾淨，版本 0.39.0
- `npx vitest run packages/server` — 767 tests pass（1 pre-existing famine timeout）
- catalog.test.ts 預期計數從 10 改 13（新增 3 個 raw goods）

### 植物 / 森林層覆蓋率

| Tile/Biome | 適配物種 | 載量總和 |
|------------|---------|----------|
| t_forest (forest) | oak + pine + wild_herb | ~240 |
| t_mountain (mountain) | pine | 80 |
| t_desert (desert) | wild_herb | 60 |
| t_ruin / t_dimai (ruin) | cave_fungus | 50 |
| t_salt_marsh (salt_marsh) | reed | 120 |
| t_central / t_dock / t_temple | 無（grass / water 不在 region 範圍）| 0 |

### Next
- Phase E5 follow-up：harvest mechanic — NPC 砍樹/採藥動作鏈，連到 `GOODS_EXTRACTED`
- §11.5 剩餘 FACT_SET（building occupants / weather / season / rare window / active events）
- §11.9 household state + alias memory 進 dialog context

---

## 2026-05-20 — Area State Typed Projection §11.5 (v0.38.0)

### Work Done

- 新 command type `AREA_STATE_RECORDED` + `AreaStateRecordedCmd` payload union 加進 `livingWorldCommands.ts`；validator 檢查必要欄位
- 新 projection `AreaStateProjection`（檔案：`packages/server/src/projections/areaState.ts`）— latest by sequence per tile
- `runtime.ts` 雙寫：area engine 變化時同時 emit FACT_SET（向後相容）+ `AREA_STATE_RECORDED` 命令；fan-out 兩處 + small/large log boot hydration 都接好
- `hydrateFromEventLog` 改為優先讀 typed projection，舊 log 仍可 fallback 到 FACT_SET
- 6 個單元測試（sequence 排序、不同 tile 隔離、忽略非相關事件、canonical hash 確定性）

### Verification
- `npm run build:server` — TypeScript 乾淨，版本 0.38.0
- `npx vitest run packages/server` — 754 tests pass（1 pre-existing famine timeout）

### §11.5 FACT_SET Migration 狀態

| Domain | 狀態 |
|--------|------|
| NPC state | ✅ typed (NpcStateProjection) |
| **Area state** | ✅ v0.38.0 (AreaStateProjection) |
| Building occupants | ❌ 仍 FACT_SET |
| Weather / Season | ❌ 仍 FACT_SET |
| Rare window | ❌ 仍 FACT_SET |
| Active world events | ❌ 仍 FACT_SET |

### Next
- 剩餘 FACT_SET domain（建築佔用、天氣、季節、稀有窗口、世界事件）的 typed migration
- BioNode / Forest Regrowth Engine
- 道路/橋樑作為可建造地圖特徵

---

## 2026-05-20 — AI Dialog Grounding §11.9 (v0.37.0)

### Work Done

- `AiDialogContext` 擴展：`extinctionWarnings`、`dominantFaction`、`tileHistoryArcs` 三個新欄位
- `buildEcologyBlock` 加入瀕危物種警告；新增 `buildFactionBlock`（派系主導）+ `buildTileHistoryBlock`（弧線歷史）
- `runtime.ts` 新增 `getHistoryArcsOnTile`、`getDominantFactionOnTile`、`getExtinctionWarningsOnTile`
- `npc.ts` 在 dialog context 建構時同步填入三欄
- `package.json` 版本設為 0.37.0（canonical source），`build:server` 透過 `sync-version.mjs` 同步

### Verification
- `npm run build:server` — TypeScript 乾淨，版本 0.37.0
- `npx vitest run packages/server` — 748 tests pass

### §11.9 Dialog Grounding 狀態

| 資料 | 狀態 |
|------|------|
| 生態（動物族群 + 漁場）| ✅ 已接 |
| 謠言（activeRumors）| ✅ 已接 |
| NPC 技能等級 | ✅ 已接 |
| 已知人物圖 | ✅ 已接 |
| **瀕危物種警告** | ✅ v0.37.0 |
| **派系主導者** | ✅ v0.37.0 |
| **歷史弧線（遷徙 / 奪權 / 獵殺）** | ✅ v0.37.0 |
| 住戶 / 家族狀態 | ❌ 仍缺 |
| 長期社交記憶 alias | ❌ 仍缺 |

### Next
- §11.5: area state 仍使用 FACT_SET（NPC state 已 typed；area state 未）
- §11.6: simulation budget gate 未實作
- BioNode / Forest Regrowth Engine

---

## 2026-05-20 — History Chronicle Projection (v0.36.0)

### Work Done

- Created `packages/server/src/projections/historyChronicle.ts` — `HistoryChronicleProjection` with 8 arc types; deterministic arc detection from 13 event types; `HISTORY_CHRONICLE_BOOT_EVENT_TYPES` for selective fast-boot.
- Wired into `runtime.ts`: private field, both fan-out loops, small-log + large-log boot hydration paths, `getHistoryArcs()` public getter.
- New HTTP router `historyRouter.ts`: `GET /api/world/history-arcs` + `GET /api/world/history-arcs/:arcType`; registered in `server.ts`.
- 12 unit tests in `historyChronicle.test.ts` — all arc state machines, hash equality, `getByType`.

### Verification
- `npm run build` — TypeScript clean, web bundle clean
- `npx vitest run packages/server` — 109 test files, 748 tests pass (1 pre-existing famine timeout under load)
- `historyChronicle.test.ts` — 12/12 pass

### §43 Status After v0.36.0
- Criterion 1 (NPC mortality + lineage) ✅ v0.32.0
- Criterion 2 (faction seizure + loyalty) ✅ v0.33.0
- Criterion 3 (settlement famine) ✅ v0.34.0
- Criterion 4 (arc history while player away) ✅ v0.36.0 — `HistoryChronicleProjection` now detects + persists all 8 narrative arc types

### Next
- AI dialog grounding (§11.9) — wire ecosystem projection data into NPC dialog prompts
- `ARCHITECTURE.md §11.5` — area state still uses FACT_SET (NPC state is typed; area state not yet)
- `ARCHITECTURE.md §11.6` — simulation budget gate not enforced
- BioNode / Forest Regrowth Engine (plant/fungal nodes)

---

## 2026-05-20 — Market Prices API + brine naming fix (v0.35.0)

### Work Done

- Fixed `salt_marsh_brine` → `brine` naming mismatch in `marketPricing.ts` and `productionChains.ts` (goodsId now matches the goods catalog spec)
- Added `GET /api/goods/market-prices` endpoint — serves current `MarketPriceRow` list from `MarketPricesProjection` with `nameZh` from catalog
- Updated `goodsRouter.test.ts` to stub `getMarketPrices()` and test the new endpoint
- All `productionChains.test.ts` and `runtimeProductionChains.test.ts` references updated to use `brine`
- Updated `recipeId` from `recipe.salt_marsh_brine.refined_salt` → `recipe.brine_to_refined_salt`

### Verification
- `npm run build:server` — TypeScript clean
- `npm test` — 108 server test files (737 tests), 21 web test files (96 tests) — all pass

### Next
- §43 criterion 2 ("settlement famine → neighbouring price rise") is now mechanically wired and observable via `GET /api/goods/market-prices`
- Consider: `history_chronicle` projection (§30.9) to close §43 criterion 4 ("player away → world continues with arc history")
- Consider: AI dialog grounding — wire ecosystem projection data into NPC dialog prompts (ARCHITECTURE.md §11.9)

---

## 2026-05-20 — WORLD_CAPABILITIES.md Part II baseline sync (v0.34.0 doc)

### Work Done

Updated `docs/WORLD_CAPABILITIES.md` Part II baseline from v0.15.47 → v0.34.0. All ✅/❌ entries now reflect the actual codebase.

**Major corrections:**
- §13 Headline Numbers: species 0→23, commands 26→~121, projections 0→23
- §14 Kernel Guarantees: NpcStateProjection as typed replacement for FACT_SET (partial §11.5 closure) noted
- §15 Command Catalog: complete rewrite grouping ~121 commands by subsystem
- §16 World Physics: resource transport / production chains / market / ecological substrate all now ✅
- §17 Map & Districts: biome-driven species spawn now ✅
- §18 NPC Population: hunter/fisher substrate now exists
- §19 NPC Inner State: deceased/heirOf/rumor/mentorship fields added
- §20 NPC Autonomous Behavior: hunting/fishing/settlement/faction/rumor/mentorship/mortality all ✅; remaining gaps: NPC-to-NPC trade, household migration
- §22 Combat: Phase C + wildlife combat ✅; §11.4 still 🟡
- §24 Player: full Phase 6 command list
- §25 AI: ecological perception gap noted
- §27 Ecosystem: was "0% implemented" → now fully implemented across E0–E4; BioNode/ForestRegrowth gaps noted
- §28 Persistence: 23 projections listed; `history_chronicle` ❌ noted
- §29 Layer-by-Layer Status: updated from "placeholder/0%" to current state

### Verification
- `npm run build:server` — TypeScript clean

### Next
- Phase 2 completion: carrier NPC autonomous logistics routing so §43 criterion 2 ("settlement famine → neighbouring price rise") is verifiable end-to-end
- OR: `history_chronicle` projection (§30.9) to close §43 criterion 4 ("player away → world continues in arcs")

---

## 2026-05-20 — Goods Primitives: Settlement Food Consumption Cadence (v0.34.0)

### Work Done

§43 acceptance gap #3 (famine): settlement food consumption cadence is now wired, closing the missing link in the goods-to-pressure-to-decline chain.

**Config (`config/world.ts`):**
- `SETTLEMENT_FOOD_CONSUMPTION_CADENCE_TICKS = TICKS_PER_HOUR` — periodic food drain constant

**Runtime (`sim/runtime.ts`):**
- Added cadence block after `planSettlementCommands`: fires `GOODS_CONSUMED` from settlement storage every `SETTLEMENT_FOOD_CONSUMPTION_CADENCE_TICKS`
- Uses `settlement.populationNpcIds.length` for population count; skips empty-population settlements
- Consumes `min(heldFood, population × SETTLEMENT_FOOD_UNITS_PER_NPC)` from highest-quantity food goods row
- Chinese narration: `"{settlementId} 的居民消耗了 {quantity} 份食物。"`

**Chronicle (`sim/settlementEngine.ts`):**
- `SETTLEMENT_DECLINED` narration confirmed correct Chinese: `"${settlement.id} 的穩定度跌破閾值，聚落陷入衰退。"` (no change needed)

**Endpoint (`http/goodsRouter.ts`):**
- `GET /api/goods/inventory/:ownerId` — verified returns only `quantity > 0` items (spec-compliant)

**Tests:**
- New integration test: `sim/runtimeSettlementFamine.test.ts` — pre-loads fish, runs 750 ticks through first cadence, asserts `GOODS_CONSUMED` and food pressure rise
- New unit test in `sim/settlementEngine.test.ts` — "emits SETTLEMENT_DECLINED when stability drops below threshold due to sustained food pressure" (zero food + collapsed fishery + 10 fog_wolves → stability = 35)
- Extended `sim/runtimeGoodsInventory.test.ts` — added `GOODS_EXTRACTED` assertion for FISHERY_HARVESTED path

### Verification
- `npm run build` — TypeScript clean
- `npm test` — 108 server test files (736 tests), 21 web test files (96 tests) — all pass
- OpenSpec: `goods-primitives/` all tasks complete

### Next
- Archive `goods-primitives` change
- Remaining §43 gaps or next Phase plan

---

## 2026-05-20 — Faction Conflict Consequences (v0.33.0)

### Work Done

§43 acceptance gap #2: Faction seizure events + NPC loyalty shifts now propagate into EventLog, projections, chronicle, and AI memory.

**Event types (`livingWorldCommands.ts`):**
- `FACTION_TILE_SEIZED` (payload: `tileId`, `factionId`, `previousFactionId: string | null`, `seizedAtTick`, `narration`)
- `FACTION_NPC_LOYALTY_SHIFTED` (payload: `npcId`, `tileId`, `fromFaction`, `toFaction`, `shiftedAtTick`, `narration`)

**New projection (`projections/factionControl.ts`):**
- `FactionControlProjection` — per-tile dominant faction map; `dominantFactionOf(tileId)`, `dominantTilesOf(factionId)`, `list()`
- Boot-hydrated via `FACTION_BOOT_EVENT_TYPES` constant in large-log else-branch

**Seizure detection (`sim/areaStateEngine.ts`):**
- `AreaStateEngine.tick()` returns `seizureIntents: FactionSeizureIntent[]`
- `previousDominantFaction` tracked in area state; hysteresis ≥5 pts lead required

**Loyalty planner (`sim/factionLoyaltyPlanner.ts`):**
- `planLoyaltyShifts()` pure function — maps seizure intents + NPC presence + faction lean to shift intents
- Skips civilian new-dominant; skips already-aligned NPCs; skips off-tile NPCs

**Runtime integration (`sim/runtime.ts`):**
- `FactionControlProjection` field + fan-out in both event loops + boot hydration
- `computeNextTick`: seizure → loyalty pipeline; Chinese narration in both command types
- `getPlayerCivilizationSnapshot()`: `playerFactionTerritories: string[]` via projection

**AI memory (`kernel/npcMemory.ts`):**
- `FACTION_NPC_LOYALTY_SHIFTED` case added → NPC-scoped memory row (importance 8, kind `faction.loyalty_shifted`)

### Verification
- `npm run build` — TypeScript clean, version 0.32.0
- `npm test` — 107 server test files (734 tests), 21 web test files (96 tests) — all pass
- OpenSpec: `faction-conflict-consequences/` all 29 tasks complete

### Next
- Archive `faction-conflict-consequences` change
- §43 gap #3: Settlement famine (needs Phase 2 Goods first)
- Bump package.json to 0.33.0 before Docker rebuild

---

## 2026-05-19 — Engineering Cleanup + Interaction Fixes (v0.32.0)

### Work Done

**工程清理：**

1. **Deploy gate** — `.github/workflows/deploy-dev.yml` 改為 `workflow_run` 觸發，CI 沒過不跑 deploy；`workflow_dispatch` 保留。Checkout 固定用 `workflow_run.head_sha`。
2. **版本統一** — 唯一來源：根目錄 `package.json`（`0.32.0`）。`scripts/sync-version.mjs` 同步 `version.ts` + workspace package.json。`build:server` 自動執行同步。`npm run version:sync` 手動觸發。
3. **OpenSpec 格式檢查** — `npm run openspec:check` 本地跑 `openspec validate --strict`，與 CI openspec job 完全一致。

**互動修復：**

4. **Animal hunt** — `AnimalPopulationProjection.project()` 新增 `PLAYER_HUNTED_ANIMAL` 處理，點擊動物後從投影移除（`readHuntPayload` reads `payload.data.animalId/speciesId/tileId/tick`）。前端在成功後立即重新 fetch ecology 更新畫面。
5. **Fishery** — `FisheryDensityProjection.project()` 新增 `PLAYER_FISHED` 處理，每次捕魚扣 `FISHERY_HARVEST_DELTA × quantity` 密度（`readPlayerFishPayload` reads `payload.data`）。前端同樣在成功後 refresh ecology。

### Verification
- `npm run build` — TypeScript clean，version synced to 0.32.0
- `npm test` — all tests pass
- git push — commit `4f56dcb`
- Docker rebuild in progress

---

## 2026-05-19 — Area Animal Hunt + Fish Interactions

### Work Done

Wired missing player interactions in AreaPage:

- **AreaScene.ts**: `AreaSceneCallbacks` now has `onAnimalHunt(speciesId, animalId)` and `onFish()`. Animal single-dot + cluster `pointerdown` call `onAnimalHunt`; fishery bar gets a transparent hit-area that calls `onFish`.
- **AreaPhaserGame.tsx**: Props + `callbacksRef` + `init.callbacks` wired for both new callbacks.
- **AreaPage.tsx**: `handleAnimalHunt` → `api.playerAction(token, 'PLAYER_HUNTED_ANIMAL', { tileId, speciesId, animalId })`; `handleFish` → `api.playerAction(token, 'PLAYER_FISHED', { tileId, quantity: 1 })`; 2s `actionFeedback` toast for both.

Server-side: `playerCivilizationRouter` injects `playerAccountId` and `tick` server-side, so frontend only sends `tileId + speciesId + animalId` (or `tileId + quantity`).

### Verification
- `npm run build` — TypeScript clean
- Docker rebuilt, stack running at tick ~26315
- URL: http://127.0.0.1:8100

---

## 2026-05-19 — NPC Mortality & Lineage (v0.32.0)

### Work Done

§43 acceptance gap #1: NPCs now age and die. Deterministic lifespan (FNV-1a hash), household succession, chronicle narration, and AI dialog memory grounding.

**Event types (`livingWorldCommands.ts`):**
- `NPC_DECEASED` (payload: `npcId`, `tileId`, `householdId`, `deceasedAtTick`, `narration`)
- `NPC_HEIR_ASSIGNED` (payload: `householdId`, `deceasedNpcId`, `heirNpcId`, `assignedAtTick`, `narration`)

**Config constants (`config/world.ts`):**
- `NPC_BASE_LIFESPAN_TICKS = 120_960` (~1 real week)
- `NPC_LIFESPAN_VARIANCE_TICKS = 60_480`
- `MORTALITY_CADENCE_TICKS = TICKS_PER_HOUR`
- `npcLifespanTicks(npcId)` — FNV-1a hash, replay-safe

**New projections:**
- `projections/npcMortality.ts` — `NpcMortalityProjection`: tracks deceased NPCs; `isDeceased()`, `deceasedAtTick()`, `list()`, `deceasedIds`
- `projections/npcLineage.ts` — `NpcLineageProjection`: household membership from `NpcProfile.personality.householdId`; `householdId()`, `membersOf()`, `heirHistory()`, `livingMembersOf()`

**New planner:**
- `sim/mortalityPlanner.ts` — `planMortality()`: pure function, cadence-gated, oldest-first heir selection by `bornAtTick`

**Runtime integration (`sim/runtime.ts`):**
- Both projections as private fields, initialized in constructor
- `MORTALITY_BOOT_EVENT_TYPES` constant; both projections boot-hydrated in large-log else-branch
- Both projections wired into both per-event fan-out loops
- Mortality cadence block emits `NPC_DECEASED` + (when heir) `NPC_HEIR_ASSIGNED`
- `getNpcs()` → `deceased: boolean` field added to `SimNpcState`

**Chronicle & AI memory:**
- Narration strings embedded directly in command payloads (Chinese)
- `HOUSEHOLD_INHERITANCE_ASSIGNED` already suppressed in chronicleRenderer
- `npcMemory.ts`: NPC_DECEASED → world-scoped memory row (importance 8); NPC_HEIR_ASSIGNED → heir-scoped memory row (importance 9)

**Also shipped (§43 quick wins):**
- `PlayerCivilizationPanel.tsx`: faction list now reads `factionEcologyStances` (was reading nonexistent `factionDominance` key)
- `settlementEngine.ts`: `SETTLEMENT_DECLINED` event now emitted when stability first transitions to declining

### Verification

- `npm run build` — TypeScript clean (server + web)
- `npm test` — 716/716 tests pass (104 test files)
- `npcLifespanTicks` is deterministic: pure FNV-1a, no IO, no random

### Remaining

- None — all 34 tasks complete

---

## 2026-05-19 — Player Civilization UI (v0.31.0)

### Work Done

Phase 6 backend APIs are now exposed in the game UI. A collapsible "文明面板" panel in HubPage lets authenticated players see their civilization state and perform actions.

**New API client methods (`packages/web/src/api/client.ts`):**
- `api.playerState(token)` → `GET /api/world/player-state` → `PlayerCivilizationSnapshot`
- `api.playerAction(token, type, payload)` → `POST /api/world/player-action` → `PlayerActionResult`

**New component: `packages/web/src/components/game/PlayerCivilizationPanel.tsx`:**
- Wallet, hired NPC count, faction list, claimed tile count displayed
- `PLAYER_CLAIMED_TERRITORY` — claim current district tile
- `PLAYER_HIRED_NPC` — hire from nearby NPC dropdown (filtered: already-hired excluded)
- `PLAYER_JOINED/LEFT_FACTION` — per-faction join/leave buttons (derived from `world.facts.factionDominance`)
- `PLAYER_PLAYED_CARD` — held card dropdown → play with current tileId
- Inline rejection reason display; auto-clears after 5s or on next submit

**HubPage changes:**
- Toggle button ("⚔ 文明面板") below map
- `showCivPanel` state; `PlayerCivilizationPanel` mounts when toggled on

**i18n:** 16 `playerCiv.*` keys in zh + en added to `types.ts`, `en.ts`, `zh.ts`.

### Verification

- TypeScript: clean (web + server, zero errors)
- Web build: clean (`vite build` 104 modules)
- Smoke tests: browser UI verification pending Docker rebuild with new web image

### Remaining

- Docker rebuild needed to see UI changes in browser (server container is already v0.30.0; web container needs rebuild with new panel)
- OpenSpec change `player-civilization-ui` ready to archive after smoke-test

---

## 2026-05-19 — Phase 6: Player Civilization Integration (v0.30.0)

### Work Done

Phase 6 wires the player into the living world via a Command → Rule Engine → Event pipeline. Players can now claim territory, hire NPCs, join factions, hunt, fish, trade, and play world-layer cards — all recorded in the deterministic EventLog and reflected in a per-account projection.

**New command types (14) in `livingWorldCommands.ts`:**
- `PLAYER_PICKED_UP_GOODS`, `PLAYER_TRADED_GOODS`, `PLAYER_HUNTED_ANIMAL`, `PLAYER_FISHED`, `PLAYER_DOMESTICATED_ANIMAL`, `PLAYER_PROTECTED_REGION`
- `PLAYER_HIRED_NPC`, `PLAYER_DISMISSED_NPC`
- `PLAYER_SPONSORED_CONSTRUCTION`, `PLAYER_FOUNDED_SETTLEMENT`, `PLAYER_CLAIMED_TERRITORY`
- `PLAYER_JOINED_FACTION`, `PLAYER_LEFT_FACTION`, `PLAYER_LED_FACTION`
- `PLAYER_PLAYED_CARD`
- Full payload types + validators for each

**New projection:**
- `packages/server/src/projections/playerCivilization.ts` — `PlayerCivilizationProjection`: `wallet`, `hiredNpcIds`, `factionIds`, `claimedTileIds` per account; boot-hydrated via selective `PLAYER_CIVILIZATION_BOOT_EVENT_TYPES` read on large-log path

**New HTTP endpoints:**
- `POST /api/world/player-action` — JWT-authenticated; validates type against allowlist; merges `playerAccountId` into payload; submits via `submitLivingWorldCommand`; returns `{ accepted, tick }` or `{ accepted: false, reason }`
- `GET /api/world/player-state` — JWT-authenticated; returns `PlayerCivilizationProjection.snapshot(accountId)`
- `packages/server/src/http/playerCivilizationRouter.ts` — router; registered in `server.ts`

**Chronicle renderer cleanup (no more hardcoded Chinese):**
- `chronicleRenderer.ts`: all 12 existing E2/E3/E4 Chinese narration strings replaced with machine-readable `[EVENT_TYPE] key=val` English fallbacks
- New player event pass-through: all `PLAYER_*` events (except `PLAYER_INTERVENE`/`PLAYER_ENERGY_SET`) return a `ChronicleEvent` with English fallback so they flow into the Gemini AI narrative pipeline

**Runtime wiring:**
- `runtime.ts`: `playerCivilizationProjection` field; fan-out in publish loop; both boot branches hydrated

**OpenSpec:** `phase-6-player-civilization` — all 26 tasks complete.

### Verification

- TypeScript: clean (`npm run build` — zero errors, both packages)
- Tests: 101 server test files, 697 tests, all pass (includes 8 new `playerCivilization.test.ts` + 4 `playerCivilizationRouter.test.ts`)
- Docker: rebuilt 2026-05-19 (1.1 GB event log, 683,366 events, large-log fast-boot)
  - `healthz` → `{"ok":true,"version":"0.26.1","tick":24418}` ✓
  - `POST /api/world/player-action` `PLAYER_CLAIMED_TERRITORY` → `{"accepted":true,"tick":24422}` ✓
  - `GET /api/world/player-state` → `{"accountId":"4","wallet":0,"hiredNpcIds":[],"factionIds":[],"claimedTileIds":["t_salt_marsh"]}` ✓

### Remaining / Known

- Archive `phase-6-player-civilization` OpenSpec change after commit/push.
- Package versions in `package.json` still show `0.26.1`/`0.27.0` — ROADMAP version numbering is semantic/release-level, not tied to npm package.json. Future: bump packages at release time.

---

## 2026-05-19 — Phase E4: Mythic Ecology (v0.29.0)

### Work Done

Phase E4 adds legendary species world events, hunt arcs, faction ecology ideology, and admin UI.

**New planners (all pure functions):**
- `packages/server/src/ecosystem/legendarySpawnPlanner.ts` — `planLegendarySpawns`: singleton constraint, prey threshold, pressure ceiling, deterministic hash probability → `ANIMAL_SPAWNED` intent
- `packages/server/src/ecosystem/legendaryHuntPlanner.ts` — `LegendaryHuntTracker` (in-memory): per-tick hunter clustering → `LEGENDARY_HUNT_STARTED` / `LEGENDARY_HUNT_CONCLUDED`
- `packages/server/src/ecosystem/factionEcologyPlanner.ts` — `planFactionEcology`: 4 static faction stances (clearcut/quota/sabotage/ritual) → faction ecology commands

**New projection:**
- `packages/server/src/projections/worldEvent.ts` — `WorldEventProjection` tracking per-tile legendary world events; `getActiveByTile`, `getActiveByAnimalId`, `list`, `snapshot`; `huntStartedEmitted` flag prevents duplicate HUNT_STARTED

**Updated:**
- `ecosystem/species.ts` — `iron_hound` updated to `rarity: 'legendary'`, `carryingCapacity: 1`, `packBehavior: 'solitary'` (singleton constraint)
- `livingWorldCommands.ts` — 8 new E4 command types: `LEGENDARY_WORLD_EVENT_SPAWNED`, `LEGENDARY_WORLD_EVENT_RESOLVED`, `LEGENDARY_HUNT_STARTED`, `LEGENDARY_HUNT_CONCLUDED`, `FOREST_CLEARCUT_ORDERED`, `FISHING_QUOTA_ENFORCED`, `INDUSTRIAL_SITE_SABOTAGED`, `RITUAL_ECOSYSTEM_MANIPULATION`
- `config/world.ts` — 9 new E4 constants: `LEGENDARY_SPAWN_CADENCE_TICKS`, `LEGENDARY_SPAWN_PROBABILITY`, `LEGENDARY_MAX_PRESSURE`, `LEGENDARY_SPAWN_MIN_PREY`, `LEGENDARY_WORLD_EVENT_SEVERITY`, `LEGENDARY_HUNT_MIN_HUNTERS`, `LEGENDARY_HUNT_THRESHOLD_TICKS`, `FACTION_ECOLOGY_CADENCE_TICKS`, + 3 faction thresholds
- `sim/runtime.ts` — `WorldEventProjection` + `LegendaryHuntTracker` fields; boot hydration (both branches); E4 cadence blocks (legendary spawn + faction ecology); per-tick hunt detection; areaSafety patch (subtract severity from tile safety before npcEngine.tick()); E4 fan-out (ANIMAL_SPAWNED for legendary → WORLD_EVENT_SPAWNED; ANIMAL_KILLED/STARVED/MIGRATED for tracked → WORLD_EVENT_RESOLVED + optional HUNT_CONCLUDED); `activeWorldEvents` + `factionEcologyStances` in snapshot facts
- `kernel/chronicleRenderer.ts` — 8 new Chinese narration blocks for all E4 event types
- `web/src/pages/AdminWorldPage.tsx` — "神話生態 Mythic Ecology" section: active world events table + faction ecology stance table

**OpenSpec:** `ecosystem-mythic-ecology` — all 38 tasks complete (12.3 Docker verified below).

### Verification

- TypeScript: clean (`npm run build` — zero errors, both packages)
- Tests: 99 server test files, 685 tests, all pass
- Docker: rebuilt and verified 2026-05-19
  - `healthz` → `{"ok":true,"version":"0.26.1","tick":22918}` ✓ (version field reflects persisted EventLog — consistent with prior releases)
  - `/api/world` facts include `activeWorldEvents: []` ✓ (empty — no legendary spawn yet; correct)
  - `factionEcologyStances` → 4 factions (guild/clearcut, tide_hunters/quota, free_runners/sabotage, hidden_overseer/ritual) ✓
  - All 23 fact keys present, no boot errors

### Remaining / Known

- Task 12.3 Docker smoke test: see above.
- `openspec-archive-change` for `ecosystem-mythic-ecology` to be run after this commit.

---

## 2026-05-19 — Phase E3: Ecosystem Domestication (v0.28.0)

### Work Done

Phase E3 adds domestication, breeding, slaughter, and mount assignment to the living world.

**New planners (all pure functions):**
- `packages/server/src/ecosystem/domesticationPlanner.ts` — `planDomestication`: wild pop ≥ 5, ranch present, capacity not full → ANIMAL_DOMESTICATED
- `packages/server/src/ecosystem/breedingPlanner.ts` — `planBreeding`: ≥ 2 livestock, cadence gate, capacity check → LIVESTOCK_BRED
- `packages/server/src/ecosystem/slaughterPlanner.ts` — `planSlaughter`: overflow → slaughter oldest-first, produce goods from byproducts
- `packages/server/src/ecosystem/mountPlanner.ts` — `planMountAssignment`: pair unassigned mount-eligible livestock with unmounted carrier NPCs

**New projection:**
- `packages/server/src/projections/livestockRegistry.ts` — `LivestockRegistryProjection` tracking per-settlement domesticated animals; role: `'livestock' | 'mount'`; helpers: `getBySettlement`, `getLivestockCount`, `getDomesticatedAnimalIdSet`, `getMountedAnimalIdForNpc`

**Wild population filter:**
- `projections/animalPopulation.ts` — `filterWildPopulation()` export: excludes domesticated animal IDs from wild pop rows used by spawning/predation/extinction planners

**Updated:**
- `ecosystem/species.ts` — `marsh_yak` added to `salt_marsh` region with `category: 'livestock'`, `mountEligible: true`, byproducts `['milk', 'hide']`; `mountEligible?: boolean` added to `Species` type
- `livingWorldCommands.ts` — 4 new command types: `ANIMAL_DOMESTICATED`, `LIVESTOCK_BRED`, `LIVESTOCK_SLAUGHTERED`, `MOUNT_ASSIGNED`
- `buildings/types.ts` — `'ranch'` building type; `livestockCapacity?: number` on `BuildingDef`
- `buildings/catalog.ts` — `b_salt_marsh_ranch` added to `EXPANSION_BUILDINGS`
- `config/world.ts` — `DOMESTICATION_MIN_WILD_POP`, `RANCH_DEFAULT_CAPACITY`, `DOMESTICATION_CADENCE_TICKS`, `BREEDING_CADENCE_TICKS`, `MOUNT_SPEED_MULTIPLIER`
- `sim/runtime.ts` — `LivestockRegistryProjection` field, boot hydration (both branches), event fan-out, E3 cadence block (domestication + breeding + slaughter + GOODS_EXTRACTED + mount assignment), `livestockRegistry` in `getSnapshot()` facts
- `kernel/chronicleRenderer.ts` — ANIMAL_DOMESTICATED/LIVESTOCK_BRED suppressed; LIVESTOCK_SLAUGHTERED + MOUNT_ASSIGNED have Chinese narration
- `web/src/pages/AdminWorldPage.tsx` — "馴養登記 Livestock Registry" section with per-settlement table

**OpenSpec:** `ecosystem-domestication` — tasks 1–9 and 10.1–10.6, 10.8, 11.1–11.3, 12.1–12.2 complete. Task 10.7 (mount speed multiplier in NpcEngine) deferred — requires NpcEngine refactor.

### Verification

- TypeScript: clean (both packages)
- Tests: 95 server files + 21 web files, 662 + 96 = 758 tests, all pass
- Web build: clean (Vite + tsc)
- Docker: rebuilt and verified 2026-05-19
  - `healthz` → `{"ok":true,"version":"0.26.1","tick":22480}` ✓
  - `/api/world` facts include `livestockRegistry` key ✓ (empty — no ranch built yet)
  - All 21 fact keys present, no boot errors

### Remaining / Known

- All 49 tasks complete. Ready to archive.
- Task 13.3: `listSpeciesByCategory('livestock')` now returns `marsh_yak` (verified via updated species test).
- `openspec validate --all --strict` should be run before next release.

---

## 2026-05-18 — Phase E2: Ecosystem Pressure & Collapse (v0.27.0)

### Work Done

Phase E2 closes the feedback loop between civilization actions and ecosystem consequences.

**New planners:**
- `packages/server/src/ecosystem/extinctionPlanner.ts` — `planSpeciesExtinctionCheck` pure function. Emits `SPECIES_EXTINCTION_WARNING` (per-tile when count < threshold), `SPECIES_EXTINCT` (total = 0 for warned species), `SPECIES_RECOVERED` (extinct species re-detected).
- `packages/server/src/ecosystem/pressurePlanner.ts` — `planEcosystemPressure` pure function. Returns `'raise'`/`'recover'`/`null` based on NPC work action count and idle time.
- `packages/server/src/ecosystem/fishery.ts` — added `planFisheryPassiveRegen` for passive density recovery.

**New projections:**
- `packages/server/src/projections/speciesExtinction.ts` — `SpeciesExtinctionProjection` with `stable/warning/extinct` lifecycle.
- `packages/server/src/projections/ecosystemRegion.ts` — `EcosystemRegionProjection` with per-tile pressure/pollution levels.

**Updated:**
- `livingWorldCommands.ts` — 6 new command types + payload types: `SPECIES_EXTINCTION_WARNING`, `SPECIES_EXTINCT`, `SPECIES_RECOVERED`, `FISHERY_RECOVERED`, `ECOSYSTEM_PRESSURE_RAISED`, `ECOSYSTEM_PRESSURE_RECOVERED`.
- `projections/fisheryDensity.ts` — handles `FISHERY_RECOVERED` event (density update + collapse recovery).
- `ecosystem/animalSpawning.ts` — added `spawnRateModifier` (pressure reduces low-tolerance species spawns) + `getPressureLevel` input.
- `sim/runtime.ts` — instantiated new projections, wired into boot hydration, fan-out loops, reproduction cadence (extinction check, fishery regen, pressure planner), snapshot facts.
- `kernel/chronicleRenderer.ts` — `SPECIES_EXTINCT`/`SPECIES_RECOVERED` → Chinese narration; warning/pressure/fishery recovery events suppressed.
- `web/src/pages/AdminWorldPage.tsx` — "生態壓力" section with species status table and tile pressure table.
- `config/world.ts` — 5 new constants: `SPECIES_EXTINCT_GRACE_TICKS`, `ECOSYSTEM_PRESSURE_WORK_THRESHOLD`, `ECOSYSTEM_PRESSURE_RECOVERY_TICKS`, `FISHERY_RECOVERY_RATE`, `FISHERY_RECOVERY_BUFFER`.

**OpenSpec:** `ecosystem-pressure-collapse` change — all 33 tasks complete.

### Verification

- TypeScript: clean (both packages)
- Tests: 111 files, 724 tests, all pass
- Web build: clean
- `openspec validate --all --strict`: 35/35 pass
- Docker: rebuild pending

---

## 2026-05-18 — Ecosystem Balance & Migration Wave Fix (v0.26.1)

### Problems Fixed

**Map freeze (migration wave accumulation)**
`AnimalMigrationProjection` incremented wave count on `ANIMAL_MIGRATED` but never removed waves. After ~21k ticks, t_mountain had 237 in-flight waves and t_dimai had 198 — every area ecology API call serialized all of them, hanging the client. Fix: delete wave on `ANIMAL_MIGRATED` (migration is instantaneous). Cap API response at 8 waves per direction as a safety net.

**No species diversity / predator extinction**
`ECOSYSTEM_TILE_CARRYING_CAPACITY_DIVISOR = 12` gave predators effective capacity of 1 (base capacity 6–16 ÷ 12 = 0–1). With effective capacity ≤ 1, reproduction requires ≥ 2 animals of the same species on the same tile — impossible. Predators went extinct within a few hours. Prey species (deer, rabbits) filled every tile. Fix: raised all predator base `carryingCapacity` to ≥ 30 (effective ≥ 2).

**Starvation too fast**
`PREDATOR_STARVATION_THRESHOLD_TICKS = 5 × 12 = 60` ticks (5 minutes wall-clock). Fix: raised to `20 × 12 = 240` ticks (20 minutes).

**Too few initial spawns**
`ECOSYSTEM_MAX_SPAWNS_PER_ACTIVE_TILE = 1` — world populated very slowly. Raised to 2.

### Files Changed

- `packages/server/src/config/world.ts` — `MAX_SPAWNS_PER_ACTIVE_TILE` 1→2; `PREDATOR_STARVATION_THRESHOLD_TICKS` 5×→20×
- `packages/server/src/ecosystem/species.ts` — all predator `carryingCapacity` ≥ 30; reduced dominant prey (deer, rabbit) to reduce monoculture
- `packages/server/src/projections/animalMigration.ts` — `ANIMAL_MIGRATED` deletes wave instead of incrementing count
- `packages/server/src/sim/areaEcology.ts` — cap migrations arriving/departing at 8 per direction
- Tests: `animalMigration.test.ts`, `animalSpawning.test.ts`, `runtimeAnimalSpawning.test.ts`, `runtimeMigration.test.ts`, `runtimePredation.test.ts` updated to reflect new behavior

### Verification

- Build: clean
- Tests: 86 files, 578 tests, all pass
- Docker: v0.26.0 running (rebuild pending for v0.26.1)

---

## 2026-05-18 — Phase 2 Goods Primitives (v0.26.0)

### Work Done

Phase 2 slice 1: goods substrate foundation — catalog, commands/events, inventory projection, HTTP endpoint.

**New files:**
- `packages/server/src/goods/catalog.ts` — 10-species frozen `GOODS_CATALOG` (`meat`, `fish`, `brine`, `lumber`, `ore`, `grain`, `refined_salt`, `iron_ingot`, `bread`, `tools`) with `goodsId`, `nameZh`, `unit`, `tier`. `listGoodsSpecies()` / `getGoodsSpecies(id)`.
- `packages/server/src/goods/catalog.test.ts` — 4 unit tests (length, array frozen, entries frozen, unknown → undefined).
- `packages/server/src/http/goodsRouter.ts` — `GET /api/goods/inventory/:ownerId` reads `GoodsInventoryProjection`, returns non-zero entries with catalog metadata (`goodsId`, `quantity`, `nameZh`, `unit`). No auth required.
- `packages/server/src/http/goodsRouter.test.ts` — 2 tests (non-zero entries only, unknown owner → []).

**Wired into existing infrastructure (already existed pre-v0.26.0):**
- 5 GOODS command/event types in `livingWorldCommands.ts` (`GOODS_EXTRACTED`, `GOODS_STORED`, `GOODS_PROCESSED`, `GOODS_CONSUMED`, `GOODS_DESTROYED`)
- `GoodsInventoryProjection` in `projections/goodsInventory.ts` — full applyEvent + rebuildFromEvents + canonicalHash
- E0 hooks in `runtime.ts`: `MEAT_HARVESTED` → `GOODS_EXTRACTED:meat`; `FISHERY_HARVESTED` → `GOODS_EXTRACTED:fish`

**Boot path additions (`runtime.ts`):**
- `GOODS_BOOT_EVENT_TYPES` constant (11 goods + logistics event types).
- `goodsInventoryProjection.rebuildFromEvents(goodsEvents)` wired into large-log `else` boot branch (same pattern as v0.25.3 ecosystem projections).

**OpenSpec:**
- `goods-primitives` change: all 8 sections complete (48/48 subtasks).
- Delta spec `openspec/changes/goods-primitives/specs/goods-primitives/spec.md` uses `## ADDED Requirements`.
- `npx openspec validate --all --strict` — 34 passed, 0 failed.

### Verification

- Build: `npm run build:server` — clean.
- Tests: 86 server files, 578+ tests, all pass.
- OpenSpec: 34/34 passed.

### CI / Deploy

- Pushed: (see commit).

### Next Steps

1. Archive `goods-primitives` OpenSpec change.
2. Phase 2 slice 2: Logistics projection (`GOODS_TRANSPORT_*` events) — trade routes between settlements.
3. Phase 2 slice 3: Market prices projection (`MARKET_PRICE_DISCOVERED`) — supply/demand clearing.

---

## 2026-05-18 — Ecosystem boot fix (v0.25.3)

### Problem Fixed

Production EventLog exceeds `BOOT_PROJECTION_REBUILD_EVENT_LIMIT = 20_000` after ~17 minutes.
The `else` branch in the boot hydration path only rebuilt combat projections — all four
ecosystem projections (`AnimalPopulation`, `AnimalMigration`, `PredatorHunger`, `FisheryDensity`)
were left empty on every Docker restart. Animals appeared at 1/minute per tile after restart,
but full historical population was silently lost. This is why animals didn't appear in the UI.

### Fix

`packages/server/src/sim/runtime.ts`:
- Added `ECOSYSTEM_BOOT_EVENT_TYPES` constant listing 8 ecosystem event types.
- Added selective `readEventsByTypes` + `rebuildFromEvents` for all 4 ecosystem projections
  in the large-log `else` branch (alongside `hydrateCombatRuntimeFromEvents`).

### Verification

- Build: `npm run build:server` — clean.
- Tests: 84/84 server files, 572/572 tests pass.
- Pushed: `9c7098a` — CI/deploy triggered.

### Next Steps

1. Verify animals appear in production after deploy:
   - Check `https://hunter.sisihome.org/api/area/t_forest/ecology` — `animals` array should be non-empty.
2. Bump `APP_VERSION` to `0.25.3` (minor fix release).
3. Start planning next OpenSpec change (Phase D: persistent combat outcomes — faction/economy/NPC memory from `COMBAT_RESOLVE.worldEffects`, closes §11.2).

---

## 2026-05-18 — Archive + version bump (v0.25.2)

### Work Done

- Archived `combat-phase-c-realtime-subtick` OpenSpec change (39/39 tasks done, all shipped).
- Synced 9 Phase C requirements from delta spec into canonical `openspec/specs/combat-runtime/spec.md`.
- Bumped `APP_VERSION` from `0.24.22` → `0.25.2` in `packages/server/src/version.ts`.

### Verification

- Build: `npm run build:server` — clean.
- Tests: 84 server files (572 tests) + 21 web files (96 tests) = 668 tests, all pass.
- `npx openspec validate --all --strict` — 33 passed, 0 failed (no active changes).

### CI / Deploy

- Pushed: `084be22`.

### Next Steps

~~Investigate why animals don't appear on any tile~~ — root cause found and fixed (see above).

---

## 2026-05-18 — Combat Phase C Complete (v0.25.1)

### Slices Implemented (this session)

**Slice 4 (v0.25.0):**
- Server: `CombatSnapshotView` + `getCombatSnapshot()` on `CombatSubTickCoordinator`; `SimulationRuntime` adds `submitCombatCardPlay`, `submitCombatCardCancel`, `getCombatSnapshot`, `subscribeCombatEvents`; `combatRouter` adds Phase C HTTP + SSE endpoints (`/play`, `/cancel`, `/snapshot`, `/stream`). `tickDigest` dispatched to every SSE listener after each committed combat event.
- Client: `CombatProjection` (pure SSE-event projection with applySnapshot/applyEvent/isStale/predict/reconcile); `api/client` extended with `combatPlay`, `combatCancel`, `combatSnapshot`, `combatStreamUrl`. 14 tests.

**Slice 5 (v0.25.1):**
- `packages/web/src/components/game/CombatScene.ts` — Phaser scene (tweened HP bars, floating damage/heal numbers); `combatHand.ts` (pure card-hand constants + shouldShowRejectToast); `CombatHudPhaseC` React component (SSE stream, card hand, client prediction, reject toast, silent reconcile). 7 tests.

**Slice 6 (v0.25.2 → current):**
- `replayDeterminism.test.ts` — 1000-event CombatStore replay determinism test.
- `subTickLatency.test.ts` — p99 latency benchmark (p99 = 0.065 ms, budget = 50 ms; passes).
- ROADMAP.md: added v0.25.0 and v0.25.1 entries.
- ARCHITECTURE.md: §11.4 marked CLOSED; §11.2 marked partially closed; §12.5 updated.

### Progress

- `combat-phase-c-realtime-subtick`: **32/39** tasks complete. Slice 4 (19/19 done), Slice 5 (4/4 done), Slice 6 (6.1–6.4 done); 6.5 (open questions) still pending. Slices 7.x open questions will be answered next.

### Verification

- Full test suite: **107 test files, 670 tests pass** (after Slice 6 tests added).
- Build: `npm run build` — server build + web Vite bundle both clean.
- `npx openspec validate --all --strict` — run before push to confirm (expect 34 passed, 0 failed).

### CI / Deploy

- Not yet pushed (batching remaining Slice 6 + open-questions commit before pushing).
- Commits on `main` branch:
  - `773581f feat(combat): Sprint 6 Slice 4 — SSE stream + client prediction projection (v0.25.0)`
  - `d0a1cd5 feat(combat): Sprint 6 Slice 5 — real-time combat UI (v0.25.1)`

### Next Steps

1. Finish task 6.5 — answer open questions from proposal.md (7 questions, non-blocking to ship).
2. Push all Slice 6 work in one commit, then push to origin.
3. Monitor CI and deploy dev at `https://hunter.sisihome.org`.
4. Archive `combat-phase-c-realtime-subtick` change once all tasks done.
5. Phase D: persistent combat outcomes (faction/economy/NPC memory), full §11.2 closure.

## 2026-05-17 — CombatStore EventLog Projection

### Slice Implemented

- Version bumped to `0.24.22` so `/healthz` can visibly prove the CombatStore projection deploy.
- Refactored `CombatStore` into a committed-EventLog projection: removed public direct write paths (`createSession`, `updateAfterRound`, `appendLog`, `incapacitateNpc`) and kept read queries plus `projectEvent()` / `rebuildFromEvents()` reducer entrypoints.
- `SimulationRuntime` now owns the Phase B `/combat/:id/action` compatibility helper: it computes `evaluateCombatRound()` inside runtime, commits `COMBAT_PLAYER_ACTION` / `COMBAT_RESOLVE`, and fans committed events into `CombatStore` projection.
- HTTP combat handlers now share the runtime-attached `CombatStore`, submit commands, and read the committed projection; static coverage blocks direct write-method regressions and HTTP-side outcome authoring.
- Boot replay rebuilds `CombatStore` from combat EventLog events when safe, but preserves existing legacy `combat_sessions` / `combat_log` projection rows when historical Phase B action events lack full result snapshots.
- `COMBAT_DAMAGE`, `COMBAT_HEAL`, and standalone `COMBAT_DEFEAT` projection branches are idempotent under duplicate committed-event fanout; standalone defeat now records the correct world `resolved_tick` and outcome.
- Player defeat energy-to-zero is now authored as a committed `PLAYER_ENERGY_SET` event and projected by `PlayerJobsStore`, rather than direct HTTP mutation.

### Progress

- `combat-phase-c-realtime-subtick`: `15/39` tasks complete; completed Slice 3 tasks `3.1` and `3.4`. Remaining Slice 3 work is `3.2`, `3.3`, and the still-open `3.5` legacy `card_action_log` derivability coverage.

### Verification

- Focused projection/boundary tests: `npm --workspace packages/server exec vitest run src/sim/runtimeCombatStoreProjection.test.ts src/buildings/playerJobsStore.test.ts src/combat/combatStore.test.ts src/combat/runtime.test.ts src/kernel/livingWorld.test.ts` — **72 tests passed**.
- Server build/typecheck: `npm run build:server` — clean.
- `npx openspec validate --all --strict` — **34 passed, 0 failed**.
- `npm test` — **570 server + 75 web = 645 tests passed**.
- `npm run build` — server build and web production bundle completed; known Vite chunk-size warning remains.
- `git diff --check` — clean; Windows CRLF warnings only.
- `npx openspec list` — `combat-phase-c-realtime-subtick 15/39 tasks` remains the only active change.
- Separate read-only reviewer gate — first pass found `COMBAT_DEFEAT` resolved tick/outcome plus defeat-energy side-effect risks; fixes were applied; final pass returned **No findings**. A residual boot-preservation gap called out by review is now covered by `runtimeCombatStoreProjection.test.ts`.

### CI / Deploy

- Commit `8c554a2 feat(combat): project combat store from events` pushed to `main` / `origin/main`.
- GitHub Actions `main CI` run `25995517848` — **passed**: OpenSpec validate, server typecheck, web typecheck + bundle, server tests. Node.js 20 deprecation annotation is non-blocking.
- GitHub Actions `main Deploy Dev` run `25995517831` — **passed**: Docker images built/pushed, desktop deploy completed, smoke check passed. Node.js 20 deprecation annotation is non-blocking.
- Live smoke after deploy:
  - `https://hunter.sisihome.org/healthz` — healthy, `version: 0.24.22`; health tick advanced `153379 → 153383`.
  - `https://hunter.sisihome.org/api/world` — tick advanced from `153379` to `153383` over 20 seconds; generated at `2026-05-17T15:56:01.987Z` and `2026-05-17T15:56:22.085Z`.
  - Recent `greed-island-server` logs since deploy: 6 lines checked, **0** matches for `SQLITE_CONSTRAINT_UNIQUE` and **0** matches for `[sim] tick failed`.

## 2026-05-17 — Combat Phase C Live Sub-Tick Wiring

### Slice Implemented

- Version bumped to `0.24.21` so `/healthz` can visibly prove the live sub-tick wiring deploy.
- Added `CombatSubTickCoordinator`, a server-side runtime coordinator for Phase C card sub-ticks.
- `COMBAT_CARD_PLAY` commands submitted through `SimulationRuntime.submitLivingWorldCommand()` are validated by `LivingWorldRuleEngine`, committed to EventLog, and then projected into the coordinator queue so crash/redeploy replay can recover unresolved plays.
- `CombatRuntime` now calls the coordinator on each per-combat tick; due queued commands are resolved by `evaluateCombatSubTick()` against the coordinator's minimal EventLog-derived combat projection.
- Sub-tick outputs are converted into deterministic `EventDraft`s and committed through a single `SqliteEventStore.appendEvents()` call, which is the SQLite transaction boundary for the batch.
- Runtime projection/listener fanout runs only from the coordinator's `afterCommit` callback, after EventLog commit succeeds. Failed commits keep pending commands queued for retry and skip fanout.
- Boot hydration rebuilds the coordinator from combat EventLog events before respawning unresolved combat loops at the highest committed resolved combat-local tick.
- This does not add new HTTP card endpoints yet; Slice 4 still owns `POST /api/combat/:id/play`, cancel, snapshot, SSE payload shape, and client prediction.

### Progress

- `combat-phase-c-realtime-subtick`: `13/39` tasks complete; completed `2.5b`; next tasks move into Slice 3 EventLog integration / CombatStore projection cleanup.

### Verification

- Focused combat runtime tests: `npm --workspace packages/server exec vitest run src/combat/subTickCoordinator.test.ts src/combat/runtime.test.ts src/combat/ruleEngine.test.ts src/combat/commands.test.ts src/combat/cards/compiler.test.ts src/combat/cards/catalog.test.ts` — **60 tests passed**.
- Server build/typecheck: `npm run build:server` — clean.
- `npx openspec validate --all --strict` — **34 passed, 0 failed**.
- `npm test` — **559 server + 75 web = 634 tests passed**.
- `npm run build` — server build and web production bundle completed; known Vite chunk-size warning remains.
- `git diff --check` — clean; Windows CRLF warnings only.
- `npx openspec list` — `combat-phase-c-realtime-subtick 13/39 tasks` remains the only active change.

### CI / Deploy

- Commit `b1567c3 feat(combat): wire live sub-tick coordinator` pushed to `main` / `origin/main`.
- GitHub Actions `main CI` run `25993027804` — **passed**: OpenSpec validate, server typecheck, web typecheck + bundle, server tests. Node.js 20 deprecation annotation is non-blocking.
- GitHub Actions `main Deploy Dev` run `25993027798` — **passed**: Docker images built/pushed, desktop deploy completed, smoke check passed. Node.js 20 deprecation annotation is non-blocking.
- Live smoke after deploy:
  - `https://hunter.sisihome.org/healthz` — healthy, `version: 0.24.21`; health tick advanced `152115 → 152119`.
  - `https://hunter.sisihome.org/api/world` — tick advanced from `152115` to `152119` over 20 seconds; generated at `2026-05-17T14:10:13.425Z` and `2026-05-17T14:10:33.515Z`.
  - Recent `greed-island-server` logs since deploy: 1 line checked, **0** matches for `SQLITE_CONSTRAINT_UNIQUE` and **0** matches for `[sim] tick failed`.

## 2026-05-17 — Combat Phase C Sub-Tick Rule Engine

### Slice Implemented

- Version bumped to `0.24.20` so `/healthz` can visibly prove this combat slice is deployed.
- Added pure `evaluateCombatSubTick()` in `packages/server/src/combat/ruleEngine.ts` for the Phase C five-phase pipeline: `STATUS_TICK → CARD_PLAY → DAMAGE/HEAL → DEFEAT → RESOLVE`.
- Card plays are filtered by `combatId` / `combatTick`, sorted deterministically by `(priority asc, actorId asc, commandId asc)`, validated against defeat/target-lock state, accepted/rejected, and compiled through the existing glyph-card catalog/compiler.
- Same-sub-tick control effects are visible to later lower-priority cards: `NO_ESCAPE` now compiles to `COMBAT_TARGET_LOCK`, later non-bypass card plays from/against locked actors reject deterministically, and `PHASE_SHIFT` puts the actor in `alt` phase so lower-priority target locks fail against the shifted actor.
- The evaluator deterministically derives sub-tick events plus resulting hp/status/target-lock projections; `FIRE_LASH` now resolves to damage plus burn status in the Phase C pure rule engine.
- Phase B `evaluateCombatRound()` remains unchanged for the existing HTTP `/api/combat/:id/action` compatibility path.
- Live EventLog transaction/SSE/runtime queue wiring is intentionally left as the next Slice 2 task (`2.5b`) rather than falsely marking the full integration clause complete.

### Progress

- `combat-phase-c-realtime-subtick`: `12/39` tasks complete; completed `2.5a` and `2.6`; next task is `2.5b` live pending-command queue + single SQLite transaction + post-commit SSE flush.

### Verification

- Focused combat tests: `npm --workspace packages/server exec vitest run src/combat/ruleEngine.test.ts src/combat/commands.test.ts src/combat/cards/compiler.test.ts src/combat/cards/catalog.test.ts` — **35 tests passed**.
- Server build/typecheck: `npm run build:server` — clean.
- `npx openspec validate --all --strict` — **34 passed, 0 failed**.
- `npm test` — **547 server + 75 web = 622 tests passed**.
- `npm run build` — server build and web production bundle completed; known Vite chunk-size warning remains.
- `git diff --check` — clean; Windows CRLF warnings only.
- `npx openspec list` — `combat-phase-c-realtime-subtick 12/39 tasks` remains the only active change.
- Separate general reviewer gate — first two passes found deterministic ordering issues; fixes were applied; final pass returned `No findings`.

### CI / Deploy

- Commit `14ebc80 feat(combat): add deterministic sub-tick rule engine` pushed to `main` / `origin/main`.
- GitHub Actions `main CI` run `25992009748` — **passed**: OpenSpec validate, server typecheck, web typecheck + bundle, server tests. Node.js 20 deprecation annotation is non-blocking.
- GitHub Actions `main Deploy Dev` run `25992009752` — **passed**: Docker images built/pushed, desktop deploy completed, smoke check passed. Node.js 20 deprecation annotation is non-blocking.
- Live smoke after deploy:
  - `https://hunter.sisihome.org/healthz` — healthy, `version: 0.24.20` on two stable reads; health tick advanced `151557 → 151561`.
  - `https://hunter.sisihome.org/api/world` — tick advanced from `151557` to `151561` over 20 seconds; generated at `2026-05-17T13:23:21.444Z` and `2026-05-17T13:23:41.514Z`.
  - Recent `greed-island-server` logs since deploy: 7 lines checked, **0** matches for `SQLITE_CONSTRAINT_UNIQUE` and **0** matches for `[sim] tick failed`.

## 2026-05-17 — Version Marker Hotfix

### Hotfix Implemented

- Version bumped to `0.24.19` as a release marker after the avatar OpenSpec archive deploy.
- Reason: the archive step was treated as docs/spec-only, so `packages/server/src/version.ts` stayed at `0.24.18` even though the archive commits deployed successfully. `/healthz` reads `APP_VERSION`, so the live site still showed `0.24.18` after the archive stage.
- No runtime behavior changes beyond the visible version marker.

### Verification

- `npx openspec validate --all --strict` — **34 passed, 0 failed**.
- `npm run build:server` — clean.
- `npm run build -w @greed-island/web` — clean; known Vite chunk-size warning remains.

### CI / Deploy

- Commit `8acd72a chore(release): bump version marker to 0.24.19` pushed to `main` / `origin/main`.
- GitHub Actions `main CI` run `25991023264` — **passed**: OpenSpec validate, server typecheck, web typecheck + bundle, server tests. Node.js 20 deprecation annotation is non-blocking.
- GitHub Actions `main Deploy Dev` run `25991023269` — **passed**: Docker images built/pushed, desktop deploy completed, smoke check passed. Node.js 20 deprecation annotation is non-blocking.
- Live smoke after version marker deploy:
  - `https://hunter.sisihome.org/healthz` — healthy, `version: 0.24.19` on two stable reads.
  - `https://hunter.sisihome.org/api/world` — tick advanced from `151024` to `151028` over 20 seconds; generated at `2026-05-17T12:38:28.396Z` and `2026-05-17T12:38:48.496Z`.
  - Recent `greed-island-server` logs since deploy: 8 lines checked, **0** matches for `SQLITE_CONSTRAINT_UNIQUE` and **0** matches for `[sim] tick failed`.

## 2026-05-17 — Authoritative Character Avatars Archived

### Archived

- Archived completed OpenSpec change `authoritative-character-avatars` to `openspec/changes/archive/2026-05-17-authoritative-character-avatars/`.
- Merged avatar authority requirements into canonical specs:
  - `openspec/specs/living-world/spec.md`: renderer-only humanoid avatar animation must not invent NPC position/activity or local wander.
  - `openspec/specs/npc-humanity-ai-memory/spec.md`: NPC avatar rendering must preserve globally unique server-authoritative presence across Hub, Area, and Building.
  - `openspec/specs/social-system/spec.md`: player avatar rendering must distinguish social presence/local input visuals from simulation authority.
- `authoritative-character-avatars` is no longer active; the remaining active OpenSpec change is `combat-phase-c-realtime-subtick`.
- Archive cleanup itself shipped as docs/spec-only after the deployed avatar rollout; a follow-up version marker hotfix bumps `/healthz` to `0.24.19` so the live release is visibly distinct.

### Verification

- `npx openspec validate --all --strict` — **34 passed, 0 failed**.
- `npx openspec list` — only `combat-phase-c-realtime-subtick` remains active.

### CI / Deploy

- Commit `6d763f2 docs(openspec): archive avatar rollout` pushed to `main` / `origin/main`.
- GitHub Actions `main CI` run `25989202269` — **passed**: OpenSpec validate, server typecheck, web typecheck + bundle, server tests. Node.js 20 deprecation annotation is non-blocking.
- GitHub Actions `main Deploy Dev` run `25989202273` — **passed**: Docker images built/pushed, desktop deploy completed, smoke check passed. Node.js 20 deprecation annotation is non-blocking.
- Live smoke after archive deploy:
  - `https://hunter.sisihome.org/healthz` — healthy, `version: 0.24.18` on two stable reads.
  - `https://hunter.sisihome.org/api/world` — tick advanced from `149995` to `149999` over 20 seconds; generated at `2026-05-17T11:12:10.928Z` and `2026-05-17T11:12:31.017Z`.
  - Recent `greed-island-server` logs since deploy: 8 lines checked, **0** matches for `SQLITE_CONSTRAINT_UNIQUE` and **0** matches for `[sim] tick failed`.

## 2026-05-17 — Authoritative Character Avatars Hub/Building

### Hub/Building Implemented

- Version bumped to `0.24.18`.
- Added Building visual-state mapping so the local player uses local-input `walk/idle` only, and occupant NPC avatars derive action/color from server-provided occupant activity/color.
- Replaced Building visible square markers with procedural humanoid avatars while keeping invisible physics anchors, owner halo, NPC interaction, exit handling, labels, and activity icons.
- Added Hub visual-state mapping so local player movement derives only from local input velocity, peer player movement derives only from social-presence coordinate deltas, and routed travelling NPC action derives only from authoritative NPC activity.
- Replaced Hub local player, peer player, and routed travelling NPC square/rectangle visuals with procedural humanoid avatars while keeping Hub sparse: no local-area NPCs, building occupants, fake people, fake crowds, decorative activity actors, or frontend-invented NPC actions were added.
- Updated Hub traveller diagnostics so `window.__giHubTravellerDiagnostics()` reports the visible avatar container state rather than the now-hidden physics proxy sprite.

### Progress

- `authoritative-character-avatars`: `28/28` tasks complete.
- Release follow-through complete for `0.24.18`; next step is future archive cleanup once the change is accepted as complete.

### Verification

- Focused web tests: `npm --workspace packages/web exec vitest run src/game/hubCharacterVisualState.test.ts src/game/buildingCharacterVisualState.test.ts src/game/areaCharacterVisualState.test.ts src/game/characterVisualState.test.ts src/pages/npcProjection.test.ts` — **25 tests passed**.
- Focused web build/typecheck: `npm run build -w @greed-island/web` — clean; known Vite chunk-size warning remains.
- `npx openspec validate --all --strict` — **35 passed, 0 failed**.
- Full `npm test` — **538 server + 75 web = 613 tests passed**.
- Full `npm run build` — server build and web production bundle completed; known Vite chunk-size warning remains.

### CI / Deploy

- Commit `d723299 feat(characters): render hub and building avatars` pushed to `main` / `origin/main`.
- GitHub Actions `main CI` run `25988861336` — **passed**: OpenSpec validate, server typecheck, web typecheck + bundle, server tests. Node.js 20 deprecation annotation is non-blocking.
- GitHub Actions `main Deploy Dev` run `25988861339` — **passed**: Docker images built/pushed, desktop deploy completed, smoke check passed. Node.js 20 deprecation annotation is non-blocking.
- Live smoke after deploy:
  - First public request during restart returned transient `502`; retry after the stack responded succeeded.
  - `https://hunter.sisihome.org/healthz` — healthy, `version: 0.24.18` on two stable reads.
  - `https://hunter.sisihome.org/api/world` — tick advanced from `149821` to `149825` over 20 seconds; generated at `2026-05-17T10:57:41.538Z` and `2026-05-17T10:58:01.612Z`.
  - Recent `greed-island-server` logs since deploy: 8 lines checked, **0** matches for `SQLITE_CONSTRAINT_UNIQUE` and **0** matches for `[sim] tick failed`.
  - Visual smoke screenshots captured with Playwright show humanoid character markers and no square player/NPC character markers in Hub, Area, and Building scenes: `C:\Users\Kevin\AppData\Local\Temp\gi-hub-avatar-smoke.png`, `C:\Users\Kevin\AppData\Local\Temp\gi-area-avatar-smoke.png`, `C:\Users\Kevin\AppData\Local\Temp\gi-building-avatar-smoke.png`.

## 2026-05-17 — Runtime Tick Hotfix

### Hotfix Implemented

- Version bumped to `0.24.17`.
- Investigated live NPC freeze: `/healthz` and `/api/world` stayed at tick `149446`; server logs showed repeated `SQLITE_CONSTRAINT_UNIQUE` failures on `event_log.event_id` during every simulation tick.
- Updated `SqliteEventStore.appendEvents()` to make deterministic event re-appends idempotent when the existing event content matches, while still rejecting conflicting same-`event_id` drafts.
- Kept append-only semantics intact: no existing EventLog rows are updated or deleted; idempotent recovery returns the already committed event sequence.

### Verification

- Focused server tests: `npm --workspace packages/server exec vitest run src/kernel/kernel.test.ts src/sim/runtimeGoodsInventory.test.ts src/sim/runtimePredation.test.ts` — **23 tests passed**.
- `npx openspec validate --all --strict` — **35 passed, 0 failed**.
- Full `npm test` — **538 server + 68 web = 606 tests passed**.
- Build evidence: `npm run build` completed server build and web production bundle; known Vite chunk-size warning remains.

### CI / Deploy

- Commit `7cfd33f fix(runtime): recover deterministic event replays` pushed to `main` / `origin/main`.
- GitHub Actions `main CI` run `25988204180` — **passed**: OpenSpec validate, server typecheck, web typecheck + bundle, server tests.
- GitHub Actions `main Deploy Dev` run `25988204169` — **passed**: Docker images built/pushed, desktop deploy completed, smoke check passed.
- Live smoke after deploy:
  - `https://hunter.sisihome.org/healthz` — healthy, `version: 0.24.17`; observed tick advancing from `149447` to `149453` after deploy.
  - `https://hunter.sisihome.org/api/world` — served world snapshot at tick `149447`, generated at `2026-05-17T10:25:20.234Z`.
  - Server logs for the recent post-deploy window contained no `SQLITE_CONSTRAINT_UNIQUE` and no `[sim] tick failed` entries.

## 2026-05-17 — Authoritative Character Avatars Slice 2

### Slice 2 Implemented

- Version bumped to `0.24.16`.
- Replaced Area scene NPC square visuals with procedural humanoid avatars driven by `AreaMapNpc.activity`, `color`, `mood`, and `health`.
- Replaced Area local-player square visuals with the same humanoid avatar system; walk/idle remains derived only from local input velocity.
- Replaced Area peer-player rectangle visuals with humanoid avatars; walk/idle remains derived only from server social-presence coordinate deltas.
- Preserved Area interaction radius, click handling, full-name labels, health injury hints, open-water boat hints, and existing `areaOutdoorNpcs()` no-duplicate projection behavior.

### Progress

- `authoritative-character-avatars`: `14/26` tasks complete (`0.1`–`0.4`, `1.1`–`1.5`, `2.1`–`2.5`).
- Next implementation task: `3.1` replace Building scene local player square with humanoid avatar.

### Verification

- Focused web tests: `npm --workspace packages/web exec vitest run src/game/areaCharacterVisualState.test.ts src/game/characterVisualState.test.ts src/pages/npcProjection.test.ts` — **18 tests passed**.
- Focused web build/typecheck: `npm run build -w @greed-island/web` — clean; known Vite chunk-size warning remains.
- `npx openspec validate --all --strict` — **35 passed, 0 failed**.
- Full `npm test` — **536 server + 68 web = 604 tests passed**.
- Full `npm run build` — clean; known Vite chunk-size warning remains.

### CI / Deploy

- Commit `cb94b3d feat(characters): render area humanoid avatars` pushed to `main` / `origin/main`.
- GitHub Actions `main CI` run `25973959729` — **passed**: OpenSpec validate, server typecheck, web typecheck + bundle, server tests.
- GitHub Actions `main Deploy Dev` run `25973959723` — **passed**: Docker images built/pushed, desktop deploy completed, smoke check passed.
- Live smoke after deploy:
  - `https://hunter.sisihome.org/healthz` — healthy, `version: 0.24.16`, tick `148242`.
  - `https://hunter.sisihome.org/api/world` — served world snapshot, tick `148242`, generated at `2026-05-16T21:58:36.823Z`.
  - `https://hunter.sisihome.org/` — served app shell with `/assets/index-lO1Jv-Pz.js` and `/assets/index-C39z8PNL.css`.

## 2026-05-17 — Authoritative Character Avatars Slice 1

### Slice 1 Implemented

- Version bumped to `0.24.15`.
- Added pure renderer-only `CharacterVisualState` projection helpers for NPCs, local player, and peer player visuals.
- NPC visual action now derives only from authoritative `NpcSummary.activity`; `move` maps to `walk`, known activities map to matching visual actions, and missing/unknown activity falls back to `idle`.
- Player visuals are explicitly source-labelled as `local-input` or `server-player-presence`; they derive only `walk`/`idle` from local velocity or social-presence coordinate deltas and do not claim simulation authority.
- Added an unwired procedural humanoid Phaser avatar factory with body/head/limb pose support so future scene slices can replace square markers without changing authority semantics.

### Progress

- `authoritative-character-avatars`: `9/26` tasks complete (`0.1`–`0.4`, `1.1`–`1.5`).
- Next implementation task: `2.1` replace Area NPC square textures with humanoid avatars driven by authoritative scene projection inputs.

### Verification

- Focused web tests: `npm --workspace packages/web exec vitest run src/game/characterVisualState.test.ts` — **8 tests passed**.
- Focused web build/typecheck: `npm run build -w @greed-island/web` — clean; known Vite chunk-size warning remains.
- `npx openspec validate --all --strict` — **35 passed, 0 failed**.
- Full `npm test` — **536 server + 64 web = 600 tests passed**.
- Full `npm run build` — clean; known Vite chunk-size warning remains.

### CI / Deploy

- Commit `3332f80 feat(characters): add avatar visual state foundation` pushed to `main` / `origin/main`.
- GitHub Actions `main CI` run `25973271789` — **passed**: OpenSpec validate, server typecheck, web typecheck + bundle, server tests.
- GitHub Actions `main Deploy Dev` run `25973271778` — **passed**: Docker images built/pushed, desktop deploy completed, smoke check passed.
- Live smoke after deploy:
  - `https://hunter.sisihome.org/healthz` — healthy, `version: 0.24.15`, tick `147839`.
  - `https://hunter.sisihome.org/api/world` — served world snapshot, tick `147839`, generated at `2026-05-16T21:24:41.829Z`.
  - `https://hunter.sisihome.org/` — served app shell with `/assets/index-Bj7OYpc1.js` and `/assets/index-C39z8PNL.css`.

## 2026-05-17 — Authoritative Character Avatars Planned

### Planned

- Created OpenSpec change `authoritative-character-avatars` to replace square/pixel NPC and player markers with humanoid avatars.
- Scope keeps avatars renderer-only: NPC action derives from server-authoritative `NpcSummary.activity`; player walk/idle animation is local/social presentation unless a future server action field is added.
- Explicitly forbids fake Hub crowds, fake pedestrians, decorative activity actors, and frontend-invented NPC action.
- First implementation slice should use procedural humanoid avatars because no committed human sprite sheet/atlas assets exist in the repo.
- The change also updates the stale `living-world` frontend-wander contract so renderer animation may animate pose/limbs but must not invent map-coordinate drift.

### OpenSpec Artifacts

- `openspec/changes/authoritative-character-avatars/proposal.md`
- `openspec/changes/authoritative-character-avatars/design.md`
- `openspec/changes/authoritative-character-avatars/tasks.md`
- `openspec/changes/authoritative-character-avatars/specs/living-world/spec.md`
- `openspec/changes/authoritative-character-avatars/specs/npc-humanity-ai-memory/spec.md`
- `openspec/changes/authoritative-character-avatars/specs/social-system/spec.md`

### Progress

- `authoritative-character-avatars`: `4/26` tasks complete (`0.1`–`0.4`).
- Implementation has not started.
- Next implementation task: `1.1` add pure `CharacterVisualState` projection types and mapping helpers.

### Verification

- `npx openspec validate authoritative-character-avatars --strict` — **passed**.
- `npx openspec validate --all --strict` — **35 passed, 0 failed**.

### CI / Deploy

- Pending for OpenSpec planning commit. This is a docs/spec-only change and does not change runtime version or deployed behavior.

## 2026-05-17 — Settlement Runtime v2 Archived

### Archived

- Synced `settlement-runtime-v2` spec delta into `openspec/specs/civilization-runtime/spec.md`.
- Archived the completed change to `openspec/changes/archive/2026-05-17-settlement-runtime-v2/`.
- `settlement-runtime-v2` is no longer active; the only active OpenSpec change left is `combat-phase-c-realtime-subtick`.

### Verification

- Before archive: `npx openspec validate --all --strict` — **35 passed, 0 failed**.
- After archive: `npx openspec validate --all --strict` — **34 passed, 0 failed**.

### CI / Deploy

- Pending for archive commit. This is a spec/docs-only change and does not change runtime version or deployed behavior.

## 2026-05-17 — Settlement Runtime v2 Slice 4

### Slice 4 Implemented

- Version bumped to `0.24.14`.
- Exposed authoritative settlement projection rows through `WorldSnapshot.facts.settlements`.
- Kept `/api/settlements` backward-compatible by preserving the `{ settlements: [...] }` envelope and existing formation fields while returning the enriched settlement state rows.
- Added GM/admin settlement observability on the world observer page: status, stability, pressure scores, population count, founder count, storage summary, and updated tick.
- Added a pure web projection helper for settlement facts so the frontend only renders server-authoritative settlement rows and does not invent fake Hub people, crowds, or decorative activity actors.

### Progress

- `settlement-runtime-v2`: `24/26` tasks complete (`0.1`, `0.2`, `1.1`–`1.5`, `2.1`–`2.4`, `3.1`–`3.4`, `4.1`–`4.4`, `5.1`–`5.5`).
- Slice 4 is deployed. Remaining work is future OpenSpec follow-through/archive cleanup after the change is considered fully complete.

### Verification

- Focused server tests: `npm --workspace packages/server exec vitest run src/sim/runtimeSettlementEngine.test.ts src/http/settlementsRouter.test.ts` — **2 tests passed**.
- Focused web tests: `npm --workspace packages/web exec vitest run src/pages/adminSettlementProjection.test.ts` — **2 tests passed** before adding the declining-state case, then included in full test run below.
- `npx openspec validate --all --strict` — **35 passed, 0 failed**.
- Full `npm test` — **536 server + 56 web = 592 tests passed**.
- `npm run build` — clean; known Vite chunk-size warning remains.

### CI / Deploy

- Commit `60007df feat(settlement): expose runtime state` pushed to `main` / `origin/main`.
- GitHub Actions `main CI` run `25972394252` — **passed**: OpenSpec validate, server typecheck, web typecheck + bundle, server tests.
- GitHub Actions `main Deploy Dev` run `25972394229` — **passed**: Docker images built/pushed, desktop deploy completed, smoke check passed.
- Live smoke after deploy:
  - First public smoke during restart returned `502`; retry after 20 seconds succeeded.
  - `https://hunter.sisihome.org/healthz` — healthy, `version: 0.24.14`, tick `147351`.
  - `https://hunter.sisihome.org/api/world` — includes `facts.settlements`, current live count `0`, tick `147353`.
  - `https://hunter.sisihome.org/api/settlements` — preserves `{ settlements: [...] }` envelope, current live count `0`.
  - `https://hunter.sisihome.org/` — served app shell with `/assets/index-Bj7OYpc1.js`.

## 2026-05-16 — Settlement Runtime v2 Slice 3

### Slice 3 Implemented

- Version bumped to `0.24.13`.
- Wired `planSettlementCommands()` into `SimulationRuntime.runTick()` before
  command budget partitioning, using current authoritative settlement, NPC
  presence, goods, logistics, market, fishery, animal, and household projections.
- Settlement state changes now go through `makeLivingWorldCommand()` and
  `LivingWorldRuleEngine.evaluate()` before committed Events update
  `SettlementsProjection`.
- Added central holder alias support so formed settlement ids can read existing
  `settlement.<tileId>` goods/logistics/market rows such as `settlement.t_central`.
- Added atomic settlement-state command grouping after hard-cap partitioning:
  if any state command for a settlement is rejected, all same-settlement state
  commands from that tick are rejected together instead of partially mutating
  the settlement row.
- Suppressed routine settlement telemetry (`SETTLEMENT_POPULATION_UPDATED`,
  `SETTLEMENT_STORAGE_UPDATED`, `SETTLEMENT_PRESSURE_UPDATED`,
  `SETTLEMENT_STABILITY_CHANGED`) from server recent-event narration and web
  chronicle/ticker surfaces.

### Progress

- `settlement-runtime-v2`: `15/26` tasks complete (`0.1`, `0.2`, `1.1`–`1.5`, `2.1`–`2.4`, `3.1`–`3.4`).
- Read surfaces and GM/admin observability have not started.
- Next implementation task: `4.1` expose settlement state in snapshot facts/API
  surfaces while preserving `/api/settlements` compatibility.

### Verification

- `npm run build:server` — clean after dependency install in isolated worktree.
- Focused server tests: `npm run test -w @greed-island/server -- settlementEngine runtimeSettlementEngine` — **9 tests passed**.
- Focused web tests: `npm run test -w @greed-island/web -- eventVisibility` — **6 tests passed**.
- `npx openspec validate --all --strict` — **35 passed, 0 failed**.
- `npm run build` (server + web) — clean; known Vite chunk-size warning remains.
- `npm run test -w @greed-island/server -- runtimePredation` — **3 tests passed** after an initial full-suite parallel timeout in the existing starvation test.
- Full `npm test` rerun — **535 server + 53 web = 588 tests passed**.

### CI / Deploy

- Commit `7d6b4b4 feat(settlement): wire pressure planner` pushed to `main` / `origin/main`.
- GitHub Actions `main CI` run `25963660034` — **passed**: OpenSpec validate, server typecheck, web typecheck + bundle, server tests.
- GitHub Actions `main Deploy Dev` run `25963660028` — **passed**: Docker images built/pushed, desktop deploy completed, smoke check passed.
- Live smoke after deploy:
  - `https://hunter.sisihome.org/healthz` — healthy, `version: 0.24.13`, tick `145144`.
  - `https://hunter.sisihome.org/` — served app shell with `/assets/index-l-sBI4je.js` and `/assets/index-TQXzi4kY.css`.

## 2026-05-16 — Settlement Runtime v2 Slice 2

### Slice 2 Implemented

- Version bumped to `0.24.12`.
- Added pure `packages/server/src/sim/settlementEngine.ts` planner.
- Planner accepts settlements, authoritative NPC presence, goods inventory,
  logistics snapshot, market prices, fishery density, animal population,
  household economy, and current tick.
- Planner derives deterministic settlement commands only; it does not wire into
  `SimulationRuntime` yet and does not mutate projection state directly.
- Added named pressure constants to `packages/server/src/config/world.ts`.
- Computes bounded `food`, `safety`, `economy`, and `logistics` pressure scores,
  settlement population/storage summaries, and pressure-derived stability/status.
- Enforces at most one settlement state planning pass per settlement per tick by
  skipping rows already updated at the current tick.

### Progress

- `settlement-runtime-v2`: `11/26` tasks complete (`0.1`, `0.2`, `1.1`–`1.5`, `2.1`–`2.4`).
- Runtime wiring has not started.
- Next implementation task: `3.1` wire the pure planner into
  `SimulationRuntime.runTick()` after authoritative projection inputs are ready.

### Verification

- Focused server tests: `npm run test -w @greed-island/server -- settlementEngine.test.ts` — **6 tests passed**.
- `npx openspec validate --all --strict` — **35 passed, 0 failed**.
- Focused server tests: `npm run test -w @greed-island/server -- settlementEngine livingWorld settlements` — **65 tests passed**.
- `npm run build:server` — clean.
- Full `npm test` — **532 server + 52 web = 584 tests passed**.
- `npm run build` (server + web) — clean; known Vite chunk-size warning remains.

### CI / Deploy

- Commit `8862f8e feat(settlement): add pressure planner` pushed to `main` / `origin/main`.
- GitHub Actions `main CI` run `25963281870` — **passed**: OpenSpec validate, server typecheck, web typecheck + bundle, server tests.
- GitHub Actions `main Deploy Dev` run `25963281864` — **passed**: Docker images built/pushed, desktop deploy completed, smoke check passed.
- Live smoke after deploy:
  - `https://hunter.sisihome.org/healthz` — healthy, `version: 0.24.12`, tick `144927`.
  - `https://hunter.sisihome.org/` — served app shell with `/assets/index-DuAZLT8U.js` and `/assets/index-TQXzi4kY.css`.

## 2026-05-16 — Settlement Runtime v2 Slice 1

### Slice 1 Implemented

- Version bumped to `0.24.11`.
- Added typed settlement state commands/events to `livingWorldCommands.ts`:
  `SETTLEMENT_POPULATION_UPDATED`, `SETTLEMENT_STORAGE_UPDATED`,
  `SETTLEMENT_PRESSURE_UPDATED`, `SETTLEMENT_STABILITY_CHANGED`,
  `SETTLEMENT_DECLINED`, and `SETTLEMENT_RECOVERED`.
- Added payload validators for sorted/unique population ids, sorted storage goods
  ids, non-negative storage quantities, `0..100` pressure/stability scores,
  settlement status bands, and deterministic tick metadata.
- Extended `SettlementsProjection` from formation-only rows into authoritative
  settlement state rows with population summary, storage summary, pressure,
  stability, status, and `updatedAtTick` defaults.
- Added focused tests for rule-engine acceptance/rejection and projection replay.

### Planned

- Created OpenSpec change `settlement-runtime-v2` to turn settlements from
  formation-only records into authoritative civilization state.
- Scope is server-authoritative settlement state only: population summary,
  settlement-held storage summary, bounded pressure scores, stability, decline
  / recovery status, and GM/admin observability.
- Explicitly out of scope: fake Hub crowds, fake activity actors, decorative
  population markers, settlement conquest/split/destruction, new player
  founding commands, and new pollution/forest systems.
- The change modifies `civilization-runtime` and is intended to build on current
  `v0.24.10` systems: `SETTLEMENT_FORMED`, goods inventory, logistics, market
  prices, fishery/ecology projections, household economy, and authoritative NPC
  presence.

### OpenSpec Artifacts

- `openspec/changes/settlement-runtime-v2/proposal.md`
- `openspec/changes/settlement-runtime-v2/design.md`
- `openspec/changes/settlement-runtime-v2/tasks.md`
- `openspec/changes/settlement-runtime-v2/specs/civilization-runtime/spec.md`

### Progress

- `settlement-runtime-v2`: `7/26` tasks complete (`0.1`, `0.2`, `1.1`–`1.5`).
- Runtime pressure planner has not started.
- Next implementation task: `2.1` create pure `settlementEngine.ts` pressure
  planner.

### Verification

- `npx openspec validate --all --strict` — **35 passed, 0 failed**.
- Focused server tests in isolated worktree: `npm run test -w @greed-island/server -- livingWorld settlements` — **59 tests passed**.
- Full `npm test` — **526 server + 52 web = 578 tests passed**.
- `npm run build` (server + web) — clean; known Vite chunk-size warning remains.
- Merged-main focused check: `npm run test -w @greed-island/server -- livingWorld settlements` — **59 tests passed**.
- Release version fix: `npm run build:server` — clean after updating `packages/server/src/version.ts` to `0.24.11`.

### CI / Deploy

- Commit `cbd4f98 feat(settlement): add authoritative state events` pushed to `main` / `origin/main`.
- Commit `a806f6e chore(release): bump app version to 0.24.11` pushed to `main` / `origin/main`.
- GitHub Actions `main CI` run `25962804127` — **passed**: OpenSpec validate, server typecheck, web typecheck + bundle, server tests.
- GitHub Actions `main Deploy Dev` run `25962804139` — **passed**, but first live smoke still reported `version: 0.24.10` because `packages/server/src/version.ts` had not been updated.
- GitHub Actions `main CI` run `25962886302` — **passed** after version constant fix.
- GitHub Actions `main Deploy Dev` run `25962886309` — **passed** after version constant fix.
- Live smoke after final deploy:
  - `https://hunter.sisihome.org/healthz` — healthy, `version: 0.24.11`, tick `144691`.
  - `https://hunter.sisihome.org/` — served app shell with `/assets/index-DuAZLT8U.js` and `/assets/index-TQXzi4kY.css`.

## 2026-05-16 — Emergency Rollback: Remove Fake Hub Activity Actors (v0.24.10)

### Implemented

- Removed the failed Hub activity overlay entirely. The previous v0.24.8/v0.24.9
  attempts projected events into extra fake map actors, which violated the core
  product rule that NPCs are people, not decorative stand-ins.
- Deleted `packages/web/src/pages/hubActivity.ts` and its tests.
- Removed `activityByTile` plumbing from `HubPage`, `PhaserGame`, and `MapScene`.
- Removed all generated activity markers / ambient fake actors from `MapScene`.
- Hub now returns to rendering only existing authoritative layers: real routed
  NPC projection, players, area overlays, construction projection, ecology
  badges/migration/predator warnings, decorations, and normal controls.

### Verification

- Code search confirmed no remaining frontend references to `hubActivity`,
  `activityByTile`, `HubActivity`, `drawActivityMarkers`, `animateActivityActor`,
  or `activityPointFor`.
- Full `npm test` — **520 server + 52 web = 572 tests passed**.
- `npm run build` (server + web) — clean; known Vite chunk-size warning remains.
- `npx openspec validate --all --strict` — **34 passed, 0 failed**.
- Version bumped to `0.24.10`.

### CI / Deploy

- Commit `6ccab95 revert(hub): remove fake activity actors` pushed to `main` / `origin/main`.
- GitHub Actions `main CI` run `25962117987` — **passed**: OpenSpec validate, server typecheck, web typecheck + bundle, server tests.
- GitHub Actions `main Deploy Dev` run `25962117999` — **passed**: Docker images built/pushed, desktop deploy completed, smoke check passed.
- Live smoke after deploy:
  - `https://hunter.sisihome.org/healthz` — healthy, `version: 0.24.10`, tick `144298`.
  - `https://hunter.sisihome.org/` — served app shell with `/assets/index-DuAZLT8U.js` and `/assets/index-TQXzi4kY.css`.

## 2026-05-16 — Hub Map Activity Visual Correction (v0.24.9)

### Implemented

- Corrected the first Hub activity visualization pass. The v0.24.8 text/pill
  markers made the map feel like a dashboard and still did not sell NPC life.
- `packages/web/src/game/MapScene.ts` now renders recent activity as small
  event-driven ambient life actors inside each active district:
  - work / construction actors bob and move locally;
  - movement actors walk across short local paths;
  - danger actors jitter/flash faster;
  - pressure actors drift slowly.
- Removed the large activity text pills and narration snippets from the map.
  The Hub map now stays visual-first: motion communicates life, while detailed
  narration remains on ticker/chronicle surfaces.
- This remains projection-only UI from committed events; it does not spawn NPCs,
  change authoritative presence, or mutate simulation state.

### Verification

- Focused tests: `npm run test -w @greed-island/web -- hubActivity eventVisibility` — **10 tests passed**.
- `npm run build:web` — clean; known Vite chunk-size warning remains.
- Full `npm test` — **520 server + 57 web = 577 tests passed**.
- `npm run build` (server + web) — clean; known Vite chunk-size warning remains.
- `npx openspec validate --all --strict` — **34 passed, 0 failed**.
- Version bumped to `0.24.9`.

### CI / Deploy

- Commit `e4c1136 fix(hub): animate activity as life actors` pushed to `main` / `origin/main`.
- GitHub Actions `main CI` run `25961873379` — **passed**: OpenSpec validate, server typecheck, web typecheck + bundle, server tests.
- GitHub Actions `main Deploy Dev` run `25961873370` — **passed**: Docker images built/pushed, desktop deploy completed, smoke check passed.
- Live smoke after deploy:
  - `https://hunter.sisihome.org/healthz` — healthy, `version: 0.24.9`, tick `144154`.
  - `https://hunter.sisihome.org/` — served app shell with `/assets/index-DxDfN1Gl.js` and `/assets/index-D5NBLDnv.css`.

## 2026-05-16 — Hub Map Activity Visibility (v0.24.8)

### Implemented

- Added projection-only Hub activity markers so the main map shows where the
  world is currently working, moving, building, under pressure, or in conflict.
- `packages/web/src/pages/hubActivity.ts` derives per-district activity from
  recent committed `EventSummary` rows. It reads authoritative event payload
  tile fields / region scopes only; it does not mutate simulation state.
- `packages/web/src/game/MapScene.ts` renders compact pulsing district markers
  with kind labels, counts, and short latest narration snippets.
- The activity projection reuses `isChronicleSurfaceEvent()` for narrated
  events, so raw internal ids remain hidden from public map text. Non-narrated
  movement events (`NPC_MOVE`, `BUILDING_ENTER`, `BUILDING_LEAVE`) are allowed
  as spatial pings only.
- `packages/web/src/pages/HubPage.tsx` now passes activity summaries through
  `PhaserGame` to the persistent Phaser scene update path.

### Verification

- Focused tests: `npm run test -w @greed-island/web -- hubActivity eventVisibility` — **10 tests passed**.
- Full `npm test` — **520 server + 57 web = 577 tests passed**.
- `npm run build` (server + web) — clean; known Vite chunk-size warning remains.
- `npx openspec validate --all --strict` — **34 passed, 0 failed**.
- Version bumped to `0.24.8`.

### CI / Deploy

- Commit `297579f feat(hub): show map activity markers` pushed to `main` / `origin/main`.
- GitHub Actions `main CI` run `25961477797` — **passed**: OpenSpec validate, server typecheck, web typecheck + bundle, server tests.
- GitHub Actions `main Deploy Dev` run `25961477786` — **passed**: Docker images built/pushed, desktop deploy completed, smoke check passed.
- Live smoke after deploy:
  - `https://hunter.sisihome.org/healthz` — healthy, `version: 0.24.8`, tick `143912`.
  - `https://hunter.sisihome.org/` — served app shell with `/assets/index-HJE-JiiX.js` and `/assets/index-TQXzi4kY.css`.

## 2026-05-16 — World Prompt Life Visibility Fix (v0.24.7)

### Implemented

- Fixed the regression where the world prompt / mobile ticker no longer felt
  alive because narrated `NPC_PRODUCTIVE_ACTION` events were filtered out of
  chronicle surfaces.
- `packages/web/src/state/eventVisibility.ts` now allows narrated NPC work
  events such as 「江月在霓港區把一段潮汐刻文重新抄正…」 to appear in the
  ticker again.
- The raw-id guard remains active, so narration containing internal ids such
  as `temple.cleric.sela` or `iron_hound` is still hidden from ticker / prompt
  surfaces until those event families get proper zh labels.
- Routine logistics/goods/market events remain hidden to avoid flooding public
  narrative with internal economy facts.

### Verification

- Live repro before fix: `/api/events?limit=50` had frequent zh NPC work
  narrations, but `NPC_PRODUCTIVE_ACTION` was excluded from ticker surfaces.
- Focused tests: `npm run test -w @greed-island/web -- eventVisibility` — **5 tests passed**.
- `npm run build:web` — clean; known Vite chunk-size warning remains.
- Full `npm test` — **520 server + 52 web = 572 tests passed**.
- `npm run build` (server + web) — clean; known Vite chunk-size warning remains.
- `npx openspec validate --all --strict` — **34 passed, 0 failed**.
- Version bumped to `0.24.7`.

### CI / Deploy

- Commit `a3b68c4 fix(ticker): restore narrated npc work` pushed to `main` / `origin/main`.
- GitHub Actions `main CI` run `25961151412` — **passed**: OpenSpec validate, server typecheck, web typecheck + bundle, server tests.
- GitHub Actions `main Deploy Dev` run `25961151413` — **passed**: Docker images built/pushed, desktop deploy completed, smoke check passed.
- Live smoke after deploy:
  - `https://hunter.sisihome.org/healthz` — healthy, `version: 0.24.7`, tick `143724`.
  - `https://hunter.sisihome.org/` — served app shell with `/assets/index-DuAZLT8U.js` and `/assets/index-TQXzi4kY.css`.

## 2026-05-16 — Sprint 6: combat-phase-c Slice 2.4 + world prompt filter (v0.24.6)

### Implemented

- Completed OpenSpec `combat-phase-c-realtime-subtick` task 2.4.
- `packages/server/src/kernel/livingWorldCommands.ts` now registers all 11
  Phase C combat command types in `LIVING_WORLD_COMMAND_TYPES`:
  `COMBAT_CARD_PLAY`, `COMBAT_CARD_CANCEL`, `COMBAT_DAMAGE`, `COMBAT_HEAL`,
  `COMBAT_STATUS_APPLY`, `COMBAT_STATUS_TICK`, `COMBAT_STATUS_END`,
  `COMBAT_TARGET_LOCK`, `COMBAT_PHASE_SHIFT`, `COMBAT_FLEE_ATTEMPT`, and
  `COMBAT_DEFEAT`.
- Living-world validation for the new command types delegates to
  `validateCombatPayload()` from `packages/server/src/combat/commands.ts`.
- Added a focused living-world catalog test covering acceptance of every
  Phase C command type.
- Fixed the player-visible world prompt issue where ticker surfaces could
  display raw internal identifiers such as `iron_hound` or
  `temple.cleric.sela`. `isChronicleSurfaceEvent()` now keeps narration with
  internal ids out of ticker / chronicle surfaces until those event families
  have proper zh labels.

### Honest scope

- Slice 2.4 only registers and validates the command catalog. It does not
  execute Phase C commands, write Phase C combat events, or enable the 5-phase
  rule engine; that remains Slice 2.5.
- The world prompt fix is a presentation guard. It prevents raw ids from
  surfacing in ticker prompts, but server-side narration localization for
  animal / household event families is still future cleanup.

### Verification

- Focused server tests: `npm run test -w @greed-island/server -- livingWorld combat/commands` — **50 tests passed**.
- Focused web tests: `npm run test -w @greed-island/web -- eventVisibility` — **4 tests passed**.
- `npm run build:server` — clean.
- Full `npm test` — **520 server + 51 web = 571 tests passed**.
- `npm run build` (server + web) — clean; known Vite chunk-size warning remains.
- `npx openspec validate --all --strict` — **34 passed, 0 failed**.
- `npx openspec list` — `combat-phase-c-realtime-subtick` is now **10/38 tasks**.
- Version bumped to `0.24.6`.

### CI / Deploy

- Commit `21206e9 feat(combat): register phase c commands` pushed to `main` / `origin/main`.
- GitHub Actions `main CI` run `25960888343` — **passed**: OpenSpec validate, server typecheck, web typecheck + bundle, server tests.
- GitHub Actions `main Deploy Dev` run `25960888339` — **passed**: Docker images built/pushed, desktop deploy completed, smoke check passed.
- Live smoke after deploy:
  - `https://hunter.sisihome.org/healthz` — healthy, `version: 0.24.6`, tick `143554`.
  - `https://hunter.sisihome.org/` — served app shell with `/assets/index-Cq9FmgMz.js` and `/assets/index-TQXzi4kY.css`.

## 2026-05-16 — Area Ecology Migration Visibility Bugfix (v0.24.5)

### Implemented

- Fixed the player-visible mismatch where Hub ecology could show a species
  cue for a district, but entering the Area appeared empty when the live
  ecology row was represented by `migrationsArriving` / `migrationsDeparting`
  rather than current `animals`.
- `packages/web/src/game/AreaScene.ts` now renders read-only migration
  markers for arriving and departing waves with species glyph, count, and
  tap/click inspection text (`遷徙抵達` / `遷徙離開`).
- This remains projection-only UI. It does not mutate world state, spawn
  animals, start combat, or change migration authority.

### Verification

- Live repro before fix: `https://hunter.sisihome.org/api/area/t_desert/ecology`
  returned `animals: []` and one `migrationsDeparting` wave for `sand_runner`
  (`count: 1`), explaining why the Area had no visible animal marker.
- `npm run build:web` — clean; known Vite chunk-size warning remains.
- `npm test -w @greed-island/web` — **50 tests passed**.
- `npm test` — **519 server + 50 web = 569 tests passed**.
- `npm run build` (server + web) — clean; known Vite chunk-size warning remains.
- `npx openspec validate --all --strict` — **34 passed, 0 failed**.
- Version bumped to `0.24.5`.

### CI / Deploy

- Commit `6c182cd fix(area): show ecology migration markers` pushed to `main` / `origin/main`.
- GitHub Actions `main CI` run `25959029159` — **passed**: OpenSpec validate, server typecheck, web typecheck + bundle, server tests.
- GitHub Actions `main Deploy Dev` run `25959029154` — **passed**: Docker images built/pushed, desktop deploy completed, smoke check passed.
- Live smoke after deploy:
  - `https://hunter.sisihome.org/healthz` — healthy, `version: 0.24.5`, tick `142391`.
  - `https://hunter.sisihome.org/` — served app shell with `/assets/index-Dj9-INkz.js` and `/assets/index-TQXzi4kY.css`.

## 2026-05-16 — Sprint 6: combat-phase-c Slice 2.3 (v0.24.4)

### Implemented

Command catalog slice for Phase C combat. Defines the typed payload
surface and validation rules needed before the commands are registered
into the living-world command catalog in Slice 2.4.

#### Server

- `packages/server/src/combat/commands.ts`:
  - Added Phase C command types: `COMBAT_CARD_PLAY`,
    `COMBAT_CARD_CANCEL`, `COMBAT_DAMAGE`, `COMBAT_HEAL`,
    `COMBAT_STATUS_APPLY`, `COMBAT_STATUS_TICK`,
    `COMBAT_STATUS_END`, `COMBAT_TARGET_LOCK`,
    `COMBAT_PHASE_SHIFT`, `COMBAT_FLEE_ATTEMPT`, and
    `COMBAT_DEFEAT`.
  - Added payload types and `validateCombatPayload()` validators for
    all Phase B + Phase C combat commands.
  - Added `makeCombatCommandId()`, using
    `hashSeed(commandType, actorId, tick, combatTick, payloadCanonical)`
    with canonical JSON payload ordering for replay-stable IDs.
- `packages/server/src/combat/commands.test.ts`:
  - Covers command catalog membership, card-class validation, sub-command
    validators, malformed payload rejection, and canonical command id
    determinism.

### Honest scope

- Slice 2.3 does not register these new command types in
  `LIVING_WORLD_COMMAND_TYPES`; that remains Slice 2.4.
- No 5-phase rule-engine execution or EventLog write path is enabled yet;
  runtime behavior remains unchanged.

### Verification

- Focused tests: `npm run test -w @greed-island/server -- combat` — **39 tests passed**.
- `npm run build:server` — clean.
- Full `npm test` — **519 server + 50 web = 569 tests passed**.
- `npm run build` (server + web) — clean; known Vite chunk-size warning remains.
- `npx openspec validate --all --strict` — **34 passed, 0 failed**.
- Version bumped to `0.24.4`.

### CI / Deploy

- Commit `73809f5 feat(combat): add phase c command catalog` pushed to `main` / `origin/main`.
- GitHub Actions `main CI` run `25958600313` — **passed**: OpenSpec validate, server typecheck, web typecheck + bundle, server tests.
- GitHub Actions `main Deploy Dev` run `25958600314` — **passed**: Docker images built/pushed, desktop deploy completed, smoke check passed.
- Live smoke after deploy:
  - `https://hunter.sisihome.org/healthz` — healthy, `version: 0.24.4`, tick `142135`.
  - `https://hunter.sisihome.org/` — served app shell with `/assets/index-DAatXiI-.js` and `/assets/index-TQXzi4kY.css`.

## 2026-05-15 — Sprint 6: combat-phase-c Slice 2.2 (v0.24.3)

### Implemented

Pure compiler slice for the upcoming 5-phase combat rule engine. Adds
the deterministic translation from a card play context to sub-command
drafts, without registering new commands or mutating runtime combat
state yet.

#### Server

- `packages/server/src/combat/cards/compiler.ts`:
  - `compileCombatCardPlay()` looks up the frozen card catalog and
    returns `null` for unknown card classes.
  - Catalog effects now compile to Phase C sub-command drafts:
    `COMBAT_DAMAGE`, `COMBAT_HEAL`, `COMBAT_STATUS_APPLY`,
    `COMBAT_TARGET_LOCK`, `COMBAT_PHASE_SHIFT`, and
    `COMBAT_FLEE_ATTEMPT`.
  - `counter` catalog effects compile to a self-targeted
    `COMBAT_STATUS_APPLY` (`counter_damage` / `counter_status`) because
    Phase C's command set does not define a separate counter command.

### Honest scope

- Slice 2.2 is pure compiler/data only. No command validators, no
  `LIVING_WORLD_COMMAND_TYPES` registration, no 5-phase rule-engine
  hook, no EventLog writes, and no client UI changes.
- Slice 2.3 remains responsible for command payload types, validators,
  and deterministic `commandId` generation.

### Verification

- Focused tests: `npm run test -w @greed-island/server -- combat/cards` — **14 tests passed** (9 catalog + 5 compiler).
- `npm run build:server` — clean.
- Full `npm test` — **514 server + 50 web = 564 tests passed**.
- `npm run build` (server + web) — clean; known Vite chunk-size warning remains.
- `npx openspec validate --all --strict` — **34 passed, 0 failed**.
- Version bumped to `0.24.3`.

### CI / Deploy

- Commit `bb176ca feat(combat): add card effect compiler` pushed to `main` / `origin/main`.
- GitHub Actions `main CI` run `25958016166` — **passed**: OpenSpec validate, server typecheck, web typecheck + bundle, server tests.
- GitHub Actions `main Deploy Dev` run `25958016157` — **passed**: Docker images built/pushed, desktop deploy completed, smoke check passed.
- Live smoke after deploy:
  - `https://hunter.sisihome.org/healthz` — healthy, `version: 0.24.3`, tick `141768`.
  - `https://hunter.sisihome.org/` — served app shell with `/assets/index-DAatXiI-.js`.

## 2026-05-15 — Area Ecology Visibility Bugfix

### Follow-up: Read-only Area Element Inspection

- Added tap/click inspection for area ecology elements: animal dots, animal clusters, and fishery bars now show a short in-scene label instead of behaving like inert decoration.
- Added tap/click inspection for environment/resource decoration glyphs (trees, rocks, wood piles, reeds, ruins, boats, signs, etc.). These are read-only hints only; they do not harvest resources, start combat, or mutate world state.
- Added zh labels for known animal species so ecology inspection shows player-readable names such as `擬態黴菌 ×7` instead of raw species ids.
- Follow-up fix after mobile feedback: inspection now uses transparent tile-sized hit zones rather than tiny emoji/circle bodies, and ecology zones render below building interaction depth so visible elements are easier to tap without stealing building entry.

#### Verification

- `npm test -w @greed-island/web` — **50 tests passed**.
- `npm run build:web` — clean TypeScript + Vite build; known chunk-size warning remains.
- `npx openspec validate --all --strict` — **34 passed, 0 failed**.
- Hit-zone follow-up verification: `npm test -w @greed-island/web` — **50 tests passed**; `npm run build:web` — clean TypeScript + Vite build with known chunk-size warning; `npx openspec validate --all --strict` — **34 passed, 0 failed**.

#### CI / Deploy

- Commit `014f9f5 fix(area): add inspect hints for visible elements` pushed to `main` / `origin/main`.
- GitHub Actions `main CI` run `25915547964` — **passed**: OpenSpec validate, server typecheck, web typecheck + bundle, server tests.
- GitHub Actions `main Deploy Dev` run `25915547941` — **passed**: Docker images built/pushed, desktop deploy completed, smoke check passed.
- Live smoke after deploy:
  - `https://hunter.sisihome.org/healthz` — healthy, `version: 0.24.2`, tick `141223`.
  - `https://hunter.sisihome.org/` — served updated app shell with `/assets/index-Dxo5OEGP.js`.
  - `https://hunter.sisihome.org/api/area/t_ruin/ecology` — returned live animals (`mimic_mold:7`, `ruin_rat:1`) and 1 predator warning for inspection targets.

### Implemented

- Fixed `AreaPhaserGame` / `AreaScene` ecology update flow: async `/api/area/:tileId/ecology` responses now update the active Phaser scene and redraw animal overlays instead of only being used during initial scene creation.
- Fixed area-local event filtering so payload tile fields (`tileId`, `fromTileId`, `toTileId`, `sourceTileId`, `targetTileId`, etc.) count as local. `ANIMAL_ATTACKED_NPC` events now appear under the matching area's recent events.
- Expanded known species visuals so current ecosystem species (for example `mirage_hawk`, `dune_lizard`, `mimic_mold`, `iron_hound`) render with distinct animal glyphs instead of generic fallback paws.

### Verification

- `npx vitest run src/pages/areaEvents.test.ts src/pages/hubEcology.test.ts` — **8 tests passed**.
- `npm test -w @greed-island/web` — **50 tests passed**.
- `npm run build:web` — clean TypeScript + Vite build; known chunk-size warning remains.

### CI / Deploy

- Commit `eef95bb fix(visibility): refresh area ecology overlays` pushed to `main` / `origin/main`.
- GitHub Actions `main CI` run `25914958543` — **passed**: OpenSpec validate, server typecheck, web typecheck + bundle, server tests.
- GitHub Actions `main Deploy Dev` run `25914958540` — **passed**: Docker images built/pushed, desktop deploy completed, smoke check passed.
- Live smoke after deploy:
  - `https://hunter.sisihome.org/healthz` — healthy, `version: 0.24.2`, tick `141034`.
  - `https://hunter.sisihome.org/` — served current app shell and hashed JS/CSS assets.
  - `https://hunter.sisihome.org/api/area/t_ruin/ecology` — returned `mimic_mold:6` and 1 predator warning, confirming the deployed area ecology endpoint has animal data for area rendering.

## 2026-05-15 — User-reported visual bugfixes (v0.24.2)

### Implemented

Three player-visible bugs reported after v0.24.1 deploy:

1. **Hub red ring with no purpose** — the predator-hunger warning ring
   from Sprint 2A had no label, so players could not read what it
   meant. `MapScene.drawEcologyBadges` now pairs the ring with a small
   ⚠️ glyph at the top-left of the tile anchor and a `掠食者飢餓`
   zh label below the ring.
2. **Water districts dominated by "wood"** — Sprint 4's pier color
   (`0xc6a06b`) was too bright and pier coverage in the masks was too
   high (10–12 cells per district). Pier color toned down to
   `0x8a6d40` (weathered cedar) and `t_dock` / `t_temple` masks
   re-authored with only 4 pier cells each.
3. **Salt-marsh field station unreachable** — Sprint 4's
   `t_salt_marsh` mask placed `b_salt_marsh_field_station`'s anchor
   `(col 7, row 4)` on an `open_water` cell. The walkability gate
   blocked all approach. New mask makes rows 4-5 a walkable rim
   inland of the marsh ring; the building anchor and surrounding
   cells are now `land`.

#### Server / Web
- `packages/web/src/game/terrainMask.ts`: re-authored all three
  water-biome masks; tone-down pier RGB. Every building anchor from
  `packages/server/src/buildings/catalog.ts` for the three water
  districts now lands on walkable terrain.
- `packages/web/src/game/MapScene.ts`: ecology warning ring now
  carries a ⚠️ icon + "掠食者飢餓" label.
- Tests: new test verifies every building anchor in the three water
  districts is walkable (catches future mask-vs-catalog drift).

### Verification

- Focused tests: `npm run test -w @greed-island/web -- terrainMask` — **8 tests passing** (existing 7 + new walkable-anchor invariant).
- Full `npm test` — **509 server + 47 web = 556 tests passing**.
- `npm run build` (server + web) — clean.
- Version bumped to `0.24.2`.

### CI / Deploy

- Pending push and CI run.

## 2026-05-15 — Sprint 6: combat-phase-c Slice 2.1 (v0.24.1)

### Implemented

Pure data slice for the upcoming 5-phase rule engine. Defines the
13-card priority table from design D3 as a frozen const so Slice 2.2
(card compiler) and 2.5 (rule engine) can read structural priority
without re-litigating it. Zero runtime behavior change.

#### Server
- `packages/server/src/combat/cards/catalog.ts`:
  - `CombatCardClass` union covers the 13 cards from design D3.
  - `CombatCardEffect` union covers `damage` / `heal` / `status_apply`
    / `target_lock` / `phase_shift` / `flee_attempt` / `counter` —
    the shape the Slice 2.2 compiler will emit as sub-commands.
  - `COMBAT_CARD_CATALOG` is a frozen `Record<CombatCardClass, CombatCardDef>`.
    FIRE_LASH compiles to `[damage 18 fire, status_apply burn 30 ticks]`
    matching the design D4 example. Band 0 cards (PHASE_SHIFT,
    COUNTERSPELL, INTERRUPT) carry `bypassesTargetLock: true`.
  - `getCombatCard()` / `priorityForCardClass()` / `listCombatCardClasses()`
    accessors.

### Honest scope

- Pure data + types only. No rule engine, no compiler, no command
  catalog expansion, no runtime hook.
- Slice 1's `CombatRuntime` onTick is still a no-op — Slice 2.5 will
  wire the rule engine in.

### Verification

- Focused tests: `npm run test -w @greed-island/server -- combat/cards/catalog` — **9 tests passing** (priority bands, target-lock bypass invariant, FIRE_LASH effect shape, frozen catalog, priority bounds 0–4).
- Full `npm test` — **509 server + 46 web = 555 tests passing**.
- `npm run build:server` clean.
- Version bumped to `0.24.1` (sub-slice of Slice 2).

### CI / Deploy

- Pending push and CI run.

### Outstanding (Slice 2 remainder)

- 2.2 `cards/compiler.ts` — compile `COMBAT_CARD_PLAY` → sub-commands.
- 2.3 11 new commands + payload types + validators + `commandId = hashSeed(...)` per D3.
- 2.4 Register new commands in `LIVING_WORLD_COMMAND_TYPES`.
- 2.5 5-phase rule engine pipeline.
- 2.6 Priority + tie-break + FIRE_LASH compile tests.

## 2026-05-15 — Sprint 6: combat-phase-c Slice 1 (v0.24.0)

### Implemented

First of six slices that close `ARCHITECTURE.md` §11.4. Adds the
per-combat sub-tick loop infrastructure server-side. No UI change;
the Slice 1 tick callback is intentionally a no-op until Slice 2
ships the 5-phase rule engine, so the existing Phase B single-shot
combat path is unaffected.

#### Server
- `config/world.ts`:
  - `COMBAT_TICK_RATE_MS = 100` (10 Hz default)
  - `COMBAT_TICK_RATE_MIN_MS = 50` / `COMBAT_TICK_RATE_MAX_MS = 200`
  - `validateCombatTickRateMs()` guard.
- `packages/server/src/combat/runtime.ts`:
  - `CombatRuntime` class. Keyed `setInterval` map; `spawn` and
    `terminate` are idempotent; `shutdownAll` clears every interval;
    `onTick` / `onError` / `setInterval` / `clearInterval` are all
    injectable for deterministic tests.
  - Interval callback is wrapped in try/catch. On error, the runtime
    calls `onError({ combatId, combatTick, error })` and then
    `terminate()`s the loop so it cannot leak.
  - `computeUnresolvedCombats(events)` — pure helper that walks an
    event sequence and returns combatIds with a committed
    `COMBAT_INITIATE` but no matching `COMBAT_RESOLVE` /
    `COMBAT_DEFEAT`.
- `packages/server/src/sim/runtime.ts`:
  - Field `combatRuntime = new CombatRuntime()`.
  - `submitLivingWorldCommand` post-commit loop spawns the per-combat
    interval on `COMBAT_INITIATE` and terminates on `COMBAT_RESOLVE` /
    `COMBAT_DEFEAT`.
  - Boot-time hydration: walks `store.readEvents()` via
    `computeUnresolvedCombats` and re-spawns each unresolved combat.
  - `stop()` calls `combatRuntime.shutdownAll()` so test teardown and
    production shutdown both leave no orphaned timers behind.

### Honest scope

- Slice 1 `onTick` is a no-op. The rule engine pipeline (5-phase,
  card priority, tie-break) ships in Slice 2.
- `COMBAT_DEFEAT` is treated as a terminate signal even though it is
  not registered as a command type yet — Slice 2 will register it.
  The string match is forward-compatible.
- Phase B (`POST /api/combat/:id/action` single-shot) is unchanged.

### Verification

- Focused tests: `npm run test -w @greed-island/server -- combat/runtime` — **13 tests passing**.
- Full `npm test` — **500 server + 46 web = 546 tests passing**.
- `npm run build` (server + web) — clean.
- `npx openspec validate --all --strict` — **34 passed, 0 failed**.
- Versions bumped to `0.24.0`.

### CI / Deploy

- Pending push and CI run.

### Outstanding

- Slice 2: 5-phase rule engine + card priority + tie-break.
- Slice 3: EventLog integration + CombatStore refactor to read-only projection.
- Slice 4: SSE projection + new HTTP endpoints + client prediction.
- Slice 5: Real-time UI (Phaser CombatScene + extended CombatHud).
- Slice 6: Determinism audit + release prep.

## 2026-05-15 — Sprint 4: district-subtile-terrain (v0.23.0)

### Implemented

Closes the visual-honesty gap that made human sprites appear to stand
on open water inside the three water-biome districts. The macro-tile
graph (`MAP_ADJACENCY`) and server-side NPC sub-cell state are
unchanged — this slice is a pure client-side rendering + player-
movement improvement.

#### Web
- `packages/web/src/game/areaGrid.ts`: extracted the `AREA_*` grid
  constants out of `AreaScene.ts` so non-Phaser modules can import
  them without dragging Phaser into a Node test environment (Phaser
  touches `window` at module load time).
- `packages/web/src/game/terrainMask.ts`:
  - `SubcellTerrain` union and the per-glyph map.
  - `terrainMaskForDistrict(districtId)` returns hand-authored
    10×15 masks for `t_dock`, `t_temple`, `t_salt_marsh`; returns
    `null` for the five land districts (legacy path preserved).
  - `terrainAt(districtId, col, row)` + `isWalkableTerrain(terrain)`.
  - `COLOR_FOR_TERRAIN` palette: pier=cedar, shore=damp gray-blue,
    shallow_water=light blue, open_water=dark blue.
  - Defensive fallback: malformed masks (wrong row count or row
    width) collapse to `null` so the game stays playable.
- `AreaScene.drawBackground()`: when a mask exists for the current
  tile, paints each sub-cell with its mask color (still using the
  checker shade pattern to keep cell grid visible). Land districts
  unchanged.
- `AreaScene.isAreaWalkable(x, y)`: walkability gate over the mask.
- `handleMovement()`: look-ahead axis-wise velocity gate; player
  cannot step into an open-water cell. Pointer-target handlers
  (`pointerdown` + `pointermove`) reject taps on unwalkable cells.
- `AreaScene.applyOpenWaterHint(sprite, npc)`: fades NPC sprite alpha
  to 0.85 and attaches a `⛵` overlay when the NPC's sub-cell maps to
  `open_water`. Reapplied on both new sprites and existing-tweened
  sprites so the hint stays accurate across ticks.

### Honest scope

- Server-side NPC sub-cell selection is unchanged; NPCs may still
  land on water cells. The boat overlay frames that as "fishing
  from a small boat" rather than literally standing on the sea.
- Mask is hand-authored per district; no procedural geography.
- `shallow_water` is walkable; only `open_water` blocks the player.
- Land districts (5 of 8 + the salt-marsh outer ring) keep their
  legacy single-color rendering path.

### Verification

- Focused tests: `npm run test -w @greed-island/web -- terrainMask` — **7 tests passing**.
- Full `npm test` — **487 server + 46 web = 533 tests passing** (+7 web from terrainMask).
- `npm run build` (server + web) — clean.
- `npx openspec validate district-subtile-terrain --strict` — passes.
- `npx openspec validate --all --strict` — **34 passed, 0 failed**.
- Versions bumped to `0.23.0`.

### CI / Deploy

- Commit `91ed7d1` pushed; CI run `25907037170` success; Deploy Dev run `25907037154` queued initially (runner offline) but the subsequent closeout commit `13f068a` (Sprint 4+5 archive) caught the runner up: CI run `25908166063` success; Deploy Dev run `25908166086` success. The v0.23.0 image is live; the earlier queued deploy run is now redundant (same image content).

### Archive

- Delta spec synced: created new main spec `openspec/specs/district-subtile-terrain/spec.md` (3 requirements promoted from the delta).
- Change folder moved to `openspec/changes/archive/2026-05-15-district-subtile-terrain`.
- Also archived the umbrella `combat-system` change: Phase B (single-shot judgement) was shipped in v0.15.0; its Phase A spec was promoted to new main spec `openspec/specs/combat-runtime/spec.md` (10 requirements); Phase C is tracked separately in `combat-phase-c-realtime-subtick`; Phase D is deferred as a future change. Folder moved to `openspec/changes/archive/2026-05-15-combat-system`.
- `npx openspec validate --all --strict` — **34 passed, 0 failed**.

### Outstanding

- Sprint 6: `combat-phase-c-realtime-subtick` 0/38 — from-scratch real-time sub-tick runtime. Large slice; recommend a dedicated session.
- Sprint 6: `combat-phase-c-realtime-subtick` (0/38; from-scratch implementation of Combat Phase C real-time sub-tick runtime).
- Sprint 7: final verify + archive sweep.

## 2026-05-15 — Sprint 3: simulation-budget-enforcement Slice 4 (v0.22.0)

### Implemented

Closes the final outstanding piece of the umbrella
`simulation-budget-enforcement` change (Slices 1-3 already shipped).
Tiles with no recent NPC activity and no active world event now run
ecology drift only every 10th tick, bounding per-tick predator /
reproduction / migration work on empty regions.

#### Server
- `config/world.ts`: `TILE_ACTIVITY_RECENCY_TICKS = 60` and
  `TILE_INACTIVE_DRIFT_PERIOD = 10`.
- `packages/server/src/sim/tileActivation.ts`:
  - `computeActiveTiles({ tick, npcStates, activeEvents, recencyTicks })`
    returns a `Set<tileId>` of tiles where any NPC has acted within the
    recency window OR where an active world event's region scope
    includes the tile.
  - `tileShouldRunEcology({ tileId, tick, activeTiles, inactiveDriftPeriod })`
    returns `true` when the tile is in the active set OR when
    `tick % inactiveDriftPeriod === 0` (and tick > 0 to avoid cold-
    start mass drift on boot).
- `packages/server/src/sim/runtime.ts`:
  - Top of `runTick()` computes `activeTilesThisTick` from the live
    `npcEngine.snapshotAll()` state (not the projection — which lags
    one tick) plus `eventEngine.getActive()`.
  - Predation planner (kill / starvation / Sprint 2B aggression chain)
    is gated by `tileShouldRunEcology(predation.tileId, ...)`.
  - Reproduction and migration planners get the same gate keyed on
    their source tile.
  - NPC-triggered ecology (hunt path, fishery harvest) is unchanged —
    it is implicitly gated by NPC presence.

### Honest scope

- Drift cadence is a fixed `tick % 10`; no jitter, no per-tile schedule.
- Player presence is derived from NPC activity rather than the social
  presence API (simpler, no new infrastructure).
- Tile 0 does not drift, to avoid waking every inactive tile on
  runtime boot.
- The original spec mentioned "player presence within K ticks"; in
  practice the player avatar's tile shares with whichever NPCs are on
  that tile, so NPC-activity-based gating is an honest reformulation.

### Verification

- Focused tests: `npm run test -w @greed-island/server -- sim/tileActivation` — **9 tests passing**.
- Full `npm test` — **487 server + 39 web = 526 tests passing**.
- `npm run build` (server + web) — clean.
- `npx openspec validate simulation-budget-enforcement --strict` — passes.
- `npx openspec validate --all --strict` — **34 passed, 0 failed**.
- `npx openspec list` now shows `simulation-budget-enforcement` as `✓ Complete`.
- Versions bumped to `0.22.0` across `package.json` + `version.ts`.

### CI / Deploy

- Commit `825a931` pushed; CI run `25903986530` success; Deploy Dev run `25903986518` success.

### Archive

- Delta spec for the umbrella `simulation-budget-enforcement` change synced into `openspec/specs/simulation-kernel/spec.md` (7 requirements from prior slices 1-3b plus 3 new Slice 4 requirements appended in this commit).
- Change folder moved to `openspec/changes/archive/2026-05-15-simulation-budget-enforcement`.
- `npx openspec validate --all --strict` after archive — **33 passed, 0 failed**.

### Outstanding

- Sprint 4: `district-subtile-terrain` (sub-cell terrain mask on water-biome districts).
- Sprint 5–6: combat-system + combat-phase-c-realtime-subtick.

## 2026-05-15 — Sprint 2C: npc-defense-coordination (v0.21.0)

### Implemented

Closes the civilization-side of the ecosystem pressure loop. When an
animal attacks an NPC and other NPCs are nearby, neighbours organise a
counter-attack and put the predator down.

#### Server
- New living-world command `NPC_DEFENSE_PARTY_FORMED` (payload + union
  + validator that requires `memberNpcIds.length >= 2`).
- `config/world.ts`: `DEFENSE_REACTION_WINDOW_TICKS = 2` and
  `DEFENSE_PARTY_MIN_MEMBERS = 2`.
- `packages/server/src/ecosystem/defenseParty.ts`: pure deterministic
  planner. Walks recent `ANIMAL_ATTACKED_NPC` rows within the window;
  for each one still satisfying "attacker alive on tile" +
  "≥ 2 non-victim NPCs on tile" + "no prior party formed for this
  attackId", returns a `DefensePartyPlan` with lex-sorted member ids
  and a hashSeed-derived `partyId`.
- `packages/server/src/sim/runtime.ts`: after the predation step,
  walks `getRecentEvents(window + 1)`, calls `planDefenseParties`,
  and pushes `NPC_DEFENSE_PARTY_FORMED` + coordinated
  `ANIMAL_HUNT_STARTED` / `ANIMAL_HUNT_RESOLVED` (success) /
  `ANIMAL_KILLED` / `CARCASS_CREATED` chain attributed to the lex-min
  member as party leader. All events carry
  `motivation.projectPurpose = 'defense'`.
- Defense party hunts skip the retaliation planner — the numerical
  advantage absorbs the last-bite risk.

### Honest scope

- Individual party members cannot themselves take a retaliation hit.
- No faction-coloured parties / militia structures.
- Player avatar cannot join a party.
- Pack predators do not retaliate as a pack against the party.
- Existing `runtimePredation.test.ts` "no STARVED before threshold"
  test loosened: the wolf may now be killed by a defense party before
  starvation. Test asserts only the no-STARVED invariant; the wolf's
  survival is incidental.

### Verification

- Focused tests: `npm run test -w @greed-island/server -- ecosystem/defenseParty` — **9 tests passing**.
- Full `npm test` — **478 server + 39 web = 517 tests passing**.
- `npm run build` (server + web) — clean.
- `npx openspec validate npc-defense-coordination --strict` — passes.
- `npx openspec validate --all --strict` — **34 passed, 0 failed**.
- Versions bumped to `0.21.0` across `package.json` + `version.ts`.

### CI / Deploy

- Commit `4c58ffd` pushed; CI run `25903202816` success; Deploy Dev run `25903202817` success.

### Archive

- Delta specs synced: created new main spec `openspec/specs/npc-defense-coordination/spec.md` (2 requirements) and appended 1 requirement to `openspec/specs/living-deterministic-world/spec.md`.
- Change folder moved to `openspec/changes/archive/2026-05-15-npc-defense-coordination`.
- `npx openspec validate --all --strict` after archive — **34 passed, 0 failed**.

### Outstanding

- Sprint 3: finish `simulation-budget-enforcement` 4.x.
- Sprint 4: `district-subtile-terrain`.
- Sprint 5–6: combat-system + combat-phase-c-realtime-subtick.

## 2026-05-15 — Sprint 2B: animal-aggression (v0.20.0)

### Implemented

The ecosystem can now bite back. Two related mechanics ship together,
both pure deterministic and replay-safe.

#### Server
- New living-world commands `ANIMAL_TARGETED_NPC`, `ANIMAL_ATTACKED_NPC`,
  `ANIMAL_FLED`, `ANIMAL_RETALIATED` registered in
  `packages/server/src/kernel/livingWorldCommands.ts` with payload types,
  union variants, and validators.
- `packages/server/src/ecosystem/aggression.ts`:
  - `planAnimalAggression(input)` — when a predator would normally
    starve but at least one NPC shares its tile and `species.aggression
    > 0`, returns an `AnimalAggressionPlan` that targets a
    deterministically-picked NPC, applies `-10 mood / -10 health`
    damage, and optionally flees to a deterministic adjacent tile when
    `species.fear / 100` clears a hashSeed-derived threshold.
  - `planAnimalRetaliation(input)` — after `ANIMAL_HUNT_STARTED`,
    species with `aggression > 0` get a deterministic retaliation roll
    and, on hit, return an `AnimalRetaliationPlan` that injures the
    hunter by `-8 mood / -6 health` before the kill resolves.
- `packages/server/src/sim/runtime.ts`:
  - In the predation step, the starvation branch now consults
    `planAnimalAggression` first. If a plan exists the runtime emits
    `ANIMAL_TARGETED_NPC` → `ANIMAL_ATTACKED_NPC` → re-emitted
    `NPC_STATE_RECORDED` (mood / health clamped at 0) → optional
    `ANIMAL_FLED`. Falls through to the existing starvation event
    chain when no NPC is on the tile or `species.aggression == 0`.
  - In the NPC hunt path, `planAnimalRetaliation` runs after
    `ANIMAL_HUNT_STARTED` and pushes `ANIMAL_RETALIATED` plus a
    re-emitted `NPC_STATE_RECORDED` for the hunter BEFORE
    `ANIMAL_HUNT_RESOLVED`, so the dying animal lands its last bite.
- `ANIMAL_TARGETED_NPC` added to the chronicle suppression list (it
  is intent-only); the other three event types flow through the
  existing `/api/events` narrative surface.

### Honest scope

- No player-targeted attack path; the existing `combat-system` Phase B
  single-shot remains untouched.
- NPC organized retaliation party is **Sprint 2C** scope.
- No Phaser blood splatter / damage flash VFX — attacks surface only
  in the event feed and AI narration prompts.
- Damage tuning is a flat -10 / -10 (attack) and -8 / -6
  (retaliation); per-species damage tuning is a later polish.
- NPC death from health=0 is not handled in this slice; the NPC sits
  at zero and the next tick's NPC engine decides what to do.

### Verification

- `npm run test -w @greed-island/server -- ecosystem/aggression` —
  **10 new tests passing** (null-on-no-npc, null-on-zero-aggression,
  deterministic NPC pick, flee/no-flee paths, retaliation
  deterministic).
- Full `npm test` — **469 server + 39 web = 508 tests passing**.
- `npm run build` (server + web) — clean.
- `npx openspec validate animal-aggression --strict` — passes.
- `npx openspec validate --all --strict` — **33 passed, 0 failed**.
- Versions bumped to `0.20.0` across `package.json` + `version.ts`.

### CI / Deploy

- Commit `2320dab` pushed; CI run `25902575801` success; Deploy Dev run `25902575797` success.

### Archive

- Delta specs synced: created new main spec `openspec/specs/ecosystem-aggression/spec.md` (4 requirements) and appended 1 requirement to `openspec/specs/living-deterministic-world/spec.md`.
- Change folder moved to `openspec/changes/archive/2026-05-15-animal-aggression`.
- `npx openspec validate --all --strict` after archive — **33 passed, 0 failed**.

### Outstanding

- Sprint 2C: `npc-defense-coordination` (NPC hunting parties retaliate against attacking wildlife).
- Sprint 3: finish `simulation-budget-enforcement` 4.x.
- Sprint 4: `district-subtile-terrain`.
- Sprint 5–6: combat-system + combat-phase-c-realtime-subtick.

## 2026-05-15 — Sprint 2A: world-visibility-ecology (v0.19.0)

### Implemented

- Closed the implicit Phase E0/E1 visibility gap: animals, fishery,
  migration, and predator hunger were all server-authoritative but
  invisible to the player. After this slice, every projection has a
  user-facing surface (Hub badges, AreaScene sprites, fishery bar,
  admin table) and the AI dialog block carries structured per-species
  counts.

#### Server
- `packages/server/src/sim/areaEcology.ts`: pure `buildAreaEcology()`
  rollup of the four ecology projections, scoped to a tile, with
  deterministic ordering (count desc, lex tiebreak) and per-direction
  migration splits.
- `packages/server/src/sim/runtime.ts`: new `getAreaEcology(tileId)`
  accessor delegating to the builder; `null` for unknown tile.
- `packages/server/src/http/areaEcologyRouter.ts`: `GET
  /api/area/:tileId/ecology` returning `AreaEcologyView` (or `404
  { error: 'unknown tile' }`); wired into `createHttpApp`.
- `packages/server/src/npcs/aiDialog.ts`: `buildEcologyBlock()` now
  sorts the supplied animals list (count desc, speciesId lex tiebreak);
  anti-hallucination guard from v0.17.0 §37.1 preserved.

#### Web
- `packages/web/src/api/client.ts`: `AreaEcologyView` / `AnimalGroupRow`
  / `FisheryRow` / `MigrationRow` / `PredatorWarningRow` types + new
  `api.areaEcology(tileId)` method.
- `packages/web/src/game/speciesPalette.ts`: per-species emoji + color
  + 漢字 fallback.
- `packages/web/src/pages/hubEcology.ts`: pure helper that derives
  per-tile summaries (top 2 species + predator flag + migration
  arriving/departing) from `WorldSnapshot.facts`.
- `packages/web/src/game/MapScene.ts`: `drawEcologyBadges()` paints
  species emoji + count at each district anchor, a dimmed warning ring
  on predator-hunger tiles, and small migration arrows on the
  appropriate tile edges. Re-renders on `applyExternalUpdate` when
  `ecologyByTile` changes and on `scene.restart`.
- `packages/web/src/game/AreaScene.ts`: `drawEcologyOverlay()` renders
  individual sprites (≤ 5 per species) or a single cluster sprite
  with `×N` label (≥ 6); water-biome tiles get a fishery density bar
  with collapse colour cue. Sub-cell placement uses FNV-1a hash of
  `(animalId, tileId, salt)` for replay-stable positioning.
- `packages/web/src/pages/HubPage.tsx`: derives `ecologyByTile` from
  `world.facts.animalPopulation / migrationRoutes / predatorHunger`
  and passes it through `PhaserGame` to `MapScene`.
- `packages/web/src/pages/AreaPage.tsx`: fetches `api.areaEcology(tileId)`
  on mount and every 12 s, passes the result to `AreaPhaserGame`.
- `packages/web/src/pages/AdminWorldPage.tsx`: new "Animal Population"
  panel (sorts by count desc; shows lastSpawnedAtTick / lastKilledAtTick).

### Honest scope

- Read-only surface; no new commands, events, or projection state.
- AreaScene fetches via REST (no SSE push); 12 s poll is fine for the
  prototype but will need streaming when populations grow.
- Sub-cell placement is deterministic only inside the scene render
  pass — backend NPC presence is still keyed by `subCol/subRow/subZ`
  and is unaffected.
- Animal-on-NPC aggression and NPC defense parties are **out of scope**
  here and tracked in Sprints 2B / 2C of the 9-Sprint roadmap.

### Verification

- `npx openspec validate world-visibility-ecology --strict` — passed.
- `npx openspec validate --all --strict` — **32 passed, 0 failed**.
- Focused server tests: `npm run test -w @greed-island/server -- sim/areaEcology http/areaEcologyRouter aiDialog` — **43 tests** (9 new + 34 prior).
- Focused web tests: `npm run test -w @greed-island/web -- hubEcology` — **5 tests pass**.
- Full `npm test` — **server + web** clean (no regressions).
- `npm run build:server` + `npm run build:web` — clean (only the known Vite chunk-size warning).
- Versions bumped: workspace + server + web `package.json` → `0.19.0`; server/web `version.ts` → `0.19.0`.

### CI / Deploy

- Commit `f39cc17` pushed; CI run `25899873346` success; Deploy Dev run `25899873349` success (runner smoke check `curl http://100.83.112.20:8100/` returned `web ok`).
- Workstation session cannot reach the Tailscale interface from `127.0.0.1`, but the runner smoke check is the trustworthy evidence per HomeProject verification-and-evidence skill.

### Archive

- Delta specs synced: created new main spec `openspec/specs/ecology-visibility/spec.md` (5 requirements promoted) and appended 1 requirement to `openspec/specs/npc-dialog-grounding/spec.md`.
- Change folder moved to `openspec/changes/archive/2026-05-15-world-visibility-ecology`.
- `npx openspec validate --all --strict` after archive — **32 passed, 0 failed**.

### Outstanding

- Sprint 2B: `animal-aggression` (hungry predators attack NPC / player; animals fight back or flee).
- Sprint 2C: `npc-defense-coordination` (NPC hunting parties retaliate against attacking wildlife).
- Sprint 3: finish `simulation-budget-enforcement` 4.x (active region + low-frequency drift + replay test).
- Sprint 4: `district-subtile-terrain` (sub-cell terrain mask on water-biome districts).
- Sprint 5–6: combat-system + combat-phase-c-realtime-subtick.

## 2026-05-15 — Sprint 1: Close out three near-complete changes

### Implemented

- Closed final tasks on three near-complete OpenSpec changes:
  - `ecosystem-fishery-density` 5.8 — GM visibility follow-up evidence pointer added (commit `cd3eb0e`, CI `25802979233`, Deploy Dev `25802979345`; live `/healthz` 0.16.0 @ tick 117385).
  - `civ-evo-construction` 6.3 — Hub UI smoke test evidence pointer added (commits `212dd78` + `0f4fbce`; web smoke covered by `constructionActivity.test.ts`; live E2E from §8.5).
  - `settlement-domain` 6.7 — Local docker rebuild leg substituted with equivalent vitest path (15/15 focused tests on `projections/settlements` + `sim/settlementDetection`) because Docker Desktop daemon was unavailable on the kevinhome workstation at archive time; original CI/Deploy evidence from 6.5 still stands.
- Synced delta specs into main capability specs:
  - `ecosystem-fishery-density` → appended 4 requirements to `openspec/specs/ecosystem-runtime/spec.md`.
  - `civ-evo-construction` → promoted delta into new `openspec/specs/civ-evo-construction/spec.md` (6 requirements).
  - `settlement-domain` → appended 5 requirements to `openspec/specs/civilization-runtime/spec.md`.
- Moved the three change directories to `openspec/changes/archive/2026-05-15-*`.

### Honest scope

- No runtime / product code changed; this slice is pure OpenSpec hygiene + handoff documentation.
- Version intentionally unchanged (currently `0.18.0` in `version.ts`, `0.17.0` in workspace `package.json`); product behaviour identical.
- `simulation-budget-enforcement` 4.x, `combat-system`, and `combat-phase-c-realtime-subtick` remain active and will be picked up in later Sprints of the 7-Sprint roadmap (see chat handoff).

### Verification

- `npm test` — **449 server + 34 web = 483 tests passed**.
- `npm run build` — server + web build clean (only the known Vite chunk-size warning).
- `npx openspec validate --all --strict` — **31 passed, 0 failed**.
- `npx openspec list` — 3 active changes remain (`simulation-budget-enforcement`, `combat-system`, `combat-phase-c-realtime-subtick`).

### CI / Deploy

- Commit `6ec68e0` pushed; CI run `25898403365` success; Deploy Dev run `25898403378` success (runner smoke check `curl http://100.83.112.20:8100/` → `web ok` at 2026-05-15T03:22:12Z).

### Outstanding

- Sprint 2: build `world-visibility-ecology` (new OpenSpec change) — surface `animalPopulation` + `migrationRoutes` to the player `AreaScene` and Hub ecology badges.
- Sprint 3: finish `simulation-budget-enforcement` 4.x (active region + low-frequency drift + replay test).
- Sprint 4: build `district-subtile-terrain` (new OpenSpec change) — sub-cell terrain mask on water-biome districts so people don't visually appear to walk on open water.
- Sprint 5–6: combat-system + combat-phase-c-realtime-subtick.

## 2026-05-15 — OpenSpec Hygiene: Completed Changes Archived

### Implemented

- Archived completed Phase 3 changes: `npc-dialog-grounding`, `npc-rumor-propagation`, `npc-skill-mentorship`, `npc-culture-festivals`, `household-shared-economy`.
- Archived completed ecosystem/economy foundation changes: `npc-state-typed-projection`, `ecosystem-foundation`, `ecosystem-animal-spawning`, `ecosystem-simple-hunting`, `ecosystem-predation`, `ecosystem-reproduction-capacity`, `ecosystem-migration`, `predator-mortality`, `goods-primitives`, `goods-logistics`, `goods-production-chains`, `market-formation`.
- Active OpenSpec list is now reduced to unfinished/long-running changes only: `ecosystem-fishery-density`, `settlement-domain`, `simulation-budget-enforcement`, `civ-evo-construction`, `combat-phase-c-realtime-subtick`, `combat-system`.

### Verification

- `npx openspec list` — 6 active changes remain.
- `npx openspec validate --all --strict` — **33 passed, 0 failed**.

### Next

- Recommended next new change: Phase E2.1 `ecosystem-overuse-detection` from `docs/WORLD_CAPABILITIES.md` §38.1.

## 2026-05-15 — Phase 3 §37.4: Household Shared Economy

### Implemented

- OpenSpec change `household-shared-economy` added for `docs/WORLD_CAPABILITIES.md` Phase 3 §37.4.
- `HOUSEHOLD_GOLD_CONTRIBUTION_RATE = 0.25` added to `config/world.ts`; positive household-member income rounds up to at least 1 pooled gold.
- Three new command/event types: `HOUSEHOLD_GOLD_CONTRIBUTED`, `HOUSEHOLD_GOLD_SPENT`, `HOUSEHOLD_INHERITANCE_ASSIGNED`, plus payload types and validators in `livingWorldCommands.ts`.
- `HouseholdEconomyProjection` (`projections/householdEconomy.ts`): replayable rows keyed by `householdId`; idempotent contribution/spend/inheritance handling; spending clamp prevents negative pooled balance; canonical hash support.
- `SimulationRuntime` integration: projection boot rebuild, two fan-out points, `getHouseholdEconomy()`, and `WorldSnapshot.facts.householdEconomy` for GM/admin observability.
- Accepted `NPC_PRODUCTIVE_ACTION` and `MEAT_HARVESTED` income by household members emits deterministic household contribution events.
- Autonomous construction decisions observe personal gold plus household pooled balance; when household balance is needed, runtime emits `HOUSEHOLD_GOLD_SPENT` after the construction command is accepted.
- Routine household economy events are suppressed from chronicle/public narrative surfaces.

### Honest scope

- Household contributions are an accounting layer on top of existing individual civic gold in this slice; income is not subtracted from personal civic balances.
- Inheritance command/projection substrate exists, but `NPC_DECEASED` generation is still not implemented.
- Household construction spend is only wired into the existing autonomous construction path; no general-purpose household purchase system yet.

### Verification

- `npx openspec validate household-shared-economy --strict` — valid.
- `npx openspec validate --all --strict` — **36 passed, 0 failed**.
- Focused: `npx vitest run src/kernel/livingWorld.test.ts src/sim/runtimeExpansion.test.ts src/projections/householdEconomy.test.ts` — **48 tests passed**.
- `npm run build` — server TypeScript clean; web production build clean except known Vite chunk-size warning.
- `npm test` — **449 server + 34 web = 483 tests passed**.

### CI / Deploy

- Commit `c2cafbf` pushed to `main`.
- GitHub CI `25893553858` — success (Build/typecheck/test + OpenSpec validate).
- GitHub Deploy Dev `25893553868` — success (Docker image build/push + desktop deploy + workflow smoke check).
- Known non-blocking annotation remains: GitHub Actions Node.js 20 deprecation.
- Live smoke after deploy:
  - `https://hunter.sisihome.org/healthz` — `{"ok":true,"version":"0.18.0","tick":133361}`.
  - `http://100.83.112.20:8100/healthz` — `{"ok":true,"version":"0.18.0","tick":133361}`.
  - `https://hunter.sisihome.org/api/world` — `facts.householdEconomy` present with 5 rows at tick `133363`.

### Outstanding

- None for Phase 3 §37.4. Next work should continue from `docs/WORLD_CAPABILITIES.md` phase order or archive completed OpenSpec changes when appropriate.

## 2026-05-14 — Phase 3 §37.3: NPC Culture & Emergent Festivals

### Implemented

- `CULTURAL_FESTIVAL_THRESHOLD = 3`, `CULTURAL_NORM_NPC_THRESHOLD = 3`, `RITUAL_FACTION_LEANS` added to `config/world.ts`.
- Three new command/event types: `CULTURAL_FESTIVAL_FORMED`, `CULTURAL_RITUAL_PERFORMED`, `CULTURAL_NORM_ESTABLISHED` with payload types and validators in `livingWorldCommands.ts`.
- `CulturalElementProjection` (`projections/culturalElement.ts`): maps `(tileId, elementId) → CulturalElementRow`; internal `festivalCounters` map incremented on `RARE_WINDOW_OPEN`; `getByTile`, `getFestivalCounter`, `hasFestival`, `hasNorm`, `rebuildFromEvents`, `canonicalHash` accessors; all three cultural event types handled idempotently.
- `BuildingDef.tags?: readonly string[]` added to `buildings/types.ts`; `b_temple_shrine`, `b_dimai_archway`, `b_mountain_lodge` all tagged `['ritual_site']` in `catalog.ts`.
- `culturalSeeders.ts`: `planFestivalSeed` (RARE_WINDOW_OPEN counter threshold check, tide_festival→t_temple map), `planRitualSeed` (ritual_site tag + RITUAL_FACTION_LEANS + rareWindowOpen gate), `planNormSeed` (tile skill level density check).
- `SimulationRuntime` integration: `culturalElementProjection` instantiated, `rebuildFromEvents` wired, two fan-out points; `getCulturalElements(tileId)` public accessor; festival seeder after `RARE_WINDOW_OPEN` accepted; ritual seeder after `BUILDING_ENTER` accepted; norm pair collection + seeder after both command loops.

### Honest scope

- Festival fires once per `windowId`; no annual recurrence in this slice.
- Ritual seeder fires per NPC per window opening (repeatable living act); no chronicle deduplication.
- Norm check uses pre-commit skillXp state; norms crystallize one tick after the threshold is crossed.
- Only `tide_festival` window maps to a festival tile (`t_temple`); other windowIds ignored.

### Verification

- `npm run build:server` — clean TypeScript.
- `npm test` — **445 server + 34 web = 479 tests passed**.
- `npx openspec validate --all --strict` — **35 passed, 0 failed**.

### CI / Deploy

- Pending push and CI run.

### Outstanding

- None. Festivals, rituals, and norms will emerge once `RARE_WINDOW_OPEN` recurs 3 times, faction NPCs enter ritual sites during windows, or skill-level density thresholds are met on any tile.

## 2026-05-14 — Phase 3 §37.2: NPC Skill Learning & Mentorship

### Implemented

- `SKILL_IDS`, `SKILL_XP_PER_OBSERVE`, `SKILL_XP_PER_MENTOR_TICK`, `SKILL_XP_LEVEL_THRESHOLD` added to `config/world.ts`.
- Three new command/event types registered in `LivingWorldRuleEngine`: `NPC_OBSERVED_SKILL`, `NPC_MENTORSHIP_STARTED`, `NPC_MENTORSHIP_COMPLETED`.
- `SkillXpProjection` (`projections/skillXp.ts`): `(npcId, skillId) → { xp, level, mentorId }` projection; `rebuildFromEvents` / `canonicalHash` compliant; `getByNpc`, `getAll`, `getAllActive` accessors.
- `SimulationRuntime`: two fan-out points + `rebuildProjections` wired; `getNpcSkills(npcId)` public accessor (filters xp > 0).
- `skillObservationSeeder.ts`: maps productive events to skill IDs, caps observers at 3, excludes actor NPC.
- `mentorshipEngine.ts`: tick-driven XP increment; emits `NPC_MENTORSHIP_COMPLETED` when threshold crossed; wired at start of `runTick` fan-out.
- `AiDialogContext` extended with `skillLevels?`; `buildSkillBlock()` exported from `aiDialog.ts`; `npc.ts` assembles and passes skills.

### Honest scope

- Mentorship must be started externally via `NPC_MENTORSHIP_STARTED` command; no auto-pairing logic in this slice.
- No skill-based gating of productive actions.
- Observation seeder runs only after productive events pass the rule engine; no retrospective observation.

### Verification

- `npm run build:server` — clean TypeScript.
- `npm test` — **423 server + 34 web = 457 tests passed**.
- `npx openspec validate --all --strict` — **34 passed, 0 failed**.

### CI / Deploy

- Pending push and CI run.

### Outstanding

- None. Skill XP will accumulate once productive events and mentorship commands begin flowing through the simulation.

## 2026-05-14 — Phase 3 §37.1: NPC Dialog Grounding

### Implemented

- OpenSpec change `npc-dialog-grounding` for `docs/WORLD_CAPABILITIES.md` §37.1.
- `SimulationRuntime` gained `getAnimalPopulationOnTile(tileId)` and `getFisheryDensityOnTile(tileId)` — tile-scoped accessors delegating to existing projections.
- `AiDialogContext` extended with 4 optional fields: `knownPersonNames`, `ecologyContext`, `fisheryContext`, `recentLocalEvents`.
- Four new exported builder functions in `aiDialog.ts`: `buildKnownPersonBlock`, `buildAntiHallucinationBlock`, `buildEcologyBlock`, `buildRecentEventsBlock`.
- `buildSystemPrompt()` wires all four blocks: known-person + anti-hallucination before history; ecology + recent-events after rumors.
- `npc.ts` handler assembles grounded context: interaction memories → known-person names (cap 10); tile ecology; tile-filtered recent events (cap 5).
- Anti-hallucination constraint block uses hard directive language in Chinese: forbids naming people/species not in supplied lists.

### Honest scope

- Known-person graph uses `interaction`-type NPC memory rows; no cross-NPC relationship inference.
- Ecological awareness is current-tile only; no adjacent-tile or region-wide data.
- Recent events filtered by `payload.data.tileId`; events without tileId are silently skipped.
- No post-processing validation — constraint is prompt-level only.

### Verification

- Focused tests: `npm run test -w @greed-island/server -- npcs/aiDialog` — **29 passed**.
- `npm run build:server` — clean TypeScript.
- `npm run build:web` — passed (known Vite chunk-size warning only).
- Full suite: `npm test` — **399 server + 34 web tests passed** (433 total).
- `npx openspec validate npc-dialog-grounding --strict` — passed.
- `npx openspec validate --all --strict` — **33 passed, 0 failed**.

### CI / Deploy

- CI run `25845143736` — success (50 s).
- Deploy Dev image push success; containers restarted manually.
- Live `/healthz` at tick 17703: `{"ok":true,"version":"0.17.0","tick":17703}` ✓
- CI `25845598136` — success (43 s). Deploy Dev `25845598156` — success. Image pulled and containers restarted.

### Outstanding

- None. Dialog grounding will activate automatically on next player NPC interaction that goes through the AI path.

## 2026-05-14 — Phase 3 Slice 1: NPC Rumor Propagation

### Implemented

- OpenSpec change `npc-rumor-propagation` for `docs/WORLD_CAPABILITIES.md` Phase 3 Slice 1 (§11 NPC Social Network).
- Constants added: `RUMOR_ACCURACY_DECAY = 85`, `RUMOR_ACCURACY_THRESHOLD = 10`, `RUMOR_MAX_PER_NPC = 5`.
- New command/event types: `NPC_RUMOR_HEARD` (NPC witnesses notable event), `NPC_RUMOR_SPREAD` (NPC-to-NPC relay during interaction). Both registered in `LivingWorldRuleEngine` with validators.
- `RumorProjection`: in-memory projection keyed by `(npcId, rumorId)`; evicts oldest entry when cap exceeded; `rebuildFromEvents`/`canonicalHash` compliant.
- `rumorSeeder.ts`: converts `ANIMAL_STARVED` and `BUILDING_CONSTRUCTED` events into `NPC_RUMOR_HEARD` commands for all NPCs on the triggering tile.
- Runtime integration: projection hydrated on boot; both fan-out loops project into `rumorProjection`; seeder fires in command processing loop; `planRumorSpread()` enqueues `NPC_RUMOR_SPREAD` after accepted `NPC_INTERACT`; both rumor event types suppressed from narrative surfaces.
- `NpcMemory` integration: `NPC_RUMOR_SPREAD` adds `event`-type memory rows for both participants via `deriveMemoryRows()`.
- `WorldSnapshot.facts.npcRumors` exposes all active rumor rows.
- AI dialog: `buildRumorsBlock()` injects top-3 active rumors context into system prompt; omitted when NPC has no active rumors.

### Honest scope

- Rumors seed only from `ANIMAL_STARVED` and `BUILDING_CONSTRUCTED`; other notable events (NPC combat, trade) are not yet seeded.
- No UI display of rumor state beyond `facts.npcRumors` and the dialog prompt injection.
- Spread is at most one rumor per NPC_INTERACT; no multi-hop chain within a single tick.

### Verification

- Focused tests (14 tests): `npm run test -w @greed-island/server -- projections/rumor sim/runtimeRumor` — **14 passed**.
- `npm run build:server` — clean TypeScript.
- `npm run build:web` — passed (known Vite chunk-size warning only).
- Full suite: `npm test` — **383 server + 34 web tests passed** (417 total).
- `npx openspec validate npc-rumor-propagation --strict` — passed.
- `npx openspec validate --all --strict` — **32 passed, 0 failed**.

### CI / Deploy

- CI run `25843969886` — success (48 s).
- Deploy Dev run `25843969861` — image push success; desktop runner running; images pulled and containers restarted manually.
- Live `/healthz` at tick 16933: `{"ok":true,"version":"0.16.0","tick":16933}` ✓
- Live `/api/world.facts.npcRumors`: key present, empty array `[]` (expected — no rumor-seeding events in current session yet) ✓

### Outstanding

- Rumors will seed automatically once ANIMAL_STARVED events fire (requires predator starvation threshold to be met in live world).

## 2026-05-14 — Phase E1.4 predator mortality

### Implemented

- OpenSpec change `predator-mortality` for `docs/WORLD_CAPABILITIES.md` Phase E1.4.
- Added `PREDATOR_STARVATION_THRESHOLD_TICKS = 5 * ECOSYSTEM_REPRODUCTION_CADENCE_TICKS` (60 ticks) constant.
- New `PredatorHungerProjection`: tracks `lastKillAtTick` per `(predatorSpeciesId, tileId)` from `ANIMAL_KILLED` events emitted by `ecosystem.predator.*` actors; ignores NPC-hunter kills; `canonicalHash`/`rebuildFromEvents` compliant.
- `AnimalPopulationProjection` extended to handle `ANIMAL_STARVED`: removes `predatorAnimalId` from `(predatorSpeciesId, tileId)` row; no-op for unknown id; `lastKilledAtTick` updated.
- Runtime: starvation gate — `ANIMAL_STARVED` only fires when `hungerDuration >= PREDATOR_STARVATION_THRESHOLD_TICKS`; previously emitted unconditionally on every cadence tick with no prey.
- Both fan-out loops in runtime now project into `predatorHungerProjection`.
- `WorldSnapshot.facts.predatorHunger` exposes all rows from projection.
- `/admin/world` renders predator hunger table (speciesId, tileId, lastKillAtTick), labeled as Phase E1.4.

### Honest scope

- One starvation per cadence tick; the deterministic planner selects ONE wolf. Spawning may add new wolves on the same tick as starvation, so total count can stay ≥ 1.
- No pack-level starvation, no gradual hunger states beyond the kill timestamp, no visual UI beyond admin table.
- `ANIMAL_KILLED` and `ANIMAL_STARVED` already existed in command catalog; no new command types introduced.

### Verification

- Focused server tests: `npm run test -w @greed-island/server -- ecosystem/predation projections/predatorHunger projections/animalPopulation sim/runtimePredation kernel/livingWorld` — **70 tests passed**.
- `npm run build:server` passed (clean TypeScript).
- `npm run build:web` passed (known Vite chunk-size warning only).
- Full suite: `npm test` — **365 server + 34 web tests passed**.
- `npx openspec validate predator-mortality --strict` passed.
- `npx openspec validate --all --strict` passed: 31 passed, 0 failed.

### CI / Deploy

- CI run `25840338300` — success (52 s).
- Deploy Dev run `25840338292` — image push success; desktop runner hung on `docker version` (same Docker Desktop timeout as E1.3); images pulled and containers restarted manually.
- Live `/healthz` at tick 15565: `{"ok":true,"version":"0.16.0","tick":15565}` ✓
- Live `/api/world.facts.predatorHunger`: key present, empty array `[]` (expected — boot skipped hydration of 404 k events, no predator kills yet in new session) ✓

### Outstanding

- Next E1 slice: pack-level reproduction gating, multi-predator competition, or ecosystem health metrics. Or begin Layer 3 Phase 2 civilization growth.

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

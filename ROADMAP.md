# Greed Island — Roadmap

> 這份 roadmap 是 release-by-release 的工作項摘要。最新狀態在最上面。
> 詳細設計見 `openspec/changes/<change-id>/proposal.md`。
> 架構準則見 `ARCHITECTURE.md` 與 `COMBAT_ARCHITECTURE.md`。

## v0.15.12 ⏳ local — 2026-05-10

**主題：NPC worldline route slice**

- ✅ NPC state 新增 `travelRoute`，跨區移動時公開 from/to/target/start tick。
- ✅ Hub 只渲染 travel route 上的 NPC，並用 route segment 位置表達「在路上」。
- ✅ Area/outdoor projection 排除 `activity === 'move'`，避免同一 NPC 同時出現在 Hub 與 sub 場景。
- ✅ 新增 regression tests：移動 NPC 有 route、抵達後 route 清空、traveling NPC 不算 outdoor occupant；前端 projection 也覆蓋 Hub/Area 去重。
- ⏳ 待 final review、commit / push / CI/CD / live verification。

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

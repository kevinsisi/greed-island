# 求生者核心 — 設計文件（Survival Actor Core）

日期：2026-06-30
狀態：已與使用者對齊，SP1 進入實作

## 問題

主畫面核心迴圈目前是「走一個小地圖的小人 → 點 NPC 看 AI 對話 → 進區域看更多文字面板」。沒有目標、沒有賭注、沒有「行動→世界回應→得到/失去」的回饋。它是一個讓人「觀察」的櫥窗，不是讓人「玩」的東西——所以醜的根因不是美術，是**核心玩法**。先前的視覺基礎改造（token/字體/圖示）必要但不充分。

## 願景對齊（不可協商前提）

`docs/WORLD_CAPABILITIES.md` Part I §1.1：**Greed Island 不是 MMORPG、不是 player-centric open world、玩家只是世界中的 actor、世界不會等待玩家。** 因此解法**不是**做成繞著玩家轉的任務遊戲，而是讓「身為活世界中的 actor」這件事本身變得有張力：給玩家**有意義的動作 + 可見的後果 + 在乎世界發生什麼的理由**。

使用者選定的核心體驗：

- **角色＝世界裡的求生者**：打獵/採集/交易/建造/躲避掠食與遷徙/饑荒。
- **壓力＝個人需求時鐘**：玩家也有飢餓/健康/溫飽/住所等需求，隨時間衰退（**連離線都衰退**，呼應「世界不等你」）；靠在世界中行動來維持；撐不住→衰弱→死亡→接現有 mortality/inheritance 成為後代繼續。

## 既有基礎（非從零）

- 玩家動作已部分走事件 log：`PLAYER_HUNTED_ANIMAL`、`PLAYER_FISHED`、`PLAYER_ENERGY_SET`。
- 玩家已有金幣（wallet）、體力（energy）、術式、戰鬥、玩家文明、與 NPC 的關係。
- NPC 已有完整 needs 模型、mortality、inheritance、lineage——可重用/接續。
- 缺：**玩家的個人需求時鐘**，與**把這一切收進有張力的主畫面**。

## 主畫面願景（求生者處境台）

主畫面從「走小人 + 讀面板」變成求生者的處境台：

1. **中央＝你的處境**：需求隨時間衰退的緊張 HUD，連離線都在掉。
2. **你所在地此刻的威脅與機會**（全來自既有活世界）：附近獵物、掠食者威脅、季節/饑荒糧價、稀有窗口。
3. **可做的動作，標清楚代價與收益**：打獵/採集/交易/休息/移動，成敗取決於當下世界狀態。
4. **賭注**：需求歸零→狀態惡化→死亡→傳承。

地圖保留，但變成「機會與威脅在哪」的工具，不再是畫面全部。

## 架構約束（ARCHITECTURE.md）

所有玩家狀態改變必須走 **Command → Rule Engine → Event → 投影**。AI 維持 read-only。死亡是一等狀態變更（v0.87.3 鐵則），需全鏈路傳遞。

## 拆解路線圖（完整求生者，建置順序）

每個 sub-project 各自一個 OpenSpec change → 實作 → 上線循環。

1. **SP1 — 求生需求地基 + 處境 HUD**（本文件設計、先做）
2. **SP2 — 求生動作**：把打獵/釣魚/採集/進食/休息/買糧正式化為「消耗代價→回補需求」的動作，成敗看世界狀態；行動選單 UI。
3. **SP3 — 世界↔求生耦合**：季節/寒冷耗溫暖、掠食者威脅所在格、饑荒/糧價；威脅與機會面板。
4. **SP4 — 住所與溫暖**：建造/修繕住所、生火取暖，作為獨立需求與動作。
5. **SP5 — 死亡與傳承（收尾）**：狀態歸零→死亡→接 mortality/inheritance，成為後代繼續。

## SP1 詳細設計 — 求生需求地基 + 處境 HUD

### 範圍

- 先做兩條求生脊椎需求：`nourishment`（溫飽）與 `vigor`（體況/健康），0–100。模型可擴充（warmth/rest 留給 SP3/SP4）。
- 衰退**連離線都算**。
- 後果鏈：溫飽低→vigor 流失（挨餓）；溫飽健康時 vigor 緩慢回復；vigor 歸零=死亡（SP1 先標記死亡 + 擋互動；傳承留 SP5）。
- 主畫面中央處境 HUD。

### 伺服器設計

- **狀態模型**：每帳號一筆求生需求狀態 `{ asOfTick, nourishment, vigor, alive }`。
- **惰性對帳（offline decay）**：不對所有玩家每 tick 跑迴圈。狀態存 `asOfTick`；在「讀取 needs」或「玩家行動」時，以純函數 `reconcile(state, currentTick)` 依 `elapsedTicks × 衰退率` 往前推算，並發出對帳事件。決定性、便宜、且天然支援離線衰退。
  - `nourishment` 每 tick 以固定速率衰退（具名常數，非 magic number）。
  - 當 `nourishment` 低於閾值 → `vigor` 以飢餓速率衰退；當 `nourishment` 高於回復閾值 → `vigor` 緩慢回復（封頂 100）。
  - `vigor` 觸 0 → 發 `PLAYER_DIED` 類事件、`alive=false`（SP1 僅標記 + 後續互動 gate；傳承 SP5）。
- **事件（走 Command→Rule Engine→Event）**：
  - `PLAYER_NEEDS_RECONCILED`（對帳結果：新 needs + asOfTick）。
  - `PLAYER_DIED`（vigor 歸零；payload 帶死亡 tick/原因＝starvation）。
  - 初始化：玩家首次進入世界時 seed 需求（健康初值）。
- **投影**：`PlayerSurvivalProjection`（每帳號最新 needs + alive）。boot 重建需同時掛上 runtime 的**小 log 與大 log 兩條 boot 分支**（v0.25.3 / v0.87.3 鐵則）。
- **API**：`GET /api/player/needs`（authenticated）→ 回 reconcile 到 currentTick 的 `{ nourishment, vigor, alive, asOfTick }`。
- **死亡 gate（SP1 範圍）**：alive=false 時，既有玩家互動（hunt/fish/dialog 等寫入動作）回明確錯誤（比照死亡 NPC 的 410 模式精神，對玩家用適當狀態碼），唯讀瀏覽仍可。

### 衰退與後果常數（具名，待 SP1 實作時定值並寫進 config/world.ts）

- `PLAYER_NOURISHMENT_DECAY_PER_TICK`
- `PLAYER_STARVATION_THRESHOLD`（低於此溫飽開始扣 vigor）
- `PLAYER_VIGOR_STARVATION_DECAY_PER_TICK`
- `PLAYER_VIGOR_RECOVERY_THRESHOLD` / `PLAYER_VIGOR_RECOVERY_PER_TICK`
- 初值常數（seed 用）。
- 速率定值原則：以 `TICKS_PER_HOUR`（=720）為基準，讓「健康玩家從滿到開始挨餓」落在數小時牆鐘量級，避免過快造成挫折、過慢失去張力（實作時定，並可日後 settings 化）。

### 前端設計

- **處境 HUD**（主畫面中央，HubPage）：`nourishment`/`vigor` 兩條需求條；瀕危（低於閾值）以 rust 脈動 glow 呈現張力；一行狀態句（例：「溫飽充足」/「開始挨餓——再不進食體況會下滑」/「瀕危」）。
- 資料來源：`GET /api/player/needs`，透過既有 SSE tick 或既有 polling 節奏更新（沿用 WorldStateContext / 既有 15s fallback）。
- 採用 SP-UI 既有 token：`.gi-panel`、需求條用 ember/rust，數值用 `font-data`。
- 死亡狀態：alive=false 時 HUD 顯示明確「你已倒下」狀態（傳承 UI 留 SP5）。

### 不在 SP1 範圍（明確排除）

動作的完整經濟與成敗模型（SP2）、世界耦合的威脅機會面板（SP3）、溫暖/住所需求與動作（SP4）、死亡傳承與後代接續（SP5）、地圖/IA 全面重構。

### 測試（SP1）

- `reconcile` 純函數：溫飽衰退、低溫飽扣 vigor、溫飽足回復 vigor、封頂/封底、vigor 歸零標記死亡——皆以「給定 elapsedTicks」決定性驗證。
- 投影 boot：小 log 與大 log 兩條分支都正確重建最新 needs。
- API：回 reconcile 到 currentTick 的值；未登入/死亡的行為。
- 前端：HUD 在不同需求區間的呈現（健康/挨餓/瀕危/死亡）。

### 驗證

`npm --workspace packages/server exec vitest run`、`npm run build`（server+web）clean。live 部署為權威視覺/行為確認（本機 preview 截圖工具此環境無法 settle）。

## 風險 / 取捨

- **[惰性對帳的事件量]**：只在讀取/行動時對帳，避免每 tick 全玩家迴圈；但需確保「讀取」不會產生過量 `PLAYER_NEEDS_RECONCILED` 事件——對帳事件只在實際跨越整數 tick 且值有變時發出，或以節流（每 N tick 最多一次對帳事件）控制。
- **[衰退速率手感]**：太快挫折、太慢無張力。以牆鐘數小時為基準起步，常數化、可日後 settings 化調整。
- **[死亡 gate 範圍]**：SP1 僅標記死亡 + gate 互動，不做傳承；需明確告知玩家「傳承在後續版本」，避免「死了就卡住」的誤解。

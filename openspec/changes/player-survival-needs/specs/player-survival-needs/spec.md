## ADDED Requirements

### Requirement: 玩家 SHALL 擁有會隨時間衰退的個人求生需求

每個玩家帳號 SHALL 擁有求生需求狀態 `nourishment`(溫飽) 與 `vigor`(體況)，值域 0–100，並記錄對帳時點 `asOfTick`。需求 SHALL 隨世界 tick 推進衰退，**且不依賴玩家在線**——衰退以惰性對帳純函數依「經過的 tick × 具名衰退率」推算，MUST NOT 對全體玩家每 tick 跑迴圈。所有需求狀態變更 MUST 走 Command → Rule Engine → Event → 投影。

#### Scenario: 離線期間溫飽仍衰退
- **GIVEN** 玩家在 tick T 溫飽為 80、之後離線
- **WHEN** 玩家於 tick T+N 回來讀取需求
- **THEN** 系統 SHALL 回傳依 N 個 tick 衰退後的溫飽值（< 80），證明世界不等玩家

#### Scenario: 對帳事件不被高頻讀取灌爆
- **WHEN** 在同一個 tick 內多次讀取需求
- **THEN** 系統 SHALL NOT 為每次讀取都產生 `PLAYER_NEEDS_RECONCILED` 事件（僅在實際跨越 ≥1 整數 tick 且值有變時記錄）

### Requirement: 溫飽與體況 SHALL 形成飢餓/回復後果鏈，體況歸零 SHALL 觸發可恢復昏厥

當 `nourishment` 低於飢餓閾值時，`vigor` SHALL 隨之衰退（挨餓）；當 `nourishment` 高於回復閾值時，`vigor` SHALL 緩慢回復並封頂 100。當 `vigor` 觸及 0 時，系統 SHALL 將玩家標記為昏厥（`collapsed=true`）並發出 `PLAYER_COLLAPSED`。昏厥為**可恢復**狀態：當 `vigor` 回升至恢復閾值以上時 SHALL 解除昏厥（`collapsed=false`）。永久死亡與傳承不在本能力範圍（留待 SP5）。所有速率與閾值 MUST 為具名常數，不得使用 magic number。

#### Scenario: 溫飽過低導致體況下滑
- **GIVEN** 玩家 nourishment 低於飢餓閾值且 vigor 為 50
- **WHEN** 經過若干 tick 對帳
- **THEN** vigor SHALL 下降

#### Scenario: 溫飽充足時體況回復且封頂
- **GIVEN** 玩家 nourishment 高於回復閾值且 vigor 為 90
- **WHEN** 經過若干 tick 對帳
- **THEN** vigor SHALL 上升但不超過 100

#### Scenario: 體況歸零觸發可恢復昏厥
- **GIVEN** 玩家持續挨餓使 vigor 趨近 0
- **WHEN** vigor 觸及 0
- **THEN** 系統 SHALL 標記 `collapsed=true` 並發出 `PLAYER_COLLAPSED`

#### Scenario: 補給回升後解除昏厥
- **GIVEN** 玩家處於昏厥（collapsed=true）且其後 nourishment 回到回復閾值以上
- **WHEN** 經過若干 tick 對帳使 vigor 回升至恢復閾值以上
- **THEN** 系統 SHALL 解除昏厥（collapsed=false）

### Requirement: 系統 SHALL 提供唯讀需求查詢

系統 SHALL 提供已登入玩家查詢自身求生需求的唯讀端點，回傳 reconcile 到當前 tick 的 `{ nourishment, vigor, collapsed, asOfTick }`。

#### Scenario: 查詢回傳對帳後的當前值
- **WHEN** 已登入玩家查詢需求
- **THEN** 回傳值 SHALL 為 reconcile 到當前 tick 的結果

### Requirement: 系統 SHALL 提供最小進食動作以閉合求生迴圈

SP1 尚無世界相依的求生動作（打獵/採集等屬 SP2），因此 SHALL 提供一個最小進食動作：玩家花費固定金幣 → 提升 `nourishment`（封頂 100）。此為**過渡性置入**，SP2 將以世界相依的真實供給動作取代/擴充。進食 MUST 走 Command → Rule Engine → Event（`PLAYER_ATE`）。金幣不足時 SHALL 回明確錯誤。昏厥（collapsed）狀態下 SHALL 仍允許進食，使玩家得以自昏厥恢復（不可形成無法脫離的死局）。

#### Scenario: 進食提升溫飽並扣金幣
- **GIVEN** 玩家金幣足夠且 nourishment 為 40
- **WHEN** 執行進食動作
- **THEN** nourishment SHALL 上升（封頂 100）且金幣 SHALL 被扣除

#### Scenario: 金幣不足無法進食
- **GIVEN** 玩家金幣不足
- **WHEN** 嘗試進食
- **THEN** 系統 SHALL 回明確錯誤，nourishment 與金幣不變

#### Scenario: 昏厥時仍可進食以恢復
- **GIVEN** 玩家 `collapsed=true` 且金幣足夠
- **WHEN** 執行進食動作
- **THEN** 進食 SHALL 成功，使 nourishment 回升、進而讓 vigor 得以恢復並解除昏厥

### Requirement: 投影 boot SHALL 同時掛上小 log 與大 log 兩條分支

`PlayerSurvivalProjection` 的事件重建 MUST 同時接入 runtime 的小 log 完整重建與大 log availability-first boot 兩條分支，使重啟後最新需求狀態正確還原。

#### Scenario: 重啟後需求狀態還原
- **GIVEN** 玩家需求歷史已寫入 EventLog
- **WHEN** runtime 重啟並 boot 投影
- **THEN** 玩家最新需求狀態 SHALL 被正確重建（兩條 boot 分支皆然）

### Requirement: 主畫面 SHALL 呈現玩家求生處境

主畫面（Hub）SHALL 顯示玩家求生需求的處境 HUD：呈現 `nourishment` 與 `vigor`，於瀕危區間以視覺張力（脈動強調）提示，並附狀態句。資料 SHALL 透過既有更新管線（SSE tick 或既有 polling fallback）刷新。死亡時 SHALL 顯示明確倒下狀態。

#### Scenario: 瀕危需求顯示張力提示
- **GIVEN** vigor 或 nourishment 低於瀕危閾值
- **WHEN** 渲染處境 HUD
- **THEN** 對應需求 SHALL 以脈動/警示樣式呈現，而非與健康狀態無異

#### Scenario: 死亡狀態明確呈現
- **GIVEN** 玩家 `alive=false`
- **WHEN** 渲染處境 HUD
- **THEN** SHALL 顯示明確「已倒下」狀態（傳承 UI 留待後續）

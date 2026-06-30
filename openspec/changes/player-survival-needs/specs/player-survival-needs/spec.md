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

### Requirement: 溫飽與體況 SHALL 形成飢餓/回復後果鏈，體況歸零 SHALL 觸發死亡標記

當 `nourishment` 低於飢餓閾值時，`vigor` SHALL 隨之衰退（挨餓）；當 `nourishment` 高於回復閾值時，`vigor` SHALL 緩慢回復並封頂 100。當 `vigor` 觸及 0 時，系統 SHALL 將玩家標記為死亡（`alive=false`）並發出 `PLAYER_DIED`（cause=starvation）。所有速率與閾值 MUST 為具名常數，不得使用 magic number。

#### Scenario: 溫飽過低導致體況下滑
- **GIVEN** 玩家 nourishment 低於飢餓閾值且 vigor 為 50
- **WHEN** 經過若干 tick 對帳
- **THEN** vigor SHALL 下降

#### Scenario: 溫飽充足時體況回復且封頂
- **GIVEN** 玩家 nourishment 高於回復閾值且 vigor 為 90
- **WHEN** 經過若干 tick 對帳
- **THEN** vigor SHALL 上升但不超過 100

#### Scenario: 體況歸零觸發死亡標記
- **GIVEN** 玩家持續挨餓使 vigor 趨近 0
- **WHEN** vigor 觸及 0
- **THEN** 系統 SHALL 標記 `alive=false` 並發出 `PLAYER_DIED`

### Requirement: 系統 SHALL 提供唯讀需求查詢並在死亡時 gate 寫入型互動

系統 SHALL 提供已登入玩家查詢自身求生需求的唯讀端點，回傳 reconcile 到當前 tick 的 `{ nourishment, vigor, alive, asOfTick }`。當玩家 `alive=false` 時，寫入型玩家互動 SHALL 被擋下並回明確錯誤；唯讀瀏覽 SHALL 不受影響。傳承/後代接續不在本能力範圍。

#### Scenario: 查詢回傳對帳後的當前值
- **WHEN** 已登入玩家查詢需求
- **THEN** 回傳值 SHALL 為 reconcile 到當前 tick 的結果

#### Scenario: 死亡玩家的寫入互動被擋
- **GIVEN** 玩家 `alive=false`
- **WHEN** 嘗試寫入型互動（如打獵/釣魚/對話）
- **THEN** 系統 SHALL 回明確錯誤而非靜默成功；唯讀瀏覽不受影響

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

## Context

完整設計脈絡見 `docs/superpowers/specs/2026-06-30-survival-actor-core-design.md`。玩家已部分是 server 實體（`PLAYER_HUNTED_ANIMAL`/`PLAYER_FISHED`/`PLAYER_ENERGY_SET` 走事件 log，有 wallet/energy/techniques）。NPC 已有 needs/mortality/inheritance 可參照。缺玩家個人需求時鐘。約束：Command→Rule Engine→Event→投影；AI read-only；死亡為一等狀態（v0.87.3 鐵則，投影 boot 需掛小 log 與大 log 兩條分支）。

## Goals / Non-Goals

**Goals:** 玩家有會衰退（含離線）的 nourishment/vigor；溫飽↔體況後果鏈與飢餓死亡標記；唯讀 API；主畫面處境 HUD 讓「我在求生」變可感。

**Non-Goals:** 動作的完整經濟與成敗（SP2）、世界耦合威脅機會面板（SP3）、warmth/shelter（SP4）、死亡傳承後代接續（SP5）、地圖/IA 全面重構。

## Decisions

### D1：惰性對帳，而非每 tick 全玩家迴圈
- needs 狀態存 `(asOfTick, nourishment, vigor, alive)`。`reconcile(state, currentTick)` 為純函數：`elapsed = currentTick - asOfTick`，套用衰退/挨餓/回復/死亡，回新狀態。
- 在「讀取 `/api/player/needs`」與「玩家行動」時對帳並（必要時）發 `PLAYER_NEEDS_RECONCILED`。
- **理由**：玩家可能多且常離線；每 tick 迴圈昂貴且無謂。惰性對帳決定性、便宜、天然支援離線衰退（呼應「世界不等你」）。

### D2：對帳事件節流，避免灌爆 EventLog
- 只在「實際跨越 ≥1 整數 tick 且 needs 值有變」時發 `PLAYER_NEEDS_RECONCILED`；高頻讀取之間不重複發事件（以 asOfTick 比對）。投影層永遠可由 reconcile 即時呈現最新值，不依賴每次讀取都落事件。
- **理由**：讀取頻繁（HUD 輪詢/SSE），事件只記真實狀態推進。

### D3：後果鏈為確定性算術（具名常數）
- `nourishment -= NOURISHMENT_DECAY_PER_TICK * elapsed`（封底 0）。
- `nourishment < STARVATION_THRESHOLD` → `vigor -= VIGOR_STARVATION_DECAY_PER_TICK * elapsedUnderThreshold`。
- `nourishment >= VIGOR_RECOVERY_THRESHOLD` → `vigor += VIGOR_RECOVERY_PER_TICK * elapsed`（封頂 100）。
- `vigor <= 0` → `alive=false`，發 `PLAYER_DIED{ tick, cause:'starvation' }`。
- 速率以 `TICKS_PER_HOUR`(=720) 為基準定值：健康→開始挨餓落在數小時牆鐘量級。常數化、可日後 settings 化。
- **理由**：避免 magic number；決定性可測；手感可調。

### D4：死亡 gate（SP1 範圍）
- `alive=false` → 玩家寫入型互動（hunt/fish/dialog 等）回明確錯誤（比照死亡 NPC 410 精神，對玩家用適當碼，例如 409/410 + `PLAYER_DECEASED`）。唯讀瀏覽不受影響。
- 傳承/後代接續**不在 SP1**；前端明示「傳承於後續版本」避免「死了卡住」誤解。
- **理由**：死亡須立即有一致後果，但完整傳承是 SP5 的獨立工作。

### D5：投影 boot 掛兩條分支
- `PlayerSurvivalProjection` 的 `rebuildFromEvents` 必須同時加進 `runtime.ts` 的小 log 完整重建與大 log availability-first boot 兩條分支（v0.25.3/v0.87.3 鐵則）。
- **理由**：避免「只接一條」造成 boot 後 needs 遺失。

### D6：前端 HUD 沿用既有更新管線與 token
- `SurvivalHud` 讀 `/api/player/needs`，用既有 WorldStateContext SSE tick 或 15s fallback 節奏更新；用 SP-UI `.gi-panel`、ember/rust、`font-data`；瀕危脈動 glow。
- **理由**：不另造資料管線；視覺與既有基礎一致。

## Risks / Trade-offs

- **[對帳事件量]** → D2 節流（跨整數 tick 且值變才發）。
- **[衰退手感]** → 以數小時牆鐘為基準起步、常數化可調。
- **[死亡卡住誤解]** → 前端明示傳承在後續版本；SP1 僅標記+gate。
- **[未登入/訪客]** → `/api/player/needs` 需登入；訪客唯讀瀏覽無需求狀態。

## Migration Plan

純加法事件型別 + 新投影 + 新 API + 前端 HUD。無資料遷移。部署即生效；rollback=revert（needs 狀態由事件重建，revert 後新事件型別被忽略不影響舊 replay）。驗證：vitest 全套 + `npm run build`；live 部署為權威確認。

## Open Questions

- 衰退常數的最終值於實作時定（依數小時牆鐘基準試手感）；是否 settings 化留待 SP2 後視需要。

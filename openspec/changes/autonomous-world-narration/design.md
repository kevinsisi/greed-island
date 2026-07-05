## Context

伺服器端世界時鐘已自主（`runtime.ts` `scheduleNextTick`，`TICK_DURATION_MS = 5_000`），NPC 移動與事件每 tick 對全部 NPC 推進並寫進 EventLog，不依賴玩家連線。但 view-layer 的氛圍敘事（`AmbientNarrator`）是被動的：

- 唯一「需求端」觸發點是 area-view API（`buildingsRouter.ts:234` → `getOrSchedule`），會記 `lastRequestedTickByTile`。
- tick listener 內的 `tickRefresh`（`runtime.ts:823`）只刷新「過去 `RECENT_VISITOR_WINDOW_TICKS`(=12 ticks ≈ 1min) 內被請求過」的 tile。
- 沒有玩家在看的 tile：`cache` 沒有 entry，`tickRefresh` 也跳過 → 旁白永遠不生成，直到玩家進場。

約束：
- **ARCHITECTURE.md 鐵則**：AI 只能 read-only 旁白，不下 Command、不改 state。背景生成必須走相同 `runRefresh`，只寫記憶體 `cache`。
- **成本**：`runRefresh` 會呼叫 Gemini/OpenCode。已有閘門「無 active key → fallback 靜態、零 AI 呼叫」。背景生成不可繞過此閘門。
- **單執行緒 event loop**：背景生成不可在單一 tick 內對所有 tile 併發呼叫 AI（會塞爆 HTTP，重蹈 scheduler hotfix 覆轍）。必須限流。
- **無事件**：ambient 旁白不是 Event，不進 EventLog，因此本change對 replay 零影響。

## Goals / Non-Goals

**Goals:**
- 沒有玩家在看的 tile，其氛圍旁白也會被自主背景節奏定期生成與更新。
- 玩家進場時，透過既有 SSE/polling 拉到的旁白已是「演化中的最新狀態」，而非首次冷啟。
- 背景生成速率受具名常數封頂，成本可預期、可調節。

**Non-Goals:**
- 不讓 NPC↔NPC 對話在 tick 內自發生成（屬後續 workstream，且涉及更高成本）。
- 不修改 area-view API 契約、不修改前端。
- 不調整 `MAX_CATCH_UP_TICKS_PER_CALLBACK`（刻意的單執行緒 yield 取捨，另案處理）。
- 不把 ambient 旁白寫進 EventLog（維持 view-layer 產物定位）。

## Decisions

### D1：背景刷新採「每 N tick 挑 1 個最舊 tile」的 round-robin，而非「每 N tick 全刷」
- 在 `AmbientNarrator` 新增 `backgroundRefresh(currentTick, allTileIds, getContext)`，由 runtime tick listener 在既有 `tickRefresh` 之後呼叫。
- 每次最多挑 **1** 個 tile：在所有 world tile 中，選 `cache` 內 `generatedAtTick` 最舊者（從未生成 = 視為最舊，優先）；只在 `currentTick % AMBIENT_BACKGROUND_REFRESH_PERIOD_TICKS === 0` 時執行。
- **理由**：單執行緒下「每次 1 個」天然限流，避免併發 AI 呼叫塞爆 event loop；round-robin 保證所有 tile 公平輪到。alternative「全刷」會在每個觸發 tick 同時對 8 個 tile 發 AI，成本與延遲尖峰都不可接受。

### D2：成本上限以具名常數表達，預設值讓「每 tile 自主更新週期」落在分鐘級
- 新增 `AMBIENT_BACKGROUND_REFRESH_PERIOD_TICKS`（避免 magic number，遵守專案規則）。預設 `6`（=30s，5s/tick）。
- 含 8 個 world tile 時，每 tile 平均每 `6×8=48` ticks（≈4 分鐘）自主更新一次；AI 呼叫上限 ≈ 每 30s 一次（≈120/hr）。
- recent-visitor refresh（`tickRefresh`）維持不變並優先：玩家正在看的 tile 仍以 `AMBIENT_REFRESH_TICKS=30` 的較快節奏更新；背景只負責「沒人看的角落」。
- **理由**：把速率收斂在一個常數，部署方可依額度調節；預設值在「世界感覺活著」與「成本可控」之間取平衡。

### D3：沿用既有閘門與去重，不新增成本路徑
- `backgroundRefresh` 開頭即 `if (settings.listActiveKeys().length === 0 && !isOpenCodeConfigured) return`——無 provider 直接 no-op，**零 AI 呼叫**，行為與今日完全相同。
- 沿用既有 `inflight` map 去重：若某 tile 已有 in-flight refresh，背景跳過。
- 背景與 recent-visitor 共用同一 `runRefresh`/`cache`，不產生第二份狀態，符合「同一 server-authoritative 投影」精神。
- **理由**：最小新增面、不繞過成本閘門、不替使用者意圖加上隱藏花費。

### D4：world tile 清單由 runtime 提供，沿用 `buildAmbientContext`
- runtime tick listener 已持有 `buildAmbientContext(tileId)`（`runtime.ts:823`/`910`）。新增傳入「所有 world tile id」清單（取自既有 map graph / tile 來源），背景輪轉只在這份清單內挑。
- **理由**：context 組裝邏輯單一來源，背景與 view-time 完全一致，不會出現「背景生成的旁白引用了不同事實」。

## Risks / Trade-offs

- **[已配置 key 的部署會新增持續性 AI 花費]** → 上限由 `AMBIENT_BACKGROUND_REFRESH_PERIOD_TICKS` 明確封頂且可調大；無 key 部署零影響；花費僅發生在使用者已主動配置 key（已選擇花費）的前提下。
- **[背景 AI 呼叫與 view-time 呼叫競爭額度]** → 兩者共用 `inflight` 去重；recent-visitor 仍優先且節奏較快，玩家正在看的區不會被背景排擠。
- **[round-robin 挑選掃描所有 tile 的成本]** → tile 數量是個位數（8），每 N tick 一次線性掃描，可忽略。
- **[「最舊」判定需穩定]** → 從未生成的 tile 以 `-Infinity`/缺 entry 視為最舊並優先；同 tick 多個候選時取固定排序（tileId 字典序）保證決定性、避免抖動。

## Migration Plan

- 純加法：新增方法 + 常數 + 一個 tick-listener 呼叫點。無 schema/event 變動，無資料遷移。
- 部署即生效；rollback = revert commit，無殘留狀態（ambient 僅記憶體快取）。
- 驗證：新單元測試 + `npm --workspace packages/server exec vitest run` 全綠 + `npm run build`。

## Open Questions

- 預設 `AMBIENT_BACKGROUND_REFRESH_PERIOD_TICKS = 6` 是否需要做成 settings 可調？（本change先用常數；若部署方反映額度敏感，後續再提 settings 化的 change。）

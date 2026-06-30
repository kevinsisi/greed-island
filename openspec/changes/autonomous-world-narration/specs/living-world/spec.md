## ADDED Requirements

### Requirement: Ambient 旁白 SHALL 自主背景演化

（Priority 5，延伸「Continuous World Events / 玩家不在線世界仍演化」精神到 view-layer 敘事）系統 SHALL 以一個自主背景節奏更新 ambient 氛圍旁白，**不可僅由玩家觀看觸發**。除了既有「玩家正在看的 tile 以較快節奏刷新」之外，runtime SHALL 對所有 world tile 以 round-robin 方式定期挑選「最久沒更新（含從未生成）」的 tile 主動刷新其旁白，使沒有玩家在看的區域之氛圍敘事亦持續演化。

背景刷新 SHALL 受具名常數封頂：每隔 `AMBIENT_BACKGROUND_REFRESH_PERIOD_TICKS` 個 tick 最多挑選 **1** 個 tile 生成，且沿用既有 in-flight 去重，避免在單執行緒 event loop 上併發 AI 呼叫。

背景刷新 MUST 遵守既有成本閘門：僅在已配置 active AI provider（active key 或 OpenCode）時啟用；無 provider 時 SHALL no-op、不產生任何 AI 呼叫，行為與既有一致。背景生成 MUST 走與 view-time 相同的 read-only 旁白路徑（只寫記憶體快取、不寫 EventLog、不改 state、不下 Command），不得違反「Ambient Narration AI 為 read-only」。

#### Scenario: 無玩家在看時最舊 tile 仍被自主刷新
- **GIVEN** 已配置 active AI key，且某 tile 在過去 `RECENT_VISITOR_WINDOW_TICKS` 內從未被任何玩家請求
- **WHEN** 世界 tick 推進跨過一個 `AMBIENT_BACKGROUND_REFRESH_PERIOD_TICKS` 邊界
- **THEN** 該「最久沒更新」的 tile SHALL 被主動刷新並寫入旁白快取，無需任何玩家觀看或互動

#### Scenario: 背景生成速率受常數封頂
- **GIVEN** 已配置 active AI key 且存在多個 world tile
- **WHEN** 在單一 `AMBIENT_BACKGROUND_REFRESH_PERIOD_TICKS` 週期內推進
- **THEN** 背景路徑 SHALL 最多觸發 1 次 tile 旁白生成（其餘 tile 等待後續週期輪到）

#### Scenario: 無 AI provider 時零成本
- **GIVEN** 未配置任何 active AI key 且未配置 OpenCode
- **WHEN** 世界持續 tick
- **THEN** 背景刷新 SHALL no-op，不發出任何 AI 呼叫，ambient 旁白維持既有 fallback 行為

#### Scenario: 背景刷新不繞過 read-only 鐵則
- **WHEN** 背景路徑為某 tile 生成旁白
- **THEN** 該生成 MUST NOT 寫入 EventLog、MUST NOT 改 NPC trust/mood/state、MUST NOT 觸發新事件；僅更新記憶體中的旁白快取

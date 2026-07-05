## Why

世界的「骨架」已是自主的（固定 5s tick、NPC 移動/活動/事件每 tick 對全部 NPC 推進並寫進 EventLog，不依賴玩家連線）。但玩家**實際讀得到的氛圍敘事層不自主**：`AmbientNarrator` 只在 area-view API 被呼叫時（`buildingsRouter.ts:234`）才生成旁白，`tickRefresh` 也只主動刷新「過去 `RECENT_VISITOR_WINDOW_TICKS`(≈1 分鐘) 內被請求過」的 tile。沒有玩家在看的區域，氛圍描述**完全不生成**。結果：玩家一開畫面才第一次拉到旁白，主觀體驗變成「我一看它才開始有氣氛 / 世界等我來才動」——這與 `living-world` spec 的「玩家不在線世界仍演化」精神矛盾。

## What Changes

- 新增 **autonomous background ambient cadence**：runtime tick listener 除了既有的 recent-visitor refresh，另以 round-robin 方式定期挑「最久沒更新（含從未生成）」的 world tile 主動刷新一輪 ambient 旁白，**即使沒有任何玩家在看**。世界各區的氛圍敘事因此持續演化。
- 背景生成速率以**具名常數封頂**（`AMBIENT_BACKGROUND_REFRESH_PERIOD_TICKS`：每 N tick 最多挑 1 個 tile 生成），同時受既有 `inflight` 去重保護，避免燒 AI 額度、也避免在單執行緒 event loop 上塞爆 HTTP。
- **成本閘門不變**：僅在 `settings.listActiveKeys().length > 0`（已配置 active AI key = 使用者已選擇花費）時才背景生成；無 key 時維持零成本 fallback，行為與今日完全相同。
- 沿用既有**反幻覺 prompt 約束**與 `AmbientNarration AI 為 read-only` 鐵則：背景生成走相同 `runRefresh` 路徑，AI 只產生 zh 描述、不寫 EventLog、不改 state、不下 Command。
- 不修改 area-view API 對外契約、不修改前端；玩家進場時透過既有 SSE/polling 拉到的就是「已經在演化中的」最新旁白。

## Capabilities

### New Capabilities
- _None._

### Modified Capabilities
- `living-world`: 在既有「Ambient Narration AI 為 read-only」「Continuous World Events / 玩家不在線世界仍演化」之上，新增 requirement —— ambient 旁白 SHALL 以自主背景節奏演化，不可僅由玩家觀看觸發；且背景生成速率受具名常數封頂、僅在已配置 AI key 時啟用。

## Impact

- **Code**: `packages/server/src/sim/ambientNarrator.ts`（新增背景 round-robin refresh 邏輯與 `AMBIENT_BACKGROUND_REFRESH_PERIOD_TICKS` 常數；`tickRefresh` 擴充或新增背景方法）、`packages/server/src/sim/runtime.ts`（tick listener 注入「全 world tile 清單」供背景輪轉，沿用既有 `buildAmbientContext`）。
- **Tests**: `ambientNarrator` 新測試 —— 無 visitor 時背景仍會挑最舊 tile 刷新、速率受常數封頂、無 active key 時零 AI 呼叫、`inflight` 去重。
- **架構鐵則**: 不違反 ARCHITECTURE.md（AI 仍 read-only renderer，不下 Command）；不新增 Command/Event 型別。
- **Replay**: 無事件 shape 變動，EventLog replay 行為完全不變（ambient 旁白是記憶體快取的 view-layer 產物，非事件）。
- **成本**: 對未配置 AI key 的部署零影響；對已配置 key 的部署，背景生成上限為每 N tick 1 次 AI 呼叫（可由常數調節）。

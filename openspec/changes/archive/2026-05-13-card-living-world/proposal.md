# Proposal — 紋卡 Living World v0.13.0

## Why

紋卡是 Greed Island 的核心遊戲循環，但 v0.12.x 把「掉卡 → 撿卡 → 紋典 → 交易」流程做完之後，仍未滿足世界 living-world 的三條約束：

1. **ARCHITECTURE.md §1.1 要求所有狀態改變都走 Command → Rule Engine → Event 管線。** 既有 `CardWorldStore` 直接 `INSERT/UPDATE world_card_drops`，沒有 typed Command、沒有 EventLog 軌跡，無法做 since-last-visit / replay / 審計。
2. **掉落率對世界沒有回饋。** Spawn chance 是固定的 0.012/tile，看不出天氣（潮獵會在大潮日偏多）、區域差異（鏽灣應出高稀有、潮聲應出低階），玩家也感受不到 rare-window 開啟跟其它時段不同。
3. **「六十秒法則」的時間感無法被精力影響。** 設計文件指明精力低時「倒數感知有 ±5 秒誤差」（顯示的時間不準確），讓低能量玩家容易在以為還剩 10 秒時就現形，但目前後端推的 deadline 永遠精確到 tick。

同時 v0.12.1 引入的 MapScene 視覺回饋讓玩家觀察到「NPC 都不會移動了」— sprite 釘死在 district anchor，跨 tile 也只是 destroy+recreate，導致看起來 NPC 全程站著。這是另一個必須在這次 release 修掉的 living-world 觀感缺陷。

## What Changes

- **新增 `CardActionPipeline`** 把 10 種紋卡命令（CARD_DROP_SPAWN / CARD_DROP_EXPIRE / CARD_PICKUP / CARD_RELEASE / CARD_STORE / CARD_MATERIALIZE / CARD_TRADE_PROPOSE / ACCEPT / REJECT / CANCEL）統一進「驗證 → 寫 card_action_log → CardWorldStore 投影」一個 SQLite transaction。`card_action_log` 是新表，欄位含 deterministicKey（從 commandType + actorId + tick + payload 派生，不含 wall-clock），符合 ARCHITECTURE §1.3。
- **`CardWorldRouter` 改走 pipeline**：所有寫入路徑（pickup / store / release / materialize / trade）都產 typed Command 進 pipeline，HTTP 層只做參數驗證 + DTO 轉換。
- **`CardDropEngine` 補上 weather / area / rare-window 修正**：雨天 spawn ×1.3 + 高階卡 ×1.1；大潮日 ×1.5；鏽灣高稀有 ×1.4 / 低階 ×0.85；潮聲區量少 ×0.7、低階 ×1.2；霓港 ×1.1；浪花 ×1.2 / 低階 ×1.1。Spawn 走 pipeline。
- **精力 timer 誤差**：`DropDto` 加 `perceivedSecondsLeft`（含 deterministic ±N 秒誤差）+ `rawSecondsLeft`（後端真實值）；jitter band：energy ≥ 60 → 0s / 30..60 → ±2s / 0..30 → ±5s。前端 `CardDropPanel` 優先吃 perceived。
- **新 endpoint `/api/cards/since-last-visit`**：從 `card_action_log` 查 `tick > accounts.last_seen_tick` 的 spawn / pickup（actor != me）/ expire；回應後立刻把 `last_seen_tick` 推到 currentTick（exactly-once 摘要）。HubPage 進場拉一次，>0 顯示頂端 toast。
- **Codex 長按 2 秒實體化**：取代 `window.confirm`；onPointerDown 啟動 2s timeout + 進度條，放開/滑開/取消都不送 request。
- **MapScene NPC 移動修復**：`refreshNpcSprites` 改成 preserve sprite by npcId + tween 4.5s 到新位置；`computeNpcTarget` 用後端推的 `subCol/subRow` 把 NPC 放在 district anchor 周圍 ±36px 的子格位置。HubPage 把 `subCol/subRow` 從 NpcSummary 帶進 MapNpc。

## Impact

- **Affected specs**：simulation-kernel 不變（紋卡仍是 ARCHITECTURE §8 的 orthogonal store，不進 EventLog）。
- **Affected code**：`packages/server/src/http/cardCommands.ts`（新）、`cardWorldRouter.ts`（重寫）、`cardDropEngine.ts`（重寫）、`server.ts`（boot 順序：jobsStore 移前）；`packages/web/src/api/client.ts`、`pages/HubPage.tsx`（toast）、`pages/CodexPage.tsx`（長按）、`game/MapScene.ts`（tween）、`game/MapNpc` 介面、`components/game/CardDropPanel.tsx`（perceived 倒數）。
- **資料遷移**：`card_action_log` 是 `CREATE TABLE IF NOT EXISTS`，舊部署升級時自動建。`world_card_drops` / `player_codex` / `card_trades` schema 不動。Since-last-visit 對舊帳號從 `accounts.last_seen_tick=0` 起算，第一次拉摘要會看到自有資料以來所有事件 — 接受這個 once-only fan-out。
- **Risk**：`CardActionPipeline.expireOverdueDrops` 把 audit log 寫在 mutation 之前 snapshot，再呼叫 `store.expireOverdueDrops`；如果這兩個動作之間 race（不可能，同 transaction）就會有不一致。已包在 `db.transaction` 裡。

## Why

主畫面核心迴圈是「走小人 → 點 NPC 看對話 → 進區域讀面板」，沒有目標/賭注/回饋——是觀察櫥窗，不是遊戲。對齊願景（WORLD_CAPABILITIES Part I §1.1：活世界、玩家只是 actor、世界不等玩家），核心體驗定為**世界裡的求生者 + 個人需求時鐘**。完整求生者拆成 5 個 sub-project（見 `docs/superpowers/specs/2026-06-30-survival-actor-core-design.md`）；本change為 **SP1：求生需求地基 + 處境 HUD**，是「你在求生」變真實的脊椎。

## What Changes

- 玩家獲得**個人求生需求**：`nourishment`(溫飽) 與 `vigor`(體況/健康)，0–100，模型可擴充（warmth/rest 留 SP3/SP4）。
- **離線也衰退**：以惰性對帳（`reconcile(state, currentTick)` 純函數，依 elapsedTicks×衰退率）在讀取/行動時往前推算，不對全玩家每 tick 跑迴圈。決定性、便宜、呼應「世界不等你」。
- **後果鏈**：溫飽低於閾值 → vigor 流失（挨餓）；溫飽足 → vigor 緩慢回復（封頂 100）；vigor 觸 0 → **可恢復昏厥**（collapsed，補給回升即解除）。永久死亡 + 傳承留 SP5。
- **最小進食閉合迴圈**：SP1 無世界相依求生動作（SP2），故提供置入式進食 `PLAYER_ATE`（花固定金幣 → 提升溫飽，封頂 100；昏厥時仍可進食以脫離死局），SP2 將以世界相依供給取代。
- 新唯讀 `GET /api/player/needs`（reconcile 到 currentTick）。
- 前端主畫面（HubPage）新增**處境 HUD**：兩條需求條 + 瀕危脈動張力 + 狀態句 + 進食按鈕 + 昏厥呈現，沿用既有 SSE/polling 更新與 SP-UI token。

## Capabilities

### New Capabilities
- `player-survival-needs`: 玩家個人求生需求狀態（nourishment/vigor）、離線惰性對帳衰退、溫飽↔體況後果鏈與可恢復昏厥、最小進食閉合迴圈、唯讀需求 API、主畫面處境 HUD。

### Modified Capabilities
- _None._（永久死亡與傳承留待 SP5。）

## Impact

- **Code（server）**：`config/world.ts`（求生衰退/閾值/初值/進食具名常數）；`kernel/livingWorldCommands.ts`（`PLAYER_NEEDS_RECONCILED` / `PLAYER_COLLAPSED` / `PLAYER_ATE` / 初始化 command + 驗證）；`projections/playerSurvival.ts`（新投影 + reconcile 純函數 + boot 事件型別）；`sim/runtime.ts`（接 projection 的小 log 與大 log 兩條 boot 分支）；`http/playerState.ts` 或新 router（`GET /api/player/needs` + 進食 endpoint，扣 wallet）。
- **Code（web）**：`components/game/SurvivalHud.tsx`（新）；`pages/HubPage.tsx`（掛 HUD）；`api/client.ts`（needs 取用）。
- **Tests**：reconcile 純函數（衰退/挨餓/回復/封頂底/死亡）、投影雙 boot 分支、API、HUD 區間呈現。
- **架構**：全走 Command→Rule Engine→Event→投影；AI 不涉入；死亡全鏈路傳遞鐵則（SP1 範圍內＝tick gate 概念以 alive 標記 + API/互動 gate + 前端呈現）。
- **Replay**：新事件型別為加法；對帳事件節流避免灌爆 log。

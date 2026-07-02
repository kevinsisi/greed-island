## 1. 常數（config/world.ts）

- [x] 1.1 新增具名常數：`PLAYER_NOURISHMENT_DECAY_PER_TICK`、`PLAYER_STARVATION_THRESHOLD`、`PLAYER_VIGOR_STARVATION_DECAY_PER_TICK`、`PLAYER_VIGOR_RECOVERY_THRESHOLD`、`PLAYER_VIGOR_RECOVERY_PER_TICK`、初值常數、`EAT_RATION_GOLD_COST`、`EAT_RATION_NOURISHMENT`，速率以 TICKS_PER_HOUR 為基準（健康→挨餓落在數小時牆鐘）

## 2. 需求模型與對帳純函數（projections/playerSurvival.ts）

- [x] 2.1 定義需求狀態型別 `{ asOfTick, nourishment, vigor, collapsed }` 與初值 seed
- [x] 2.2 `reconcile(state, currentTick)` 純函數：溫飽衰退（封底 0）、低溫飽扣 vigor、足溫飽回復 vigor（封頂 100）、vigor≤0→collapsed=true、vigor≥回復閾值→collapsed=false
- [x] 2.3 `PlayerSurvivalProjection`：每帳號最新狀態 + `PLAYER_SURVIVAL_BOOT_EVENT_TYPES`
- [x] 2.4 單元測試：衰退/挨餓/回復/封頂底/昏厥/解除昏厥，皆以 elapsedTicks 決定性驗證

## 3. Commands / Events（kernel/livingWorldCommands.ts）

- [x] 3.1 `PLAYER_NEEDS_RECONCILED`（新狀態 + asOfTick）+ validator
- [x] 3.2 `PLAYER_COLLAPSED`（tick）+ validator
- [x] 3.3 `PLAYER_ATE`（扣金幣 + 提升溫飽，封頂 100）+ validator（金幣不足拒絕）
- [x] 3.4 玩家首次進入 seed 需求初始化路徑
- [x] 3.5 對帳事件節流：僅跨 ≥1 整數 tick 且值變才發

## 4. Runtime boot 接線（sim/runtime.ts）

- [x] 4.1 `PlayerSurvivalProjection.rebuildFromEvents` 接入**小 log 完整重建**分支
- [x] 4.2 同接入**大 log availability-first boot** 分支（v0.25.3/v0.87.3 鐵則）
- [x] 4.3 boot 重建測試（兩條分支皆還原最新狀態）

## 5. API（http）

- [x] 5.1 `GET /api/player/needs`（authenticated）→ reconcile 到 currentTick 的 `{ nourishment, vigor, collapsed, asOfTick }`
- [x] 5.2 進食 endpoint（authenticated）：扣 wallet → `PLAYER_ATE`；金幣不足回明確錯誤；昏厥時仍可進食
- [x] 5.3 API 測試：對帳值、未登入、進食成功/金幣不足/昏厥可進食

## 6. 前端處境 HUD（web）

- [x] 6.1 `api/client.ts` 加 `playerNeeds(token)` 與進食呼叫
- [x] 6.2 `components/game/SurvivalHud.tsx`：兩條需求條 + 瀕危脈動張力 + 狀態句 + 進食按鈕 + 昏厥呈現（SP-UI token、font-data）
- [x] 6.3 `pages/HubPage.tsx` 主畫面中央掛 HUD；透過既有 SSE/polling 節奏更新
- [x] 6.4 前端測試：健康/挨餓/瀕危/昏厥區間呈現

## 7. 驗證與收尾

- [x] 7.1 `npm --workspace packages/server exec vitest run` 全套綠（2 pre-existing failures in npc.test.ts / runtimeSettlementFamine.test.ts 與本 SP 無關）
- [x] 7.2 `npm run build`（server + web）clean
- [x] 7.3 更新 PROGRESS.md（含 design doc 連結與 SP1 範圍）
- [x] 7.4 commit；push/部署時機與 live 視覺/行為驗收向使用者確認

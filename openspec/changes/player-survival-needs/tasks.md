## 1. 常數（config/world.ts）

- [ ] 1.1 新增具名常數：`PLAYER_NOURISHMENT_DECAY_PER_TICK`、`PLAYER_STARVATION_THRESHOLD`、`PLAYER_VIGOR_STARVATION_DECAY_PER_TICK`、`PLAYER_VIGOR_RECOVERY_THRESHOLD`、`PLAYER_VIGOR_RECOVERY_PER_TICK`、初值常數，速率以 TICKS_PER_HOUR 為基準（健康→挨餓落在數小時牆鐘）

## 2. 需求模型與對帳純函數（projections/playerSurvival.ts）

- [ ] 2.1 定義需求狀態型別 `{ asOfTick, nourishment, vigor, alive }` 與初值 seed
- [ ] 2.2 `reconcile(state, currentTick)` 純函數：溫飽衰退（封底 0）、低溫飽扣 vigor、足溫飽回復 vigor（封頂 100）、vigor≤0→alive=false
- [ ] 2.3 `PlayerSurvivalProjection`：每帳號最新狀態 + `PLAYER_SURVIVAL_BOOT_EVENT_TYPES`
- [ ] 2.4 單元測試：衰退/挨餓/回復/封頂底/死亡，皆以 elapsedTicks 決定性驗證

## 3. Commands / Events（kernel/livingWorldCommands.ts）

- [ ] 3.1 `PLAYER_NEEDS_RECONCILED`（新狀態 + asOfTick）+ validator
- [ ] 3.2 `PLAYER_DIED`（tick + cause=starvation）+ validator
- [ ] 3.3 玩家首次進入 seed 需求初始化路徑
- [ ] 3.4 對帳事件節流：僅跨 ≥1 整數 tick 且值變才發

## 4. Runtime boot 接線（sim/runtime.ts）

- [ ] 4.1 `PlayerSurvivalProjection.rebuildFromEvents` 接入**小 log 完整重建**分支
- [ ] 4.2 同接入**大 log availability-first boot** 分支（v0.25.3/v0.87.3 鐵則）
- [ ] 4.3 boot 重建測試（兩條分支皆還原最新狀態）

## 5. API 與死亡 gate（http）

- [ ] 5.1 `GET /api/player/needs`（authenticated）→ reconcile 到 currentTick 的 `{ nourishment, vigor, alive, asOfTick }`
- [ ] 5.2 玩家寫入型互動（hunt/fish/dialog 等）在 alive=false 時回明確錯誤；唯讀不受影響
- [ ] 5.3 API 測試：對帳值、未登入、死亡 gate

## 6. 前端處境 HUD（web）

- [ ] 6.1 `api/client.ts` 加 `playerNeeds(token)`
- [ ] 6.2 `components/game/SurvivalHud.tsx`：兩條需求條 + 瀕危脈動張力 + 狀態句 + 死亡倒下狀態（SP-UI token、font-data）
- [ ] 6.3 `pages/HubPage.tsx` 主畫面中央掛 HUD；透過既有 SSE/polling 節奏更新
- [ ] 6.4 前端測試：健康/挨餓/瀕危/死亡區間呈現

## 7. 驗證與收尾

- [ ] 7.1 `npm --workspace packages/server exec vitest run` 全套綠
- [ ] 7.2 `npm run build`（server + web）clean
- [ ] 7.3 更新 PROGRESS.md（含 design doc 連結與 SP1 範圍）
- [ ] 7.4 commit；push/部署時機與 live 視覺/行為驗收向使用者確認

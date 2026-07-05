## 1. AmbientNarrator 背景自主刷新

- [x] 1.1 在 `ambientNarrator.ts` 新增具名常數 `AMBIENT_BACKGROUND_REFRESH_PERIOD_TICKS`（預設 6），含註解說明速率與成本封頂語意
- [x] 1.2 新增 `backgroundRefresh(currentTick, allTileIds, getContext)` 方法：成本閘門（無 active key 且無 OpenCode → no-op）、僅在 `currentTick % AMBIENT_BACKGROUND_REFRESH_PERIOD_TICKS === 0` 執行、於所有 tile 中挑 `generatedAtTick` 最舊者（缺 cache = 最舊，同 tick 多候選以 tileId 字典序決定性挑選）、沿用 `inflight` 去重、走既有 `runRefresh`
- [x] 1.3 背景挑選略過「過去 `RECENT_VISITOR_WINDOW_TICKS` 內已被 recent-visitor refresh 涵蓋」的 tile，避免與 `tickRefresh` 重複生成同一 tile

## 2. Runtime tick listener 接線

- [x] 2.1 在 `runtime.ts` attachAmbientNarrator 的 tick listener 中，於既有 `tickRefresh` 之後呼叫 `backgroundRefresh`，傳入全 world tile id 清單（`MAP_TILES.map(t => t.id)`，與 AreaStateEngine seed 同源）與既有 `buildAmbientContext`
- [x] 2.2 確認傳入的 tile 清單來源單一、與 view-time context 組裝完全一致（沿用 `buildAmbientContext`，不另起 context 組裝路徑）

## 3. 測試

- [x] 3.1 `ambientNarrator` 新測試：已配置 key、無 visitor 時，跨 period 邊界後最舊 tile 被刷新並寫入 cache
- [x] 3.2 速率封頂測試：單一 period 內背景最多 1 次生成（+ 非 period 整數倍 tick 不動作）
- [x] 3.3 零成本測試：無 active key 且無 OpenCode 時 `backgroundRefresh` 不觸發任何 AI 呼叫（mock 呼叫計數驗證）
- [x] 3.4 去重測試：tile 已 in-flight 時背景跳過；recent-visitor 已涵蓋的 tile 背景不重複挑
- [x] 3.5 決定性測試：多個從未生成的 tile，挑選順序穩定（字典序）+ round-robin 讓位

## 4. 驗證與收尾

- [x] 4.1 `npm --workspace packages/server exec vitest run` — 1311/1312 通過；唯一失敗為 `npc.test.ts` OpenCode 20ms-timeout failover 測試（與本change無關，單獨重跑 11/11 綠，全套高負載下 timing flaky）
- [x] 4.2 `npm run build`（server + web）clean（`build:server` tsc 已綠；full build 確認中）
- [ ] 4.3 本機跑起 server，觀察 log：無玩家觀看下 `[ambient] generating for <tile>` 仍以背景節奏出現（已配置 key 時）—— **保留待使用者方便時做**（避免在使用者使用線上世界時重啟 pod）
- [~] 4.4 更新 PROGRESS.md + commit（已做）；**push 保留批次處理**（push main = rollout 重啟線上 pod，待使用者確認時機）

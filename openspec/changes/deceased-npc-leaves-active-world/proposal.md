## Why

在 live v0.87.2 上，玩家可以走到死掉的 NPC 旁邊，跟他聊天、買賣、介入他與別人的爭執，畫面上死人跟活人一模一樣在走路、做事。這跟 `docs/WORLD_CAPABILITIES.md §43.1` 第一條「當某個 NPC 死亡，後代會記得他」的根本前提 — 「死亡是真實狀態變更」 — 直接衝突。

根因不是顯示層問題，是死亡狀態從 sim → API → web 全鏈路都漏接。`NpcMortalityProjection` 自 v0.32.0 起就有 `isDeceased(npcId)`，但只在 3 個 planner 內被檢查：

| 層級 | 檢查 `isDeceased`？ | 後果 |
|---|---|---|
| `NpcEngine.tick()` (npcEngine.ts:557) | ❌ 否 | 死人繼續 decide / move / activity |
| `runtime.getNpcs()` (runtime.ts:1321) | ⚠️ 加 `deceased: boolean` 但不過濾 | 客戶端拿到完整一份「活著的死人」 |
| `ServerNpc` 型別 (client.ts:126) | ❌ 沒宣告 `deceased` | TS 把欄位丟掉 |
| `NpcSummary` 型別 (state/types.ts:40) | ❌ 沒宣告 | 同上 |
| `toNpcSummary()` (WorldStateContext.tsx:347) | ❌ 沒 copy | 同上 |
| `AreaScene` (game/AreaScene.ts:1622) | ❌ 全畫 | 死人精靈跟活人一樣動 |
| `POST /api/npc/:npcId/interact` | ❌ 只查 `findProfile` | **可跟死人聊天** |
| `POST /api/npc/:npcId/dialog-hold` | ❌ 同上 | **可 hold 死人 dialog** |
| `POST /api/npc/intervene` | ❌ 同上 | **可調解兩個死人吵架** |
| `GET /api/npc/:npcId/greet` | ❌ 同上 | 死人會打招呼 |
| `GET /api/npc/:npcId/history` | ❌ 同上 | 可查跟死人的歷史對話（這個可以留，純讀） |

合計 7 個獨立 surface 全壞。任何一條沒補就還是看得到 / 摸得到死人。本變更把「死亡」做成全鏈路一等狀態。

## What Changes

- **Sim 層**：`NpcEngine.tick()` 接受 `deceasedNpcIds: ReadonlySet<string>`（從 `NpcTickContext` 傳入），主迴圈 `for (const profile of this.profiles)` 第一行就 `if (deceasedNpcIds.has(profile.id)) continue`。死亡 NPC 的 `NpcRuntimeState` 凍結在死亡 tick 的最後快照，不再被更新或寫出。
- **Runtime 層**：`runtime.tick()` 從 `npcMortalityProjection` 取得 `deceasedSet` 傳入 `npcEngine.tick(context)`。其他每 tick planner（intent / belief / memory / cognitive）若會修改 NPC 狀態，同樣加 mortality gate。
- **API 層**：`runtime.getNpcs()` 預設**過濾掉** deceased，回傳給普通客戶端的 `ServerNpc[]` 不含死人。新增 `runtime.getNpcsIncludingDeceased()` 供 admin/lineage/chronicle 路徑使用。`/api/npcs` 預設只回傳活著的；admin 路徑用新方法。
- **Interaction 路由**：在 `packages/server/src/http/npc.ts` 加共用 helper `requireLivingNpc(runtime, npcId, res)`：若 `isDeceased` 回 `410 Gone { error: 'NPC_DECEASED', message: '這位 NPC 已經不在世上。' }`。套用到 `/interact`、`/dialog-hold`、`/intervene` (兩個 NPC 都檢查)、`/greet`。`/history` 保留唯讀，可查死人對話史。
- **前端型別 / 渲染**：
  - `ServerNpc` 加 `deceased: boolean`
  - `NpcSummary` 加 `deceased: boolean`
  - `toNpcSummary` copy 過去
  - `WorldStateContext` 在進場前過濾 `deceased === true`（雙重保險）
  - `NpcDialog` / `AreaPage` 點擊 dead NPC 顯示「這位 NPC 已經不在了」的 toast（萬一狀態 race 進來）
- **驗證**：寫一個 e2e-ish 測試：建一個 NPC、發 `NPC_DECEASED`、驗證 `/api/npcs` 不出現他、`/api/npc/:id/interact` 回 410、`npcEngine` 下個 tick 不再寫他的 state。
- **不動的部分**：admin lineage tree、chronicle、history-arcs 仍能看到 deceased NPC — 死人在「世界記憶」內可見，只是不在「活著的世界」內可互動。`/api/npc/:npcId/history` 玩家對死人的歷史對話保留可查。

## Capabilities

### New Capabilities
- `deceased-npc-isolation`: requirements covering: NpcEngine 對 deceased 的 tick gate、`runtime.getNpcs()` 預設過濾語意、admin 路徑保留死人可見性、5 個 interaction endpoints 對 deceased 的 410 拒絕、前端型別與渲染過濾、`/history` 唯讀路徑的例外保留。

### Modified Capabilities
- `npc-lineage`: 加一條 requirement — 死亡狀態 MUST 在 sim tick gate / public `/api/npcs` / 互動 endpoint 三個 surface 全部生效。`npc-mortality-lineage` archived spec 沒有覆蓋這個 — 它只規範「死亡事件本身」，沒規範「死亡後 NPC 該從活躍世界消失」。

## Impact

- **Code**:
  - `packages/server/src/sim/npcEngine.ts` — `tick()` 主迴圈 + `NpcTickContext`
  - `packages/server/src/sim/runtime.ts` — 過濾 `getNpcs()`、新增 `getNpcsIncludingDeceased()`、把 deceasedSet 傳給 npcEngine
  - `packages/server/src/http/npc.ts` — 5 endpoints 加 mortality gate；新 helper
  - `packages/server/src/http/world.ts`（`GET /api/npcs`）— 確認預設行為對齊
  - `packages/server/src/http/adminNpcsRouter.ts` / `adminLineageRouter.ts` — 改用 `getNpcsIncludingDeceased`
  - `packages/web/src/api/client.ts` — `ServerNpc.deceased`
  - `packages/web/src/state/types.ts` — `NpcSummary.deceased`
  - `packages/web/src/state/WorldStateContext.tsx` — `toNpcSummary` 帶 `deceased`，並在 `npcs` 列表處過濾（屬於雙重保險）
  - `packages/web/src/pages/AreaPage.tsx` / `NpcDialog.tsx` — 點到死人 NPC 顯示 toast；不再開 dialog
- **Tests**:
  - `npcEngine` deceased gate 單元測試
  - `runtime.getNpcs()` 過濾測試
  - `/api/npc/:id/interact` 410 整合測試（含 `/dialog-hold`、`/intervene`、`/greet`）
  - `/api/npc/:id/history` 仍可查（不被擋）
  - 前端 `toNpcSummary` 帶 `deceased` 測試
- **Replay / 既有資料**: 完全相容。新增的是過濾/拒絕路徑，不改 EventLog 結構。
- **Live 影響**: 部署後玩家若 cache 了死人的 npcId 觸發 `/interact` 立即 410；下一次 `/api/npcs` poll 後死人就從畫面消失。沒有 schema migration。
- **與 matured-child-inheritance 的關係**: 這是 v0.87.3 hotfix，independent；可在 inheritance v0.88.0 之前先 ship。inheritance change 沒有依賴本 change。

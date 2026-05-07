## 1. Spec & 規劃

- [x] 1.1 在 `openspec/changes/living-world-runtime/specs/living-world/spec.md` 寫出 5 個 Priority 完整 contract
- [x] 1.2 建立 proposal.md 與 tasks.md（本檔）

## 2. Priority 1 — NPC Persistent State

- [x] 2.1 新增 `npc_state` SQLite 表：`npc_id, current_tile, intratile_x, intratile_y, mood, health, current_activity, faction, target_tile, last_acted_tick`
- [x] 2.2 為 `NpcProfile` 增 `faction`、`schedule[]`（含 `activity`），保持向後兼容（缺欄位走 default）
- [x] 2.3 `npc-engine.ts`：rehydrate 既存 NPC state；缺資料就以 profile defaultLocation + activity:'idle' 初始化

## 3. Priority 1 — Tick Decision Engine

- [x] 3.1 `decideTargetTile(profile, tickOfDay)`：根據 schedule slot 解出目的 tile
- [x] 3.2 `pathStep(currentTile, targetTile, mapTiles)`：BFS 4-連通找下一格
- [x] 3.3 `decideActivity(profile, atTarget, slot, mood, health)`：選 move/work/eat/sleep/idle
- [x] 3.4 NPC 同 tile 互動：每 tick 隨機機率（deterministic seeded by tick+npcId pair）兩兩 NPC 觸發 `NPC_INTERACT` 事件
- [x] 3.5 mood/health 隨活動緩慢漂移（睡覺回 health、爭執降 mood、休息回 mood）

## 4. Priority 1 — Event Emission

- [x] 4.1 NPC 從 tile A → tile B 一步：emit `NPC_MOVE` narrative event with `{from, to, activity}`
- [x] 4.2 NPC 改變 activity（不一定移動）：emit `NPC_ACTIVITY` 事件
- [x] 4.3 NPC 互動：emit `NPC_INTERACT` 事件，含參與者 ids 與 deterministic 描述
- [x] 4.4 SSE 通道無需改動；既有 narrative event 推送會自動帶過去
- [x] 4.5 `npc_state` 變更以 `FACT_SET` 寫回 EventLog（current_tile/activity/mood/health）方便重啟還原

## 5. Priority 1 — API surface

- [x] 5.1 `/api/npcs` 回傳新增 `activity, mood, health, faction, targetTile` 欄位
- [x] 5.2 `WorldStateContext` 對應更新 ServerNpc / NpcSummary 型別
- [x] 5.3 NpcSummary `activity` 字串以 i18n key 對應顯示

## 6. Priority 1 — Frontend (Phaser AreaScene)

- [x] 6.1 NPC sprite 加入隨機 idle wander tween（在 sprite 起始點周圍 ±20px 內漂移）
- [x] 6.2 sprite 上方 nameLabel 下方加 activity 行，顯示「工作中 / 休息 / 移動中 / 用餐 / 睡眠」
- [x] 6.3 sprite 朝向：依漂移方向左右翻轉（簡化版方向感）
- [x] 6.4 NPC 在 tile 變更（透過 SSE）導致 mapNpcs prop 變化時，refreshNpcSprites 重建並保留 wander tween

## 7. Bug Fixes

- [x] 7.1 `NpcDialog.tsx`：useEffect deps 改為 `[npc?.id]`，把 `onClose` 用 `useRef` 持有
- [x] 7.2 `npc.ts` HTTP route：fallback 路徑 greet 加入 cooldown（每 NPC 每 TICKS_PER_HOUR 最多 +1）
- [x] 7.3 `aiDialog.ts` prompt：強制 trustDelta 預設 0，只有具體價值才偏離；clamp 上限改為 +2

## 8. Verification & Deploy

- [x] 8.1 `npm run build`（server + web）
- [x] 8.2 `npm test` (server vitest)
- [x] 8.3 bump 版本：`server/package.json`、`web/package.json`、`packages/server/src/version.ts`、`packages/web/src/version.ts` 至 **0.9.0**
- [x] 8.4 commit + push 到 `claude/romantic-meninsky-2a3888`
- [x] 8.5 SSH 到 deploy host 並執行 docker rebuild & restart
- [x] 8.6 OpenSpec 此 change 待 `openspec archive living-world-runtime` 收尾

## 9. Out of Scope (本 change 不做)

- Priority 2 World Pressure 實作
- Priority 3 Persistent Traces 實作
- Priority 4 Ambient Narration AI Pipeline 拆解
- Priority 5 Continuous Events 引擎（已存在 WorldEventEngine 是子集，但完整版留待後續）

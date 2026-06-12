## Why

Three presentation/autonomy gaps remained visible in the live world at v0.87.12:

1. **角色呈現是「方塊火柴人」** — `characterAvatar.ts` 畫的是純色方塊軀幹 + 圓頭，無陰影、無臉、無髮型、無連續動作循環；動作 pose 是靜態旋轉。世界裡的「人」看起來像佔位符。
2. **卡牌幾乎全是 rank 色塊** — 100 張定序卡只有極少數有 GM 上傳插畫；其餘在 Codex / 掉落面板顯示一個帶字母的色塊。卡牌系統的世界觀感（10 大類別、5 階稀有度）完全沒有視覺表達。
3. **NPC 自主意識斷在兩處** — (a) `NPC_LIFE_GOAL_SET` 事件已存在（cityLife 每 30 tick 對壓力最高的 NPC 發出），但沒有 projection、不注入對話、也不回饋行動層：NPC「立了志」卻既不能談它、行為也不受它影響。(b) `HOUSEHOLD_INHERITANCE_ASSIGNED` 從未被任何 planner 發出：NPC 死亡時名下 goods 永遠凍結在死人身上，§43.1「後代承接生活」的物質面斷鏈。

## What Changes

- **2.5D 程序化角色**（`packages/web/src/game/characterAvatar.ts` 重寫，對外 API 不變）：地面陰影 + 軀幹體積陰影 + id 播種的膚色/髮色/髮型/褲色 + 雙眼朝向 + 關節原點手腳 + 場景 update 驅動的連續動作循環（走路擺臂擺腿與 bob、呼吸、工作敲打、吃飯、交易手勢、睡姿）。三個場景（Area / Map / Building）零修改沿用。
- **確定性程序化卡面**（`packages/web/src/components/game/cardArt.tsx` 新檔）：依 card id 播種的 SVG 插畫，10 大類別各有主題構圖與配色，rank 決定外框/光暈層級。`CardImage` fallback 順序變為：GM 上傳圖 → 程序化卡面 → rank 色塊（無 id 時）。Codex 格狀清單、卡牌詳情、掉落面板、Admin 卡牌頁全部接上。
- **NPC 人生目標 grounding**（server）：新 `LifeGoalsProjection`（NPC_LIFE_GOAL_SET → 每 NPC 最新目標），小 log boot 完整重建、大 log availability-first boot 依 v0.87.13 OOM 政策走 live-derive fallback；`getFormattedLifeGoalContext` 注入 AI 對話（4 檔模式同 v0.50 belief）；`computeIntentStack` 新增 `lifeGoalBoost` 參數，目標方向對應的 intent kind 獲得壓力比例偏壓（封頂 0.25）。
- **NPC 遺產轉移**（server）：新 pure planner `planInheritanceTransfers`；mortality cadence 對有繼承人且有遺產的死者發出 `HOUSEHOLD_INHERITANCE_ASSIGNED`（payload 新增 `goods` 清單）；`GoodsInventoryProjection` 處理該事件把 npc:deceased 庫存搬到 npc:heir。無 `goods` 的舊事件 shape 視為 no-op（向後相容）。

## Capabilities

### New Capabilities
- `character-visual-presentation`: 2.5D 角色渲染與連續動作循環。
- `card-art-fallback`: 確定性程序化卡面與 fallback 順序。
- `npc-life-goal-grounding`: 人生目標投影、對話注入、intent 偏壓。
- `npc-estate-inheritance`: 死亡時 goods 遺產轉移。

### Modified Capabilities
- _None._（`HOUSEHOLD_INHERITANCE_ASSIGNED` payload 為向後相容的加欄位。）

## Impact

- **Code**: `packages/web/src/game/characterAvatar.ts`（重寫）、`packages/web/src/components/game/cardArt.tsx`（新）、`CardImage.tsx` / `CodexPage.tsx` / `CardDropPanel.tsx` / `AdminCardsPage.tsx`（接線）；`packages/server/src/projections/lifeGoals.ts`（新）、`sim/inheritancePlanner.ts`（新）、`sim/intentPlanner.ts`、`sim/runtime.ts`、`kernel/livingWorldCommands.ts`、`projections/goodsInventory.ts`、`npcs/aiDialog.ts`、`http/npc.ts`。
- **Tests**: lifeGoals / inheritancePlanner / goodsInventory（繼承轉移 + legacy no-op）/ intentPlanner（lifeGoalBoost）/ aiDialog（buildLifeGoalBlock）。
- **Replay**: 新事件 shape 為加欄位；舊 log replay 行為不變。LifeGoalsProjection 接小 log full rebuild；大 log availability-first boot 依 v0.87.13 OOM 政策刻意不深度補水，對話注入由 live-derive fallback 降級。
- **AI dialog**: lifeGoalContext 帶反幻覺規則塊（不可虛構目標以外的人生規劃）。

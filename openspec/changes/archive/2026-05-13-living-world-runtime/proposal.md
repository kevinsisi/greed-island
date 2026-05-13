## Why

潮鳴市目前只是一個會自動換天氣與循環行程槽的 stage 背景：NPC 永遠站在
固定位置等玩家點擊，世界除了天氣 / 季節 / 紋卡 drop 沒有任何持續演化，
AI 同時負責產出對話內容並決定信任度與意圖（雙重身份）。結果是 — 玩家
登入 → 點圖示 → 看一句台詞 → 登出，世界在你不在時等於停擺。

「Living World Runtime Improvement Plan」要把整個世界改造成在玩家不
在線時也持續推進的活體：NPC 有真正的狀態與行程、世界本身會擴張與衰
退、事件會在地圖與 NPC 上留下可觀察的痕跡、AI 退到只負責敘事描述、
事件由世界自身產生而非玩家觸發。

這份 change 涵蓋整體規劃；**Priority 1 (NPC Schedule System)** 為第一
階段實作目標，其他四個 Priority 只在本 change 內留下 contract 層級的
spec，實際代碼留待後續 change 處理，避免單次變更過大。

## What Changes

整體 5 個 Priority 的設計：

1. **NPC Schedule System**（本 change 實作）
   - NPC 持續性狀態：location/mood/health/current_activity/faction
   - 三段式行程：morning / afternoon / night
   - 行為集合：move / trade / eat / sleep / interact / fight
   - 每個 tick：observe → evaluate schedule → choose action → submit command
   - tile-by-tile 移動（不瞬移），共 NPC 可在地圖上看到正在移動

2. **World Pressure System**（contract only）
   - faction 擴張：勢力會奪取相鄰 tile 的影響力
   - 資源衰退：每個 tile 有資源池，過度開採會枯竭
   - 環境壓力：天氣 / 季節影響 NPC 與資源
   - 怪物壓力：邊緣 tile 累積敵意，會反噬城內

3. **Persistent World Traces**（contract only）
   - 戰鬥 / 災害留下地圖破壞 marker
   - NPC 受傷 / 失蹤狀態持續顯示
   - 大量交易扭曲對應 tile 的價格 facts
   - 派系勝負後在 tile 上留下旗幟

4. **Ambient Narration Layer**（contract only）
   - 提取「敘事生成」與「事件生成」邊界
   - AI 只能讀 WorldState 並產生 zh/en 描述
   - AI 絕對不可寫 EventLog 也不可改 trust / mood / state

5. **Continuous World Events**（contract only）
   - 系統事件：節慶、天災、潮汐節
   - NPC 事件：派系衝突、結盟、走私
   - 突發事件：機率化怪物入侵、稀有紋卡浮現
   - 全部由 world rule 在 tick 中決定，不依賴玩家觸發

## Capabilities

### New Capabilities
- `living-world`：NPC schedule runtime + persistent NPC state +
  tile-by-tile pathing + co-located NPC interaction + 完整 5-priority
  contract spec。

### Modified Capabilities
- 無（建立在 `simulation-kernel` 與既有 `add-living-world-runtime`
  deterministic runtime 之上，但本 change 不更動其 contract）。

## Bug Fixes (bundled)

兩個現場 bug 一併在本 change 修：

- **NpcDialog SSE 重渲染洗掉輸入框**：`useEffect` deps 含父層每次重建
  的 `onClose`，每次 SSE tick 都觸發 reset，把 `draft` 清空。改為僅依
  `npc.id` 並用 ref 持有最新 onClose。
- **好感度過度膨脹**：`greet` 之前每點一次就 +1，導致玩家連點 quick
  intent 即可拉滿。改為加上 cooldown（每位 NPC 每 1 小時 in-world
  時間最多 +1），`ask` 與 `trade` 在 fallback 路徑保持 0；AI 路徑收
  緊 prompt 強制 default 為 0，只有具體有資訊 / 物品交換才得加分。

## Impact

- 依賴 `simulation-kernel` 的 EventLog / Reducer / Tick 模型。
- 實作面影響：`packages/server/src/sim/runtime.ts` 拆出 `npc-engine.ts`、
  新增 `npc_state` SQLite 表、`/api/npcs` 回傳擴充欄位（activity / mood
  / health）、`AreaScene.ts` 加 sprite 動畫、`NpcDialog.tsx` 修 useEffect。
- **不在範圍**：World Pressure / Persistent Traces / Ambient Narration /
  Continuous Events 的具體實作；那些只在本 change 留 capability spec
  作為後續 change 的 anchor。
- 版本：bumped to **v0.9.0**，含 docker deploy 與 push。

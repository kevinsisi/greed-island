## Context

使用者對世界呈現的判決：8-bit 風格但有 3D 立體感、靈動生機勃勃、人物不能醜、動物要有行為、每個 NPC 是 AI agent、事件流不能有內部垃圾、手機桌面皆完美。技術前提：Phaser 已開 pixelArt + FIT 縮放；憲法規定 AI 只能旁白與意圖分類。

## Goals / Non-Goals

**Goals:**
- 零外部美術資產：所有像素材質 runtime 程序化生成（generateTexture）。
- 「3D 感」用 bevel 磚面 + 高於 tile 的道具 + 落影達成，不動座標系（不做真等距投影 — 那會重寫三個場景的所有座標數學與點擊判定）。
- AI agent 嚴格走意圖分類：選擇題、server 算選項、AI 數字不採信、失敗靜默退回。
- 動物行為是顯示層演出；族群數量/獵殺仍 server 權威。

**Non-Goals:**
- 不做 three.js / 真 3D。
- 不做 BuildingScene 室內像素化（本版聚焦戶外兩場景；室內列下一版）。
- 不把 AI utterance 寫進 NPC 記憶/關係（純 read-only 自述）。

## Decisions

### Decision 1 — 8-bit=「dither+bevel 磚面」而非整片重繪地形
保留既有 per-cell 顏色邏輯（terrain mask / LAND_COLOR / district palette 全部不動），疊兩張小 texture（noise variant ×4 + bevel）。任何新地形型別自動獲得像素質感，回歸風險最小。

### Decision 2 — 動物行為機放 client
server 已有個體 id 與族群權威；獵殺走既有 onAnimalHunt 命令路徑。把 wander/flee/stalk 放 client 是「演出」不是「狀態」，不違反 kernel 原則，也避免 server 每 tick 模擬上百隻動物的 sub-cell 位置。

### Decision 3 — agent 是選擇題不是開放生成
開放式 AI 行動需要無界的合法性驗證；選擇題把驗證縮為「index 在範圍內」。選項即 server 確定性 intent stack —— AI 增加的是「在合理選項間的個性化取捨 + 語言化自述」，這正是「自我意志」的可驗證最小形。

### Decision 4 — utterance 上 ticker 而非 chat bubble
ticker 是現成公開敘事面，零新 UI；NPC 的聲音直接成為世界敘事的一部分（生機勃勃的最低成本實現）。chat bubble 列為後續 polish。

### Decision 5 — 事件衛生雙層修
根因（server null narration）+ 防禦（web 型別過濾）。只修 server 會留下歷史事件繼續污染 ticker；只修 web 則新 log 仍髒。

## Risks / Trade-offs

- **AI 成本**：上限 52 次/`NPC_AGENT_DECISION_INTERVAL_TICKS`；僅在 stack 非空時呼叫，實際遠低於上限。kv `npc_agent_enabled=false` 可一鍵關閉。
- **agent override 與確定性 planner 競寫**：兩者走同一 setIntentOverride 路徑與同一 anti-thrash 規則；agent 決策也會被更高 urgency 的 planner 結果覆蓋 — 接受（緊急生存 > 自主偏好）。
- **動物行為的 client 演出與 server 位置雜湊不同步**：獵殺判定用 animalId 不用座標，無一致性風險。
- **像素道具風格主觀**：樹已獲使用者認可（「樹的美術風格可以」）；人物/動物沿同一語彙。

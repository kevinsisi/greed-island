## Context

v0.87.12 的世界已具備完整 cognitive substrate（belief / intent / reflection / memory / relationship / mortality / lineage / life-goal events），但三個表達層斷鏈讓世界「看起來」與「聽起來」不像活的：角色是方塊火柴人、卡牌是色塊、NPC 不能談自己的人生目標、死人財產凍結。

## Goals / Non-Goals

**Goals:**
- 不動三個 Phaser 場景的前提下升級角色渲染（保持 `ProceduralAvatar` 合約）。
- 零外部圖檔資產：卡面與角色全程序化、確定性（同 id 永遠同畫面）。
- 人生目標閉環：事件 → 投影 → 對話表達 + 行動偏壓。
- 遺產轉移走 Command → Rule Engine → Event → Projection，不直接改庫存。

**Non-Goals:**
- 不做 sprite sheet / 外部美術管線（GM 上傳插畫仍優先於程序化卡面）。
- 不改 NPC_LIFE_GOAL_SET 的發出節奏（仍是 30-tick top-8 壓力）。
- 不做成年時刻的 civic 繼承 — 那是 `matured-child-inheritance` change 的範圍。

## Decisions

### Decision 1 — 角色動畫掛在 scene update，不掛 tween
走路/呼吸等循環需要無限重複且跟 action 即時切換；對每個 avatar 註冊一個 `Phaser.Scenes.Events.UPDATE` handler、在 container destroy 時解除，比管理 N 條 yoyo tween 的生命週期簡單，且 pose 切換零成本（讀 container data 的 action）。每角色相位由 id hash 錯開，避免全場齊步走。

### Decision 2 — 卡面是 React SVG 元件，不是產生的圖檔
SVG 隨主題 build 出貨、無 HTTP 請求、任意解析度清晰；mulberry32(cardId) 播種讓粒子位置/構圖微變每張卡唯一。category→motif 用 10 個手寫向量構圖。

### Decision 3 — 人生目標對話 context 的 fallback 是 live derive
`planLifeGoalCommands` 只對 top-8 壓力 NPC 發事件，多數 NPC 沒有 committed goal。對話注入時若投影為空，改用 `deriveNpcLifeView` 即時推導（read-only，不產生事件），讓每個 NPC 都能回答「你最近想做什麼」。

### Decision 4 — 遺產轉移重用 HOUSEHOLD_INHERITANCE_ASSIGNED 而非新事件
該事件的 household / deceased / heir / amount 語義正確且 HouseholdEconomyProjection 已消費 `amount`；只加 optional `goods` 清單讓 GoodsInventoryProjection 能搬庫存。舊 shape（無 goods）保持 no-op，舊 log replay 不變。與 `matured-child-inheritance` 的 NPC_INHERITANCE_GRANTED（成年 seed、非轉移）互補不衝突。

### Decision 5 — lifeGoalBoost 與 memoryUrgencyBoost 同型注入
`computeIntentStack` 加一個 optional 參數而不是改 weights 來源，保持 planner 純函數與既有測試不變。封頂 `LIFE_GOAL_INTENT_BOOST_MAX = 0.25`，量級與 reflection learning weights（0.5–1.5）相容。

## Risks / Trade-offs

- **每幀動畫成本**：~50 NPC × 每幀三角函數，可忽略；handler 在 container 不 active 時提前 return。
- **程序化卡面美術上限**：不如 AI 插畫精緻 — 接受，因為 GM 上傳圖永遠優先，程序化卡面只是把 baseline 從「色塊」抬到「有世界觀的構圖」。
- **live-derive fallback 與 committed goal 可能不一致**：NPC 30 tick 內需求變化會讓即時推導與最後承諾不同 — 接受，committed 優先，fallback 只在無事件時使用。

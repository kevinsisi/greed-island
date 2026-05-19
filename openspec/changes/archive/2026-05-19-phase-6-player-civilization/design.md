## Context

玩家目前只能做兩件事：NPC 對話（`PLAYER_INTERVENE`）與戰鬥牌（`COMBAT_PLAYER_ACTION`）。世界所有的物品、地圖事件、NPC 僱傭、陣營、領地宣稱都在玩家的視線之外運行。`PlayerStateStore`（`http/playerState.ts`）只追蹤對話信任值，不追蹤文明層的玩家狀態。

目標：讓玩家的文明行動走同一條 Command → Rule Engine → Event → Projection 管線，世界對玩家和 NPC 一致對待。

## Goals / Non-Goals

**Goals:**
- 新增 14 個玩家文明 Command 類型及 payload validator（物品、NPC 僱傭、建設、領地、陣營、牌卡）
- 新增 `PlayerCivilizationProjection`：per-account 錢包、僱傭 NPC 列表、陣營歸屬、已宣稱領地
- 新增 `POST /api/world/player-action` — 玩家提交文明指令入口
- 新增 `GET /api/world/player-state` — 回傳玩家文明快照
- 玩家行動進入 EventLog，chronicle renderer 產生中文旁白
- `PlayerCivilizationProjection` boot 時從 EventLog hydrate

**Non-Goals:**
- 遊戲 UI 的完整前端（只需後端 API 可通；UI 是後續工作）
- 複雜的規則引擎拒絕邏輯（此 phase 驗證 payload 合法性即可；高階業務規則留後）
- 玩家戰鬥行動（已在 `COMBAT_PLAYER_ACTION` 處理）
- 玩家 NPC 對話（已在 `PLAYER_INTERVENE` 處理）
- 持久化玩家錢包到 SQLite（此 phase 用 in-memory projection，boot hydrate 即可）

## Decisions

### D1 — 命令路由走 `runtime.submitCommand()`，不繞過 Rule Engine

玩家文明指令走 `POST /api/world/player-action`，payload 為 `{ type, payload }`，actorId 由 JWT 帶入。與 NPC 指令用同一個 `submitCommand` 入口，Rule Engine 驗證，結果進 EventLog。

替代方案：直接寫 DB。**拒絕**：違反 ARCHITECTURE.md §0.1（EventLog is the only truth source）。

### D2 — PlayerCivilizationProjection 在 `packages/server/src/projections/`，不在 HTTP 層

新 projection 放在 `projections/playerCivilization.ts`，與 `goodsInventory`、`livestockRegistry` 同一模式。Boot 時從 EventLog hydrate，fan-out 時即時 project。

現有 `http/playerState.ts` 是 NPC 對話 trust 的 SQLite store，**不修改**——職責不同。

### D3 — 14 個命令類型命名，`actor: 'player'` 為必填

所有新 player 文明命令在 payload 中必帶 `playerAccountId: string`（與既有 `PLAYER_INTERVENE` 一致）。Rule Engine validator 直接驗證 actorId 非空。

### D4 — chronicle narration 只引用 payload 中的具名實體

嚴格遵守反幻覺鐵則（CLAUDE.md）：旁白只能用 payload 中的 `playerAccountId`、`npcId`、`tileId`、`factionId`。不憑空捏造名字。

### D5 — `GET /api/world/player-state` 回傳 in-memory projection 快照

不走 `/api/world` 的全局 snapshot（避免污染），改用獨立 endpoint，authToken 識別 account，回傳該帳號的 `PlayerCivilizationRow`。

## Risks / Trade-offs

- [in-memory projection 不持久化] → 重啟後從 EventLog hydrate，不損失資料；boot 時間不受影響（player 命令量少）
- [Rule Engine 拒絕邏輯此 phase 最小化] → 玩家可發出一些「無效」文明命令（例如宣稱一個不存在的地塊），這些仍進 EventLog 只是 chronicle 不理；後續 phase 加嚴格驗證
- [API 無 rate limit] → 開發階段可接受；生產環境再加

## Why

玩家目前是純旁觀者——地圖上的物品（擬態徽菌 ×17）、NPC 交易、地圖事件（異常光點）全都看得到但無法介入。Phase 6 把玩家從旁觀者變成文明參與者：玩家的每個行動走相同的 Command → Rule Engine → Event 管線，世界對玩家和對 NPC 完全一致，玩家離線後世界繼續正常運行。

## What Changes

- 新增玩家物品互動指令：`PLAYER_PICKED_UP_GOODS`、`PLAYER_TRADED_GOODS`、`PLAYER_HUNTED_ANIMAL`、`PLAYER_FISHED`、`PLAYER_DOMESTICATED_ANIMAL`、`PLAYER_PROTECTED_REGION`
- 新增玩家 NPC 互動指令：`PLAYER_HIRED_NPC`、`PLAYER_DISMISSED_NPC`
- 新增玩家文明建設指令：`PLAYER_SPONSORED_CONSTRUCTION`、`PLAYER_FOUNDED_SETTLEMENT`、`PLAYER_CLAIMED_TERRITORY`
- 新增玩家陣營指令：`PLAYER_JOINED_FACTION`、`PLAYER_LEFT_FACTION`、`PLAYER_LED_FACTION`
- 新增玩家牌卡指令：`PLAYER_PLAYED_CARD`（世界層，非戰鬥）
- 新增 `PlayerStateProjection`：追蹤每位玩家的錢包、僱傭 NPC 列表、所屬陣營、已宣稱領地
- 每個玩家 Command 提交後，鄰近 NPC 的旁白與對話可引用該玩家行動
- 玩家長時間離線後仍出現在 NPC 對話 + history projection 的記憶中
- HTTP API：新增 `POST /api/player/action` 接受玩家指令；`GET /api/player/state` 回傳玩家快照

## Capabilities

### New Capabilities

- `player-civilization`: 玩家指令類型定義、PlayerStateProjection、玩家行動規則引擎驗證、玩家快照 API

### Modified Capabilities

- `living-world`: 新增 14 個玩家 Command payload 類型到 `LivingWorldCommandPayload` union
- `event-motivation-chronicle`: 新增玩家行動的中文 chronicle 旁白（物品採集、交易、雇傭、陣營加入、領地宣稱）

## Impact

- `packages/server/src/kernel/livingWorldCommands.ts` — 新增 14 個玩家 command 類型及 payload
- `packages/server/src/projections/playerState.ts` — 新 projection（錢包、NPC 僱傭、陣營、領地）
- `packages/server/src/sim/runtime.ts` — PlayerStateProjection 接入 boot hydration、fan-out、snapshot facts
- `packages/server/src/http/` — 新增 playerRouter（action endpoint + state endpoint）
- `packages/server/src/kernel/chronicleRenderer.ts` — 玩家行動旁白
- `packages/web/src/pages/AdminWorldPage.tsx` — 玩家狀態觀察區塊（選填）

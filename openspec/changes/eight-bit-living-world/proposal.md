## Why

使用者對 v0.88.0 的世界呈現給出四個明確判決：

1. **「整體美術不是我要的，我要類似 8-bit 風格但還是 3D 的世界，要非常靈動、生機勃勃」** — v0.88.0 的 2.5D 向量小人被評為「太醜」；地形仍是棋盤色塊 + emoji 佔位。
2. **「確保每個 NPC 都有自我意志，每個人都是 AI agent」** — 既有的 intent planner 是確定性規則；NPC 沒有真正的 AI 決策時刻。
3. **「確保世界事件不是一堆智障」** — 「世界正在發生」ticker 充斥 `internal area state projection` 內部投影事件。
4. **「好好處理動物，呈現該有的行為」+「所有 UI/UX 手機與桌面都要完美顯示」** — 動物是靜態 emoji 圓點；Codex/Market 在 390px 破版。

## What Changes

- **8-bit 像素世界**（web）：新 `pixelWorld.ts` 程序化像素材質 — 每個地形 cell 疊確定性 dither 雜訊 + 上亮下暗 bevel（體素磚感）；21 種像素道具（樹/松/屋/商鋪/神社/城樓/水晶/錨/船…）取代 emoji 佔位，比 tile 高 + 落影 = 2.5D 立體；水面波光閃爍。AreaScene / MapScene 兩場景接上。
- **8-bit 像素人**（web）：`characterAvatar.ts` 重寫為 texture-based — 白底灰階軀幹/腿（tint 衣色/褲色）、5 膚色頭、7 髮色×3 髮型、雙幀走路 + 舉鎚工作幀 + 呼吸/睡姿；場景換色 API 從 `body.setFillStyle` 改為 `applyAvatarOutfitColor`。
- **動物行為呈現**（web）：新 `pixelAnimals.ts` — 23 物種 5 體型原型（四足/鳥/魚/蟹/蛇）白底像素 sprite + 物種色 tint、雙幀步行；`AnimalActor` 顯示層行為機（漫遊、吃草 bob、玩家靠近時非掠食者逃離、掠食者潛行逼近）；群聚（≥6）以 3 隻代表 + 數量呈現；環境生命層（飛鳥橫越/蝴蝶遊蕩/林地落葉）。
- **NPC AI agent**（server）：新 `NPC_AGENT_DECISION` command/event — AI 以憲法允許的「意圖分類」身分，在 server 用確定性 intent stack 算好的**合法選項**（follow_schedule + 各 intent 候選）中替 NPC 做選擇；urgency/targetTile 一律採 server 值，AI 只貢獻 choice/reason/utterance；`NpcAgentRunner` 以 `NPC_AGENT_DECISION_INTERVAL_TICKS` 錯相排程、非阻塞、AI 不可用時靜默退回確定性 planner；utterance 以「喃喃自語」narration 上公開 ticker（世界的聲音）。
- **世界事件衛生**（server+web）：`AREA_STATE_RECORDED` / `NPC_STATE_RECORDED` 的 placeholder narration 改為 null（根因）；web `eventVisibility` 把投影類事件型別列入內部過濾（防禦）。
- **響應式修正**（web）：Codex 卡格 390px 從 5 欄改 4 欄（sm 6 / md 8 / lg 10）；Market 在 <sm 改卡片式清單；過時的 `web/version.ts`（0.24.2）跟上版本。

## Capabilities

### New Capabilities
- `eight-bit-pixel-world`：像素地形/道具/人物渲染。
- `animal-behavior-presentation`：動物像素 sprite 與顯示層行為機 + 環境生命。
- `npc-ai-agent`：每 NPC AI 自主決策（意圖分類路徑）。
- `world-feed-hygiene`：公開事件流不得出現內部投影事件。

### Modified Capabilities
- _None._（角色換色 API 為內部重構；ProceduralAvatar 對外仍由場景內部使用。）

## Impact

- **Code**: `packages/web/src/game/{pixelWorld,pixelAnimals,characterAvatar}.ts`（新/重寫）、`AreaScene.ts`/`MapScene.ts`/`BuildingScene.ts`（接線）、`eventVisibility.ts`、`CodexPage.tsx`、`MarketPage.tsx`；`packages/server/src/npcs/{npcAgent,npcAgentRunner}.ts`（新）、`kernel/livingWorldCommands.ts`、`sim/runtime.ts`、`http/server.ts`、`config/world.ts`。
- **Tests**: npcAgent（options/prompt/parse）、NPC_AGENT_DECISION validator、eventVisibility 投影過濾。
- **AI 成本**: 每 NPC 每 `NPC_AGENT_DECISION_INTERVAL_TICKS`（=TICKS_PER_HOUR）一次、只在有真實抉擇（intent stack 非空）時呼叫；52 NPC ≈ 最多每 70 秒一次。
- **憲法**: AI 僅做意圖分類與 read-only 自述；所有狀態變更仍走 Command → Rule Engine → Event → 投影。
- **生存動機/學習/開拓**: 既有系統已涵蓋 — 學習（skillXp + mentorship + reflection learning weights）、生存（needs/beliefs/intent）、開闢世界（CONSTRUCTION_INITIATE + MAP_TILE_UNLOCKED + v0.84.0 動態 tile）；本 change 把這些動機接上 AI 自主決策與可見的動物行為。

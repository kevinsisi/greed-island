# Tasks — World Pressure 視覺化 + Dialog 修復 v0.14.0

## Server

- [x] `geminiClient.ts`：`GeminiGenerationOptions` 加 `thinkingBudget?`，傳到 `generationConfig.thinkingConfig.thinkingBudget`
- [x] `geminiClient.ts`：「Gemini returned no text candidate」錯誤訊息附帶 `finishReason`
- [x] `aiDialog.ts`：`generateAiReply` 把 `thinkingBudget: 0` 加進 generation options
- [x] `areaStateEngine.ts`：`AreaState` 新增 `pressureCooldowns?`，hydrate / persist 都讀寫
- [x] `areaStateEngine.ts`：threshold-crossing recovery 事件（`recovery.food_restored` / `recovery.safety_restored` / `recovery.economy_restored`）
- [x] `areaStateEngine.ts`：派系跨過 60 但未到 80 → `faction.rising` 事件
- [x] `npcEngine.ts`：`NpcRuntimeState` 加 `personalityOverride?`，hydrate / equality / dirty 都跟著走
- [x] `npcEngine.ts`：`NpcTickContext.npcsInsideBuildings` + Phase 2 互動排除這些 NPC
- [x] `npcEngine.ts`：`computePersonalityNudge` 嚴格 role-based（entertainer talkativeness ≥ 0.9 / outsider greed≥0.4 patience<0.6）
- [x] `npcEngine.ts`：`injectCrossTileWanderIfStuck` 嚴格 role-based（entertainer / outsider / 獵人 / 流浪 / 報童）
- [x] `runtime.ts`：在 `npcEngine.tick()` 前算 areaSafety / areaEconomy / npcsInsideBuildings 傳入 context
- [x] vitest 全綠（82 通過）

## Web

- [x] `client.ts`：`worldSinceLastVisit` + `ServerCatchUpSummary` / `ServerWorldSinceLastVisit` 型別
- [x] `MapScene.ts`：`MapAreaOverlay` 型別 + `refreshAreaOverlay()` 畫 safety/economy/faction 蓋層
- [x] `PhaserGame.tsx`：`areaOverlays` prop 傳到 scene 並在 props 變動時呼叫 `applyExternalUpdate`
- [x] `HubPage.tsx`：30 秒 polling `/api/areas` → 算 `MapAreaOverlay[]` 餵 PhaserGame
- [x] `HubPage.tsx`：`mapNpcs` 過濾 `activity === 'move'`，主地圖只畫跨區移動中的 NPC
- [x] `AreaScene.ts`：`AreaMapNpc` 加 `mood?` / `health?`；mood<30 → 灰名字、health<30 → 🤕；tween/dispose 帶上 healthIcon
- [x] `AreaPage.tsx`：把 `npc.mood` / `npc.health` 餵進 `AreaMapNpc`
- [x] `SinceLastVisitPanel.tsx`：合併 cards + world summary 的 modal，事件 row 點擊跳 `/area/:tileId`
- [x] `HubPage.tsx`：移除舊 toast，改 render `<SinceLastVisitPanel>`
- [x] tsc --noEmit 全綠

## Player Intervene + Combat Spec（同 commit）

- [x] `kernel/livingWorldCommands.ts`：新增 `PLAYER_INTERVENE` 命令型別 + `PlayerIntervenecmd` payload + validator
- [x] `sim/runtime.ts`：新 `submitLivingWorldCommand(command)` 對外入口，把 player command 走 Rule Engine 後寫進 EventLog + fan out projections
- [x] `http/npc.ts`：`POST /api/npc/intervene` 接 `mode` 或 `message`，自由文字用 Gemini classify 成 intent，build typed Command 走 Rule Engine
- [x] `npcs/geminiClient.ts`：`thinkingBudget` option 也讓 classifyInterventionIntent 用
- [x] `web/src/api/client.ts`：`npcIntervene(token, npcA, npcB, mode)` API method
- [x] `COMBAT_ARCHITECTURE.md`：repo 根新增完整戰鬥架構準則
- [x] `openspec/changes/combat-system/`：proposal + tasks + spec 三檔
- [x] `openspec/changes/player-intervene-and-combat/proposal.md` 更新，指向新 combat-system

## Release

- [x] `version.ts` server / web bump 到 0.14.0
- [ ] commit + push + merge main + docker deploy + curl verify NPC dialog replySource=ai

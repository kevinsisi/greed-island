# Proposal — World Pressure 視覺化 + Dialog 修復 v0.14.0

## Why

v0.13.0 落地 Living World 三件事（紋卡走 Rule Engine、天氣/區域 spawn、精力 timer 誤差）後，v0.14.0 要把 World Pressure 從「後端跑得很 active 但前端看不到」推到玩家面前；同時修三個讓世界感被打破的 bug：

1. **NPC AI 對話全部 fallback 成「（NPC 看了你一眼，沒有開口。）」**：每個 NPC 講一樣的廢話。Gemini-2.5-flash 用 chain-of-thought tokens 吃光 maxOutputTokens，回傳空 text candidate，server 整個掉到 static fallback library。`replySource=ai` 在實戰中幾乎沒出現。
2. **NPC 移動觀感不一致**：主地圖塞滿了所有 NPC（不論在區域內/外），看起來大家都站著、看不出哪些在跨區。同時某些 archetype 不該硬被 schedule 拉跨區（商店 NPC 不會無端去鄰區找人）。
3. **World Pressure 沒被前端表達**：area state 在後端存在於 `area.state.<tileId>` FACT_SET，但 UI 沒有任何方式讓玩家看到「這區現在治安差 / 經濟好 / 被潮獵會控制」。NPC 的 mood/health 也只在 `/api/npcs` JSON 裡，不影響視覺。
4. **Since-Last-Visit 摘要太薄**：v0.13.0 只有「世界掉了 N 張紋卡」一行 toast，玩家看不到他不在時 Living World 真正發生了什麼（壓力 / 派系 / 事件）。

## What Changes

- **AI dialog 修復**：`generateAiReply` 加 `thinkingBudget: 0` 把 2.5-flash 的內部 CoT tokens 關掉，避免 1500 thinking tokens 把 maxOutputTokens=2048 的 budget 用完只剩空字串。同時在 `geminiClient.callGemini` 把 `finishReason` 帶進「Gemini returned no text candidate」的錯誤訊息，下次再失敗能在 server log 直接看到原因。`GeminiGenerationOptions` 多一個 `thinkingBudget?` 選項，其它 caller 不影響。
- **MapScene 只畫 activity=move 的 NPC**：HubPage 改成只 render 跨區移動中的 NPC sprite。在區域內工作 / 休息 / 聊天的 NPC 從主地圖隱藏，只在該區域的 AreaPage scene 出現。實作層面把 `mapNpcs` 過濾 `n.activity === 'move'`。
- **Cross-tile schedule injection 改成 role-based**：原本 v0.13.x `injectCrossTileWanderIfStuck` 對所有 distinct=1 的 NPC 都硬塞跨區外出。新版只對 archetype === 'entertainer' / 'outsider' 或 role 含「獵 / hunter / 流浪 / 報童」的 NPC 啟用。商店 / 工匠 / 公務 NPC 維持原 schedule、不被硬拖離崗位。
- **NPC personality nudge 也改 role-based**：`computePersonalityNudge` 嚴格限定只對 entertainer (talkativeness ≥ 0.9) 和 outsider (greed ≥ 0.4 + patience < 0.6) 生效；其他 archetype 永遠回 null。NPC mood < 30 / health < 30 / 半夜時段一律不漂泊。`NpcRuntimeState` 新增 `personalityOverride?` 欄位，由 hydrate / persist 來回。
- **World Pressure 新增 threshold-crossing 與 recovery 事件**：`AreaStateEngine` 在資源從 ≥ 30 跨入 < 30 時觸發 `pressure.*`、從 < 55 跨上 ≥ 55 時觸發 `recovery.*`；派系跨過 60 (rising) 在 dominance 之外也補事件。`AreaState` 新增 `pressureCooldowns` 欄位讓重啟後 cooldown 不被 reset。`AreaLocalEvent.kind` 新增 `recovery.*`、`faction.rising`。
- **MapScene tile overlay**：`/api/areas` 拉一次 + 30 秒 polling；MapScene 接受 `MapAreaOverlay[]` 並依 safety < 40 → 暗紅蓋層、economy > 70 → 金色蓋層、dominantFaction → 派系外框（紫=潮獵會 / 金=公會 / 綠=自由潮感者 / 灰=平民）。`MapSceneInit.areaOverlays` + `applyExternalUpdate` 同步。
- **NPC mood/health 視覺化（AreaScene）**：mood < 30 → name label 灰色；health < 30 → sprite 左上角加 🤕。`AreaMapNpc` 加 `mood?` / `health?`，`AreaPage` 把它從 `NpcSummary` 接過來。
- **SinceLastVisitPanel**：把原本的單行 toast 換成完整 modal，同時拉 `/api/cards/since-last-visit` 與 `/api/world/since-last-visit`，分四區顯示：紋卡計數、區域壓力 / 回穩、跨區世界事件、天候季節。每個壓力 / 世界事件項目可以點擊跳到 `/area/:tileId`。Digest 一行摘要在標題下方。
- **NPC 互動事件排除建築內 NPC**：runtime 把「目前在建築物內」的 NPC id 算成 `npcsInsideBuildings` 傳進 `NpcEngine.tick()`；Phase 2 同 tile 互動排除這些 NPC，避免「鏽灣區 A 與 B 起爭執」但 A 與 B 其實都在某棟建築內、玩家進到鏽灣區地圖看不到他們。

## Impact

- **Affected specs**：simulation-kernel 不變（pressure / recovery 走 `AREA_PRESSURE` 既有命令，不改命令型錄）。
- **Affected code**：
  - server：`npcs/geminiClient.ts`（thinkingBudget option）、`npcs/aiDialog.ts`（傳 thinkingBudget=0）、`sim/areaStateEngine.ts`（recovery / rising / 持久化 cooldowns）、`sim/npcEngine.ts`（personalityNudge role-gated + injectCrossTileWanderIfStuck role-gated）、`sim/runtime.ts`（傳 areaSafety/Economy 給 npcEngine）。
  - web：`api/client.ts`（worldSinceLastVisit + ServerCatchUpSummary）、`pages/HubPage.tsx`（改用 SinceLastVisitPanel + areaOverlays）、`pages/AreaPage.tsx`（傳 mood/health）、`game/PhaserGame.tsx` + `game/MapScene.ts`（areaOverlays）、`game/AreaScene.ts`（mood/health 視覺）、`components/game/SinceLastVisitPanel.tsx`（新）。
- **資料遷移**：`pressureCooldowns` 是 AreaState 上的新欄位；舊資料缺欄位會 fall back 為空 map，不會出錯。
- **Risk**：`thinkingBudget=0` 可能讓部分有「需要 reasoning 才生得好」的回應品質下降；對「短 JSON 對話」這種任務反而比較穩。如果回頭發現需要 thinking，可以提到 256 / 512 而不是完全關掉。

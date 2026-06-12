## 1. 8-bit Pixel World (web)

- [x] 1.1 `pixelWorld.ts`：dither/bevel/sparkle 地形覆蓋 + 21 種像素道具（含 fungus）
- [x] 1.2 AreaScene：cell 覆蓋、水面波光、emoji 裝飾 → 像素道具（含 inspect zone / 環境動畫沿用）
- [x] 1.3 MapScene：active 街區 cell 覆蓋 + 裝飾像素化
- [x] 1.4 `characterAvatar.ts` 重寫為 texture-based 8-bit 像素人；`applyAvatarOutfitColor` 取代 setFillStyle；三場景換色點改接

## 2. Animal Behavior Presentation (web)

- [x] 2.1 `pixelAnimals.ts`：5 體型原型雙幀 sprite（白底 tint）+ 23 物種對應 + 掠食者鏡像清單
- [x] 2.2 `AnimalActor`：漫遊/吃草/逃離/潛行 + 步行幀 + 可獵點擊 + walkability/邊界約束 + destroy 生命週期
- [x] 2.3 AreaScene ecology overlay 重寫：個體 actor、群聚三隻代表、植物 emoji → 像素道具（飽和度縮放）
- [x] 2.4 環境生命層：飛鳥/蝴蝶/落葉（scene shutdown 清理）

## 3. NPC AI Agent (server)

- [x] 3.1 `NPC_AGENT_DECISION` command type + payload + validator + 測試
- [x] 3.2 `npcs/npcAgent.ts`：buildAgentOptions / buildAgentPrompt / parseAgentDecision + 測試
- [x] 3.3 `npcs/npcAgentRunner.ts`：錯相排程、in-flight guard、enable 檢查、靜默失敗
- [x] 3.4 runtime `attachNpcAgent`：deps 接線（intent stack / needs / 三 context）+ submitDecision → Rule Engine
- [x] 3.5 `applyAgentDecisionEvent`：override 套用 / follow_schedule 解除；utterance narration 上 ticker
- [x] 3.6 `http/server.ts` bootstrap 接線；config 常數（cadence / utterance cap）

## 4. World Feed Hygiene

- [x] 4.1 server：AREA_STATE_RECORDED / NPC_STATE_RECORDED narration → null
- [x] 4.2 web：eventVisibility 投影型別過濾 + 測試

## 5. Responsive Fixes (web)

- [x] 5.1 CodexPage 卡格 4/6/8/10 欄階梯
- [x] 5.2 MarketPage <sm 卡片式清單（表格 hidden sm:block）
- [x] 5.3 `web/version.ts` 跟上版本（0.24.2 → 0.89.0，header client 版本顯示修復）

## 6. Verification

- [x] 6.1 `npm --workspace packages/server exec vitest run` — 1179 tests 全過
- [x] 6.2 `npm --workspace packages/web exec vitest run` — 114 tests 全過
- [x] 6.3 `npm run build` — server + web 乾淨
- [x] 6.4 本機 runtime：v0.89.0 healthz + hydration 完成 + 無 AI key 時 agent inert
- [x] 6.5 Playwright 視覺驗證：desktop hub/area（像素世界 + 像素人 + 蝴蝶）、mobile 390×844 hub/codex/market
- [ ] 6.6 （deferred）BuildingScene 室內像素化；NPC chat bubble utterance；真 AI key 下的 agent 決策實測

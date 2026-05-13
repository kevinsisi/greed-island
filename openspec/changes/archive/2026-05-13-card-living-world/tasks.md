# Tasks — 紋卡 Living World v0.13.0

## 1. Backend：Rule Engine pipeline + audit log

- [x] 1.1 新增 `packages/server/src/http/cardCommands.ts`：`CardCommand` 10 種類型 + `CardActionPipeline` + `card_action_log` schema + `cardCommandErrorStatus` 翻 HTTP code
- [x] 1.2 `CardActionPipeline` 每筆動作 `db.transaction(() => { store mutation; appendEvent })`，CardWorldError → CardCommandError，deterministicKey = hash(eventType, actorId, tick, payload)
- [x] 1.3 `CardActionPipeline.expireOverdueDrops` 先 snapshot 即將過期 row，逐筆寫 CARD_DROP_EXPIRE event，再呼叫 store.expireOverdueDrops 一起在 transaction 裡完成
- [x] 1.4 `CardActionPipeline.sinceLastVisit(accountId, sinceTick)`：count CARD_DROP_SPAWN / CARD_PICKUP(actor != me) / CARD_DROP_EXPIRE 自 sinceTick 之後

## 2. Backend：Router + DropEngine 重接 pipeline

- [x] 2.1 `cardWorldRouter.ts` 全部寫入 endpoint 改走 pipeline；新增 `/cards/since-last-visit`（後端順手 `setLastSeenTick(currentTick)`）
- [x] 2.2 `DropDto` 加 `perceivedSecondsLeft` + `rawSecondsLeft`；jitter band 由玩家 energy 決定（jobsStore.getWallet）
- [x] 2.3 `cardDropEngine.ts` 重寫：`spawnDrop` / `expireOverdueDrops` 走 pipeline；spawn chance 套 weather (霧雨/驟雨 +30%) / rare-window (+50%) / per-tile 倍率（鏽灣高稀有、潮聲低階等）；rank pool 套同樣 modifier
- [x] 2.4 `tileIdsFromRuntime` 排除 `t_road`（街道不掉卡）
- [x] 2.5 `server.ts` boot 順序：`jobsStore` 先建（`cardWorldRouter` 需要它讀玩家 energy）；CardActionPipeline 注入 router + dropEngine

## 3. Frontend：since-last-visit + 長按實體化 + perceived timer

- [x] 3.1 `api/client.ts` 加 `cardsSinceLastVisit(token)` + `ServerSinceLastVisit` type；`ServerCardDrop` 加 `perceivedSecondsLeft` / `rawSecondsLeft`
- [x] 3.2 `HubPage` 進場拉一次摘要，>0 顯示頂端 toast「不在時 世界掉了 N 張紋卡，其中 M 張被別人撿走、K 張現形消失」（按一下關閉）
- [x] 3.3 `CardDropPanel.ticksToSeconds(deadline, perceived?)` 優先吃後端 perceived 值
- [x] 3.4 `CodexPage` 實體化按鈕改長按 2 秒：onPointerDown 啟動 timeout + 50ms 進度條 tick；放開/滑開/取消都不送 request；解除 unmount cleanup

## 4. MapScene NPC 移動修復（v0.12.1 視覺回歸）

- [x] 4.1 `MapNpc` 介面加 `subCol?: number` / `subRow?: number`
- [x] 4.2 `MapScene.refreshNpcSprites` 重寫：preserve existing sprite by npcId + tween 4.5s 到新目標；`computeNpcTarget` 用 subCol/subRow 把 NPC 放在 district anchor 周圍 ±36px；缺值退 60° ring fallback
- [x] 4.3 `tweenNpcTo` Sine.easeInOut；distance < 0.5px 直接 setPosition；同 sprite 帶 badge / nameLabel / activityIcon / chatBubble 一起移動
- [x] 4.4 `disposeNpcSprite` 統一清 sprite + 所有 attached label + 取消 moveTween，避免重建造成的 leak
- [x] 4.5 `HubPage` mapNpcs 把 `n.subCol` / `n.subRow` 從 NpcSummary 帶進 MapNpc

## 5. 驗證

- [x] 5.1 `cd packages/server && npx tsc --noEmit` 通過 / `npx vitest run` 10 file / 81 tests 全綠
- [x] 5.2 `cd packages/web && npm run build` 通過（1.60 MB JS gzipped 447 KB）
- [x] 5.3 部署到本機 docker compose 後 `curl https://hunter.sisihome.org/healthz` 應回 `version:"0.13.0"`
- [x] 5.4 hub 進場應看到 since-last-visit toast（如有 spawn 累積）
- [x] 5.5 區域內地圖看到 drop spawn 在鏽灣偏 SS/S/A、潮聲偏 G/H；雨天比晴天密
- [x] 5.6 work N 個 shift 把 energy < 30，再撿一張卡，觀察 holdingTimer 顯示與真實 60s 偏差 ±5s
- [x] 5.7 Codex 點實體化按鈕需要長按 2 秒才送 request；放開取消
- [x] 5.8 hub 城市地圖看到 NPC sprite 在 district 內緩慢移動（不再釘 anchor）；跨 district 看到 4.5s tween 滑過去

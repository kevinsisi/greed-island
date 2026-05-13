# Proposal — 場景動態化 + AI 反幻覺 + 編年史多樣化 + 角色 lock home tile（v0.15.1–v0.15.3）

## Why

v0.15.0 上線後使用者陸續回報：

1. **場景看起來像截圖** — AreaPage 開啟後 NPC 完全靜止；30 ticks 才換一次 ambient 文字；環境裝飾物（樹/燈/海港物件）都是純文字字符，沒有任何動態。世界感被打破。
2. **天氣只是後端 fact，前端看不到** — `world.facts.weather` 改成「驟雨」但區域畫面什麼變化都沒有。
3. **AI 旁白幻覺嚴重** — Gemini 編出根本不存在的 NPC（「祭司瑟拉守在第一層的拱門前」— Sela 不在這區、「第一層 / 拱門」也不存在）。光說「不要捏造具體事件」AI 不夠；prompt 要明確列在場 NPC + 建築清單，並對空清單發反向約束。
4. **NPC 跨區把職責綁定的角色硬拉走** — 祭司在地脈層應該永遠在地脈層；profile 寫「council attendance → t_central」就被 schedule 拉走。Role-bound NPC 的工作地必須是不可妥協的。
5. **編年史每條都長一樣** — 互動敘事 `composeInteractionNarration` 句型池只有 ~12 句模板，使用者掃一眼就知道是模板；「氣氛緊繃」「兩人僵成一塊」反覆出現。
6. **進入區域後 NPC 不動要等下一輪 polling** — POLL_FALLBACK_MS = 8s，玩家進場後最多要等 8 秒才看到 NPC 動。
7. **HTML 按鈕蓋住地圖** — 「← 返回」+ 區域名稱 absolute overlay 蓋住 NPC 與建築 sprite。
8. **AreaPage 顯示「靜態」debug badge** — `source==='fallback'` 漏給使用者看。

## What Changes

### v0.15.1 — 場景動態化（已 ship）

- `AmbientNarrator.tickRefresh(currentTick, getContext)` + `lastRequestedTickByTile`：runtime tick listener 主動推「最近 12 tick 內被玩家 polled 過的 tile」進下一輪 refresh。30-tick TTL 維持，但 cache 過期那一刻就在背景跑下一輪，下次 polling 拿到的就是新文字。
- `runtime.buildAmbientContext(tileId)` 抽出共用 helper，buildings router + tickRefresh 共用同一份 context 組裝。
- `AreaScene.applyWeather(weather)` + `weatherLayer` (depth=200)：5 種天氣 VFX（晴 → 太陽暈呼吸 / 陰 → 飄雲 / 霧雨 → 30 條細雨線 + 5 個霧斑 / 驟雨 → 60 條雨線 + 偶發閃電 / 微風 → 飄落 🍃🌸）。
- `AreaScene.attachEnvAnimation`：依 emoji 類型套不同 idle tween（樹搖 ±4° / 燈閃 alpha 0.7-1.0 / 海港 ±2px 漂浮 / 結晶脈動 / 岩石微抖）；phase delay 用 (col,row) hash 錯開。
- `normaliseWeather` 把後端中文 weather 轉成 enum (clear/overcast/mist/storm/breeze)；plumbed through AreaPage → AreaPhaserGame → AreaScene。

### v0.15.2 — 地圖純畫面 + NPC idle 呼吸 + polling 縮短（已 ship）

- AreaPage 重組：「← 返回」+ 區域名稱 pill 從 `absolute top-2 left-2 right-2` overlay 改放在地圖**上方** block flow。地圖區現在只剩 Phaser canvas。
- 新 callback `AreaSceneCallbacks.onNearbyBuildingChange`：玩家走到建築旁時 fire；React 在地圖**下方** render「進入 X →」HTML 按鈕（用 `placement.glyph + nameZh`）。地圖內仍保留 Phaser `✋/🔍` 提示氣泡（純 game object，不是 HTML）。
- `AreaScene.attachNpcIdleAnimation`：每位 NPC sprite spawn 時套 scaleY 0.93→1.06 yoyo tween（1.2s 週期 + npcId hash phase delay）；獨立於位置 tween（不同 axis），玩家進場景時就看到 NPC 在動。
- `WorldStateContext.POLL_FALLBACK_MS` 8s → 3s。後端 tick 5s，polling 短於 tick 確保 NPC subCol/subRow 變動最多 3s 送達。
- 移除 `area.scene` tab 的「AI / 靜態」debug badge — fallback 文字直接顯示，使用者看不到 source。

### v0.15.3 — AI 反幻覺 + 編年史多樣化 + 角色 lock home tile（本 release）

- **Ambient prompt 反幻覺強化**（`packages/server/src/sim/ambientNarrator.ts`）：
  - System prompt 加 ⚠️ 嚴禁虛構區塊：禁止虛構任何具名 NPC（即使聽似合理的「祭司 / 守衛 / 商人」）、禁止虛構建築結構名（「拱門 / 第一層 / 鐘樓」）。
  - User prompt 列「在場 NPC」清單時加註「你只能引用這些名字，其它人物用『行人 / 攤主 / 巡邏的人』」。
  - `AmbientContext` 新增 `presentBuildingNames` 欄位（`runtime.buildAmbientContext` 從 `BuildingRuntime.snapshotForTile` 拉），列當前 tile 可命名建築。空清單時明示「不要使用任何具體建築名」。
  - WorldEvent narration prompt 同步加禁構約束。
- **`isRoleLockedToHomeTile(profile)` + `deriveSchedule` lock 路徑**（`packages/server/src/sim/npcEngine.ts`）：
  - lock 條件：archetype ∈ {mystic, shopkeeper, craftsman, guard, civic, cleric}；或 role.zh 含「祭司/僧/住持/主教/守衛/衛兵/店長/老闆/鑄/匠/修士/醫/工坊/員工/司祭」；或 role.en 含 abbot|cleric|priest|guard|shopkeeper|smith。
  - lock 時把所有 schedule slot 的 location 壓回 `profile.defaultLocation`，即使 profile JSON 寫了跨區 slot 也整段壓回。
  - Wanderer archetype（entertainer / outsider）即使 role 含「商」也不 lock。
- **`composeInteractionNarration` 句型池擴充**（`packages/server/src/sim/npcEngine.ts`）：
  - 句型池從 ~12 句擴充到 50+ 句，依 archetype 組合分支（mystic / shopkeeper / craftsman / guard / civic / outsider / 同派系 / 跨派系 / 預設池）。
  - seed 加入 `tick + weather`：同對 NPC 同 tile 不同 tick 拿到不同句子，不再「永遠卡同一句」。
  - 雨天 / 微風 / 晴 / 陰 各自加情境句（「簷下避雨」「風口聊」「陽光下站著」）。

## Impact

- **Affected specs**：simulation-kernel 不變；ambient-narrator + npc-engine 加新 contract（presentBuildingNames、isRoleLockedToHomeTile、composeInteractionNarration tick/weather seed）。
- **Affected code**：
  - server：`sim/ambientNarrator.ts`（presentBuildingNames + tickRefresh + 反幻覺 prompt）、`sim/runtime.ts`（buildAmbientContext + ambient tick listener）、`sim/npcEngine.ts`（isRoleLockedToHomeTile + 句型池擴充 + tick/weather seed）、`http/buildingsRouter.ts`（refactor 用 buildAmbientContext）。
  - web：`game/AreaScene.ts`（applyWeather + attachEnvAnimation + attachNpcIdleAnimation + onNearbyBuildingChange）、`game/AreaPhaserGame.tsx`（plumb weather + onNearbyBuildingChange）、`pages/AreaPage.tsx`（HTML chrome out of map + 進入按鈕 + 移除 debug badge）、`state/WorldStateContext.tsx`（POLL_FALLBACK_MS 3s）。
- **資料遷移**：`presentBuildingNames` 是 AmbientContext 新欄位；buildings router 與 tick refresh 都用 `runtime.buildAmbientContext` 統一組，不存在缺欄位的 path。
- **Risk**：lock 條件以 role.zh 字典硬比對；如果未來新增「祭司型」NPC 用其它字（例如「巫」「靈媒」），需要追加進 regex。可接受 — review 時提醒即可。
- **AI key 注意**：production 兩把 Gemini key 全部回 INVALID_ARGUMENT，所有 ambient/dialog 都走 fallback。本 release 反幻覺 prompt 上線後，等 user 在 `/settings` 換新 key 才會真正生效。

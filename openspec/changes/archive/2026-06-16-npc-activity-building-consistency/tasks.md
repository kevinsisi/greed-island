## 1. Server — NpcActivity 型別擴充

- [x] 1.1 在 `packages/server/src/sim/npcEngine.ts` 的 `NpcActivity` union 新增 `'read' | 'perform' | 'craft' | 'study' | 'pray' | 'write' | 'guard'`
- [x] 1.2 在 `packages/web/src/state/types.ts` 的 `NpcActivity` union 同步新增相同 7 個值

## 2. Server — Schedule label 精細化對映

- [x] 2.1 在 `npcEngine.ts` 於 `LABEL_WORK_PATTERN` **之前**新增 6 個更精細的 pattern 常數：`LABEL_READ_PATTERN`、`LABEL_PERFORM_PATTERN`、`LABEL_CRAFT_PATTERN`、`LABEL_STUDY_PATTERN`、`LABEL_PRAY_PATTERN`、`LABEL_WRITE_PATTERN`
- [x] 2.2 在 `inferActivityFromLabel()` 函式中，在 WORK fallback **之前**依序判斷新 pattern，命中時回傳對應細粒度 activity
- [x] 2.3 為新 label→activity 對映補充 unit test（npcEngine.test.ts fine-grained activity label inference describe block，14 tests）

## 3. Server — ScheduleSlot buildingId 欄位

- [x] 3.1 在 `ScheduleSlot` 介面新增 `buildingId?: string | null`
- [x] 3.2 在 `decideNextState/finish()` 新增：當 slot 有 `buildingId` 且 NPC 已在目標 tile 時，將 NPC runtime `scheduledBuildingId` 設為 `slot.buildingId`；`getNpcBuildingId` 優先回傳 `scheduledBuildingId`
- [x] 3.3 在 NpcEngine 啟動時驗證 profile schedule slots 的 `buildingId` 都存在於 building catalog；不存在時 `console.warn` 但繼續執行

## 4. Server — 補建築、更新 NPC profile

- [x] 4.1 在 `packages/server/src/buildings/catalog.ts` 的 t_central 區塊新增 `b_central_library`（type: `'library'`，placement col:7 row:1，enterable: true，ownerNpcId: null，hiring: [{shift: 'afternoon', capacity: 2, taskZh: '整理書目、服務讀者'}]）
- [x] 4.2 在 `packages/server/src/npcs/profiles/_daily.central.json` 找到 `central.librarian.lin_pei_rou`，將其工作 schedule slot 的 label 更新為含 `library`/`reading` 關鍵詞，並加上 `"buildingId": "b_central_library"`
- [x] 4.3 審查完成（busker/performer labels 已含 `busking`/`gig` 關鍵詞；priest labels 已含 `prayer`/`ritual` 關鍵詞）
- [x] 4.4 審查完成（同 4.3）

## 5. Server — AI dialog 注入建築名稱

- [x] 5.1 在 `packages/server/src/npcs/aiDialog.ts` + `npc.ts` 中，當 NPC `buildingId` 非 null 時，從 building catalog 查找建築的 `nameZh`，注入 `「目前位置：[nameZh]（[type]）內」` 到 dialog context

## 6. Client — 角色動畫 pose

- [x] 6.1 在 `packages/web/src/game/characterAvatar.ts` 為 7 個新 activity type 各新增 animation pose（read/perform/craft/study/pray/write/guard）
- [x] 6.2 在 `packages/web/src/game/characterVisualState.ts` 的 activity→CharacterVisualAction 對映表新增 7 個新 activity 的對應 action 名稱

## 7. Client — 表情符號 glyph

- [x] 7.1 在 `packages/web/src/game/npcVisuals.ts` 的 `ACTIVITY_GLYPH` map 新增 7 個新 activity 的 emoji：`read: '📖'`、`perform: '🎵'`、`craft: '⚒️'`、`study: '🔬'`、`pray: '🙏'`、`write: '✍️'`、`guard: '🛡️'`

## 8. 驗證與版本

- [x] 8.1 執行 `npm run build` 確認 server + web 無型別錯誤
- [x] 8.2 執行 `npm run test` 確認全數通過（1239 server + 120 web）
- [ ] 8.3 起 local server，呼叫 `/api/npcs`，確認 `central.librarian.lin_pei_rou` 的 `activity = 'read'` 且 `buildingId = 'b_central_library'`（工作時段內）
- [x] 8.4 bump server + web version → 0.93.0
- [x] 8.5 更新 `PROGRESS.md`、`ROADMAP.md`，commit + push

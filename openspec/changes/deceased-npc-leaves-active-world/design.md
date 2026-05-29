## Context

`NpcMortalityProjection.isDeceased(npcId)` 自 v0.32.0 起就存在並正確被 `NPC_DECEASED` 事件填充。問題不在資料層 — 問題在「死亡狀態沒被任何 consumer 認真接住」。

死亡漏網點全圖（v0.87.2 live）：

```
EventLog: NPC_DECEASED ✅ 正確寫入
   │
   ├─→ NpcMortalityProjection.isDeceased() ✅ 正確
   │
   ├─→ NpcEngine.tick() ❌ 不檢查，死人繼續 decide / move
   │
   ├─→ runtime.getNpcs() ⚠️ 加 deceased 旗標但不過濾
   │       │
   │       ├─→ /api/npcs ❌ TS 型別丟掉 deceased
   │       │       │
   │       │       └─→ web AreaScene ❌ 全畫
   │       │
   │       └─→ /api/npc/:id/{interact,dialog-hold,intervene,greet} ❌ 全部用 findProfile 不查死活
   │
   └─→ admin lineage / chronicle ✅ 正確使用 isDeceased
```

七個 surface 全部需要單獨修。本變更的設計目標是把死亡狀態做成 sim 的一等公民，而不是再加第 N 個「if dead skip」貼紙。

## Goals / Non-Goals

**Goals:**
- 死亡 NPC 在公共 `/api/npcs` 路徑完全消失
- 5 個玩家互動 endpoint 對死亡 NPC 一律 410 Gone
- `NpcEngine.tick()` 不再 advance 死亡 NPC 的狀態（state 凍結在死亡 tick 的最後 snapshot）
- 前端 `NpcSummary` 帶 `deceased` 旗標，UI 依此過濾 + 防呆 toast
- Admin / lineage / chronicle 仍能看到死亡 NPC（這是 §43.1 「後代會記得他」的核心：世界記得死人）
- `/history` endpoint 玩家對死人的歷史對話保留唯讀

**Non-Goals:**
- _不_ 改 EventLog schema — 不引入 NPC_BURIED 或類似事件
- _不_ 處理「夫妻一方死亡」「家族繼承」這些 economic 行為（屬於 matured-child-inheritance 與 household-shared-economy 各自的範圍）
- _不_ 為死亡 NPC 製作「屍體 / 墓碑」地圖物件 — 那是未來的 ecosystem 物件、不屬於本 hotfix
- _不_ 改 AI dialog grounding 已經正確處理的部分 — `householdMembers` 已從 living 過濾
- _不_ 動 combat sub-runtime — combat outcome → NPC_DECEASED 的 wiring 已正確

## Decisions

### Decision 1 — 預設 `getNpcs()` 過濾死人，admin 用獨立方法

```typescript
getNpcs(): SimNpcState[]                     // 預設 = 活著的
getNpcsIncludingDeceased(): SimNpcState[]    // admin / lineage 用
```

理由：絕大多數 consumer（玩家 UI、`/api/npcs`、interaction endpoint 內查 location/state）期望「現在世界上活著的人」。讓「活著」是預設、「含死人」是顯式行為，是符合 principle of least surprise 的選擇。

**Alternatives 考慮過：**
- _Always return all, callers filter_：拒絕 — 等於把 bug 留給每個 caller 自己想起來補。Live 已經證明這條路會漏。
- _Two-tier with `{ living: [], deceased: [] }`_：拒絕 — 接口表面變更太大，所有現存 caller 都要改。

### Decision 2 — `NpcEngine.tick()` 接 `deceasedNpcIds` set，主迴圈 guard

```typescript
interface NpcTickContext {
  // ...
  deceasedNpcIds?: ReadonlySet<string>   // optional 以保留現有測試呼叫
}
```

主迴圈第一行：
```typescript
for (const profile of this.profiles) {
  if (context?.deceasedNpcIds?.has(profile.id)) continue
  // ... 既有邏輯
}
```

**為什麼不直接在 `NpcEngine` 內存一份 mortality projection 的指標：** 因為 NpcEngine 是 sim 內最底層的「決策器」，跟 `NpcMortalityProjection` 之間目前沒有耦合。透過 context 注入維持單向依賴 (`runtime` 知道 mortality，傳入 engine)；engine 不需要知道 mortality 怎麼來。

死亡 NPC 的 `NpcRuntimeState` 仍存在 `this.state` map 中（凍結在死亡 tick 那次寫入的值），這對 boot replay 是必要的 — 任何 consumer（chronicle / admin）若要看「他死的時候站在哪」仍可拿到。**死亡後不再更新**就是「凍結」的全部意思。

### Decision 3 — Interaction endpoints 回 `410 Gone` 而非 `404`

|  | `404 NOT_FOUND` | `410 GONE` |
|---|---|---|
| 語意 | 「我從來沒聽過這個 npcId」 | 「這個 npcId 曾經存在，現在不在了」 |
| 客戶端反應 | 顯示「未知的 NPC」 | 顯示「這位 NPC 已經不在世上」 |
| Cache 行為 | 可短 cache | 應永久 cache（不會復活） |

選 410 是因為它精準對應 HTTP 語意 — 資源曾經存在但已永久消失。客戶端 toast 訊息可以對應做「死人專屬」的處理。

### Decision 4 — `/api/npc/:npcId/history` 不擋

玩家對死人的歷史對話是「他活著時的紀錄」，本來就屬於唯讀回憶。擋掉反而破壞 §43.1「後代會記得他」精神 — 玩家也記得。`/history` 只 read `personal_events` 表，不會 invoke 死人，無副作用。

### Decision 5 — 前端雙重過濾

服務端已經過濾，前端仍在 `toNpcSummary` 之後再 filter `deceased === false` 一次。理由：
1. SSE / poll 之間 race 可能拿到夾雜狀態
2. 萬一服務端 hotfix 之後出新 bug 又回退，前端守住最後一關
3. 寫測試比較簡單

### Decision 6 — `NpcDialog` 內 mortality double-check

打開 dialog 前再 query 一次 `npc.deceased`。如果是 true，顯示「這位 NPC 已經不在了」toast 並關閉。是針對「玩家 cache 了 stale npc 列表，點到剛死的 NPC」這個 1 秒 race window 的防呆。

## Risks / Trade-offs

- **[Risk]** 把 `getNpcs()` 預設改成過濾，可能有其他 internal caller 期望看到死人 → Mitigation: grep `runtime.getNpcs()` 全用法，把每個 caller 標示「需要含死人」/「只要活人」，admin/lineage/chronicle 全改用 `getNpcsIncludingDeceased`。新增單元測試覆蓋 `getNpcs() filters deceased` 行為。

- **[Risk]** `NpcEngine.tick` 加 guard 可能改變 canonical hash（如果死人之前的「無聊」狀態變化被算進去）→ Mitigation: 寫一個 replay test，建立 EventLog 含 NPC_DECEASED 之後幾百 tick，比對 lifeExpansion 與其他 projection canonical hash。預期是相同（死人本來決策也沒寫 EventLog，只是被 NpcEngine 內部記）。

- **[Risk]** 410 Gone 對玩家是新的錯誤碼，前端可能沒處理過 → Mitigation: `NpcDialog` / `AreaPage` 對 `ApiError` 加 `status === 410` 分支，顯示中文 toast；其他 endpoint 一律 fall back 到既有 generic error path。

- **[Trade-off]** 死人凍結在 sim state 不被清掉，long-running world 會慢慢累積死人 state（每個 ~200 bytes）。1000 隻 NPC 全死也才 ~200 KB，對 server 不痛。如果 100 年後想清，可加單獨 vacuum pass — 不在本 hotfix 範圍。

- **[Trade-off]** `/api/npc/:npcId/history` 仍可拿死人歷史，UX 上會出現「我可以查我跟一個已死 NPC 的對話、但點他名字沒反應」。這是「死人不可互動但記憶可查」設計的副作用，符合 §43.1 精神，接受。

## Migration Plan

- 無 schema migration
- 無資料 migration
- Deploy 流程：標準 CI/CD。Deploy 後 live 觀察：
  1. `/api/npcs` 死人立即消失
  2. `/api/npc/:dead-id/interact` 立即 410
  3. NpcEngine canonical hash 不變
  4. AdminLineagePage 仍顯示死人 †
- Rollback：revert commit，世界回到「死人能聊天」狀態 — 不會 data loss，只是 bug 復活

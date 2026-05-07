# Proposal — 即時制紋卡戰鬥系統（規劃 only）

## Why

紋卡是 Greed Island 的核心，但到 v0.14.0 為止它還只是「掉落 → 撿 → 紋典 → 交易」一條物件流。玩家手裡的紋卡無法在世界裡「真的拿來打」 — 派系衝突永遠停在 NPC 互相罵幾句、玩家被 NPC 敵視也只是好感掉，沒有 climax。要讓 Living World 有真正的張力，需要一個會死人 / 會掉血 / 會掉卡的戰鬥系統。

同時，戰鬥不能變成「分支系統」。如果它走自己一套 hp 表、自己一套規則、自己一套 client 邏輯，就會違反 ARCHITECTURE.md 的 EventLog 唯一真相原則 → replay / since-last-visit / 派系反饋全部失靈。

這份 proposal 把戰鬥系統當作「世界模擬的高頻 sub-runtime」來設計 — 同樣的 Command/Event/Rule Engine，只是 tick 加速。

## What Changes

**這個 release（v0.14.0）只寫規劃文件，不實作戰鬥程式碼。** 完整實作分四個階段，從 v0.15 開始。

### 文件產出

- 新增 `COMBAT_ARCHITECTURE.md` 在 repo 根（與 `ARCHITECTURE.md` 同級），把戰鬥架構準則訂下來。
- 本 OpenSpec change `combat-system/`：proposal + tasks + spec。

### 設計核心

1. **戰鬥走 Command → Rule Engine → Event**：跟世界模擬完全一致。任何戰鬥動作（出牌、移動、逃跑）都先 build typed Command，由 `CombatRuleEngine` 編譯成 typed Event 寫進 EventLog。沒有「直接套效果」這條路。
2. **雙 tick 階層**：world tick 5s 不變；戰鬥開始時 spawn 一個 `combatId` 的高頻 sub-tick (`combatTickRate` ∈ 5~20 Hz，預設 10Hz / 100ms)。Combat events 寫世界 `tick` 欄位（取戰鬥開始時的世界 tick），用 payload `combatTick` 排序戰鬥內事件。
3. **紋卡是 Command 來源**：玩家或 NPC 「打」一張紋卡 = 提交 `COMBAT_CARD_PLAY`。卡的效果（傷害 / 狀態 / 防禦）由 Rule Engine 編譯成 sub-commands `COMBAT_DAMAGE` / `COMBAT_STATUS_APPLY` 等。Client 不持有「卡的計算公式」 — 它只看到 events。
4. **Rule Engine 解析優先級**：兩張卡同 sub-tick 互相影響時（A `NO_ESCAPE` / B `PHASE_SHIFT`），Rule Engine 用 deterministic priority table + `(actorId, commandId)` tie-break 排序。`PHASE_SHIFT` priority 0 先解析，`NO_ESCAPE` priority 1 後解析 → 玩家可以用 PHASE_SHIFT 規避鎖定。
5. **Client 是投影層 + 樂觀預測**：Client 訂閱戰鬥 events，畫面 derive 自 `CombatProjection`。出牌時 client 立刻畫動畫 + 更新預測值，server 回 commitment 後 reconcile（accepted 繼續 / rejected 回滾 + toast）。每個 sub-tick 結尾用 server 的 `tickDigest` hash 做 sanity check，不一致就拉 snapshot 強制重 sync。
6. **戰鬥結果回饋世界**：`COMBAT_RESOLVE` 的 payload 包 `worldEffects`：hp 永久變化、NPC defeated → 1h incapacitated、玩家 defeated → energy=0 / carry slot 隨機掉卡、faction 影響力變化、card loot drops、relationship 變化、歷史卷軸 entry。世界 reducer 看到這個 event 自己消化，不靠 endpoint 後置寫表。
7. **AI 只做旁白**：pre-combat / mid-combat / post-combat 三個 narration 點，全部 read-only，不影響 hp / priority / damage 計算。AI 失敗 → fallback 到 deterministic 模板（`AmbientNarrator` 既有模式）。

### 階段實作藍圖（不在這個 release 範圍）

- **Phase A — Spec only (v0.14.0，本 release)**：`COMBAT_ARCHITECTURE.md` + 本 OpenSpec。
- **Phase B — 單擊判決 (v0.15)**：先做最簡形 — 玩家三按鈕（攻擊/防禦/逃跑），後端一次性算贏家。沒有 sub-tick，純 1 個世界 tick 做完。驗證 Command/Event/Rule Engine 管線能承載戰鬥 domain。
- **Phase C — Real-time sub-tick (v0.16)**：加 `combatTick` sub-loop、紋卡、優先級解析、client prediction、reconciliation。
- **Phase D — World feedback loop (v0.17)**：完整 `worldEffects` reducer 消化、歷史卷軸、loot drops、replay validation。

## Impact

- **Affected specs**：simulation-kernel 不破壞既有要求；新加 `combat-runtime` capability 描述戰鬥的 sub-tick 與 priority 規則（v0.16 的 spec.md 才寫，本 release 只 propose）。
- **Affected code (本 release)**：只新增 markdown — `COMBAT_ARCHITECTURE.md` + 三個 openspec 檔。
- **Affected code (Phase B+)**：
  - 新檔 `packages/server/src/combat/commands.ts`、`combat/ruleEngine.ts`、`combat/runtime.ts`、`http/combatRouter.ts`。
  - `packages/web/src/game/CombatScene.ts` + `components/game/CombatHud.tsx`。
- **Risk**：戰鬥 sub-tick 加速到 10 Hz 會讓 EventLog 增量瞬間很大（10 events/s × 數十秒戰鬥 → 一場戰鬥幾百個 events）。需要 retention 政策（戰鬥結束 N 天後壓縮成單一 `COMBAT_RESOLVE` 結果 + ambient 敘事，sub-tick 細節歸檔）。
- **與 ARCHITECTURE.md 的相容性**：完全相容 — 戰鬥沿用同一個 Command/Event 介面，同一個 EventLog，同一個 reducer。Rule Engine 多一個 `CombatRuleEngine` 子類，仍走 Rule Engine 唯一寫入路徑原則。

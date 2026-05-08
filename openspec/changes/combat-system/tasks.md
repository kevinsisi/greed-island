# Tasks — 即時制紋卡戰鬥系統

> **本 release (v0.14.0) 只做 Phase A — 規劃文件**。Phase B+ 是後續 release 的工作項，這裡列出來是為了讓未來 PR 知道接下來要做什麼。

## Phase A — Spec only（v0.14.0，本 release）

- [x] 寫 `COMBAT_ARCHITECTURE.md` 在 repo 根
- [x] 寫 `openspec/changes/combat-system/proposal.md`
- [x] 寫 `openspec/changes/combat-system/tasks.md`（本檔）
- [x] 寫 `openspec/changes/combat-system/specs/combat-runtime/spec.md`

## Phase B — 單擊判決（v0.15）

驗證 Command/Event/Rule Engine 管線能承載戰鬥 domain。沒有 sub-tick、沒有紋卡、沒有 client 預測。

- [ ] `packages/server/src/combat/commands.ts`：
  - `COMBAT_INITIATE` / `COMBAT_PLAYER_ACTION` (action: 'attack' | 'defend' | 'flee') / `COMBAT_RESOLVE`
  - validators 完整覆蓋
- [ ] `packages/server/src/combat/ruleEngine.ts`：
  - `CombatRuleEngine.evaluate(command, snapshot)` 一次算完輸贏
  - 公式：`damage = base + greed * power - target.patience * 5`、暴擊用 `hash(combatId, actorId)` seed
- [ ] `packages/server/src/http/combatRouter.ts`：
  - `POST /api/combat/initiate { targetNpcId }`
  - `POST /api/combat/:id/action { action }`
  - 走 `runtime.submitLivingWorldCommand`（v0.14.0 已實作的命令提交入口）
- [ ] `packages/server/src/sim/runtime.ts`：
  - 新 `combatStates: Map<combatId, CombatState>`，hydrate 自 EventLog
  - `submitCombatCommand` 與既有 `submitLivingWorldCommand` 共用 fan-out
- [ ] `packages/web/src/components/game/CombatHud.tsx`：
  - 三按鈕 UI（攻擊 / 防禦 / 逃跑）
  - 顯示雙方 hp + 上一輪結果
- [ ] `packages/web/src/api/client.ts`：
  - `combatInitiate` / `combatAction`
- [ ] vitest：
  - rule engine 兩個固定 seed 戰鬥的 deterministic 結果
  - replay：兩次 reduce 同 EventLog 產生同 outcome

## Phase C — Real-time sub-tick（v0.16）

升級到實時戰鬥 + 紋卡。

- [ ] `combat/runtime.ts`：sub-tick loop（10 Hz 預設），每 tick run rule engine 一輪
- [ ] `combat/commands.ts`：加 `COMBAT_CARD_PLAY` / `COMBAT_CARD_CANCEL` / `COMBAT_DAMAGE` / `COMBAT_STATUS_*` / `COMBAT_PHASE_SHIFT` / `COMBAT_TARGET_LOCK*` / `COMBAT_FLEE_ATTEMPT` / `COMBAT_DEFEAT`
- [ ] `combat/ruleEngine.ts`：5-phase 結構（STATUS_TICK → CARD_PLAY → DAMAGE/HEAL → DEFEAT → RESOLVE）
- [ ] 卡牌優先級表 + tie-break (`(actorId, commandId)` lex)
- [ ] `combat/cards/`：每張卡的 sub-command 編譯器（fire_lash → DAMAGE+burn STATUS）
- [ ] `web/src/game/CombatScene.ts`：Phaser scene 渲染，動畫 derive 自 events
- [ ] `web/src/state/CombatProjection.ts`：訂閱 SSE 戰鬥 events，maintain hp / status / phase / locked / log
- [ ] Client prediction + reconcile（出牌立刻播動畫；server reject 回滾）
- [ ] 每 sub-tick 結尾驗證 `tickDigest` hash 一致；不一致拉 snapshot
- [ ] vitest：
  - PHASE_SHIFT vs NO_ESCAPE 同 sub-tick 解析順序測試
  - replay：同 events 多次解析得同結果

## Phase D — World feedback loop（v0.17）

戰鬥結果完整融入世界。

- [ ] `COMBAT_RESOLVE.worldEffects` 完整定義 + reducer 消化
- [ ] NPC defeated → 1h `incapacitated` 狀態（`NpcRuntimeState` 加欄位）
- [ ] 玩家 defeated → energy=0、carry slot 隨機掉卡、relocate to home tile
- [ ] `cardLootSpawns` 走既有 `CARD_DROP_SPAWN` 命令
- [ ] `factionShifts` 套到 `area.state.<tile>.factionControl`（走 `AREA_PRESSURE` 或新 `FACTION_SHIFT`）
- [ ] 歷史卷軸：新表 `world_history`，記 `COMBAT_RESOLVE` 的 narration + outcome
- [ ] `SinceLastVisitPanel` 加「戰鬥」section（從 `world_history` 拉）
- [ ] AI ambient narrator：pre/mid/post combat 三種 prompt 模板
- [ ] EventLog retention：戰鬥結束 N 天後壓縮 sub-tick 細節成單筆 `COMBAT_HISTORY_COMPACT` event
- [ ] vitest：
  - 戰鬥結果套到世界 reducer 的 deterministic test
  - SinceLastVisit 包含戰鬥摘要的 test

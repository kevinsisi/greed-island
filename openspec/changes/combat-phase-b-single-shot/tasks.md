# Tasks — Combat Phase B 單擊判決（v0.15.0 ✅ shipped）

> 跟 `combat-system/tasks.md` 的「Phase B」清單對齊；本 change 已 ship 進 v0.15.0。

## 1. Server — Commands

- [x] `packages/server/src/combat/commands.ts`
  - `COMBAT_INITIATE` (player → NPC)
  - `COMBAT_PLAYER_ACTION` ('attack' | 'defend' | 'flee', optional `cardId`)
  - `COMBAT_RESOLVE` (terminal — Rule Engine emits, not user)
  - 加進 `LIVING_WORLD_COMMAND_TYPES`
  - validators 完整覆蓋：unknown action / missing combatId / invalid actor

## 2. Server — Rule Engine

- [x] `packages/server/src/combat/ruleEngine.ts`
  - `evaluateCombatRound(input): CombatRoundResult`
  - 公式（見 proposal.md）— attack / defend 對稱、crit 用 `hashSeed(combatId, actorId, combatRound)` seed
  - `flee` 永遠成功（user 答覆 open question 3）
  - 暴擊用 `hashSeed(...)` — 不可叫 `Date.now()`

## 3. Server — HTTP

- [x] `packages/server/src/http/combatRouter.ts`
  - `POST /api/combat/initiate { targetNpcId }`
  - `POST /api/combat/:id/action { action, cardId? }`
  - `GET /api/combat/active`、`GET /api/combat/:id`
  - 用 `requireAuth` 中介
  - 走 `runtime.submitLivingWorldCommand` 寫 EventLog（COMBAT_INITIATE / COMBAT_PLAYER_ACTION / COMBAT_RESOLVE）
- [x] mount 到 `http/server.ts`

## 4. Server — Snapshot / Reducer

- [x] CombatStore：`combat_sessions` + `combat_log` 兩表，CombatStore 提供 createSession / updateAfterRound / appendLog / listLog
- [x] in-memory NPC incap map（5 秒倒地）；Phase B 暫不持久化（重啟後 NPC 立即可戰）— 留 Phase D 改進
- [x] hydrate-from-EventLog：暫由 LivingWorldRuleEngine 既有路徑接收，CombatStore 不從 EventLog rebuild — Phase D 才做

## 5. Web — API + UI

- [x] `packages/web/src/api/client.ts`：`combatActive` / `combatGet` / `combatInitiate` / `combatAction`
- [x] `packages/web/src/components/game/CombatHud.tsx`：
  - 三按鈕（攻擊 / 防禦 / 逃跑），busy 時 disable
  - 雙方 hp bar
  - 上一輪 result row（包含暴擊 / 防禦恢復 / 逃跑 / Phase C 紋卡 ignored 提示）
- [x] `packages/web/src/components/game/NpcDialog.tsx`：低 trust + NPC `health > 0` 時加「挑戰開戰」按鈕；開戰後直接畫 CombatHud
- [x] CombatProjection 純 derive：CombatHud 收 server response、不寫 hp（client 沒有權威）

## 6. Open Questions（已答覆）

- [x] **NPC 健康度**：Phase B 用獨立 combatHp（COMBAT_INITIAL_HP=100），不影響 NPC mood/health
- [x] **同 tile 才能戰鬥**：✅ 強制
- [x] **逃跑成功率**：永遠成功
- [x] **戰鬥失敗副作用**：玩家 energy=0；NPC 倒地 1 個世界 tick (5 秒)；loot drop / faction shift 留 Phase D

## 7. Tests

- [x] `combat/ruleEngine.test.ts` — 7 tests pass
  - hashSeed deterministic
  - attack 行為產 COMBAT_DAMAGE
  - flee 永遠 resolve fled
  - 兩次相同 input byte-identical events
  - player victory 在 NPC 反擊前結束
  - npc victory zero player energy
  - cardId 寫 COMBAT_CARD_IGNORED warning（Phase C hook）

## 8. Docs

- [x] `ROADMAP.md`：v0.15.0 ✅ shipped
- [x] `MEMORY.md`（auto memory）：更新 deploy state

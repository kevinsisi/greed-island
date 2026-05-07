# Tasks — Combat Phase B 單擊判決

> 跟 `combat-system/tasks.md` 的「Phase B」清單對齊；本 change 是把那段抽出來變一個獨立可 review 的 ticket。

## 1. Server — Commands

- [ ] `packages/server/src/combat/commands.ts`
  - `COMBAT_INITIATE` (player → NPC)
  - `COMBAT_PLAYER_ACTION` ('attack' | 'defend' | 'flee', optional `cardId`)
  - `COMBAT_RESOLVE` (terminal — Rule Engine emits, not user)
  - 加進 `LIVING_WORLD_COMMAND_TYPES`
  - validators 完整覆蓋：unknown action / missing combatId / invalid actor

## 2. Server — Rule Engine

- [ ] `packages/server/src/combat/ruleEngine.ts`
  - `evaluateCombatCommand(cmd, snapshot): Event[]`
  - 公式（見 proposal.md）
  - `flee` 成功率（待 reviewer 確認後寫死）
  - 暴擊用 `hash(combatId, actorId, combatRound)` seed — 不可叫 `Date.now()`
- [ ] 接進 `LivingWorldRuleEngine` 主入口（dispatch by command type）

## 3. Server — HTTP

- [ ] `packages/server/src/http/combatRouter.ts`
  - `POST /api/combat/initiate { targetNpcId }`
  - `POST /api/combat/:id/action { action, cardId? }`
  - 用 `requireAuth` 中介
  - 走 `runtime.submitLivingWorldCommand`
- [ ] mount 到 `index.ts` 主 app

## 4. Server — Snapshot / Reducer

- [ ] `kernel/reducer.ts`：對 `COMBAT_*` event 維護 `combat.<combatId>` 子物件
- [ ] retention：`COMBAT_RESOLVE` 後 60 秒從 in-memory snapshot 砍（EventLog 仍留）
- [ ] hydrate-from-EventLog 路徑驗證（boot 時讀完歷史 EventLog 不會崩）

## 5. Web — API + UI

- [ ] `packages/web/src/api/client.ts`：`combatInitiate` / `combatAction`
- [ ] `packages/web/src/components/game/CombatHud.tsx`：
  - 三按鈕（攻擊 / 防禦 / 逃跑），busy 時 disable
  - 雙方 hp bar
  - 上一輪 result row（包含「暴擊 / 普通 / 防禦成功 / 逃跑失敗」標籤）
- [ ] `packages/web/src/components/game/NpcDialog.tsx`：低 trust + NPC `health > 0` 時加「挑釁開戰」按鈕
- [ ] `packages/web/src/state/CombatProjection.ts`：純 derive 自 SSE event

## 6. Tests

- [ ] `combat/ruleEngine.test.ts`
  - 固定 (combatId, actor, target) 雙方軌跡 byte-identical
  - 暴擊判定 deterministic（兩次跑相同 seed 同結果）
- [ ] `combat/replay.test.ts`
  - 同一 EventLog reduce 兩次得相同 combat outcome
- [ ] `combat/router.test.ts`（http 整合）
  - initiate → action → resolve 一條 happy path
  - 玩家不在同 tile → 400
  - flee 成功 → 早結束 + `COMBAT_RESOLVE.outcome === 'fled'`

## 7. Docs

- [ ] `ROADMAP.md`：v0.15 從「規劃中」改 ✅，加實作 commit hash
- [ ] `combat-system/tasks.md`：標記 Phase B 已 ship，留 Phase C / D 未做
- [ ] `MEMORY.md`（auto memory）：更新 deploy state 加「v0.15 combat single-shot 上線」

## 8. 紋卡 hook（不實作，只留設計）

- [ ] `COMBAT_PLAYER_ACTION.payload.cardId?: number` 欄位定義 + reducer 看到時寫 `COMBAT_CARD_IGNORED` warning event
- [ ] **不**寫卡的編譯器；Phase C 才接

## Open questions（待 reviewer 答覆再進實作）

見 `proposal.md` 末段四個 open question。

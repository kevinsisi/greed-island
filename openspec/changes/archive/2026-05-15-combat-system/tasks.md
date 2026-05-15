# Tasks — 即時制紋卡戰鬥系統

> **本 release (v0.14.0) 只做 Phase A — 規劃文件**。Phase B+ 是後續 release 的工作項，這裡列出來是為了讓未來 PR 知道接下來要做什麼。

## Phase A — Spec only（v0.14.0，本 release）

- [x] 寫 `COMBAT_ARCHITECTURE.md` 在 repo 根
- [x] 寫 `openspec/changes/combat-system/proposal.md`
- [x] 寫 `openspec/changes/combat-system/tasks.md`（本檔）
- [x] 寫 `openspec/changes/combat-system/specs/combat-runtime/spec.md`

## Phase B — 單擊判決（v0.15）— ✅ shipped in v0.15.0

驗證 Command/Event/Rule Engine 管線能承載戰鬥 domain。沒有 sub-tick、沒有紋卡、沒有 client 預測。

- [x] `packages/server/src/combat/commands.ts`：`COMBAT_INITIATE` / `COMBAT_PLAYER_ACTION` (action: 'attack' | 'defend' | 'flee') / `COMBAT_RESOLVE` + validators。
- [x] `packages/server/src/combat/ruleEngine.ts`：`CombatRuleEngine.evaluate(command, snapshot)` 一次算完輸贏；damage 公式 + `hashSeed(combatId, actorId, ...)` 暴擊 seed。
- [x] `packages/server/src/http/combatRouter.ts`：`POST /api/combat/initiate { targetNpcId }` + `POST /api/combat/:id/action { action }`。
- [x] `packages/server/src/sim/runtime.ts`：Combat session 透過獨立 `combatStore` 持久化（SQLite combat_sessions + combat_log），不放在 SimulationRuntime 的 EventLog；hydrate from store on boot；Phase B 的 single-shot 判決不需要與 LivingWorld fan-out 共用。
- [x] `packages/web/src/components/game/CombatHud.tsx`：攻擊 / 防禦 / 逃跑 UI + 雙方 hp + 上一輪結果。
- [x] `packages/web/src/api/client.ts`：`combatInitiate` / `combatAction` methods（grep 確認）。
- [x] vitest：`packages/server/src/combat/ruleEngine.test.ts` 涵蓋 deterministic seed + replay 結果。

## Phase C — Real-time sub-tick（v0.16）— 移到獨立 OpenSpec change

Phase C 的工作（sub-tick loop + 紋卡 + 5-phase rule engine + Phaser combat scene + client prediction）已被獨立成 `openspec/changes/combat-phase-c-realtime-subtick/` change，由該 change 追蹤實作進度。本 umbrella 不再重複列項目；上游請看獨立 change 的 tasks.md。

## Phase D — World feedback loop（v0.17）— deferred follow-up

Phase D 的工作項（NPC incapacitated 狀態、玩家敗北 relocate、cardLootSpawns、factionShifts、world history、since-last-visit 戰鬥摘要、AI narrator pre/mid/post 模板、EventLog 戰鬥 retention compaction）保留為未來 OpenSpec change 的 backlog。**目前還沒有獨立 change 追蹤**，因此本 umbrella 對 Phase D 的列項只是 design intent，不是 active task。完成 Phase C 之後再拆 `combat-world-feedback` 或類似名稱的 change。

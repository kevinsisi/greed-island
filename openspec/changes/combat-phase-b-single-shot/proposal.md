# Proposal — Combat Phase B：單擊判決（v0.15 起的第一段戰鬥實作）

## Why

`combat-system/` (v0.14.0) 已把戰鬥架構準則寫進 `COMBAT_ARCHITECTURE.md` 並在 OpenSpec 把 capability 規格 ADDED 進來。下一步必須先用「最簡形」驗證這條 Command → Rule Engine → Event 管線真的能承載戰鬥 domain，再考慮 sub-tick / 紋卡優先級這些更難的東西。Phase B 就是這個最簡形：

- 沒有 sub-tick — 整場戰鬥在 1 個世界 tick 解完。
- 沒有紋卡 — 玩家只有「攻擊 / 防禦 / 逃跑」三按鈕。
- 沒有 client prediction — 出招立刻 await server，server 回傳定案再畫。
- 沒有實時動畫 — 純 HUD 文字 + hp bar。

只要這個能跑、能 replay、能寫進歷史卷軸，Phase C（sub-tick + 紋卡）就可以放心做。把它失敗在最便宜的地方。

關於**紋卡效果**：這 release **不接**。紋卡做為 Command source 的設計是 Phase C 的核心；提早進來只會讓 Phase B 被 priority table、card cancel、status DOT 拖到下個 release 都做不完。Phase B 的判決公式會留 hook（`damageBonus` 欄位接受紋卡 modifier），但卡的編譯器在這次 release 不寫。

## What Changes

### Server

新增 `packages/server/src/combat/`：

- `commands.ts`：`COMBAT_INITIATE` / `COMBAT_PLAYER_ACTION` (`'attack' | 'defend' | 'flee'`) / `COMBAT_RESOLVE`，validators 完整。所有 commands 進 `LIVING_WORLD_COMMAND_TYPES` 同一池，由既有 `submitLivingWorldCommand` fan-out 進 `LivingWorldRuleEngine`（**不**另開 runtime）。
- `ruleEngine.ts`：`evaluateCombatCommand(cmd, snapshot) → Event[]`：
  - `COMBAT_INITIATE` → 寫 1 條 `COMBAT_INITIATE` event；snapshot 的 `combat.<id>` 加一筆 active state。
  - `COMBAT_PLAYER_ACTION` → 算這一輪雙方 action（玩家 vs NPC）+ damage + 結果，寫 0..N 條 `COMBAT_DAMAGE` / `COMBAT_HEAL` / `COMBAT_STATUS_APPLY`，必要時加 1 條 `COMBAT_RESOLVE`。
  - 公式（Phase B 簡形）：
    ```
    base       = 8 + ceil(actor.health * 0.05)
    greedBoost = floor((actor.greed ?? 0.5) * 6)
    patienceMitigation = floor((target.patience ?? 0.5) * 5)
    raw = base + greedBoost - patienceMitigation
    crit = (hash(combatId, actorId, combatRound) % 100) < 12  // 12% 暴擊率
    damage = crit ? raw * 2 : raw
    ```
  - NPC AI 出招用 `hash(combatId, npcId, combatRound) % 3` deterministic：0 attack / 1 defend / 2 flee。
- `http/combatRouter.ts`：
  - `POST /api/combat/initiate { targetNpcId }` → returns `{ combatId, snapshot }`
  - `POST /api/combat/:id/action { action: 'attack'|'defend'|'flee' }` → returns 這一輪解出的 events + 新 snapshot
- `sim/runtime.ts`：snapshot 投影加 `combat.<id>` key（從 reducer 推）；hydrate 自 EventLog（replay-safe）。

### Web

- `api/client.ts`：`combatInitiate` / `combatAction`
- `components/game/CombatHud.tsx`：三按鈕 UI、雙方 hp、上一輪 result row（含 crit 標記、damage 數字）。
- `components/game/NpcDialog.tsx`：在 NPC `health > 0` 且 relationship `low` 時，出現「挑釁開戰」按鈕 → 觸發 `combatInitiate`。
- `state/CombatProjection.ts`：訂閱 SSE，收到 `COMBAT_*` event 重建本地戰鬥 view（純 derive，不寫 hp）。

### Tests

- `combat/ruleEngine.test.ts`：
  - 給定固定 (combatId, actor, target) 算出兩條固定軌跡 → byte-identical replay
  - 暴擊發生與否 deterministic（不靠 `Date.now()`）
  - `flee` 在 `health < 30` 才有可能成功，否則 `COMBAT_FLEE_FAILED` event
- `combat/replay.test.ts`：Reduce 同一 EventLog 兩次，得到相同 combat outcome。

### 紋卡 hook（**留設計，不實作**）

`COMBAT_PLAYER_ACTION` payload 接受 optional `cardId`：
```ts
type CombatPlayerAction = Readonly<{
  combatId: string
  action: 'attack' | 'defend' | 'flee'
  cardId?: number   // Phase C 才開始解析；Phase B 收下後忽略 + 警告
}>
```
Rule engine 看到 `cardId` 寫一條 `COMBAT_CARD_IGNORED` warning event，方便 Phase C 接上時知道哪些舊存檔有 unresolved card 動作。

## Impact

- **Affected specs**：`combat-system/spec.md` 已 ADDED 全部 requirements，這個 release 只滿足其中 *Combat sub-tick is deterministic* 的 replay 子句、*Card play is a typed Command* 的 typed-command 子句。Sub-tick / priority table 等留到 Phase C。
- **Affected code**：新增上面那些檔案，無破壞性 server schema 變化。EventLog 多幾種 event type，reducer 加對應 case；舊客戶端看不懂 `COMBAT_*` event 會被它們忽略（既有 reducer 就是 unknown event = 跳過）。
- **Risk**：
  - `combat.<id>` snapshot key 累積會吃記憶體 — 加 retention：`COMBAT_RESOLVE` 後 60 秒從 in-memory snapshot 移除，但 EventLog 保留。
  - HTTP per-action 對 mobile 反應差 — 接受，Phase B 沒打算解這個。Phase C 的 sub-tick + SSE push 才解。
- **Out of scope**（明確不做）：
  - 紋卡編譯器 / `COMBAT_CARD_PLAY`
  - 卡牌優先級表 / `(actorId, commandId)` 排序
  - Sub-tick loop
  - Client prediction + reconcile
  - `worldEffects` 完整 reducer 套用（faction shift / loot drop） — Phase B 的 `COMBAT_RESOLVE` 只先寫 `outcome` + `damageDealt`，世界回饋留 Phase D
  - AI ambient narrator

## Open questions（請 reviewer 確認再進實作）

1. **NPC 健康度從哪來？** 既有 `NpcRuntimeState.health` 是 0..100 的 mood-like 值，從 `NpcEngine` 推。Phase B 直接拿這個當「戰鬥 hp」夠不夠？還是要新建 `combatHp = health * 2` 之類？
2. **戰鬥能否在玩家不同 area 觸發？** Phase B 想限制在「玩家與 NPC 同 tile」才能 initiate，避免遠距戰鬥的 location consistency 問題。同意嗎？
3. **逃跑成功率公式？** `health < 30 → 80%`、`30..60 → 30%`、`> 60 → 5%` 這樣？還是 `flee` 永遠成功但下一輪 NPC 對該玩家 mood -10？
4. **戰鬥失敗的世界副作用？** Phase B 想做最小：玩家輸 → energy=0；NPC 輸 → 該 NPC `incapacitated` 1 個世界 tick（5 秒）。loot drop / faction shift 留 Phase D。可以嗎？

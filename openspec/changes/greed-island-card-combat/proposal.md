## Why

對齊獵人《貪婪之島》遊戲精髓的戰鬥稽核發現三個斷點：

1. **術式卡與戰鬥完全沒接**：15 張術式卡（天際百貨販售、持有清單）v0.15.0 就 ship，但 Phase C 戰鬥手牌寫死 6 張免費卡 — 「花潮幣買術式卡」對戰鬥毫無意義，違背原作「術式卡是財產、用在關鍵時刻」的核心循環。Phase B 回合制的 `playerCardId` 收到後直接發 `COMBAT_CARD_IGNORED`。
2. **Phase C 即時卡戰 UI（CombatHudPhaseC）從未被任何頁面渲染**，且 sub-tick 引擎沒有 NPC 自主出牌 — 玩家實際只摸得到 Phase B 三按鈕。
3. **Phase D（戰鬥回饋世界）缺一半**：COMBAT_ARCHITECTURE §5.2/§6 規定的勝利紋卡掉落、玩家戰敗掉卡、關係位移從未實作；Phase C 路徑的戰敗 energy 歸零也漏接（只有 Phase B inline 有）。

## What Changes

- **術式卡 ↔ 戰鬥手牌**（`combat/handLoadout.ts` 新檔）：基本牌 TIDE_STRIKE/MEND 人人可用（一般戰鬥保底）；7 張戰鬥型術式卡（1001..1007）各解鎖一個戰鬥卡類別（潮燼一閃→FIRE_LASH、退潮步法→PHASE_SHIFT、織絲縛魂→NO_ESCAPE、潮鼓震盪→STUN、退潮岩盾→SHIELD、潮源回響→COUNTERSPELL、黑潮獸引→HASTE），手牌顯示術式卡名。
- **回合制卡牌戰鬥**（`evaluateCombatRound` 擴充）：`playerCardClass` 把卡效果編譯進回合 — 加傷、回復、護盾減傷、相位完全迴避、震懾使 NPC 跳過行動、束縛禁防、反彈、連擊；全 deterministic、發 `COMBAT_CARD_USED`/`COMBAT_HEAL` 事件。**每場戰鬥每張限用一次**（HxH 一次性術式感），router 以 combat_log 投影驗證 + 持有驗證（403 CARD_NOT_OWNED / 409 CARD_ALREADY_USED）。
- **Phase D 世界回饋**：
  - 勝利紋卡掉落（§6 公式：base 5% + 時長加成 cap 10% + rare window ×2 + safety<30 ×1.3；hash(combatId) deterministic；卡池 = 正典 `acquisitionMethod==='combat_victory'`）→ 既有 `CARD_DROP_SPAWN` 管線（reason `combat_loot`）。
  - 玩家戰敗：energy 歸零統一移至 COMBAT_RESOLVE 消費端（Phase B/C 同路徑）+ 隨身 held 卡 deterministic 掉一張回地上（`CARD_RELEASE`，他人可搶 — 奪卡感）。
  - 目擊者關係位移：在場 NPC 對落敗 NPC respect -8（`NPC_RELATIONSHIP_DIMENSION_ADJUSTED`，上限 6 位）。
  - 新 `runtime.subscribeCombatResolved(cb)` hook 讓 http 層（card pipeline）消費戰鬥終局。
- **Web**：CombatHud（Phase B HUD）加術式卡手牌列（選卡→隨下一個行動施放、已用打勾鎖定）；initiate/active/get 回應帶 `hand` + `usedCardClasses`；NpcDialog 與 AreaPage（動物戰）接線。

## Capabilities

### New Capabilities
- `technique-card-combat`：術式卡解鎖手牌 + 回合制卡效果 + 每場限用一次。
- `combat-world-feedback`：Phase D 戰鬥終局世界回饋（掉卡/奪卡/energy/關係）。

### Modified Capabilities
- _None._（COMBAT_PLAYER_ACTION payload 加 optional `cardClass`，向後相容。）

## Impact

- **Code**: server `combat/handLoadout.ts`、`combat/ruleEngine.ts`、`http/combatLoot.ts`、`http/combatRouter.ts`、`http/server.ts`、`http/cardCommands.ts`（reason union）、`sim/runtime.ts`、`kernel/livingWorldCommands.ts`（兩個 validator 欄位）；web `CombatHud.tsx`、`api/client.ts`、`NpcDialog.tsx`、`AreaPage.tsx`。
- **Tests**: handLoadout（6）、combatLoot（7）、ruleEngine 術式效果（8）— 1200 全綠。
- **Replay/憲法**: 卡效果與掉落全 hash-deterministic；所有世界副作用 event-driven（CARD_DROP_SPAWN / CARD_RELEASE / PLAYER_ENERGY_SET / NPC_RELATIONSHIP_DIMENSION_ADJUSTED）。
- **Deferred**: Phase C 即時 sub-tick 模式的 NPC 自主出牌與 UI 接線（CombatHudPhaseC 保留為未來模式）；§5.2 factionShifts。

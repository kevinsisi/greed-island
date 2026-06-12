## 1. 術式卡 ↔ 戰鬥手牌

- [x] 1.1 `combat/handLoadout.ts`：BASE_HAND + TECHNIQUE_COMBAT_UNLOCKS（7 張戰鬥型術式全對應）+ computeHandLoadout/allowedClassesFor + 測試
- [x] 1.2 combatRouter：TechniqueShopStore 接入（db param）；initiate/initiate-animal/active/:id 回 `hand` + `usedCardClasses`
- [x] 1.3 `/combat/:id/play`（Phase C 管線）也驗持有（403 CARD_NOT_OWNED）

## 2. 回合制卡牌戰鬥

- [x] 2.1 `evaluateCombatRound` 接 `playerCardClass`：TECHNIQUE_ROUND_EFFECT 效果表（加傷/回復/盾/迴避/震懾/禁防/反彈/連擊）+ COMBAT_CARD_USED/COMBAT_HEAL events + 反彈致死終局判定
- [x] 2.2 runtime.submitCombatRoundAction 線 cardClass；COMBAT_PLAYER_ACTION payload + validator 加 cardClass
- [x] 2.3 router action：持有 + 每場限用一次（combat_log 投影判定；409 CARD_ALREADY_USED）
- [x] 2.4 ruleEngine 術式效果測試 ×8（含 replay determinism）

## 3. Phase D 世界回饋

- [x] 3.1 `http/combatLoot.ts`：§6 機率公式 + 正典 combat_victory 卡池 + deterministic roll/pick/position + 測試
- [x] 3.2 `cardCommands` reason union + `runtime.subscribeCombatResolved` hook（resolve 消費端組 info）
- [x] 3.3 server.ts 訂閱：勝利 spawnDrop(combat_loot)；戰敗 listHeldByPlayer + deterministic CARD_RELEASE
- [x] 3.4 energy 歸零統一：Phase B inline 移除，resolve 消費端依 playerEnergyToZero 發 PLAYER_ENERGY_SET（Phase B/C 同路徑）
- [x] 3.5 目擊者 respect -8（上限 6 位）NPC_RELATIONSHIP_DIMENSION_ADJUSTED

## 4. Web 卡牌戰鬥 UI

- [x] 4.1 api client：ServerCombatHandCard 型別；combat 回應帶 hand/usedCardClasses；combatAction 帶 cardClass
- [x] 4.2 CombatHud：術式卡手牌列（選卡→隨行動施放；已用 ✓ 鎖定；按鈕文案「攻擊＋施放」）+ COMBAT_CARD_USED/COMBAT_HEAL 事件描述
- [x] 4.3 NpcDialog（NPC 戰）與 AreaPage（動物戰）接 hand

## 5. Verification

- [x] 5.1 server 1200 tests 全過（+21 新）；web build 乾淨
- [x] 5.2 `npm run build` + `npx openspec validate --all --strict`
- [ ] 5.3 （deferred）Phase C 即時模式 NPC 出牌 AI + CombatHudPhaseC 接線；§5.2 factionShifts；術式卡消耗制評估

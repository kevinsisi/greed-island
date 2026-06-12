## Context

獵人《貪婪之島》的戰鬥精髓：戰鬥本身是「一般戰鬥」（拳腳/念），術式卡是花錢買來、在關鍵回合一次性施放的王牌；戰鬥結果改變世界（卡被奪走、名聲變動）。本 codebase 已有 Phase B 回合制（含 NPC AI 出招）與 Phase C sub-tick 卡播管線，但購卡與戰鬥斷鏈、Phase C UI 未接、Phase D 回饋缺。

## Goals / Non-Goals

**Goals:**
- 買術式卡 → 戰鬥手牌 → 回合施放 → 世界回饋的完整循環。
- 全部 deterministic / event-driven，零新隨機源。
- 不破壞既有 Phase B/Phase C 測試與 replay。

**Non-Goals:**
- 不在本版完成 Phase C 即時模式的 NPC 自主出牌（需要 sub-tick NPC AI 設計；CombatHudPhaseC 保留）。
- 不做 PvP、不做 §5.2 factionShifts（記為 deferred）。
- 不消耗術式卡持有數（cooldown 語意 → 以「每場限用一次」近似；若要真消耗需扣 count，留待玩家經濟驗證後決定）。

## Decisions

### Decision 1 — 卡牌戰鬥落在 Phase B 回合制，不是 Phase C
Phase C sub-tick 缺 NPC 出牌 AI，單方面打靶不是戰鬥。Phase B 已有確定性 NPC AI（攻/防/瞪視），把卡效果編譯進回合即得「出牌＋出招」的對戰節奏 — 最小路徑取得真 gameplay。

### Decision 2 — 每場每張限用一次，從 combat_log 投影判定
HxH 術式卡大多一次性。不新增表：COMBAT_PLAYER_ACTION payload 已含 cardClass，combat_log 是事件投影 → router 掃 log 即 replay-一致的去重依據。

### Decision 3 — urgency/效果數值全在 server 效果表
TECHNIQUE_ROUND_EFFECT 是 rule engine 內常數表；client 只送 cardClass。違規卡 403/409 擋在 router（持有 + 已用）。

### Decision 4 — Phase D 掉卡走既有 CARD_DROP_SPAWN/CARD_RELEASE 管線
§6 原文「掉落走既有管線，不是新檔」。勝利掉卡池改用正典 acquisitionMethod='combat_victory'（比 §6 的 rank≥A 更符合 catalog 設計意圖；池空才退回 rank≥A）。戰敗掉卡用 CARD_RELEASE = 卡回地上重新計時，天然形成「別人可以撿走你的卡」的奪卡張力。

### Decision 5 — energy 歸零移到 COMBAT_RESOLVE 消費端
Phase B inline 發射移除，統一在 publishCommittedEvents 的 resolve 消費端依 payload.playerEnergyToZero 發 PLAYER_ENERGY_SET — Phase B / Phase C 自動同路徑，杜絕雙發與漏發。

## Risks / Trade-offs

- **掉 held 卡只影響未入冊的卡**：已 CARD_STORE 入紋典的卡不會被奪 — 符合原作「入冊的指定卡安全」的直覺。
- **每場限一次而非消耗持有數**：玩家可每場重複用同一張 — 接受（cooldown 語意），數值失衡時再改為扣 count。
- **subscribeCombatResolved 在 commit 同步呼叫**：listener 內再 commit 事件（spawnDrop/release 走 card pipeline 的獨立 log）不會遞迴 EventLog consumer；錯誤被 try/catch 吞掉並 log。

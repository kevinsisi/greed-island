# Greed Island — Roadmap

> 這份 roadmap 是 release-by-release 的工作項摘要。最新狀態在最上面。
> 詳細設計見 `openspec/changes/<change-id>/proposal.md`。
> 架構準則見 `ARCHITECTURE.md` 與 `COMBAT_ARCHITECTURE.md`。

## v0.15.0 ✅ shipped — 2026-05-07

**主題：紋卡系統大重設計 + 戰鬥系統 Phase B**

- ✅ **定序卡 100 張完整重設計**
  - Rank 從 SS/S/A/B/C/D/E/F/G/H 收斂為 S/A/B/C/D（5 階）
  - 10 大分類（潮源系 / 食飲系 / 技藝系 / 地景系 / 潮器系 / 生靈系 / 契約系 / 秘聞系 / 潮術系 / 深淵系），各 10 張 (1×S, 2×A, 3×B, 2×C, 2×D)
  - 新欄位：`category` / `maxCopies` / `effectDescription` / `acquisitionMethod` / `acquisitionDetail`
  - 取得方式 enum：`main_quest` / `side_quest` / `affinity_bond` / `combat_victory` / `shop_purchase` / `location_trigger` / `puzzle_solve` / `random_drop`
  - 高階卡（S/A/B）絕不會隨機掉落 — 必須走任務 / 戰鬥 / 好感度 / 解謎；只有 D 階共 20 張進 random_drop 池子
- ✅ **掉落率大幅調低**
  - 基準 spawn chance 從 1.2% → 0.24% per-tile per-tick（5×降低）
  - 大潮日 (rare window) ×1.8、雨天 ×1.3
  - tile category boosts：鏽灣區→技藝系/秘聞系；潮聲區→地景系/食飲系；霓港區→潮器系/食飲系；地脈層→深淵系/潮術系；浪花區→生靈系
- ✅ **15 張術式卡完整設計** (`packages/server/src/cards/techniques.ts`)
  - 戰鬥型 7 / 探索型 5 / 社交型 3
  - 不掉落，只能在「天際百貨」(t_temple, 霓港區) 用潮幣購買
  - 每張有具體效果 mechanic 描述（Phase C 才接戰鬥引擎 hook）
  - 新表 `player_techniques` 記錄玩家持有
- ✅ **天際百貨商店 router** (`packages/server/src/http/techniqueShopRouter.ts`)
  - `GET /api/shop/techniques`、`POST /api/shop/techniques/:id/buy`、`GET /api/me/techniques`
  - 必須在 t_temple tile + 足夠潮幣 + 未達持有上限
- ✅ **戰鬥系統 Phase B：單擊判決** (`packages/server/src/combat/`)
  - `commands.ts`：`COMBAT_INITIATE` / `COMBAT_PLAYER_ACTION` (attack/defend/flee) / `COMBAT_RESOLVE`，加進 `LIVING_WORLD_COMMAND_TYPES`
  - `ruleEngine.ts`：deterministic 公式 + `hashSeed(combatId, actorId, round)` 暴擊；逃跑永遠成功；玩家輸 energy=0、NPC 輸 incapacitated 5 秒
  - `combatStore.ts`：`combat_sessions` + `combat_log` + in-memory NPC incap map
  - `http/combatRouter.ts`：`POST /api/combat/initiate`、`POST /api/combat/:id/action`、`GET /api/combat/active`、`GET /api/combat/:id`
  - 同 tile 才能戰鬥；player energy=0 不可挑戰；玩家同時只能有一場 active
- ✅ **Web 戰鬥 HUD** (`packages/web/src/components/game/CombatHud.tsx`)
  - 三按鈕（攻擊 / 防禦 / 逃跑）+ 雙方 hp bar + 上回合 result row
  - `NpcDialog` 在 `trust ≤ 30 + npc.health > 0` 時出現「挑戰開戰」按鈕
- ✅ **Personality + history-aware AI greet** (`packages/server/src/npcs/greetLine.ts` + `/api/npc/:id/greet`)
  - 依 trust / interactionCount / sinceTickGap 派生不同 bucket（fresh / hostile / familiar / bonded / reconnect）
  - 仍 deterministic（不靠 AI），但每位玩家對每位 NPC 的招呼會根據關係階段動態變
- ✅ **Architecture 合規**：所有戰鬥動作都產生 typed Command 經 `LivingWorldRuleEngine` 寫進 EventLog（`COMBAT_INITIATE` / `COMBAT_PLAYER_ACTION` / `COMBAT_RESOLVE` 三型）；CombatStore 是 SQLite projection；無 `Math.random()` 進 deterministicKey
- ✅ tests：`combat/ruleEngine.test.ts` 7 tests、`cards/catalog.test.ts` 9 tests，全 100 tests pass

OpenSpec: `combat-phase-b-single-shot/`（archived） + `card-catalog-redesign/`（new for v0.15）

## v0.14.1 ✅ shipped — 2026-05-07

**主題：NPC dialog 空狀態 personality-based + 戰鬥 Phase B OpenSpec**

- ✅ NPC dialog 空狀態 placeholder 從單一 i18n string「看了你一眼，沒有開口」改成 server 派生、依 personality 因人而異
  - 新 `packages/server/src/npcs/greetLine.ts`：6 個 bucket（reserved / temple / guild / cheerful / greedy / gruff / neutral），用 profile.personality (calmness / patience / greed / factionLean) 決定，profile id hash 挑句子（deterministic）
  - `SimNpcState.greetLine` + `NpcSummary.greetLine` 透傳到 web；`NpcDialog.tsx` 在 `turns.length===0` 顯示這句話而不是 i18n fallback
  - 修 v0.14.0 後使用者誤判「dialog 還在壞」（其實是空狀態占位符跟舊 fallback 視覺一致造成的誤會）
  - 7/7 unit tests 過
- ✅ `openspec/changes/combat-phase-b-single-shot/`：把 v0.15 戰鬥 Phase B 從 `combat-system/` 規劃單抽出來變獨立可實作 ticket，列出 Open Questions 等 reviewer 答覆再進實作
- ✅ frame-processor docker stack 確認上線（`100.83.112.20:8533` web / worker+postgres+redis healthy）

## v0.14.0 ✅ shipped — 2026-05-07

**主題：World Pressure 視覺化 + Dialog 修復 + 介入爭執走 Rule Engine + 戰鬥系統規劃**

- ✅ Gemini-2.5-flash `thinkingBudget=0` 修 NPC dialog 全部 fallback
- ✅ HubPage MapScene 只畫 `activity=move` 的 NPC（區域內 NPC 只在 AreaPage 顯示）
- ✅ MapScene tile 視覺化：safety<40 暗紅 / economy>70 金 / dominantFaction 派系外框
- ✅ AreaScene NPC mood<30 灰名 / health<30 🤕
- ✅ NPC 互動事件排除建築內 NPC（修「鏽灣區起爭執但 NPC 在建築內」）
- ✅ Cross-tile schedule 改 role-based（商店 / 工匠 / 公務 不被硬塞跨區）
- ✅ AreaState 持久化 `pressureCooldowns` + recovery / faction.rising threshold-crossing 事件
- ✅ `SinceLastVisitPanel` modal 取代單行 toast，事件 row 點擊跳區域
- ✅ 玩家介入 NPC 爭執（自由文字 + AI 意圖分類）走 Command → Rule Engine → Event 管線
  - 新 `PLAYER_INTERVENE` 命令型別 + `runtime.submitLivingWorldCommand` 對外入口
  - Gemini classify message → mediate / provoke / watch / threaten
- ✅ 戰鬥系統規劃文件：`COMBAT_ARCHITECTURE.md` + `openspec/changes/combat-system/`

OpenSpec: `world-pressure-and-dialog-fixes/` + `player-intervene-and-combat/` + `combat-system/`

## v0.15.x — Phase B 後續強化（暫無排程）

**Goal：v0.15.0 Phase B 已 ship；以下是 Phase B 範圍內未做的補強**

- [ ] 玩家介入爭執前端 UI（HubPage / AreaPage 看到 argument 時跳出 modal，4 按鈕 + message 輸入框）
- [ ] 戰鬥事件接 `summarizeWindow` → `SinceLastVisitPanel` 顯示「不在時打了 N 場」
- [ ] 戰鬥失敗的世界副作用更完整：玩家 carry slot 隨機掉一張卡、NPC 倒地進 buildings 拉長至更可感知的時間
- [ ] 100 張定序卡與術式卡的紋典 UI 分組（按 category）+ 商店 / 任務獎勵 hook 上線

## v0.16 — 戰鬥系統 Phase C：實時 sub-tick + 紋卡

**Goal：升級到實時戰鬥 + 紋卡互動優先級**

- [ ] sub-tick loop（10 Hz 預設，可調 5~20 Hz）
- [ ] 紋卡 commands：`COMBAT_CARD_PLAY` / `COMBAT_DAMAGE` / `COMBAT_STATUS_*` / `COMBAT_PHASE_SHIFT` / `COMBAT_TARGET_LOCK*` / `COMBAT_FLEE_ATTEMPT` / `COMBAT_DEFEAT`
- [ ] 5-phase 結構：STATUS_TICK → CARD_PLAY → DAMAGE/HEAL → DEFEAT → RESOLVE
- [ ] 卡牌優先級表 + tie-break (`actorId, commandId`)
- [ ] `web` `CombatScene.ts` (Phaser) + `CombatProjection`（訂閱 SSE，純 derive）
- [ ] Client prediction + reconcile（server reject → 回滾 + toast）
- [ ] `tickDigest` hash sanity check + snapshot fallback

## v0.17 — 戰鬥系統 Phase D：世界回饋迴圈

**Goal：戰鬥結果完整融入世界**

- [ ] `COMBAT_RESOLVE.worldEffects` 完整定義 + reducer 消化
- [ ] NPC defeated → `incapacitated` 1h；玩家 defeated → energy=0 + carry slot 隨機掉卡
- [ ] `cardLootSpawns` 走既有 `CARD_DROP_SPAWN`
- [ ] `factionShifts` 套到 `area.state.<tile>.factionControl`
- [ ] 歷史卷軸：`world_history` 表 + `SinceLastVisitPanel` 加「戰鬥」section
- [ ] AI ambient narrator pre/mid/post combat narration
- [ ] EventLog retention：戰鬥結束 7 天後 sub-tick 細節 → `COMBAT_HISTORY_COMPACT`

## 已 shipped（往前的 release）

- **v0.13.0** — 紋卡 Rule Engine 管線（`CardActionPipeline`）+ 天氣/區域 spawn + 精力 timer 誤差 + Since-Last-Visit + 長按實體化 + MapScene tween
- **v0.12.1** — MapScene / BuildingScene 共用 `npcVisuals`；後端 NPC color + activity 推到三場景
- **v0.12.0** — NPC sprite 完全後端驅動（subCol/subRow exploration）+ 角色色四色 + 活動 emoji；AI dialog parser 寬鬆化
- **v0.11.0** — Living Deterministic World：Command/Event/Rule Engine 雙路徑、NPC Memory + Relationships 投影、AI dialog on-topic
- **v0.10.0** — World Pressure（AreaStateEngine）+ Buildings + AI Ambient Narrator
- **v0.9.x** — NpcEngine schedule + activity；紋卡掉落 + 紋典 + 紋卡交易（60 秒法則 + RANK_EXISTENCE_CAP）

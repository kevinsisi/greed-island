# Proposal — 玩家介入 NPC 事件 + 戰鬥系統規劃

## Why

紋卡 Living World 已經會自己生成 NPC↔NPC 互動（chat / argue），但玩家是觀察者：看到「A 和 B 在 X 區起爭執」之後沒有任何 affordance 介入。玩家的存在對世界沒有反饋，世界只是自己跑。要讓世界覺得玩家「在裡面」，至少要做兩件事：

1. **玩家介入 NPC 爭執**（這個 release 的 basic 版）：當 player 看到 argument 事件、又站在事件 tile 上，可以選 *煽風點火* / *當和事佬* / *旁觀*。介入會推 NPC 的 mood 和 player 對雙方 NPC 的好感度。
2. **戰鬥系統**（這個 release 只規劃 spec、不實作）：派系衝突升級成肢體衝突 (NPC vs NPC)、玩家被 NPC 主動敵對 (NPC vs Player)、玩家挑釁 NPC (Player vs NPC) 都需要一條「真正會死人 / 流血 / 紋卡掉落」的後續流程，否則 living world 的張力到不了 climax。

## What Changes

### v0.14.0 — 玩家介入爭執（含自由輸入 + AI 意圖分類 + Rule Engine 路徑）

- **新 endpoint `POST /api/npc/intervene`**：body 形狀：
  - `{ npcA, npcB, mode?: 'mediate' | 'provoke' | 'watch' | 'threaten' }` — 純按鈕介入
  - `{ npcA, npcB, message: string }` — 玩家自由輸入；後端 AI 分類成 mode
  - `{ npcA, npcB, mode, message }` — 兩個都傳；**message 優先 + AI 分類覆蓋 mode**
- **驗證**：兩位 NPC 都在 runtime、同一 tile、不在建築內；至少傳 `mode` 或 `message` 之一；message ≤ 800 字。
- **AI 意圖分類**（玩家有打字時觸發）：用 Gemini-2.5-flash + `thinkingBudget: 0` + 32 token 上限的低開銷 prompt，把 message 分成四類：
  - `mediate`：嘗試調解 / 勸架 / 把雙方拉開
  - `provoke`：火上加油 / 起鬨 / 選邊站 / 貶低一方
  - `threaten`：威脅暴力 / 命令住口 / 最後通牒
  - `watch`：純評論 / 中立 / 沒有實質行動
  - AI 失敗 → fallback 到 `explicitMode` 或 `watch`
- **Rule Engine 路徑（合規 ARCHITECTURE.md §1.1）**：
  1. `PLAYER_INTERVENE` 加進 `LIVING_WORLD_COMMAND_TYPES`，新 payload type `PlayerIntervenecmd`
  2. `LivingWorldRuleEngine.evaluate()` 認識並驗證新命令
  3. Endpoint 流程：build typed Command → `runtime.submitLivingWorldCommand` → Rule Engine 驗證 → typed Event 寫進 EventLog → fan out 給 npcMemory / npcRelationships projection + SSE listeners
  4. AI 只在第 0 步做意圖分類（read-only），決策結果進 Command payload，不直接寫 EventLog
- **副作用（PlayerStateStore 套 trust + personal_event）**：
  - `mediate`：兩位 trust+2、mood+2
  - `provoke`：對 mood 較低一方 trust+1、另一方 trust-3、雙方 mood-3
  - `threaten`：兩位 trust-4、mood-5
  - `watch`：trust / mood 不動，僅寫 personal_event
- **回應**：`{ ok, intentClass, classifiedByAi, message, narration, eventId, sequence, effects: {...} }`

### 下個 release 補的部分

- 前端 AreaScene 在 `argument` 發生時顯示 4 個按鈕（煽風點火 / 當和事佬 / 旁觀 / 威脅）+ 文字輸入框，帶 N 秒倒數窗口
- 把 `npc_relations` / `personal_events` 也用 EventLog 投影方式取代（這次仍直接寫表，跟既有 dialog endpoint 行為一致）

### v0.15+ — 戰鬥系統（規劃 only，這個 release 不實作）

戰鬥系統的完整規劃移到獨立的 OpenSpec change `openspec/changes/combat-system/`
與 repo 根目錄的 `COMBAT_ARCHITECTURE.md`。重點：

- **即時制紋卡戰鬥**（不是回合制），走獨立的 sub-tick clock (5~20 Hz)，但仍是 Living World 的高頻 sub-runtime — 同一個 EventLog、同一個 Command/Event/Rule Engine 介面。
- **紋卡 = Command 來源**：玩家或 NPC 出牌 = 提交 `COMBAT_CARD_PLAY`，效果由 `CombatRuleEngine` 編譯成 sub-commands（傷害 / 狀態 / 防禦）寫進 EventLog。
- **規則互動 + 優先級**：兩張卡同 sub-tick 互相影響時 (`NO_ESCAPE` vs `PHASE_SHIFT`)，Rule Engine 用 deterministic priority table 解析。
- **Client 投影 + 樂觀預測**：客戶端 derive 自 events，出牌立刻畫動畫；server reject 後 reconcile。
- **戰鬥結果回饋世界**：`COMBAT_RESOLVE.worldEffects` 列舉所有跨領域影響（hp / faction / loot / 歷史卷軸），世界 reducer 自己消化。
- **AI 只做旁白**：pre/mid/post combat narration，read-only，不影響戰鬥計算。
- **階段藍圖**：Phase A 規劃 only (本 release v0.14.0) → Phase B 單擊判決 (v0.15) → Phase C real-time sub-tick (v0.16) → Phase D world feedback loop (v0.17)。

詳細：見 [`openspec/changes/combat-system/proposal.md`](../../combat-system/proposal.md) + [`COMBAT_ARCHITECTURE.md`](../../../../COMBAT_ARCHITECTURE.md)。

## Impact

- **Affected specs**：simulation-kernel 不變（intervene 還沒走 Command）；後續 v0.15 戰鬥系統會新增 3 個命令型別。
- **Affected code**（v0.14.x basic intervene）：
  - server：新檔 `http/intervention.ts` 或在 `http/npc.ts` 加 `/intervene`；`http/playerState.ts` 接受 `mediation_event` 紀錄。
  - web：暫時不加 UI（下個 release 再做）。可選：API 客戶端加 `npcIntervene(token, npcA, npcB, mode)`。
- **資料遷移**：basic 版直接寫現有 `npc_relations` / `personal_events`，無新 schema。
- **Risk**：basic 版繞過 Rule Engine，違反 ARCHITECTURE §1.1（所有狀態變更走 Command → Event）。**標記為 v0.14.x 的技術債**，必須在 v0.15 補完整 Command 路徑後才能算正式 living-world 機制。

## Archive note

Archived as proposal-only historical context on 2026-05-13 because it had no formal OpenSpec deltas and blocked `openspec validate --all --strict`. Future player-as-civilization work should be re-proposed under Phase 6 using `docs/WORLD_CAPABILITIES.md` §42.1 and must not reuse the v0.14 direct-mutation debt path.

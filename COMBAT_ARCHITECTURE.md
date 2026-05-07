# Greed Island — Deterministic Real-Time Combat Runtime

> 這份文件是即時制紋卡戰鬥的架構準則。所有戰鬥相關程式碼必須符合本文，
> 並繼承 [`ARCHITECTURE.md`](./ARCHITECTURE.md) 的命令-事件分離原則。
>
> 戰鬥不是「分支系統」 — 戰鬥就是 Living World 的一個高頻 sub-runtime，
> 走一樣的 Command → Rule Engine → Event 管線，差別只在 tick 速度與作用域。

## 0. 核心原則（不可違反）

1. **同樣的 Command/Event 法則**：戰鬥的每一個動作都必須是一個 typed
   Command，由 Combat Rule Engine 編譯成 typed Event 寫進 EventLog。
   沒有 Command 就沒有 Event；沒有 Event 就沒有 WorldState 改變。
2. **戰鬥 tick 與世界 tick 解耦但對齊**：戰鬥走自己的高頻 tick
   (`combatTickRate` ∈ [5, 20] Hz)；每個戰鬥 tick 仍記錄為一個世界
   `tick` 的小數延伸 — 戰鬥事件在 `tick` 欄位寫世界 `tick`，並在
   payload 帶 `combatTick`（戰鬥內部單調遞增整數）。Replay 時雙
   key 排序：先 `tick`、再 `combatTick`。
3. **紋卡是 Command 來源**：玩家 / NPC「打」一張紋卡 = 提交一個
   `COMBAT_CARD_PLAY` 命令。卡的效果由 Rule Engine 編譯，不是 client
   端直接套效果。Client 只做樂觀預測 (optimistic prediction)，
   Server 才有權威。
4. **Rule Engine 解析卡牌互動 + 優先級**：兩張同 tick 提交的卡互相影
   響時（例如 A 出 `NO_ESCAPE`、B 同 tick 出 `PHASE_SHIFT`），由
   Rule Engine 用 deterministic priority table + tie-break key 決定
   解析順序，產生有序的 Event 串。
5. **Client 是投影層**：Client 拿到的是已 commit 的 Event 串。它可以做
   client-side prediction（提交 Command 後立刻畫動畫），但任何畫面
   結果在收到 Server 的 authoritative event 後必須能 reconcile。
6. **AI 只做旁白**：Ambient narrator 可以為「決勝局」「絕殺」「敗北」
   寫一段敘事，但 AI 不下 Command、不改 hp / 不影響卡的優先級。
7. **戰鬥結果回饋世界**：戰鬥結束 emits `COMBAT_RESOLVE` event，這
   個 event 會被世界的派系 / NPC 關係 / area state / 歷史紀錄 reducer
   消化，產生持久影響。沒有「戰鬥獨立沙盒」這種事。

## 1. Tick 與時間模型

### 1.1 雙 tick 階層

```
World tick (5s)              ──┬───────┬──────┬──────┬──...
                                │       │      │      │
                                │       └─Combat sub-tick (50–200ms)
                                │             instance ID = combatId
                                │             internal counter combatTick
                                │
                                └─Combat session bounded by [startTick, endTick] in world ticks
```

- **World tick 5s**：原本的 living-world tick rate（`config/world.ts`
  的 `TICK_DURATION_MS = 5000`）。所有 NPC routine、area pressure、
  weather / season 都走這個。
- **Combat sub-tick**：戰鬥開始時 `runCombatLoop` 啟動一個獨立的
  `setInterval(combatTickMs)`，`combatTickMs` 預設 100ms（10 Hz）；
  可調 [50, 200] ms。
- **時間關係**：
  - 戰鬥內 events 的 `tick` 欄位 = 戰鬥開始時的世界 tick（不變動），
    避免戰鬥中世界 tick 跳動造成 EventLog 排序不一致。
  - `payload.combatTick` 是戰鬥內單調遞增整數（從 0 開始）。
  - `payload.combatId` 把同一場戰鬥的 events 黏起來。
- **戰鬥結束**：emit `COMBAT_RESOLVE` event 後，combatId 的 sub-tick
  loop 終止；戰鬥結果（勝負、傷亡、紋卡掉落）在當前世界 tick 立即生效。

### 1.2 Determinism 保證

戰鬥 sub-tick 必須做到：
- **No wall-clock dependency**：所有計算只看 `combatTick`、`combatId`、
  payload；不看 `Date.now()`。
- **Sub-tick 排序穩定**：同 `combatTick` 內多個 commands 用
  `(actorId, commandId)` lexicographic 排序，確保 replay 一致。
- **No randomness without seed**：任何隨機（暴擊、AI 出牌偏好）必須用
  `hash(combatId, combatTick, actorId)` 做 seed，純 deterministic。
- **No external IO**：rule engine 不讀資料庫、不打 AI；只看 events 與
  commands。

## 2. Command Catalog (combat-domain)

加進 `LIVING_WORLD_COMMAND_TYPES` 或新建 `combat/commands.ts` 與
`COMBAT_COMMAND_TYPES`（建議獨立檔，但走相同 Command/Event 介面）：

```ts
COMBAT_INITIATE       // 觸發戰鬥；payload: { combatId, participants[], reason, scope }
COMBAT_TICK           // 每個 sub-tick 走一次；rule engine 用來推 cooldown / dot
COMBAT_CARD_PLAY      // actor 出一張紋卡；payload: { combatId, actorId, cardId, target?, charge }
COMBAT_CARD_CANCEL    // 取消正在 channel 的紋卡（被打斷或玩家自己 cancel）
COMBAT_DAMAGE         // rule engine 解析後產生；payload: { combatId, source, target, amount, kind }
COMBAT_HEAL           // rule engine 產生
COMBAT_STATUS_APPLY   // dot / buff / debuff
COMBAT_STATUS_TICK    // dot / buff 每秒結算
COMBAT_STATUS_END     // 狀態結束（cleared / expired）
COMBAT_TARGET_LOCK    // NO_ESCAPE 之類的「鎖定不可移動」狀態
COMBAT_PHASE_SHIFT    // PHASE_SHIFT 把 actor 移到平行相位（規避 NO_ESCAPE）
COMBAT_FLEE_ATTEMPT   // 嘗試逃跑
COMBAT_DEFEAT         // 一方 hp ≤ 0；payload: { combatId, defeatedId, victorIds }
COMBAT_RESOLVE        // 戰鬥終局；payload: { combatId, outcome, durationCombatTicks, lootDrops, factionShifts }
```

每張紋卡的「效果」是它生成的 sub-commands（不是 client-side hardcode）。
舉例：`fire_lash` 卡播放後 → rule engine 產
`COMBAT_DAMAGE { kind: 'fire', amount: f(power, target.element) }`
+ `COMBAT_STATUS_APPLY { effect: 'burn', duration: 30 combatTicks }`。

## 3. Rule Engine — 卡牌互動解析

### 3.1 Phase 結構（每個 sub-tick）

```
gather inbound commands for this combatTick
  ↓
Phase 1: STATUS_TICK  — 把 dot / buff 走一輪
  ↓
Phase 2: CARD_PLAY    — 解析所有卡，依優先級表 + tie-break
  ↓
Phase 3: DAMAGE/HEAL  — 套到 hp pool，clamp [0, max]
  ↓
Phase 4: DEFEAT check — 任一方 hp = 0 → emit COMBAT_DEFEAT
  ↓
Phase 5: RESOLVE check — 所有 hostile actor defeated → emit COMBAT_RESOLVE
  ↓
emit ordered Event list to EventStore
```

### 3.2 卡牌優先級表（範例）

```
priority 0 (最高，最先解析)：
  PHASE_SHIFT, COUNTERSPELL, INTERRUPT
priority 1：
  TARGET_LOCK / NO_ESCAPE / SILENCE
priority 2：
  damage cards (fire_lash, tide_strike, ...)
priority 3：
  utility (heal, shield, refresh)
priority 4 (最低)：
  dot ticks, regen ticks
```

同一 priority 內 tie-break 用 `(actorId, commandId)` lexicographic。
`PHASE_SHIFT` 在 `NO_ESCAPE` 之前解析 → 玩家可以用 `PHASE_SHIFT` 規避鎖定。

### 3.3 解析範例（A.NO_ESCAPE vs B.PHASE_SHIFT 同 sub-tick）

1. Phase 2 收到兩個 CARD_PLAY commands 在同 combatTick。
2. 排序：PHASE_SHIFT priority 0、NO_ESCAPE priority 1。
3. 先解析 PHASE_SHIFT：emit `COMBAT_PHASE_SHIFT { actor: B }`，B 進入
   `phase=alt` 狀態。
4. 再解析 NO_ESCAPE：rule engine 看 B 的 `phase=alt` → A 的鎖定無法套
   到 alt phase 的 actor → emit `COMBAT_TARGET_LOCK_FAIL { ... }`。
5. Client 收到 ordered events，畫面播 PHASE_SHIFT 動畫 → NO_ESCAPE 失敗
   特效。畫面結果跟伺服器一致。

## 4. Client 端 — Projection + Prediction

### 4.1 投影

Client 訂閱戰鬥 events（既有 SSE 通道，filter `combatId`）。
每個收到的 event 直接套到 client 的 `CombatProjection`：

```
hp[actorId]
status[actorId][effect] → { remainingTicks, stacks }
phase[actorId] → 'main' | 'alt'
locked[actorId] → boolean
combatLog → ordered narrative
```

Client 的「戰鬥畫面」純 deriving 自 `CombatProjection`，不持有任何權威資料。

### 4.2 樂觀預測

玩家點「出牌」→ client 立刻畫動畫 + 更新 local projection 預測值，
同時 POST `COMBAT_CARD_PLAY` 命令。Server 回 commitment（accepted /
rejected）後：
- accepted：客戶端的預測通常會被接續到的 authoritative event 確認，
  畫面繼續播放。
- rejected：`COMBAT_CARD_PLAY_REJECTED { commandId, reason }` →
  client 回滾 local projection（hp 補回、status 移除）+ 顯示 toast。

### 4.3 Reconciliation

每個 sub-tick 結尾，client 用 server 的 `combatTick` event sequence
做 sanity check：如果 client 的 projection hash != server 在同
combatTick 的 hash（鎖在 event payload 上的 `tickDigest`），client
強制重 sync — 拉一份 `GET /api/combat/:combatId/snapshot`。

## 5. 戰鬥觸發 → 結果

### 5.1 觸發

`COMBAT_INITIATE` 由以下 source 之一產生：
- **NPC vs NPC（派系衝突升級）**：`AreaStateEngine` 看到
  `factionControl[A] >= 95` + 對立派系 NPC 在同 tile，emit。
- **Player 主動挑戰**：玩家在 AreaPage 對 hostile NPC 點「挑戰」按鈕，
  client POST `/api/combat/initiate { targetNpcId, cardLoadout }`。
- **NPC 主動敵對**：NPC mood < 10 + faction 敵對 + 同 tile + deterministic
  hash 觸發。

### 5.2 結果（emit `COMBAT_RESOLVE`）

`COMBAT_RESOLVE.payload` 包含：

```ts
{
  combatId,
  outcome: 'player_victory' | 'npc_victory' | 'draw' | 'flee',
  durationCombatTicks: number,
  // 影響世界的衍生 commands — rule engine 在世界 reducer 套用
  worldEffects: {
    hpDelta: { [actorId]: number },           // 持久 hp 變化
    npcDefeated: string[],                    // → 1h incapacitated
    playerDefeated: boolean,                  // → energy=0, carry slot 隨機掉一張
    factionShifts: { [tile]: { [faction]: delta } },
    cardLootSpawns: Array<{ cardId, tile, x, y }>,
    relationshipShifts: Array<{ playerId, npcId, delta }>,
    historyEntry: { templateId, narration }   // 歷史卷軸
  }
}
```

世界 reducer 看到這個 event 就把 `hp` / `area.state.<tile>.factionControl`
/ `npc_relations` / `world_card_drops` 等更新。**所有世界副作用都是
event-driven，不是 endpoint 直接寫表**。

## 6. Loot / 紋卡掉落

戰鬥結束有概率掉一張稀有紋卡：
- 機率基準：`base = 0.05`（5%）
- 戰鬥時長加成：`min(0.10, durationCombatTicks * 0.0001)`
- rare window 期間：×2
- area state safety < 30：×1.3
- 對戰雙方 archetype 加成（mystic 雙方戰鬥更可能掉稀有）：±0.05
- 卡 id 從 `cards/catalog.ts` 篩 rank ≥ A 用 hash(combatId) 抽

掉落走既有 `CARD_DROP_SPAWN` command（v0.13.0 既有管線），不是新檔。

## 7. AI 邊界（read-only）

AI 在戰鬥中只負責三件事，全部 **不影響 EventLog**：
1. **Pre-combat narration**：戰鬥開始時的場景敘述（誰挑誰、地點氛圍）
2. **Mid-combat ambient**：每 N combatTicks 一段「圍觀者反應 / 環境變化」
3. **Post-combat narration**：勝負敘事，寫進 `historyEntry.narration`

AI 不下 Command、不改 hp / cooldown、不影響 priority。AI 失敗 →
ambient 直接 fallback 到 deterministic 模板（`AmbientNarrator` 既有
模式）。

## 8. 違反本文的 PR 必須拒絕

審查 checklist：
- [ ] 任何戰鬥動作都產生一個 typed Command，且只有 Rule Engine 能編譯成 Event
- [ ] Sub-tick 沒有依賴 `Date.now()` / `Math.random()` 不帶 seed
- [ ] Client 沒有直接寫 hp / status — 只 derive 自 events
- [ ] AI 沒有產生 Event，沒有改變 priority / damage 計算
- [ ] `COMBAT_RESOLVE.worldEffects` 列舉所有跨領域影響，不靠 endpoint 後置寫表
- [ ] 戰鬥 events 與世界 events 共用同一個 EventLog，可 replay

## 9. 階段性實作（指引，不是 PR scope）

- **Phase A — Spec only (v0.14.0)**：本文 + OpenSpec change `combat-system/`，
  無程式碼。
- **Phase B — 單擊判決（v0.15）**：先做最簡形：玩家點「攻擊 / 防禦 /
  逃跑」三按鈕，後端一次性算完輸贏。沒有 sub-tick loop，純 1 個世界 tick
  做完。驗證 Command/Event 管線是否能承載戰鬥 domain。
- **Phase C — Real-time sub-tick（v0.16）**：在 Phase B 基礎上加
  `combatTick` sub-loop、cards、優先級解析、client prediction。
- **Phase D — World feedback loop（v0.17）**：完整 worldEffects reducer
  消化、歷史卷軸、loot drops。

## 10. 與既有架構的接合點

- `ARCHITECTURE.md` §1.1 命令-事件分離 → 戰鬥沿用，不破例。
- `ARCHITECTURE.md` §1.3 deterministic key → 戰鬥 events 的 key seed
  必須包含 `combatTick` 才不會與其它 living-world events 同 hash。
- `ARCHITECTURE.md` §9 AI advisory only → 戰鬥嚴格遵守。
- `simulation-kernel` spec → 戰鬥 events 通過同一個 reducer，不開後門。

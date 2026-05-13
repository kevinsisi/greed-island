# Greed Island — Runtime Constitution & Civilization Program

一個 deterministic、event-sourced、civilization-driven 的世界模擬系統。

這份文件不是 roadmap，而是：

- 定義世界「現在是什麼」
- 定義世界「未來必須變成什麼」
- 定義「哪些東西是核心原則，不能被破壞」
- 定義「接下來的演化順序」

換句話說。

這不是遊戲設計文件。

這是文明模擬憲法。

人類很喜歡把所有東西寫成 TODO List，最後專案就會像被塞滿紙箱的倉庫。
所以這份文件要做的事情，是把「世界法則」與「功能清單」分離。

否則半年後你會開始問：

- 「為什麼這個 NPC 可以瞬移運貨？」
- 「為什麼 AI 突然知道不存在的人？」
- 「為什麼 settlement 根本只是換名字的 tile？」

然後整個 deterministic simulation 就開始腐爛。

很典型的人類行為。

---

## 1. Core Identity

### 1.1 Greed Island 不是 MMORPG

Greed Island 的本質：

- 不是 MMO server
- 不是 AI NPC showcase
- 不是 sandbox builder
- 不是 procedural content generator
- 不是 player-centric open world

Greed Island 是：

> 一個會自行演化的 deterministic civilization simulation。

玩家只是世界中的 actor。
不是世界的中心。

世界不會等待玩家。
NPC 不會因為玩家離線停止存在。
文明不會因為 client 關掉而停止演化。

這是最重要的原則。

---

## 2. Non-Negotiable Runtime Laws

以下規則屬於「不可破壞層」。
任何 feature 若違反，視為 architecture regression。

### 2.1 Event Reality Principle

只有 committed Event 是真實。

所有 State 都只是 EventLog 的 projection。

```text
Command
  → Rule Engine
    → Event
      → Projection
        → Read Model
```

禁止：

- mutable runtime truth
- hidden state
- AI 直接修改 state
- bypass reducer
- projection 反向寫入 canonical state

### 2.2 Determinism Principle

相同：

- EventLog
- Ruleset
- Seed

必須產生：

- 完全相同的 WorldState

禁止：

- `Math.random()`
- wall-clock logic
- nondeterministic ordering
- async race mutation

所有 randomness 必須來自 deterministic seed。

### 2.3 Tick Principle

世界以 tick 前進。

不是以真實時間。

wall-clock 只是 scheduler。

simulation reality 必須只依賴：

```text
(currentTick, EventLog, Ruleset)
```

不是：

- `Date.now()`

因為那會讓 replay 爛掉。

Replay 爛掉之後。
你得到的就不是 simulation。
而是「帶資料庫的即時聊天室」。

### 2.4 AI Read-Only Principle

AI 永遠只能存在於 perception layer。

AI 可以：

- 描述
- 解讀
- 敘事
- 對話
- 推測感受
- 生成 atmosphere

AI 不可以：

- 創造世界真相
- 提交 event
- 修改 world state
- 發明不存在的人
- 修改規則

AI 是 observer。
不是 god object。

---

## 3. Runtime Layer Model

整個世界分成五層。

每層只能透過 Command interaction。
不能直接改下一層 state。

```text
Layer 5 — Perception Runtime
  AI narration / dialog / rumors / history

Layer 4 — Combat Runtime
  Combat / card operators / tactical resolution

Layer 3 — Civilization Runtime
  Settlement / economy / logistics / territory

Layer 2 — Living World Runtime
  NPC routines / movement / weather / world events

Layer 1 — Simulation Kernel
  Deterministic event runtime
```

---

## 4. Current Reality Assessment

目前專案最成熟的是：

### Strongest Layer

**Layer 1 — Simulation Kernel**

已經具備：

- deterministic replay
- event sourcing
- append-only EventLog
- atomic tick
- deterministic random
- reducer pipeline
- command validation

這層其實已經接近 production-grade simulation kernel。

真正危險的不是 kernel。

而是：

上層文明系統幾乎還不存在。

### Partially Complete Layers

**Layer 2 — Living World**

目前已經有：

- NPC routine
- movement
- interaction
- memory
- relationship
- weather
- seasons
- world agenda
- productive actions
- autonomous construction

但仍缺：

- migration
- trade
- rumor propagation
- mentorship
- culture
- long-term identity

現在的 NPC 比較像：

> 有 schedule 的 simulation actor

而不是 civilization citizen。

### Weakest Layer

**Layer 3 — Civilization Runtime**

目前真正存在的只有：

- construction slice
- resource scalar
- faction pressure scalar

這不叫 civilization。

這叫：

> 「看起來像 civilization 的 placeholder。」

缺失包括：

- settlement entity
- goods
- logistics
- market
- territory
- supply chain
- production chain
- resource transport
- infrastructure
- faction expansion
- settlement lifecycle

目前 economy 只是數字。

不是代謝系統。

這是接下來最大的工程區塊。

---

## 5. Civilization Runtime Vision

### 5.1 Settlement Is a Real Entity

Settlement 不等於 tile label。

Settlement 必須擁有：

- population
- storage
- economy
- trade routes
- faction alignment
- territory
- production capacity
- stability
- expansion pressure

Settlement 必須：

- 能成長
- 能衰退
- 能分裂
- 能被佔領
- 能消失

否則只是靜態地圖。

### 5.2 Economy Must Become Metabolism

真正的 civilization simulation：

不是 `economy = 87`。

而是：

```text
ore
  → ingot
    → tools
      → construction
```

以及：

```text
fish
  → food
    → survival
      → population growth
```

Goods 必須是可追蹤實體。

不是 abstract scalar。

因為文明真正重要的是：

> 資源如何流動。

不是資料表裡有幾個數字。

### 5.3 Logistics Is Civilization

沒有 logistics。
就沒有 civilization。

只有 disconnected resource islands。

因此：

- goods 不能 teleport
- carrier 必須實際移動
- route 必須存在
- disruption 必須產生 shortage

玩家破壞 bridge。

應該真的讓某 settlement 飢荒。

否則 combat 沒有歷史意義。

### 5.4 Culture Must Emerge

文化不是 JSON config。

文化是：

> recurring collective behavior remembered across time。

例如：

- festival
- ritual
- mourning
- ideology
- regional norms
- inherited beliefs

如果 NPC 永遠只是 schedule-driven。

那世界最後只會像：

> 會走路的 API response。

非常現代。
非常悲傷。

---

## 6. Combat Reframing

Combat 不是 mini-game。

Combat 是 civilization pressure resolution。

因此 combat 必須：

- 影響 faction dominance
- 改變 territory
- 影響 settlement stability
- 被 NPC 記憶
- 被歷史記錄
- 改變 supply chain
- 影響 economy

否則：

combat 只是 detached interaction loop。

玩家打一架。
世界毫無反應。

像是在 Slack 上按 emoji。

---

## 7. Cards Reframing

Card 不應該只是 item。

Card 應該是：

> temporary world rule modifier。

也就是：

```text
Card
  → modifies rule evaluation
```

而不是：

```text
Card
  → consume item
```

這是 Greed Island 與一般 RPG 最大的分水嶺。

因為玩家真正操作的是：

> 世界規則。

不是數值。

---

## 8. Player Philosophy

玩家是 civilization actor。

不是 chosen one。

因此玩家應該能：

- sponsor construction
- found settlement
- hire NPC
- influence trade
- join faction
- lead faction
- alter logistics
- change history

但玩家不應該：

- 暫停世界
- bypass rules
- 擁有特殊 deterministic 特權
- 成為唯一重要角色

真正成熟的 simulation：

即使玩家離線。
世界仍然繼續。

甚至可能忘記玩家。

非常殘酷。

也因此才像真的文明。

---

## 9. Engineering Priorities

### Priority 1 — Budget Enforcement

在 civilization runtime 擴張前。
必須先完成：

- command cap
- active/background partition
- regional throttling
- replay-safe projection rebuild

否則 NPC 一多。
整個 tick runtime 會開始爆炸。

然後人類就會開始：

- 「先暫時 cache 一下啦」
- 「先 shortcut 一下啦」
- 「這邊直接 mutate 比較快」

然後 architecture integrity 就死了。

### Priority 2 — Typed Event Migration

`FACT_SET` 必須逐步消失。

因為 `FACT_SET` 本質上：

> 是 event sourcing 過渡期的技術債。

長期存在會造成：

- replay ambiguity
- projection inconsistency
- hidden truth
- rebuild impossibility

所有 state 都必須可由事件還原。

### Priority 3 — Civilization Runtime

真正的大工程其實現在才開始。

因為：

> civilization simulation 的難度遠高於 NPC AI。

AI 對話只是 perception illusion。

文明代謝才是真正的世界。

---

## 10. Recommended Development Order

| Phase | Theme |
|---|---|
| **Phase 0** | Architecture Formalization |
| **Phase 1** | Budget Gate + Settlement Runtime |
| **Phase 2** | Goods + Logistics + Market |
| **Phase 3** | Culture + Humanity + Rumor + Mentorship |
| **Phase 4** | Cards as Rule Operators |
| **Phase 5** | Persistent Combat Consequences |
| **Phase 6** | Player Civilization Integration |

這個順序不能亂。

因為：

- 沒 budget gate 前不能擴 simulation
- 沒 settlement 前不能做 economy
- 沒 logistics 前 market 是假的
- 沒 history 前 combat 沒意義
- 沒 event-sourced player 前 civilization interaction 會不一致

系統演化順序本身也是 deterministic dependency。

很討厭。

但這就是 runtime engineering。

---

## 11. Final Objective

Greed Island 的最終目標不是：

> 「玩家很多」

或

> 「NPC 很像真人」。

真正的目標是：

> 建立一個即使沒有玩家存在，也會持續演化、記憶、衰退、重建、擴張的 civilization simulation。

當某個 NPC 死亡。
後代會記得他。

當某 settlement 飢荒。
周邊價格會上升。

當 faction 戰敗。
道路與物流會崩潰。

當玩家離開數個月。
世界仍然繼續。

甚至已經變成另一個文明時代。

那時候。
Greed Island 才真正成立。

而不是一個包著 AI NPC 的聊天室。

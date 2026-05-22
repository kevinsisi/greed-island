# Greed Island — World Capabilities, Constitution & Program

> **Single source of truth** for what Greed Island is, what it must
> become, and how to bridge the two.
>
> Five parts (continuous section numbering 1–43):
>
> - **Part I — Runtime Constitution & Civilization Program** (§1–§12.5,
>   user-authored): non-negotiable world laws + civilization vision +
>   ecosystem vision + Cognitive Runtime architecture (§12.5) +
>   engineering priorities + recommended phase order.
> - **Part II — Current Verified Baseline** (§13–§28, v0.15.47):
>   what the world actually does today, verified against
>   `packages/server/src/` and `packages/web/src/`. ❌ marks are real
>   gaps, not aspirations.
> - **Part III — Operational Crosswalk** (§29–§30): each Part I
>   principle mapped to specific Commands, projections, and runtime
>   hooks the implementation will need.
> - **Part IV — Phased Plan** (§31–§41): release-sized phases with
>   dependencies, sub-deliverables, and honest sizing. Civilization
>   phases (0–6) interleaved with ecosystem phases (E0–E4).
> - **Part V — Program Acceptance & Meta** (§42–§43): success
>   criteria and update protocol.
>
> **What this is not:** not `ARCHITECTURE.md` (engine-level world laws),
> not `ROADMAP.md` (release history), not `PROGRESS.md` (handoff state),
> not `COMBAT_ARCHITECTURE.md` (combat sub-runtime). Architecture §11.X
> references inside this doc point to `ARCHITECTURE.md` §11 backlog
> items, not to this doc's own sections.

---

═══════════════════════════════════════════════════════════════
## Part I — Runtime Constitution & Civilization Program

(User-authored. Greed Island 的核心法則、文明演化目標，與生態 substrate。)
═══════════════════════════════════════════════════════════════

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
- 「為什麼漁夫一直在抓魚，魚卻永遠不會少？」

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

> 一個會自行演化的 deterministic civilization simulation，
> 並且這個文明 trapped inside a living planet。

玩家只是世界中的 actor。
不是世界的中心。

世界不會等待玩家。
NPC 不會因為玩家離線停止存在。
文明不會因為 client 關掉而停止演化。
生態系也不會因為沒人觀察就停止崩潰或恢復。

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
- 發明不存在的物種
- 修改規則

AI 是 observer。
不是 god object。

---

## 3. Runtime Layer Model

整個世界分成七層。（2026-05-22 重新編號：新增 Layer 2 — Cognitive Runtime；原 Layer 2.5 升為 Layer 3；原 Layer 3–5 依序升為 Layer 4–6。）

每層只能透過 Command interaction。
不能直接改下一層 state。

```text
Layer 6    — Narrative / Perception Runtime
             AI narration / dialog / rumors / history

Layer 5    — Combat Runtime
             Combat / card operators / tactical resolution

Layer 4    — Civilization Runtime
             Settlement / economy / logistics / territory

Layer 3    — Ecosystem Runtime
             Species / wildlife / predation / migration /
             fishery / forest / domestication / biome recovery

Layer 2    — Cognitive Runtime
             NPC cognition / beliefs / intentions / planning /
             memory / reflection / social reasoning / households

Layer 1    — Living World Runtime
             NPC routines / movement / weather / world events

Layer 0    — Simulation Kernel
             Deterministic event runtime
```

Layer 3 (Ecosystem) sits below Civilization Runtime by design: civilization
consumes ecosystems, not the other way around. Without Layer 3,
Layer 4's metabolism (§5.2) is decorative — `economy` becomes a
scalar with no biological substrate.

Layer 2 (Cognitive) sits between Living World and Ecosystem: NPCs are not
schedule-runners — they are cognitive agents with beliefs, intentions, and
memory. Without Layer 2, NPCs are puppets; civilization cannot emerge from
genuine agent reasoning.

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

上層文明系統與生態 substrate 幾乎都還不存在。

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

### Weakest Layers

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

**Layer 2.5 — Ecosystem Runtime**

> **完全不存在於 codebase。**

沒有：

- species 目錄
- animal entity
- BioNode（魚群 / 樹林 / 苔蘚 / 菇類）
- EcosystemRegion 狀態
- wildlife engine
- 預捕食模型
- 遷徙模型
- 漁場 / 森林再生
- 馴化系統

`food` 是一個 0–100 的純量，不是來自任何動植物。

獵人空有 archetype 卻沒有獵物。

漁夫的網裡沒有魚。

這是最大的工程區塊。

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

**這條原則依賴 Layer 2.5**。沒有 ecosystem 提供 fish 與 ore 的真實來源，metabolism 仍然會退化成 scalar 偽裝。

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

## 6. Ecosystem Runtime Vision

> Civilization does not emerge from UI.
> Civilization emerges from metabolism.
> Metabolism emerges from ecology.
>
> If the world has hunters but no animals, fishermen but no fish,
> winter but no migration — then the simulation is only performing
> civilization.

Ecosystem Runtime is **not decoration**. It is the substrate that
civilization consumes.

### 6.1 Why This Layer Exists

Living World Runtime (L2) answers:

- What NPCs do
- What weather exists
- What events occur

Civilization Runtime (L3) answers:

- How settlements grow
- How goods flow
- How economies emerge

But neither answers:

- Where food comes from
- Why one biome is rich
- Why scarcity exists
- Why migration happens
- Why settlements collapse after overhunting

Ecosystem Runtime (L2.5) provides:

- renewable biological resources
- ecological pressure
- predator/prey cycles
- regional biodiversity
- seasonal population changes
- natural hazards
- biome identity
- resource exhaustion and recovery

Without it:

- economy becomes fake
- logistics become cosmetic
- scarcity becomes scripted
- survival becomes arbitrary

### 6.2 Core Principles

#### 6.2.1 Ecosystem Autonomy Principle

Animals, plants, and ecological systems evolve without player presence.

The world continues:

- migrating
- reproducing
- starving
- hunting
- collapsing

without observation.

#### 6.2.2 Biological Scarcity Principle

Food is not generated from nowhere.

Every edible resource MUST originate from:

- animals
- plants
- fisheries
- fungal growth
- domesticated livestock
- agriculture

All biological production MUST have:

- carrying capacity
- reproduction rate
- environmental dependency
- extinction risk

#### 6.2.3 Predation Principle

Life consumes life.

- Predators affect prey populations.
- Prey scarcity affects predators.
- Civilization affects both.

No infinite prey generation.

#### 6.2.4 Migration Principle

Species are not static map props.

Migration depends on:

- season
- food density
- predator density
- weather
- rare windows
- civilization expansion

#### 6.2.5 Civilization Pressure Principle

Civilization damages ecosystems.

Examples:

- overfishing
- forest depletion
- overhunting
- road fragmentation
- industrial waste
- faction warfare

Civilization growth MUST alter ecosystem state.

#### 6.2.6 Recovery Principle

Nature can recover.

If pressure decreases:

- fish return
- forests regrow
- predator populations stabilize
- biodiversity recovers

Recovery speed depends on biome and species.

### 6.3 Domain Model

```text
Species {
  id, category, biomeAffinity[], dietType, aggression, fear,
  intelligence, packBehavior, activityWindow, migrationPattern,
  reproductionRate, carryingCapacity, predatorTargets[],
  preyTargets[], edibleYield, byproducts[], rarity,
  climateTolerance, civilizationTolerance, extinctionThreshold
}

Animal {
  id, speciesId, tileId, biomeRegion, position, state,
  hunger, health, fear, aggression, packId?,
  migrationTarget?, currentTarget?, reproductionCooldown,
  lifecycleStage, ownerSettlementId?, domesticatedBy?
}

BioNode {
  id, kind, tileId, growthState, yieldAmount,
  regenerationRate, seasonalModifier, harvestDifficulty,
  depletionThreshold
}

EcosystemRegion {
  tileId, biodiversity, predatorPressure, preyDensity,
  fishDensity, forestCoverage, pollution, fertility,
  migrationPressure, extinctionRisk
}
```

Species categories: `fish / herbivore / predator / scavenger / insect / livestock / mythical / avian / fungal`.

Animals are runtime actors with **limited memory, simpler behavior trees, ecosystem-driven decisions, no civilization ideology** — they are not NPCs.

### 6.4 Initial Species Catalog (by region)

| Region | Species | Role |
|---|---|---|
| Salt Marsh | `marsh_fish` | staple food |
| Salt Marsh | `salt_crab` | tide-cycle harvest |
| Salt Marsh | `reed_eel` | nocturnal predator |
| Salt Marsh | `marsh_heron` | migratory avian |
| Salt Marsh | `white_marsh_leviathan` | rare world-event creature |
| Forest | `forest_deer` | herbivore |
| Forest | `moss_boar` | aggressive prey |
| Forest | `fog_wolf` | pack predator |
| Forest | `ember_owl` | night avian |
| Forest | `bark_mantis` | insect regulator |
| Mountain | `cliff_goat` | prey |
| Mountain | `iron_beak_vulture` | scavenger |
| Mountain | `stone_lizard` | cave species |
| Mountain | `mountain_bear` | apex predator |
| Desert | `dune_lizard` | prey |
| Desert | `ash_serpent` | ambush predator |
| Desert | `sand_runner` | migratory herbivore |
| Desert | `mirage_hawk` | aerial predator |
| Ruin | `ruin_rat` | scavenger |
| Ruin | `mimic_mold` | fungal colony |
| Ruin | `iron_hound` | hostile mutated predator |
| Ruin | `lantern_moth` | rare nocturnal species |

### 6.5 Ecosystem Commands

**Biological lifecycle**
`ANIMAL_SPAWNED`, `ANIMAL_MIGRATED`, `ANIMAL_REPRODUCED`, `ANIMAL_STARVED`, `ANIMAL_DIED`, `SPECIES_POPULATION_SHIFTED`, `SPECIES_EXTINCTION_WARNING`, `SPECIES_EXTINCT`, `SPECIES_RECOVERED`.

**Hunting / predation**
`ANIMAL_HUNT_STARTED`, `ANIMAL_HUNT_RESOLVED`, `ANIMAL_KILLED`, `CARCASS_CREATED`, `MEAT_HARVESTED`, `HIDE_COLLECTED`, `BONE_COLLECTED`.

**Ecological pressure**
`FOREST_DEPLETED`, `FISHERY_COLLAPSED`, `BIOME_RECOVERED`, `POLLUTION_INCREASED`, `POLLUTION_RECOVERED`, `MIGRATION_WAVE_STARTED`.

**Domestication**
`ANIMAL_DOMESTICATED`, `LIVESTOCK_BRED`, `MOUNT_ASSIGNED`, `LIVESTOCK_SLAUGHTERED`.

### 6.6 Runtime Systems (five engines)

1. **Wildlife Engine** — runs every K ticks. Population spawning, migration, predator/prey balancing, starvation, reproduction, pack coordination. All outcomes derive from `hashSeed(speciesId, tileId, tick, pressure)`.
2. **Predation Engine** — predators search nearby prey. Low prey density → predator starvation, migration pressure, aggression. Predators may attack prey / livestock / NPC carriers / isolated players.
3. **Fishery Engine** — fish density tracked per coastal tile. Fishing reduces local density and reproduction. Overfishing → `fishDensity ↓ → foodPrice ↑ → settlementInstability ↑ → crime ↑`.
4. **Forest Regrowth Engine** — tree density regenerates slowly. Roads and buildings reduce regrowth, biodiversity, animal spawn rate. Heavy logging may permanently alter biome identity.
5. **Migration Engine** — species periodically migrate. Triggers: winter, low food, predator density, pollution, rare windows, civilization expansion. Affects hunting opportunities, market prices, settlement growth, faction patrol demand.

### 6.7 Integration With Other Layers

**With Civilization Runtime (L3)**

Goods MUST originate from ecosystem events:

```text
Correct:    forest_deer killed → carcass → butcher → meat → cooked food → consumption
Incorrect:  GOODS_EXTRACTED: meat
```

Logistics: `fog_wolf attacks carrier → GOODS_TRANSPORT_LOST → market shortage → food price spike`. Roads and guards then matter naturally.

Settlement pressure: `population ↑ → food demand ↑ → hunting pressure ↑ → biodiversity ↓ → migration changes`.

Faction ideology shapes ecological behaviour:

| Faction | Ecosystem behaviour |
|---|---|
| `tide_hunters` | sustainable fishing bonus |
| `free_runners` | low civilization footprint |
| `guild` | aggressive industrial expansion |
| `hidden_overseer` | ritual ecosystem manipulation |

**With Combat Runtime (L4)**

Not all combat is civilization conflict. Wildlife combat: `mountain_bear attacks hunter`, `ash_serpent ambushes caravan`, `fog_wolf pack surrounds player`.

Rare creature events: `WORLD_EVENT: "The White Marsh Leviathan Emerges"` → settlements panic / hunters gather / faction conflict / market spike / chronicle updates.

**With Perception Runtime (L5)**

NPC dialog must reference ecosystems: `"The marsh has gone quiet. Even the herons left early this season."` AI can interpret ecology; AI cannot invent species, animals, or extinction events.

**With History System (Part V §42)**

Ecological events become history arcs:

- *Ecological Collapse Arc*: overfishing → fish decline → starvation → unrest → faction violence → settlement decline.
- *Great Migration Arc*: winter pressure → `sand_runner` migration → desert trade boom → new roads → settlement expansion.
- *Extinction Arc*: `fog_wolf` hunted heavily → extinction warning → species extinct → prey overpopulation → forest imbalance.

History becomes ecological, not just political.

### 6.8 Domestication (Late Runtime)

Future civilization depth depends on domestication.

- **Livestock**: ranches, breeding, milk/wool/meat economy, guard animals.
- **Mounts** (`marsh yak / dune crawler / cliff ram / salt hound`): travel speed, logistics capacity, combat mobility, migration range.

### 6.9 Technical Constraints

Ecosystem simulation MUST obey runtime budgets:

- Inactive regions: aggregate simulation, low-frequency updates, statistical balancing.
- Active regions: individual animal entities, pack simulation, detailed encounters.

Determinism: no non-deterministic randomness. Replay must reproduce identical ecosystems.

Required projections (each with `rebuildFromEvents` + canonical-hash replay tests):

- `animal_population`
- `ecosystem_region`
- `migration_routes`
- `livestock_registry`
- `carcass_registry`

---

## 7. Combat Reframing

Combat 不是 mini-game。

Combat 是 civilization pressure resolution。
而且部分 combat 是 ecological pressure（人對獸、獸對人）。

因此 combat 必須：

- 影響 faction dominance
- 改變 territory
- 影響 settlement stability
- 影響 species population（被獵殺、被馴化、被滅絕）
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

## 8. Cards Reframing

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

可能的規則操縱包含：經濟、生態、戰鬥、文明壓力 — 例如「祈雨」card 可暫時提升 forest regrowth、「血潮」card 可暫時驅趕 prey species。

---

## 9. Player Philosophy

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
- 過度狩獵、保護生態、馴化動物、見證文明衰退

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

## 10. Engineering Priorities

### Priority 1 — Budget Enforcement

在 civilization runtime 與 ecosystem runtime 擴張前。
必須先完成：

- command cap
- active/background partition
- regional throttling
- replay-safe projection rebuild

否則 NPC 與 wildlife 一多。
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

### Priority 3 — Ecosystem Foundation

> civilization metabolism cannot be honest without an ecological substrate.

在開始做 Goods + Logistics + Market 之前。
必須至少先有：

- species catalog
- 動物 runtime entity
- wildlife engine
- 漁場密度 + 簡單狩獵

否則 Goods 永遠是憑空產生，metabolism (§5.2) 永遠假裝。

### Priority 4 — Civilization Runtime

真正的大工程其實現在才開始。

因為：

> civilization simulation 的難度遠高於 NPC AI。

AI 對話只是 perception illusion。

文明代謝才是真正的世界。

而 ecology 是文明代謝的 substrate。

---

## 11. Recommended Development Order

文明 phase 與生態 phase 必須**交錯**進行 — civilization 不能在 ecosystem 還沒有最小可信形式時就 ship goods/logistics/market。

| Phase | Theme | Civilization or Ecosystem |
|---|---|---|
| **Phase 0** | Architecture Formalization (含 Layer 2.5) | both |
| **Phase 1** | Budget Gate + Settlement Runtime | civilization |
| **Phase E0** | Ecosystem Foundation (species / wildlife engine / fish density / 簡單狩獵) | ecosystem |
| **Phase 2** | Goods + Logistics + Market (sourced from ecosystem) | civilization |
| **Phase E1** | Predator/Prey + Migration + 飢餓 + 生態平衡 | ecosystem |
| **Phase 3** | Culture + Humanity + Rumor + Mentorship | civilization |
| **Phase E2** | Civilization Pressure (overfishing / forest depletion / pollution / 崩潰) | ecosystem |
| **Phase 4** | Cards as Rule Operators | civilization |
| **Phase 5** | Persistent Combat Consequences | civilization |
| **Phase E3** | Domestication (livestock / mounts / breeding / mounted logistics) | ecosystem |
| **Phase 6** | Player Civilization Integration | civilization |
| **Phase E4** | Mythic Ecology (rare species / ecosystem world events / faction ecological conflict) | ecosystem |

這個順序不能亂。

因為：

- 沒 budget gate 前不能擴 simulation
- 沒 settlement 前不能做 economy
- 沒 ecosystem foundation (E0) 前 goods 與 logistics 是假的
- 沒 logistics 前 market 是假的
- 沒 ecology pressure (E2) 前 combat 對生態的後果是假的
- 沒 history 前 combat 沒意義
- 沒 event-sourced player 前 civilization interaction 會不一致

系統演化順序本身也是 deterministic dependency。

很討厭。

但這就是 runtime engineering。

---

## 12. Final Objective

Greed Island 的最終目標不是：

> 「玩家很多」

或

> 「NPC 很像真人」。

真正的目標是：

> 建立一個即使沒有玩家存在，也會持續演化、記憶、衰退、重建、擴張、捕食、遷徙、絕種、復原的 civilization-trapped-inside-a-living-planet。

當某個 NPC 死亡。
後代會記得他。

當某 settlement 飢荒。
周邊價格會上升。

當 faction 戰敗。
道路與物流會崩潰。

當玩家離開數個月。
世界仍然繼續。

甚至已經變成另一個文明時代。

當玩家過度狩獵 `fog_wolf`。
牠們會先絕種警告，再真的絕種；幾代之後 `forest_deer` 過剩，森林失衡，moss 與 mantis 結構崩盤；接下來 `forest_deer` 自己也飢荒。

當 `marsh_heron` 提前遷走。
NPC 會聊起來，市集裡的魚會貴一些，沒人能解釋為什麼但每個人都感覺到了。

那時候。
Greed Island 才真正成立。

而不是一個包著 AI NPC 的聊天室。

---

## 12.5 Cognitive Runtime Architecture (Layer 2)

> 以下內容原文來自 2026-05-22 架構願景文件，逐字整合。

---

# Greed Island — Complete World Architecture & Cognitive Runtime

> This document defines the full runtime structure of Greed Island.
>
> Not as a game.
> Not as an MMO.
> Not as an AI chat world.
>
> But as:
>
> a deterministic civilization simulation system operating on top of a living ecosystem inhabited by cognitive agents.
>
> The objective is not to create content.
>
> The objective is to create:
>
> a world capable of generating history.

---

## 12.5.0 Core Definition

Greed Island is:

* deterministic
* event-sourced
* replayable
* autonomous
* civilization-driven
* ecology-dependent
* cognition-enabled
* AI-perceived

The world continues existing:

* without players
* without rendering
* without AI narration
* without clients

Only committed Events are reality.

---

## 12.5.1 Layer 2 — Cognitive Runtime

This is the missing soul layer.

Without this layer:

* NPCs are puppets
* schedules pretend to be intelligence
* dialog pretends to be thought

The Cognitive Runtime transforms runtime actors into:

> agents.

---

## 12.5.2 Cognitive Runtime Principles

### 12.5.2.1 Local Knowledge Principle

No actor is omniscient.

Every NPC has:

* incomplete information
* biased beliefs
* outdated assumptions
* personal experiences

Reality and belief are separate.

---

### 12.5.2.2 Intention Principle

Actions emerge from intentions.

Schedules do not create decisions.

Intentions create schedules.

---

### 12.5.2.3 Reflection Principle

Actors evaluate outcomes.

Experience changes future behavior.

Without reflection:

* actors never learn
* behavior becomes repetitive
* worlds feel fake

---

### 12.5.2.4 Social Cognition Principle

Civilization emerges from:

* trust
* fear
* loyalty
* debt
* obligation
* reputation

Not from isolated utility calculations.

---

## 12.5.3 Cognitive Actor Model

```text
CognitiveActor {
  identity
  beliefs
  knownEntities
  intentions
  priorities
  memories
  traumas
  relationships
  factionViews
  riskTolerance
  moralProfile
  householdResponsibilities
  currentPlan
  learnedBehaviors
  socialStatus
}
```

---

## 12.5.4 Perception System

### Purpose

Actors perceive:

* nearby events
* rumors
* market conditions
* faction danger
* ecosystem changes
* combat
* deaths
* shortages

Perception is:

* limited
* delayed
* biased
* lossy

---

### Perception Graph

```text
PerceptionGraph {
  actorId
  knownPeople[]
  knownPlaces[]
  knownEvents[]
  knownThreats[]
  knownTradeRoutes[]
  knownFactions[]
  confidence
  lastConfirmedTick
}
```

---

### Example

A fisherman may know:

* fish populations declining
* dangerous reefs
* harbor politics

But know nothing about:

* mountain bandits
* desert migration
* secret faction wars

---

## 12.5.5 Belief System

> **v0.50.0 — BeliefProjection shipped.** Belief+Perception Layer 2 baseline operational.
> - 4 belief subjects: `tile_safety`, `goods_scarcity`, `ecosystem_health`, `faction_control`
> - Triggers: `FACTION_TILE_SEIZED` (tile_safety + faction_control), `ANIMAL_ATTACKED_NPC` (tile_safety), `GOODS_CONSUMED` food (goods_scarcity), ecosystem cadence every 48 ticks (ecosystem_health)
> - Locality-based perception: same-tile = 90% confidence, adjacent = 40%; ecosystem capped to 70/30
> - Confidence decay: `tick()` every `TICKS_PER_DAY`; rows at ≤0 deleted
> - Dialog integration: `AiDialogContext.beliefContext` + `buildBeliefBlock` hedge-language rules injected into Gemini NPC prompt (≥70 direct, 40–69 "我聽說", <40 "也許")
> - 23 tests in `beliefProjection.test.ts`

Beliefs are not truth.

Beliefs are:

* subjective
* incomplete
* wrong sometimes

```text
Belief {
  subject
  confidence
  emotionalWeight
  source
  observedAtTick
  decayRate
}
```

Examples:

```text
"The forest road is unsafe."
"The guild controls food prices."
"The marsh spirits are angry."
```

Beliefs influence:

* movement
* faction alignment
* market decisions
* fear
* migration

---

## 12.5.6 Intention System

Intentions drive action.

### Long-Term Intentions

Examples:

* become wealthy
* protect family
* gain faction power
* survive winter
* escape debt
* seek revenge

---

### Short-Term Intentions

Examples:

* buy food
* avoid danger
* escort caravan
* hunt prey
* repair building

---

### Intent Stack

```text
IntentStack {
  survival
  economic
  social
  ideological
  emotional
}
```

Each intent has:

* urgency
* reward expectation
* risk estimate
* emotional influence

---

## 12.5.7 Planning System

Planning converts intentions into executable actions.

### Example

```text
Need money
→ find work
→ nearest settlement unsafe
→ choose caravan escort
→ recruit allies
→ travel route
```

Plans may fail.

Actors must adapt.

---

### Planning Components

```text
Planner {
  evaluateOptions()
  estimateRisk()
  estimateReward()
  evaluateSocialImpact()
  selectPlan()
}
```

---

## 12.5.8 Utility Evaluation

Actors evaluate:

* hunger
* safety
* money
* reputation
* social approval
* faction pressure
* family pressure
* emotional state

Different personalities weight values differently.

---

### Example

Greedy merchant:

```text
rewardWeight = high
riskTolerance = high
```

Fearful villager:

```text
safetyWeight = very high
```

---

## 12.5.9 Reflection System

Reflection modifies future behavior.

Without reflection:

* no learning
* no adaptation
* no personality growth

---

### Reflection Example

```text
Caravan attacked by wolves
→ fear increases
→ avoid forest route
→ hire guards next time
```

---

### Reflection Data

```text
Reflection {
  triggeringEvent
  emotionalImpact
  behavioralChange
  duration
}
```

---

## 12.5.10 Memory System

Memory is not a list.

Memory is weighted.

### Memory Components

```text
Memory {
  eventId
  salience
  trauma
  emotionalTag
  socialImportance
  historicalImportance
  decayCurve
}
```

---

### Memory Weight Examples

| Event             | Salience  |
| ----------------- | --------- |
| buying soup       | low       |
| witnessing murder | extreme   |
| losing child      | permanent |
| surviving famine  | very high |

---

## 12.5.11 Social Reasoning

Actors reason socially.

Questions:

```text
Who can I trust?
Who owes me?
Who is dangerous?
Who controls this region?
What happens if others discover this?
```

Civilization emerges from these evaluations.

---

## 12.5.12 Relationship Runtime

Relationships are multidimensional.

Not a single trust scalar.

```text
Relationship {
  trust
  fear
  respect
  attraction
  loyalty
  resentment
  dependency
  familiarity
}
```

Relationships evolve through:

* trade
* combat
* betrayal
* mentorship
* shared survival
* faction conflict

---

## 12.5.13 Household Runtime

Households are decision units.

Not cosmetic family links.

### Shared Systems

* pooled resources
* child care
* food allocation
* inheritance
* emotional pressure
* survival coordination

---

### Household Decisions

Examples:

```text
Should we:
- move settlement?
- spend money on food?
- risk dangerous work?
- send child to learn trade?
```

---

## 12.5.14 NPC Thinking Flow

This is the actual cognition pipeline.

```text
Perception
→ Belief Update
→ Need Evaluation
→ Intent Generation
→ Planning
→ Social Evaluation
→ Action Selection
→ Command Submission
→ Outcome Observation
→ Reflection
→ Memory Update
```

This loop repeats forever.

That is:

> thought.

---

## 12.5.15 Example Runtime Scenario

### Situation

Fish populations collapse.

---

### Ecosystem Runtime

```text
fishDensity ↓
```

---

### Civilization Runtime

```text
food supply ↓
market prices ↑
```

---

### Cognitive Runtime

Fisherman beliefs update:

```text
"The marsh is dying."
```

Intentions change:

```text
survive winter
find alternative work
```

---

### Logistics Runtime

Caravans reroute.

---

### Faction Runtime

Guild exploits shortages.

---

### Social Runtime

Crime rises.

---

### Narrative Runtime

NPC says:

> "The sea used to feed everyone. Now even the gulls are leaving."

That sentence now means something.

Because the simulation produced it.

Not the prompt.

---

## 12.5.16 Final Objective (Cognitive Layer Framing)

The player should eventually feel:

* the world existed before them
* the world survives without them
* civilization depends on fragile systems
* NPCs genuinely evaluate reality
* ecosystems react to civilization
* history emerges from interactions
* memory persists beyond sessions
* actions alter future generations

At that point:

Greed Island stops being:

* an AI roleplay game
* a scripted MMO
* a reactive sandbox

And becomes:

> a deterministic civilization simulation operating inside a living planet inhabited by cognitive agents.

---

═══════════════════════════════════════════════════════════════
## Part II — Current Verified Baseline (v0.34.0, 2026-05-20)

Verified against `packages/server/src/` and `packages/web/src/`.
✅ = shipped. ❌ = real gap. 🟡 = partial.
═══════════════════════════════════════════════════════════════

## 13. Headline Numbers

| Surface | Count |
|---|---|
| Named map tiles | **9** (`t_central`, `t_forest`, `t_mountain`, `t_temple`, `t_dock`, `t_desert`, `t_ruin`, `t_dimai`, `t_salt_marsh`) |
| NPC profiles configured | **50** unique IDs across 17 profile files |
| Factions | **4** (`tide_hunters` 潮獵會, `free_runners` 自由潮感者, `guild` 公會, `civilian` 平民) |
| **Species catalogued** | **23** across 5 biome regions (`ecosystem/species.ts`) |
| **Ecosystem engines** | **5** (Wildlife / Predation / Fishery / Migration / Domestication) |
| Static building catalog entries | **~17** across 8 tiles + 1 dynamic salt-marsh seed |
| Living-world Command types | **~121** (see §15) |
| In-memory projections | **~23** (see §28) |
| Card catalog | **100** cards (`greed-island-card-catalog@0.2.0`) |
| Frontend page views | **14** + ecosystem API endpoint |
| Tick cadence | One simulation tick every **5 seconds** (one in-world hour = 720 ticks) |

---

## 14. Kernel Guarantees (Architecture §0–§6)

The simulation is **deterministic, event-sourced, append-only**.

- ✅ **Command → Rule Engine → Event → Projection** is the only path that mutates world state.
- ✅ **EventLog is the single source of truth** (`event_log` SQLite table). Replay reproduces the same WorldState.
- ✅ **Tick atomicity**: one tick = one SQLite transaction; no observable partial state.
- ✅ **Causality**: actors in tick N see only WorldState(N-1).
- ✅ **AI is read-only**: Gemini calls are off-tick; AI cannot append Events, cannot influence Rule Engine, cannot mutate State.
- ✅ **10-step tick runtime** in `SimulationRuntime.runTick`.
- ✅ **Deterministic random** via `hashSeed(commandId, actorId, tick, ...)`. No `Math.random()` in deterministic paths.
- ✅ **NPC state typed projection** (`NpcStateProjection`) — replaces FACT_SET for NPC presence/activity.

❌ **Simulation budget (Architecture §7)** is specified but **not enforced** — no command cap, no NPC partitioning, no regional activation throttle. (ARCHITECTURE.md §11.6)

🟡 **ARCHITECTURE.md §11.5 FACT_SET** — NPC state now has typed projection (✅), but area state, building occupants, weather, season, rare windows still use FACT_SET.

❌ **ARCHITECTURE.md §11.4** — combat session/log still partially outside canonical EventLog.

---

## 15. Living-World Command Catalog (`livingWorldCommands.ts`)

**~121 Command types** (was 26 at v0.15.47). All state changes go through this catalog.

**World physics** (8)
`WORLD_TICK`, `WEATHER_CHANGE`, `SEASON_CHANGE`, `RARE_WINDOW_OPEN`, `RARE_WINDOW_CLOSE`, `WORLD_EVENT_SPAWN`, `WORLD_EVENT_END`, `AREA_PRESSURE`

**NPC behavior** (7)
`NPC_MOVE`, `NPC_ACTIVITY_CHANGE`, `NPC_STATE_RECORDED`, `NPC_INTERACT`, `NPC_PRODUCTIVE_ACTION`, `NPC_DIALOG_HOLD`, `PLAYER_INTERVENE`, `PLAYER_ENERGY_SET`

**NPC social / life** (5)
`NPC_LIFE_GOAL_SET`, `NPC_HOUSEHOLD_FORMED`, `NPC_CHILD_BORN`, `NPC_DECEASED`, `NPC_HEIR_ASSIGNED`

**NPC culture / learning** (8) — Phase 3
`NPC_RUMOR_HEARD`, `NPC_RUMOR_SPREAD`, `NPC_OBSERVED_SKILL`, `NPC_MENTORSHIP_STARTED`, `NPC_MENTORSHIP_COMPLETED`, `CULTURAL_FESTIVAL_FORMED`, `CULTURAL_RITUAL_PERFORMED`, `CULTURAL_NORM_ESTABLISHED`

**Household economy** (3)
`HOUSEHOLD_GOLD_CONTRIBUTED`, `HOUSEHOLD_GOLD_SPENT`, `HOUSEHOLD_INHERITANCE_ASSIGNED`

**Civilization — construction** (6)
`CONSTRUCTION_INITIATE`, `CONSTRUCTION_PROJECT_PROGRESS`, `BUILDING_CONSTRUCTED`, `MAP_TILE_UNLOCKED`, `BUILDING_ENTER`, `BUILDING_LEAVE`

**Civilization — settlement** (7)
`SETTLEMENT_FORMED`, `SETTLEMENT_POPULATION_UPDATED`, `SETTLEMENT_STORAGE_UPDATED`, `SETTLEMENT_PRESSURE_UPDATED`, `SETTLEMENT_STABILITY_CHANGED`, `SETTLEMENT_DECLINED`, `SETTLEMENT_RECOVERED`

**Civilization — faction** (2)
`FACTION_TILE_SEIZED`, `FACTION_NPC_LOYALTY_SHIFTED`

**Goods primitives** (5) — Phase 2 §35.1
`GOODS_EXTRACTED`, `GOODS_STORED`, `GOODS_PROCESSED`, `GOODS_CONSUMED`, `GOODS_DESTROYED`

**Logistics** (5) — Phase 2 §35.2
`TRADE_ROUTE_OPENED`, `TRADE_ROUTE_CLOSED`, `GOODS_TRANSPORT_STARTED`, `GOODS_TRANSPORT_ARRIVED`, `GOODS_TRANSPORT_LOST`

**Market** (1) — Phase 2 §35.4
`MARKET_PRICE_DISCOVERED`

**Combat** (14)
`COMBAT_INITIATE`, `COMBAT_PLAYER_ACTION`, `COMBAT_RESOLVE`, `COMBAT_CARD_PLAY`, `COMBAT_CARD_CANCEL`, `COMBAT_DAMAGE`, `COMBAT_HEAL`, `COMBAT_STATUS_APPLY`, `COMBAT_STATUS_TICK`, `COMBAT_STATUS_END`, `COMBAT_TARGET_LOCK`, `COMBAT_PHASE_SHIFT`, `COMBAT_FLEE_ATTEMPT`, `COMBAT_DEFEAT`

**Ecosystem — lifecycle** (12) — Phase E0/E1
`ANIMAL_SPAWNED`, `ANIMAL_HUNT_STARTED`, `ANIMAL_HUNT_RESOLVED`, `ANIMAL_KILLED`, `ANIMAL_STARVED`, `ANIMAL_REPRODUCED`, `ANIMAL_MIGRATED`, `MIGRATION_WAVE_STARTED`, `CARCASS_CREATED`, `MEAT_HARVESTED`, `FISHERY_HARVESTED`, `FISHERY_COLLAPSED`

**Ecosystem — animal behavior** (5) — Sprint 2B/2C
`ANIMAL_TARGETED_NPC`, `ANIMAL_ATTACKED_NPC`, `ANIMAL_FLED`, `ANIMAL_RETALIATED`, `NPC_DEFENSE_PARTY_FORMED`

**Ecosystem — pressure / collapse / recovery** (6) — Phase E2
`SPECIES_EXTINCTION_WARNING`, `SPECIES_EXTINCT`, `SPECIES_RECOVERED`, `FISHERY_RECOVERED`, `ECOSYSTEM_PRESSURE_RAISED`, `ECOSYSTEM_PRESSURE_RECOVERED`

**Ecosystem — domestication** (4) — Phase E3
`ANIMAL_DOMESTICATED`, `LIVESTOCK_BRED`, `LIVESTOCK_SLAUGHTERED`, `MOUNT_ASSIGNED`

**Ecosystem — mythic ecology** (8) — Phase E4
`LEGENDARY_WORLD_EVENT_SPAWNED`, `LEGENDARY_WORLD_EVENT_RESOLVED`, `LEGENDARY_HUNT_STARTED`, `LEGENDARY_HUNT_CONCLUDED`, `FOREST_CLEARCUT_ORDERED`, `FISHING_QUOTA_ENFORCED`, `INDUSTRIAL_SITE_SABOTAGED`, `RITUAL_ECOSYSTEM_MANIPULATION`

**Player civilization** (15) — Phase 6
`PLAYER_PICKED_UP_GOODS`, `PLAYER_TRADED_GOODS`, `PLAYER_HUNTED_ANIMAL`, `PLAYER_FISHED`, `PLAYER_DOMESTICATED_ANIMAL`, `PLAYER_PROTECTED_REGION`, `PLAYER_HIRED_NPC`, `PLAYER_DISMISSED_NPC`, `PLAYER_SPONSORED_CONSTRUCTION`, `PLAYER_FOUNDED_SETTLEMENT`, `PLAYER_CLAIMED_TERRITORY`, `PLAYER_JOINED_FACTION`, `PLAYER_LEFT_FACTION`, `PLAYER_LED_FACTION`, `PLAYER_PLAYED_CARD`

❌ Still missing: `HIDE_COLLECTED`, `BONE_COLLECTED`, `BIOME_RECOVERED`, `FOREST_DEPLETED`, `POLLUTION_INCREASED`, `POLLUTION_RECOVERED`, `SPECIES_POPULATION_SHIFTED` (listed in §6.5 but not yet in catalog).

---

## 16. World Physics

- ✅ **Tick** advances every 5 s. Deterministic logic uses integer tick + EventLog.
- ✅ **Weather** transitions via `WEATHER_CHANGE` events.
- ✅ **Season** rotates via `SEASON_CHANGE` events.
- ✅ **Rare windows** open/close via dedicated commands.
- ✅ **World events** spawn / end; surface in chronicle ticker.
- ✅ **Area state per tile** (`areaStateEngine.ts`) tracks `{ food, safety, economy }` with pressure thresholds + faction control.
- ✅ **Faction dominance** (4 factions, threshold 80) emergent from NPC behavior + tile seizure events.
- ✅ **Resource transport** — `GOODS_TRANSPORT_*` + `TRADE_ROUTE_*` commands wired in runtime; `LogisticsProjection` active.
- ✅ **Production chains** — `GOODS_PROCESSED` + `ProductionChainsProjection` wired; production recipes defined in `goods/productionChains.ts`.
- ✅ **Market price discovery** — `discoverMarketPrices()` runs each tick; `MarketPricesProjection` active.
- ✅ **Ecological substrate** — wildlife engine runs per tick; species populations affect area food/safety pressure.

❌ No **roads / bridges / defenses** as buildable map features (ARCHITECTURE.md §30.4 still open).
❌ Area state `{ food, safety, economy }` scalars still use FACT_SET (§11.5 partial).

---

## 17. Map & Districts

9 named tiles with biomes (`mapGraph.ts`):

| Tile ID | 中文 | Biome |
|---|---|---|
| `t_central` | 夜潮區 | grass |
| `t_forest` | 潮見丘 | forest |
| `t_mountain` | 煙嵐山 | mountain |
| `t_temple` | 霓港區 | water |
| `t_dock` | 碼頭區 | water |
| `t_desert` | 潮聲區 | desert |
| `t_ruin` | 鏽灣區 | ruin |
| `t_dimai` | 地脈層 | ruin |
| `t_salt_marsh` | 鹽沼外環 | water (expansion-unlock) |

- ✅ **Hub view** (parent map): district overview, traveller sprites, construction activity markers, since-last-visit panel.
- ✅ **Area view** (15×10 cell canvas): server-authoritative NPC sprites, building markers, ambient narration.
- ✅ **Building interior view**: enter via building marker, occupants from authoritative presence tuple.
- ✅ **Map expansion** mechanism proven by `t_salt_marsh`.
- ✅ **Biome-driven species spawn** — each species has `biomeAffinity[]`; wildlife engine spawns by biome region.

❌ No **roads / bridges / defenses** as buildable map features.
❌ No **new tile creation** beyond the predefined catalog.

---

## 18. NPC Population & Configuration

50 NPCs across 17 profile files. Each profile has:

- ✅ **Bilingual identity** (`name.zh` / `name.en`, `role.zh` / `role.en`)
- ✅ **Daily routine** — time-of-day windows mapping to locations + activity labels
- ✅ **Personality** — `{ archetype, patience, greed, trustBase, talkativeness, factionLean, calmness? }`
- ✅ **Triggers** — conditional command emissions
- ✅ **Memory profile** — `consultsEventTypes`, `decayFn`, `decayParam`

Sample roles: 雜貨店老闆娘 / 報童 / 公會行政員 / 通勤上班族 / 漁場仲介 / 沙漠守墓人 / 寺院住持 / 港口接待 / 自由商人 / 神殿牧師 / 衝浪手 / 公會會長 / 山林獵人.

🟡 Roles like 「山林獵人」、「漁場仲介」 now have ecosystem substrate — hunters hunt animals, fishers reduce fishery density. NPC-to-NPC goods trade still not implemented (no carrier NPC archetype routing goods between settlements autonomously).

---

## 19. NPC Inner State (per NPC, projection of EventLog)

What an NPC "is" at any tick:

| Field | Source | Status |
|---|---|---|
| `tile`, `buildingId`, `subCol`, `subRow`, `subZ`, `activity` | `NpcStateProjection` (typed events, v0.3x) | ✅ |
| `mood`, `health` | derived from interactions, productive actions, events | ✅ |
| `factionLean` | profile config + `FACTION_NPC_LOYALTY_SHIFTED` events | ✅ |
| `lifeGoal` (kind + pressure + narration) | `NPC_LIFE_GOAL_SET` | ✅ |
| `household`, `children` | `NPC_HOUSEHOLD_FORMED`, `NPC_CHILD_BORN` | ✅ |
| `deceased` | `NPC_DECEASED` (v0.32.0) | ✅ |
| `heirOf` | `NPC_HEIR_ASSIGNED` (v0.32.0) | ✅ |
| `civic.gold` | productive action rewards + household economy | ✅ |
| `civic.skillXp` | productive actions + mentorship | ✅ 4 domains |
| `memory` rows | `npc_memory` projection (event-decay) | ✅ |
| `relationships` rows | `npc_relationships` projection (trust scalar) | ✅ |
| `travelRoute` | `NPC_MOVE` routed traveller | ✅ |
| `dialogHold` | `NPC_DIALOG_HOLD` (bounded tick window) | ✅ |
| Rumors heard | `RumorProjection` | ✅ |
| Mentorship state | `SkillXpProjection` (lineage tracked) | ✅ |

❌ Missing:
- **Knowledge boundary** — NPC's known-person graph, alias memory, faction knowledge (ARCHITECTURE.md §11.9)
- **Household joint decisions** — economy pooled but no shared command decisions yet
- **Ecological awareness in dialog** — AI prompts not yet fed ecosystem state from projections

---

## 20. NPC Autonomous Behavior (per tick)

What NPCs do **without any player action**:

- ✅ **Routine-following**, **ambient cross-district errands**, **productive actions**, **autonomous construction**, **household formation**, **children**, **interactions**, **life goal updates**, **world agenda**.
- ✅ **Hunting / fishing** — hunter archetype emits hunt commands when near prey + low household food; fisher reduces fishery density.
- ✅ **Settlement formation / decline** — ≥3 NPCs co-located → `SETTLEMENT_FORMED`; stability drops → `SETTLEMENT_DECLINED`.
- ✅ **Faction war / territorial takeover** — area dominance shifts → `FACTION_TILE_SEIZED` → `FACTION_NPC_LOYALTY_SHIFTED`.
- ✅ **Rumor propagation** — NPC pairs on same tile spread top rumors via `NPC_RUMOR_SPREAD`.
- ✅ **Mentorship** — `planMentorshipTick` emits `NPC_MENTORSHIP_STARTED/_COMPLETED` based on skill gap.
- ✅ **Cultural festival seeder** — threshold met → `CULTURAL_FESTIVAL_FORMED`.
- ✅ **NPC mortality** — cadence-gated `planMortality()` emits `NPC_DECEASED` + `NPC_HEIR_ASSIGNED` (v0.32.0).
- ✅ **Animal aggression** — hungry predators attack nearby NPCs; NPCs flee or form defense parties.

❌ Missing autonomous behaviors:
- NPC-to-NPC goods trade (carrier NPC moving goods between settlements autonomously)
- Cross-tile resource transport initiated by NPC merchants
- Migration (NPC moving household permanently)
- History narrative arc generation (`history_chronicle` projection not implemented)

---

## 21. Construction / Buildings

- ✅ **Static catalog** (`buildings/catalog.ts`): ~17 named buildings across 8 tiles + dynamic seed.
- ✅ **Player work/rest at buildings**: `POST /api/buildings/:id/apply|quit|work|rest`.
- ✅ **Dynamic NPC-completed buildings** with monotonic state invariant.
- ✅ **Per-tile visibility cap**: 3 autonomous completed/open buildings per tile.

❌ Buildings are **not upgradeable, damageable, abandonable, repairable, capturable**.
❌ No **ecosystem-aware building types** — no ranch, no warehouse, no smokehouse, no fishery dock.
❌ No **roads / bridges / walls** as buildable map features.

---

## 22. Combat

- ✅ **Phase B** — single-shot player-vs-NPC combat (v0.15.0).
- ✅ **Phase C** — real-time 10Hz sub-tick, 5-phase rule engine, 紋卡 priority, SSE `CombatProjection` (v0.25.3).
- ✅ **Wildlife combat** — animals attack NPCs, retaliate, flee; defense party formation (Sprint 2B/2C).
- ✅ **Faction consequences** — combat dominance shift → `FACTION_TILE_SEIZED` (v0.33.0).

🟡 **ARCHITECTURE.md §11.4** — combat session/log partially outside canonical EventLog (not yet fully merged).
❌ **History chronicle** — combat outcomes don't feed `history_chronicle` projection (doesn't exist yet).
❌ Player cannot fight animals (player-vs-wildlife commands exist but are not validated to start a sub-tick combat session).

---

## 23. Card System

- ✅ **Catalog**: 100 cards.
- ✅ **World card drops**: deterministic spawn.
- ✅ **Player operations**: pickup, store, release, codex materialize, trade.
- ✅ **Codex**: per-player card library.
- ✅ **Techniques shop**.

❌ **ARCHITECTURE.md §11.2** — card events live in `card_action_log` separate from canonical `event_log`.
❌ Cards are **effects/items**, not **World Rule Operators** as Part I §8 demands. (Phase 4 not yet done.)

---

## 24. Player Capabilities

What a logged-in player can do (verified in `packages/server/src/http/`):

**Identity / account**, **World view**, **Cards**, **NPC dialog & intervention**, **Combat** (Phase B + Phase C), **Social**, **Techniques**, **Admin / GM** (`/admin/npc-stats`).

**New since v0.15.47 (Phase 6, v0.30.0–v0.31.0):**
`PLAYER_CLAIMED_TERRITORY`, `PLAYER_HIRED_NPC`, `PLAYER_DISMISSED_NPC`, `PLAYER_JOINED/LEFT/LED_FACTION`, `PLAYER_PLAYED_CARD`, `PLAYER_HUNTED_ANIMAL`, `PLAYER_FISHED`, `PLAYER_DOMESTICATED_ANIMAL`, `PLAYER_PROTECTED_REGION`, `PLAYER_PICKED_UP_GOODS`, `PLAYER_TRADED_GOODS`, `PLAYER_FOUNDED_SETTLEMENT`, `PLAYER_SPONSORED_CONSTRUCTION`.

❌ Player **cannot** carry goods physically between tiles (logistics substrate exists; player-goods-movement is command-only with no spatial carrier simulation).
❌ `history_chronicle` projection not implemented — no arc-based history for the player's absence periods.

---

## 25. AI / Narration Layer

- ✅ **Gemini integration** for NPC dialog.
- ✅ **Ambient narrator** per-tile.
- ✅ **Chronicle renderer** with machine-readable English fallbacks for all event types.
- ✅ **Anti-hallucination guardrail** (v0.15.3+).
- ✅ **AI output never re-enters EventLog**.
- ✅ **AI failure / latency cannot block tick**.
- ✅ **Server-authored motivation payloads**.

❌ **ARCHITECTURE.md §11.9** — NPC personal dialog not fully grounded in known-person graph, alias memory, faction knowledge.
❌ **Ecological perception** — AI prompts not yet fed animal population / migration / extinction events (ecosystem data exists in projections but not wired to dialog context).

---

## 26. Observability Surfaces

| Page / Endpoint | What it shows |
|---|---|
| `HubPage.tsx` | Parent overview map, district sprites, routed travellers, construction activity, since-last-visit panel, PlayerCivilizationPanel |
| `AreaPage.tsx` | 15×10 cell canvas, NPC sprites, building markers, ambient narration |
| `BuildingPage.tsx` | Building interior, occupants, work/rest UI |
| `CodexPage.tsx` | Player's collected cards |
| `TimelinePage.tsx` | Event chronicle |
| `AdminNpcsPage.tsx` | GM: NPC origin, births, households, deaths |
| `GET /api/area/:tileId/ecology` | Animal population counts, fishery density, ecosystem region state per tile |
| `GET /api/goods/inventory/:ownerId` | Per-owner goods inventory (non-zero only) |
| `GET /api/world/player-state` | Player wallet, hired NPCs, faction memberships, claimed tiles |

**APIs as data product**, **SSE stream** at `/api/events/stream`.

❌ No **ecosystem dashboard frontend page** — `/api/area/:tileId/ecology` endpoint exists but no dedicated UI.
❌ No **market price panel** or goods flow visualization.

---

## 27. Ecosystem Runtime Baseline (Layer 2.5)

**Status: fully implemented across E0–E4.**

- ✅ **Species catalog** (`ecosystem/species.ts`): 23 species across 5 biome regions (salt_marsh / forest / mountain / desert / ruin). All fields from §6.3 domain model.
- ✅ **Animal entity runtime**: `Animal` type with id, speciesId, tileId, biomeRegion, state, hunger, health, fear, aggression, packId?, migrationTarget?, lifecycleStage.
- ✅ **Wildlife Engine** (`ecosystem/animalSpawning.ts`): deterministic spawn per biome via `hashSeed`; population caps via `carryingCapacity`.
- ✅ **Predation Engine** (`ecosystem/predation.ts`, `aggression.ts`): predator-on-prey hunt; predator attacks NPCs when hungry; fear + flee logic.
- ✅ **Fishery Engine** (`ecosystem/fishery.ts`): `fishDensity` per coastal tile; NPC fishing depletes density; `FISHERY_COLLAPSED` / `FISHERY_RECOVERED` at thresholds.
- ✅ **Migration Engine** (`ecosystem/migration.ts`): `MIGRATION_WAVE_STARTED` / `ANIMAL_MIGRATED` triggered by season + pressure.
- ✅ **Reproduction** (`ecosystem/reproduction.ts`): `ANIMAL_REPRODUCED` per `reproductionRate`; carrying-capacity cap.
- ✅ **Extinction tracking** (`ecosystem/extinctionPlanner.ts`): `SPECIES_EXTINCTION_WARNING` → `SPECIES_EXTINCT` → `SPECIES_RECOVERED`.
- ✅ **Ecosystem pressure planner** (`ecosystem/pressurePlanner.ts`): `ECOSYSTEM_PRESSURE_RAISED/_RECOVERED` feeds back into settlement food/safety scalars.
- ✅ **Domestication** (`ecosystem/domesticationPlanner.ts`): `ANIMAL_DOMESTICATED` / `LIVESTOCK_BRED` / `MOUNT_ASSIGNED` / `LIVESTOCK_SLAUGHTERED`.
- ✅ **Legendary ecology** (`ecosystem/legendarySpawnPlanner.ts`, `legendaryHuntPlanner.ts`, `factionEcologyPlanner.ts`): mythic species behavior, legendary hunt arc, faction ecological ideology (Phase E4).
- ✅ **Defense coordination** (`ecosystem/defenseParty.ts`): NPC defense party formation when animal attacks.

❌ **BioNode** (`BioNode {...}` for plants / fungi) — not implemented; only animals and fishery density exist.
❌ **Forest Regrowth Engine** — `FOREST_DEPLETED` / `BIOME_RECOVERED` commands exist in §6.5 but are not in catalog or wired.
❌ `SPECIES_POPULATION_SHIFTED` — not yet in command catalog.

---

## 28. Persistence

- ✅ **`event_log`** — canonical SQLite table; single source of world truth.
- ✅ **`rejected_command_log`** — audit log.
- ✅ **FACT_SET snapshots** — transitional, still used for area state (ARCHITECTURE.md §11.5).
- ✅ **Hydration on boot** — all projections rebuilt from EventLog on startup.
- ✅ **Orthogonal stores**: accounts, password resets, friend graph, messages, alliances, player codex, card trades, player jobs, wallet, settings.

**In-memory projections (all with `rebuildFromEvents` + canonical-hash):**

| Projection | Purpose | Since |
|---|---|---|
| `npc_memory` | NPC event-decay memory rows | v0.15.x |
| `npc_relationships` | Trust scalar per NPC pair | v0.15.x |
| `construction_projects` | Active / completed projects | v0.15.x |
| `NpcStateProjection` | NPC presence + activity (typed, replaces FACT_SET) | v0.3x |
| `SettlementsProjection` | Settlement entity, population, stability | v0.2x |
| `AnimalPopulationProjection` | Animal count per (speciesId, tileId) | v0.2x |
| `EcosystemRegionProjection` | Biodiversity, pressure, collapse state | v0.2x |
| `FisheryDensityProjection` | Fish density per coastal tile | v0.2x |
| `GoodsInventoryProjection` | Goods per (holderId, holderType, goodsId) | v0.34.0 |
| `LogisticsProjection` | Open trade routes + in-transit goods | v0.3x |
| `MarketPricesProjection` | Price per (marketId, goodsId) | v0.3x |
| `ProductionChainsProjection` | Active production jobs | v0.3x |
| `FactionControlProjection` | Dominant faction per tile | v0.33.0 |
| `NpcMortalityProjection` | Deceased NPC tracking | v0.32.0 |
| `NpcLineageProjection` | Household membership + heir history | v0.32.0 |
| `PlayerCivilizationProjection` | Per-account wallet / hired NPCs / factions / tiles | v0.30.0 |
| `LivestockRegistryProjection` | Domesticated animals per settlement | v0.2x |
| `WorldEventProjection` | Active legendary world events | v0.29.0 |
| `AnimalMigrationProjection` | Active migration waves + routes | v0.2x |
| `CulturalElementProjection` | Emergent cultural elements | v0.3x |
| `HouseholdEconomyProjection` | Household gold pool | v0.3x |
| `PredatorHungerProjection` | Predator hunger state | v0.2x |
| `RumorProjection` | NPC rumor payloads | v0.3x |
| `SkillXpProjection` | NPC skill XP with lineage | v0.3x |
| `SpeciesExtinctionProjection` | Extinction warnings + extinct species | v0.2x |

❌ **`history_chronicle` projection** — not implemented (§30.9). Combat, ecological, and political events have no emergent arc narrative.
❌ **ARCHITECTURE.md §11.7** — projection rebuild contract sweep incomplete for some older projections (area state, building occupants).

---

═══════════════════════════════════════════════════════════════
## Part III — Operational Crosswalk

Mapping Part I principles to specific Commands / projections /
runtime hooks the implementation needs. Input for OpenSpec changes.
═══════════════════════════════════════════════════════════════

## 29. Layer-by-Layer Status (v0.50.0)

| Layer | Status | Already shipped | Major missing pieces |
|---|---|---|---|
| **1. Simulation Kernel** | ✅ Strongest | Command/Event/State separation, EventLog, deterministic replay, 10-step tick, hashSeed randomness, tick atomicity, ~121 command types | ARCHITECTURE.md §11.5 (area FACT_SET), §11.6 (budget gate), §11.7 (rebuild contract sweep) |
| **2. Living World Runtime** | 🟡 Strong | Weather, season, rare windows, world events, NPC routine / interaction / memory / relationships / mortality / lineage / household, rumor propagation, mentorship, cultural festivals, world agenda, productive actions, skill XP, autonomous construction | NPC migration (household moves tile permanently), NPC-to-NPC trade, ARCHITECTURE.md §11.9 dialog grounding |
| **2.5. Ecosystem Runtime** | ✅ **Fully implemented** | 23 species catalog, animal entity runtime, Wildlife / Predation / Fishery / Migration / Reproduction / Extinction / Domestication / Legendary Ecology engines, 5 ecosystem projections, faction ecological ideology | BioNode (plant/fungal), Forest Regrowth Engine, `FOREST_DEPLETED` / `BIOME_RECOVERED`, `SPECIES_POPULATION_SHIFTED` |
| **3. Civilization Runtime** | 🟡 Substantial | Settlement entity + lifecycle; goods primitives; logistics (trade routes + transport); production chains; market price discovery; faction territory + loyalty; NPC mortality + lineage | History chronicle projection; roads/bridges as map features; carrier NPC autonomous routing; §43 criterion 2 + 3 not yet verifiable end-to-end |
| **4. Combat Runtime** | 🟡 Strong | Phase B + C (real-time sub-tick, 5-phase pipeline, 紋卡 priority), wildlife combat, faction consequences | ARCHITECTURE.md §11.4 (combat log not fully in canonical EventLog); cards as combat rule operators (Phase 4); history chronicle feed |
| **5. Perception Runtime** | 🟡 Partial | Gemini dialog, ambient narrator, chronicle renderer, anti-hallucination guard, server-authored motivation payloads, AI fire-and-forget | ARCHITECTURE.md §11.9 dialog grounding (known-person graph), ecological perception (ecosystem data not yet wired to AI prompts), history projection as interpreted arcs |

The "看起來像 civilization 的 placeholder" critique from Part I §4 is now partially resolved: Layer 2.5 is real (not a placeholder), Layer 3 has genuine goods metabolism, and Layer 2 has cultural + mortality depth. The remaining genuine gaps are: budget gate, history chronicle, and AI dialog grounding.

---

## 30. Principles → Required New Capabilities

What each Part I principle demands as new Commands, projections, runtime hooks.

### 30.1 Settlement Is a Real Entity (Part I §5.1)

**Domain:** `Settlement` — `{ id, tileId, population[], storage, economyState, territory, factionAlignment, stability, productionCapacity[], defense, expansionPressure, tradeRoutes[] }`.

**Commands:** `SETTLEMENT_FORMED`, `_POPULATION_CHANGE`, `_GROW`, `_DECLINE`, `_SPLIT`, `_MIGRATE`, `_DESTROYED`, `_TAKEN_OVER`.

**Projection:** `settlements`.

**Runtime hook:** Layer 3 `SettlementEngine`.

### 30.2 Economy Must Become Metabolism (Part I §5.2)

**Domain:** `Goods` — `{ kind: 'raw'|'intermediate'|'finished', species, quantity, location }`.

**Commands:** `GOODS_EXTRACTED`, `_STORED`, `_PROCESSED`, `_CONSUMED`, `_DESTROYED`.

**Projection:** `goods_inventory` per (settlement, building, NPC).

**Runtime hook:** Layer 3 `EconomyEngine`. **Dependency on Layer 2.5**: raw goods MUST originate from ecosystem events (`ANIMAL_KILLED → CARCASS_CREATED → MEAT_HARVESTED → GOODS_EXTRACTED`), never out of thin air.

### 30.3 Logistics Is Civilization (Part I §5.3)

**Domain:** `TradeRoute`, `carrier` NPC archetype, `warehouse / port / road_segment / bridge` building types.

**Commands:** `GOODS_TRANSPORT_STARTED`, `_ARRIVED`, `_LOST`, `TRADE_ROUTE_OPENED`, `_CLOSED`.

No instant teleport. Carrier loss (incl. predator attack from §30.13) cascades.

### 30.4 Construction & Map Evolution (Part I §5.1 + §5.3)

**Commands:** existing construction + `BUILDING_UPGRADED`, `_DAMAGED`, `_ABANDONED`, `_REPAIRED`, `_CAPTURED`, `ROAD_BUILT`, `BRIDGE_BUILT`, `WALL_BUILT`, `MAP_FEATURE_DECAYED`.

### 30.5 Learning As Historical Accumulation (Part I §5.4)

**Commands:** `NPC_OBSERVED_SKILL`, `NPC_MENTORSHIP_STARTED/_COMPLETED`, `NPC_KNOWLEDGE_INHERITED`.

Skill XP carries `lineage`.

### 30.6 Culture Must Emerge (Part I §5.4)

**Domain:** `CulturalElement` — `{ kind: 'tradition'|'belief'|'festival'|'ritual'|'ideology'|'norm', scope, participants[], originatingEvent }`.

**Commands:** `CULTURAL_ELEMENT_FORMED`, `_OBSERVED`, `_FORGOTTEN`.

### 30.7 Combat As Civilization Pressure Resolution (Part I §7)

**Commands (on top of Phase C):** `FACTION_DOMINANCE_SHIFTED`, `TERRITORY_CLAIM_CHANGED`, `NPC_INCAPACITATED_LONG`, `NPC_DECEASED`, `COMBAT_WITNESS_RECORDED`.

Combat events feed history projection (§30.9). Wildlife combat events feed species population (§30.13).

### 30.8 Cards As World Rule Operators (Part I §8)

**Reframe:** cards modify rule evaluation for a bounded scope.

**Examples:** `"潮汐倒退"` lowers food cost at `t_dock`; `"石脈共鳴"` doubles `GOODS_EXTRACTED` for `mountain_ore`; `"血潮"` temporarily drives prey species to migrate.

**Implementation:** `ruleOperatorScope`, `ruleOperatorEffect`, `durationTicks`, `permittedInvokers`. Closes ARCHITECTURE.md §11.2.

### 30.9 Emergent History Projection (Part I §12)

**Projection:** `history_chronicle` — narrative arcs from event sequences:

- Settlement formation arc
- Faction war arc
- Founder / hero arc
- Decline arc
- Ecological collapse arc
- Great migration arc
- Extinction arc

### 30.10 Player As Civilization Actor (Part I §9)

**Commands:** `PLAYER_HIRED_NPC`, `_DISMISSED_NPC`, `_SPONSORED_CONSTRUCTION`, `_FOUNDED_SETTLEMENT`, `_CLAIMED_TERRITORY`, `_JOINED_FACTION`, `_LEFT_FACTION`, `_LED_FACTION`, `_TRADED_GOODS`, `_PLAYED_CARD`, **plus ecosystem-facing actions** `_HUNTED_ANIMAL`, `_FISHED`, `_DOMESTICATED_ANIMAL`, `_PROTECTED_REGION`.

Closes ARCHITECTURE.md §11.3 and applies `player-intervene-and-combat`.

### 30.11 Engineering Priorities — Architectural Cross-Cutting (Part I §10)

Part I §10 names four priorities:

- **P1 Budget Enforcement** = ARCHITECTURE.md §11.6.
- **P2 Typed Event Migration** = ARCHITECTURE.md §11.5.
- **P3 Ecosystem Foundation** — new — Layer 2.5 minimum viable (§30.12–§30.18). Required before honest civilization metabolism.
- **P4 Civilization Runtime** = ARCHITECTURE.md §11.8 expanded.

### 30.12 Ecosystem Autonomy (Part I §6.2.1)

**Domain:** `Animal`, `Species`, `BioNode`, `EcosystemRegion` (see §6.3).

**Wildlife Engine** runs every K ticks. Determines spawn, migration, predator/prey balancing, starvation, reproduction, pack coordination. All outcomes derive from `hashSeed(speciesId, tileId, tick, pressure)`.

### 30.13 Predator / Prey + Hunting (Part I §6.2.3)

**Commands:** `ANIMAL_SPAWNED`, `_MIGRATED`, `_REPRODUCED`, `_STARVED`, `_DIED`, `_HUNT_STARTED`, `_HUNT_RESOLVED`, `_KILLED`, `CARCASS_CREATED`, `MEAT_HARVESTED`, `HIDE_COLLECTED`, `BONE_COLLECTED`, `SPECIES_POPULATION_SHIFTED`.

**Projection:** `animal_population` per `(speciesId, tileId)`. Rebuild + canonical hash.

Predators may target prey, livestock, NPC carriers, isolated players.

### 30.14 Fishery (Part I §6.2.2 + §6.6.3)

**Fishery Engine** tracks `fishDensity` per coastal tile.

`FISHERY_COLLAPSED` Command/Event when density crosses extinction threshold. Civilization Runtime reads `fishDensity` to set local fish-goods price.

### 30.15 Forest Regrowth (Part I §6.6.4)

**Forest Regrowth Engine** regenerates tree density slowly. Roads and buildings reduce regrowth + animal spawn rate.

`FOREST_DEPLETED`, `BIOME_RECOVERED` Commands. Heavy logging may permanently alter biome identity.

### 30.16 Migration (Part I §6.2.4)

**Migration Engine** triggers `ANIMAL_MIGRATED`, `MIGRATION_WAVE_STARTED` on winter / low food / predator density / pollution / rare windows / civilization expansion.

**Projection:** `migration_routes`.

### 30.17 Civilization Pressure → Pollution + Collapse (Part I §6.2.5)

**Commands:** `POLLUTION_INCREASED`, `POLLUTION_RECOVERED`, `SPECIES_EXTINCTION_WARNING`, `SPECIES_EXTINCT`, `SPECIES_RECOVERED`.

`EcosystemRegion.pollution` rises with industrial buildings + faction expansion; lowers naturally over many ticks if pressure drops.

### 30.18 Domestication (Part I §6.8)

**Commands:** `ANIMAL_DOMESTICATED`, `LIVESTOCK_BRED`, `MOUNT_ASSIGNED`, `LIVESTOCK_SLAUGHTERED`.

**Projection:** `livestock_registry` per settlement. Mounts feed back into logistics capacity and travel speed.

---

═══════════════════════════════════════════════════════════════
## Part IV — Phased Plan

Release-sized phases. Each phase closes at least one
ARCHITECTURE.md §11 backlog item OR delivers a constitutional
substrate. Sequence is dependency-locked per Part I §11.
═══════════════════════════════════════════════════════════════

## 31. Phase Overview & Honest Sizing

| Phase | Theme (Part I §11) | Part I §10 priority | Releases | Closes ARCHITECTURE.md §11 |
|---|---|---|---|---|
| **0** | Architecture Formalization (doc only) | — | 1 | none |
| **1** | Budget Gate + Settlement Runtime | **P1 + P2 + P4 start** | 4–6 | 11.5, 11.6, 11.7 (NPC + areas), 11.8 starts |
| **E0** | Ecosystem Foundation | **P3 start** | 2–4 | (new substrate) |
| **2** | Goods + Logistics + Market | P4 continues | 3–5 | 11.8 expands |
| **E1** | Predator/Prey + Migration | P3 continues | 2–3 | (new substrate) |
| **3** | Culture + Humanity + Rumor + Mentorship | Layer 2 / 5 humanity | 3–4 | 11.9 |
| **E2** | Civilization Pressure (overfishing / depletion / pollution) | P3 + P4 | 2–3 | (closes feedback loop) |
| **4** | Cards as Rule Operators | — | 1–2 | 11.2 |
| **5** | Persistent Combat Consequences (incl. wildlife) | — | 2–3 | 11.4 |
| **E3** | Domestication | — | 2–3 | (extends substrate) |
| **6** | Player Civilization Integration | — | 2–4 | 11.3, `player-intervene-and-combat` applied |
| **E4** | Mythic Ecology (rare species / ecosystem world events / faction ecological conflict) | — | 2–3 | (ecological history) |
| **Total** | | | **≈26–43 releases** | All §11 items closed |

**Dependency rule:** Phase 1's budget gate (P1) must complete before any later phase grows per-tick load. Phase E0 (P3 ecosystem foundation) must complete before Phase 2 (goods/logistics/market) — otherwise metabolism is fake. Phase 2 must complete before Phase E1 — predator/prey have nothing to disrupt without goods existing. And so on. The interleaving in §31 is not negotiable.

**At v0.15.34→47 cadence** this is ~6 months optimistic, ~12–24 months realistic for the full 12-phase program.

---

## 32. Phase 0 — Architecture Formalization

**Goal:** Lock the six-layer vocabulary into the documentation system.

**Concrete deliverables:**
- Add `ARCHITECTURE.md` §12 "Six Runtime Layers" — definitions (including Layer 2.5 Ecosystem), inter-layer rule, mapping of existing §0–§11 to layers.
- Update `DEVELOPMENT_CONSTITUTION.md` with vision pointer.
- Update `ROADMAP.md` — v0.16.0 entry naming Phase 0.
- No code change.

**Definition of done:**
- All six docs cross-reference each other consistently.
- ARCHITECTURE.md §12 names which layer each existing module belongs to.

**Release:** v0.16.0.

---

## 33. Phase 1 — Budget Gate + Settlement Runtime

**Goal:** Make Layer 3 a real layer and prepay budget / typed-event / rebuild-contract debt.

**33.1 Budget gate (closes ARCHITECTURE.md §11.6)** — 1–2 releases. Per-tick command cap, NPC partitioning, regional activation, `/api/dashboard` exposes tick cost histogram. Load test at 200 NPCs.

**33.2 NPC FACT_SET → typed events (closes ARCHITECTURE.md §11.5 for NPC state)** — 1 release. New `npc_state` projection with rebuild + canonical-hash.

**33.3 Projection rebuild contract sweep (closes ARCHITECTURE.md §11.7)** — 1 release. Area state, building occupants, weather/season, active world events, rare windows, household/children all gain rebuild+hash tests.

**33.4 Settlement domain object (opens §30.1)** — 1–2 releases. `settlement-domain` OpenSpec change. Visible behavior: ≥ 3 NPCs co-located + recurring co-presence for K ticks → `SETTLEMENT_FORMED`; Hub map shows "聚落: <name>". Salt-marsh becomes the first NPC-formed settlement.

**Definition of done:** tick cost bounded at 200 NPCs; NPC state replayable from typed events; salt-marsh = real settlement entity; new projections have rebuild + canonical-hash tests.

**Releases:** v0.16.1 → v0.16.6 (approximately).

---

## 34. Phase E0 — Ecosystem Foundation

**Goal:** Make Layer 2.5 a real layer with minimum viable wildlife and fishery, so Phase 2 metabolism can be honest.

**E0.1 Species catalog + Animal entity (opens §30.12)** — 1 release.
- New file `packages/server/src/ecosystem/species.ts` with the §6.4 catalog (22 species across 5 regions).
- `Animal` runtime entity type with fields from §6.3.
- `Species` lookup helpers.

**E0.2 Wildlife Engine + spawning** — 1 release.
- `ANIMAL_SPAWNED` Command + projection.
- Deterministic per-biome spawn rate via `hashSeed(speciesId, tileId, tick)`.
- `animal_population` projection per `(speciesId, tileId)` with rebuild + canonical-hash.
- Active vs background region throttling per Phase 1 budget gate.

**E0.3 Simple hunting** — 1 release.
- `ANIMAL_HUNT_STARTED`, `ANIMAL_HUNT_RESOLVED`, `ANIMAL_KILLED`, `CARCASS_CREATED`, `MEAT_HARVESTED` Commands.
- NPC hunter archetype actually emits hunt commands when nearby prey + low household food.
- `MEAT_HARVESTED` feeds NPC `civic.gold` and household storage (placeholder for Phase 2 Goods).

**E0.4 Fishery density** — 1 release.
- Coastal tile `fishDensity` projection.
- NPC fisher archetype reduces local density on `work` actions.
- `FISHERY_COLLAPSED` warning when density crosses extinction threshold.

**Definition of done:**
- Forest hunters actually hunt `forest_deer` and reduce population.
- Salt-marsh fishers actually reduce `marsh_fish` density.
- Stopping all hunting on a tile for K ticks → population recovers deterministically.
- All ecosystem commands and projections have rebuild + canonical-hash tests.

**Releases:** v0.17.0 → v0.17.3 (approximately). **MUST land before Phase 2.**

---

## 35. Phase 2 — Goods + Logistics + Market

**Goal:** Layer 3 starts metabolizing goods sourced from ecosystem events. `economy` stops being a scalar.

**35.1 Goods primitives (§30.2)** — 1 release. Catalog ~10 goods species (brine, lumber, ore, fish, grain, refined salt, iron ingot, bread, cloth, tools). Commands `GOODS_EXTRACTED`, `_STORED`, `_PROCESSED`, `_CONSUMED`, `_DESTROYED`. `goods_inventory` projection per (settlement, building, NPC). **First behavior:** `MEAT_HARVESTED` from Phase E0 promotes to `GOODS_EXTRACTED:meat`. Forest hunters / mountain miners / salt-marsh fishers emit `GOODS_EXTRACTED` on accepted productive actions.

**35.2 Logistics (§30.3)** — 1–2 releases. Carrier NPCs, warehouses, ports, abstract roads. `GOODS_TRANSPORT_STARTED`, `_ARRIVED`, `_LOST`, `TRADE_ROUTE_OPENED`, `_CLOSED`.

**35.3 Production chains (§30.4)** — 1 release. Production buildings consume input goods, emit `GOODS_PROCESSED`. Example: `salt_marsh_brine → refined_salt → central market`.

**35.4 Market formation (§30.2 finishing)** — 1–2 releases. Local supply/demand per goods species per settlement. `MARKET_PRICE_DISCOVERED` Command/Event.

**Definition of done:** salt-marsh supplies refined salt to central market via real carrier NPCs; carrier route disruption causes shortage; settlement prices respond to supply.

**Releases:** v0.18.0 → v0.18.4 (approximately).

---

## 36. Phase E1 — Predator/Prey + Migration

**Goal:** Layer 2.5 ecosystem balances itself. Predators eat prey; migrations happen; populations breathe.

**E1.1 Predation Engine** — 1 release. Predator behavior: hunt nearby prey, starve if scarce, migrate if hopeless. `ANIMAL_STARVED`, `_DIED`, predator-on-prey hunt resolution.

**E1.2 Reproduction + carrying capacity** — 1 release. `ANIMAL_REPRODUCED` deterministic per `Species.reproductionRate`. Carrying capacity caps population.

**E1.3 Migration Engine (§30.16)** — 1 release. `ANIMAL_MIGRATED`, `MIGRATION_WAVE_STARTED` triggered by season / low food / predator density / pollution / rare windows / civilization expansion. `migration_routes` projection.

**Definition of done:**
- `fog_wolf` population fluctuates with `forest_deer` population (Lotka-Volterra-ish).
- `marsh_heron` migrates seasonally between `t_salt_marsh` and `t_temple`.
- Forest pressure (heavy NPC activity) reduces local `forest_deer` spawn, drives migration.

**Releases:** v0.18.5 → v0.18.7 (approximately).

---

## 37. Phase 3 — Culture + Humanity + Rumor + Mentorship

**Goal:** Layer 2 + Layer 5 close the humanity gap. NPCs become people, not predictable role-actors.

**37.1 Dialog grounding (closes ARCHITECTURE.md §11.9)** — 1–2 releases. AI prompts gain query interface to known-person graph, alias memory, household state, faction knowledge, recent events, **and ecological awareness** ("we haven't seen `marsh_heron` for two seasons"). Anti-hallucination rejects out-of-graph names and out-of-catalog species.

**37.2 Learning from history (§30.5)** — 1 release. `NPC_OBSERVED_SKILL`, `NPC_MENTORSHIP_STARTED/_COMPLETED`.

**37.3 Culture (§30.6)** — 1–2 releases. `CulturalElement` domain. First emergent: festival around recurring rare-window event; faction-specific ritual; regional norm (e.g. salt-marsh fishing prayer).

**37.4 Household shared economy** — 1 release. Household members pool gold; joint decisions. Inheritance on `NPC_DECEASED`.

**Definition of done:** NPCs refuse to "know" people they have never met; NPCs reference ecology in dialog; skill XP shows lineage; at least one regional festival visible in chronicle.

**Releases:** v0.19.0 → v0.19.4 (approximately).

---

## 38. Phase E2 — Civilization Pressure on Ecosystem

**Goal:** Civilization visibly damages ecosystems. Player choices have ecological consequences.

**E2.1 Overhunting + Overfishing detection** — 1 release. Sustained `ANIMAL_KILLED` rate above carrying-capacity threshold emits `SPECIES_EXTINCTION_WARNING`. Sustained fishing emits `FISHERY_COLLAPSED`.

**E2.2 Pollution + Forest depletion** — 1 release. Industrial-type buildings raise `EcosystemRegion.pollution`. Heavy construction raises `FOREST_DEPLETED`. Both reduce nearby `animal_population` regen.

**E2.3 Recovery loops** — 1 release. If pressure drops for K ticks, `POLLUTION_RECOVERED`, `BIOME_RECOVERED`, `SPECIES_RECOVERED` emit deterministically.

**E2.4 Settlement feedback** — 1 release. `EcosystemRegion` state feeds back into Settlement Runtime: food shortage → unrest → faction shift → in extreme case `SETTLEMENT_DECLINE`.

**Definition of done:** disrupting `salt_marsh_brine` extraction via overfishing collapses local market price, drives NPC migration, settlement declines if unaddressed.

**Releases:** v0.20.0 → v0.20.3 (approximately).

---

## 39. Phase 4 — Cards as Rule Operators

**Goal:** Layer 4 (and player) treats cards as rule-operators, not effects. Closes ARCHITECTURE.md §11.2.

**39.1 Unify card events into canonical EventLog** — 1 release.

**39.2 Cards as rule operators** — 1 release. Catalog gains `ruleOperatorScope` / `ruleOperatorEffect` / `durationTicks` / `permittedInvokers`. Ecology-affecting cards now operable: `"祈雨"` boosts forest regrowth, `"血潮"` drives prey migration.

**Definition of done:** playing a card changes how subsequent Commands are validated; every card play is in `event_log` and replayable.

**Releases:** v0.20.4 → v0.20.5 (approximately).

---

## 40. Phase 5 — Persistent Combat Consequences

**Goal:** Layer 4 ships Phase C; combat outcomes ripple into Layer 3 + Layer 2 + Layer 2.5 + Layer 5.

**40.1 Combat Phase C** — 1–2 releases. 10Hz sub-tick + 5-phase rule engine + 紋卡 priority table + SSE `CombatProjection`. Closes ARCHITECTURE.md §11.4.

**40.2 Wildlife combat support** — 1 release. Animals as combat actors. `mountain_bear` can fight a hunter; `fog_wolf` pack can attack a carrier.

**40.3 Persistent consequences (§30.7 + §30.13)** — 1 release. `FACTION_DOMINANCE_SHIFTED`, `TERRITORY_CLAIM_CHANGED`, `NPC_INCAPACITATED_LONG`, `NPC_DECEASED`, `COMBAT_WITNESS_RECORDED`. Wildlife combat outcomes feed `SPECIES_POPULATION_SHIFTED`.

**40.4 History projection (§30.9)** — 1 release. `history_chronicle` projection identifies arcs (Settlement formation, faction war, founder, decline, **ecological collapse, great migration, extinction**). Layer 5 (AI) phrases the arcs.

**Definition of done:** losing combat over contested settlement changes faction control; witnesses remember combats; chronicle page shows interpreted arcs; an extinction event surfaces as a named historical arc.

**Releases:** v0.21.0 → v0.21.4 (approximately).

---

## 41. Phase E3 — Domestication

**Goal:** Civilization integrates ecosystems through livestock and mounts.

**E3.1 Domestication primitives (§30.18)** — 1 release. `ANIMAL_DOMESTICATED`, `LIVESTOCK_BRED`, `LIVESTOCK_SLAUGHTERED`. `livestock_registry` per settlement.

**E3.2 Mounts** — 1 release. `MOUNT_ASSIGNED`. Mounts feed back into NPC travel speed, carrier logistics capacity.

**E3.3 Ranch building type** — 1 release. New building consumes feed (raw goods) and produces livestock + byproducts (milk / wool / meat). Closes the loop with Phase 2 goods.

**Definition of done:** a settlement can run a `marsh_yak` ranch supplying milk to neighboring towns; mounted NPC carriers move goods faster than walking.

**Releases:** v0.22.0 → v0.22.2 (approximately).

---

## 42. Phase 6 — Player Civilization Integration + Phase E4 Mythic Ecology

These are the last two phases, can partially parallel.

### 42.1 Phase 6 — Player Civilization Integration

**Closes ARCHITECTURE.md §11.3; applies `player-intervene-and-combat`.**

- `PLAYER_HIRED_NPC` / `_DISMISSED_NPC`
- `PLAYER_SPONSORED_CONSTRUCTION`
- `PLAYER_FOUNDED_SETTLEMENT`
- `PLAYER_CLAIMED_TERRITORY`
- `PLAYER_JOINED_FACTION` / `_LEFT_FACTION` / `_LED_FACTION`
- `PLAYER_TRADED_GOODS`
- `PLAYER_HUNTED_ANIMAL` / `_FISHED` / `_DOMESTICATED_ANIMAL` / `_PROTECTED_REGION`
- `PLAYER_PLAYED_CARD`

Player wallet/jobs event-sourced; every player Command produces an Event visible to nearby NPCs; long-absent player still appears in NPC dialog + history projection.

### 42.2 Phase E4 — Mythic Ecology

- Rare species behavior (`white_marsh_leviathan`, `iron_hound`).
- Ecosystem-level `WORLD_EVENT_SPAWN`: "The White Marsh Leviathan Emerges" → settlements panic, hunters gather, faction conflict.
- Faction ecological conflict: `guild` clear-cuts forest; `tide_hunters` enforce fishing quotas; `free_runners` sabotage industrial sites; `hidden_overseer` performs ritual ecosystem manipulation.
- Legendary hunts as multi-NPC arcs that update `history_chronicle`.

**Definition of done:** the world runs identically whether the player is online or not (verifies Architecture §0.1); legendary creature events surface in chronicle; faction ecological ideology shifts visible faction behavior.

**Releases:** v0.23.0 → v0.23.4 (approximately).

---

═══════════════════════════════════════════════════════════════
## Part V — Program Acceptance & Meta
═══════════════════════════════════════════════════════════════

## 43. Program Success Criteria (Part I §12)

The program is **not done** when phases 0–6 + E0–E4 ship. It is done when these emergent behaviours can be observed in a live deployment. They are the acceptance test for "Greed Island 才真正成立" + "civilization trapped inside a living planet".

### 43.1 Civilization criteria (Part I §12 ¶1)

| Criterion | Verifiable by |
|---|---|
| 「當某個 NPC 死亡，後代會記得他。」 | `NPC_DECEASED` event produces inheritance + memory transfer to descendants; descendant dialog can reference the deceased ancestor without AI invention. |
| 「當某 settlement 飢荒，周邊價格會上升。」 | Disrupting a `salt_marsh_brine` supply route via `GOODS_TRANSPORT_LOST` causes neighbouring settlements' `MARKET_PRICE_DISCOVERED` events to shift upward within K ticks. |
| 「當 faction 戰敗，道路與物流會崩潰。」 | A losing-faction settlement's roads and trade routes show `TRADE_ROUTE_CLOSED` + `BUILDING_DAMAGED`/`_ABANDONED` after `FACTION_DOMINANCE_SHIFTED` + `TERRITORY_CLAIM_CHANGED`. |
| 「當玩家離開數個月，世界仍然繼續，甚至已經變成另一個文明時代。」 | After K weeks of no player activity, EventLog continues to accumulate civilization-level events; `history_chronicle` shows distinct arc deltas from before-absence to after-absence. |

### 43.2 Ecosystem criteria (Part I §12 ¶2 + WITH_ECO §13)

| Criterion | Verifiable by |
|---|---|
| Witness migration | Live observation of `MIGRATION_WAVE_STARTED` events surfaced in chronicle, with `ANIMAL_MIGRATED` events showing animals crossing tiles. |
| Overhunt a species | Sustained `ANIMAL_KILLED` events on a single species emit `SPECIES_EXTINCTION_WARNING`, then `SPECIES_EXTINCT`. |
| Protect an ecosystem | Reduced civilization pressure for K ticks emits `BIOME_RECOVERED` / `SPECIES_RECOVERED`. |
| Cause ecological collapse | Player or faction behavior triggers `FISHERY_COLLAPSED` / `FOREST_DEPLETED` with cascading economic consequences (price spike, NPC migration). |
| Stabilize a region | Conservation actions (e.g. card play, settlement policy) reverse a decline arc visible in `history_chronicle`. |
| Domesticate creatures | `ANIMAL_DOMESTICATED` + `LIVESTOCK_BRED` events; livestock produces goods via Phase E3 ranches. |
| Lose a settlement to famine | `SETTLEMENT_DECLINE` triggered by sustained food shortage caused by ecological collapse. |
| Factions fight over biological resources | `FACTION_DOMINANCE_SHIFTED` + combat events scoped to a specific contested resource (fishery, forest, rare animal). |
| NPCs discuss disappearing animals | Anti-hallucination-safe NPC dialog references `marsh_heron` / `fog_wolf` etc., grounded by recent `SPECIES_POPULATION_SHIFTED` / `_EXTINCTION_WARNING` events. |
| Extinct species visible only in old chronicles | After `SPECIES_EXTINCT`, the species no longer spawns; `history_chronicle` retains the extinction arc as historical record. |
| The world is a civilization trapped inside a living planet | All of the above co-occur in the same persistent EventLog without GM scripting. |

If any criterion still cannot be demonstrated after the full phase program ships, the program is **not complete** — return to whichever phase failed to land the missing piece.

---

## 44. Update Protocol & Document Scope

**This document is:**
- The integrated constitution + current-state + path picture for Greed Island.
- The reference any new OpenSpec change consults to know which layer it belongs to, which principle it serves, and which phase it ships in.
- The honest gap inventory: every ❌ in Part II is a real missing capability, not a future flag.

**This document is not:**
- Not a substitute for `ARCHITECTURE.md` (engine-level world laws, §11 backlog detail).
- Not a substitute for `ROADMAP.md` (release-by-release history).
- Not a substitute for `PROGRESS.md` (latest handoff state).
- Not a substitute for `COMBAT_ARCHITECTURE.md` (combat sub-runtime spec).
- Not a sprint backlog — Part IV is **6 months – 2 years of work** at realistic pace.

**Update protocol per Part:**
- **Part I** (§1–§12, user-authored constitution + ecosystem vision): updates only when the user redefines world identity / laws / vision. Treat as authoritative source.
- **Part II** (§13–§28, baseline): updates whenever a capability ships, breaks, or is removed. Tag each entry with the release that introduced/removed it.
- **Part III** (§29–§30, crosswalk): updates whenever Part I or Part II changes.
- **Part IV** (§31–§42, plan): updates whenever a phase boundary is crossed, a dependency is invalidated, or a sub-deliverable is re-scoped.
- **Part V** (§43–§44, acceptance + meta): §43 only updates when Part I §12 is rewritten; §44 only when this doc's own scope changes.

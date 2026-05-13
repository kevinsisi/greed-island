# Greed Island — World Capabilities, Constitution & Program

> **Single source of truth** for what Greed Island is, what it must
> become, and how to bridge the two.
>
> Five parts (continuous section numbering 1–43):
>
> - **Part I — Runtime Constitution & Civilization Program** (§1–§12,
>   user-authored): non-negotiable world laws + civilization vision +
>   ecosystem vision + engineering priorities + recommended phase order.
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

整個世界分成六層。

每層只能透過 Command interaction。
不能直接改下一層 state。

```text
Layer 5    — Perception Runtime
             AI narration / dialog / rumors / history

Layer 4    — Combat Runtime
             Combat / card operators / tactical resolution

Layer 3    — Civilization Runtime
             Settlement / economy / logistics / territory

Layer 2.5  — Ecosystem Runtime
             Species / wildlife / predation / migration /
             fishery / forest / domestication / biome recovery

Layer 2    — Living World Runtime
             NPC routines / movement / weather / world events

Layer 1    — Simulation Kernel
             Deterministic event runtime
```

Layer 2.5 sits below Civilization Runtime by design: civilization
consumes ecosystems, not the other way around. Without Layer 2.5,
Layer 3's metabolism (§5.2) is decorative — `economy` becomes a
scalar with no biological substrate.

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

═══════════════════════════════════════════════════════════════
## Part II — Current Verified Baseline (v0.15.47, 2026-05-13)

Verified against `packages/server/src/` and `packages/web/src/`.
✅ = shipped. ❌ = real gap.
═══════════════════════════════════════════════════════════════

## 13. Headline Numbers

| Surface | Count |
|---|---|
| Named map tiles | **9** (`t_central`, `t_forest`, `t_mountain`, `t_temple`, `t_dock`, `t_desert`, `t_ruin`, `t_dimai`, `t_salt_marsh`) |
| NPC profiles configured | **50** unique IDs across 17 profile files |
| Factions | **4** (`tide_hunters` 潮獵會, `free_runners` 自由潮感者, `guild` 公會, `civilian` 平民) |
| **Species catalogued** | **0** (Layer 2.5 not implemented) |
| **Animals in runtime** | **0** |
| **BioNodes in runtime** | **0** |
| Static building catalog entries | **~17** across 8 tiles + 1 dynamic salt-marsh seed |
| Living-world Command types | **26** (see §15) — zero are ecosystem commands |
| Card catalog | **100** cards (`greed-island-card-catalog@0.2.0`) |
| Frontend page views | **14** (Hub / Area / Building / Codex / Timeline / Account / Profile / Settings / Admin / Admin-NPCs / Social / 3 auth pages) |
| Tick cadence | One simulation tick every **5 seconds** (one in-world hour ≈ 5s × 720 = 1 h) |

---

## 14. Kernel Guarantees (Architecture §0–§6)

The simulation is **deterministic, event-sourced, append-only**. Verified by `eventStore`, `ruleEngine`, `pipeline`, `kernel.test.ts`, `livingWorld.test.ts`.

- ✅ **Command → Rule Engine → Event → Projection** is the only path that mutates world state.
- ✅ **EventLog is the single source of truth** (`event_log` SQLite table). Replay reproduces the same WorldState.
- ✅ **Tick atomicity**: one tick = one SQLite transaction; no observable partial state.
- ✅ **Causality**: actors in tick N see only WorldState(N-1).
- ✅ **AI is read-only**: Gemini calls are off-tick; AI cannot append Events, cannot influence Rule Engine, cannot mutate State.
- ✅ **10-step tick runtime** in `SimulationRuntime.runTick`.
- ✅ **Deterministic random** via `hashSeed(commandId, actorId, tick, ...)`. No `Math.random()` in deterministic paths.

❌ **Simulation budget (Architecture §7)** is specified but **not enforced** — no command cap, no NPC partitioning, no regional activation throttle. (ARCHITECTURE.md §11.6)

❌ **ARCHITECTURE.md §11.5 FACT_SET transitional path** still used for NPC state, area state, building occupants, weather, season, rare windows, active events.

---

## 15. Living-World Command Catalog (`livingWorldCommands.ts`)

Every state change goes through one of these 26 Commands:

**World physics**
`WORLD_TICK`, `WEATHER_CHANGE`, `SEASON_CHANGE`, `RARE_WINDOW_OPEN`, `RARE_WINDOW_CLOSE`, `WORLD_EVENT_SPAWN`, `WORLD_EVENT_END`, `AREA_PRESSURE`

**NPC behavior**
`NPC_MOVE`, `NPC_ACTIVITY_CHANGE`, `NPC_INTERACT`, `NPC_PRODUCTIVE_ACTION`, `NPC_DIALOG_HOLD`

**NPC social / life**
`NPC_LIFE_GOAL_SET`, `NPC_HOUSEHOLD_FORMED`, `NPC_CHILD_BORN`

**Civilization (construction slice 1)**
`CONSTRUCTION_INITIATE`, `CONSTRUCTION_PROJECT_PROGRESS`, `BUILDING_CONSTRUCTED`, `MAP_TILE_UNLOCKED`

**Buildings / occupancy**
`BUILDING_ENTER`, `BUILDING_LEAVE`

**Player**
`PLAYER_INTERVENE`

**Combat (Phase B single-shot, v0.15.0)**
`COMBAT_INITIATE`, `COMBAT_PLAYER_ACTION`, `COMBAT_RESOLVE`

❌ Conspicuously **missing** Command types (need new design): all 20+ ecosystem commands (§6.5), production-chain, trade/market, settlement-formation, faction-war/territory-takeover, culture/tradition, mentorship/skill-transfer, player-hire-NPC, player-sponsor-construction, road/bridge-build, goods-extracted/transported/stored/consumed.

---

## 16. World Physics

- ✅ **Tick** advances every 5 s. Audit `occurredAt` allowed; deterministic logic uses integer tick + EventLog only.
- ✅ **Weather** transitions per tick window via `WEATHER_CHANGE` events.
- ✅ **Season** rotates via `SEASON_CHANGE` events.
- ✅ **Rare windows** (timed special states) open/close via dedicated commands.
- ✅ **World events** spawn / end with `WorldEventSpawnCmd` / `WorldEventEndCmd`; carry name + scope + duration; surface in chronicle ticker.
- ✅ **Area state per tile** (`areaStateEngine.ts`) tracks `{ food, safety, economy }` resources with natural decay, pressure thresholds, faction control.
- ✅ **Faction dominance** (4 factions, threshold 80) emergent from NPC behavior weighted by `factionLean`.

❌ No **resource transport** between tiles — `food` decays locally, doesn't flow.
❌ No **production chain** — `economy` is a single scalar, not raw→intermediate→finished goods.
❌ No **scarcity-driven price formation** — there is no market price.
❌ No **ecological substrate** — `food` decays but has no biological source; weather/season don't trigger migrations because no animals exist.

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

- ✅ **Hub view** (parent map): district overview, traveller sprites for routed cross-tile NPCs.
- ✅ **Area view** (15×10 cell canvas): server-authoritative NPC sub-position rendering via `subCol` / `subRow` / `subZ`.
- ✅ **Building interior view**: enter via building marker, NPCs derived from same authoritative presence tuple.
- ✅ **Map expansion** mechanism proven by `t_salt_marsh`. NPC-initiated expansion not yet shipped.

❌ Biomes are labels only — no biome-driven species spawn, no biome-driven regrowth, no biome-driven fishery density.
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

❌ Roles like 「山林獵人」、「漁場仲介」 today have **no animals to hunt or fish to broker** — the archetype exists but the substrate doesn't.

---

## 19. NPC Inner State (per NPC, projection of EventLog)

What an NPC "is" at any tick:

| Field | Source | Status |
|---|---|---|
| `tile`, `buildingId`, `subCol`, `subRow`, `subZ` | `npc.state.<id>` FACT_SET (transitional) | ✅ |
| `activity` | `NPC_ACTIVITY_CHANGE` events | ✅ 11 kinds: `idle`, `work`, `eat`, `sleep`, `trade`, `patrol`, `move`, `build`, `learn`, `service`, `rest` |
| `mood`, `health` | derived from interactions, productive actions, events | ✅ |
| `factionLean` | profile config + emergent shift | ✅ |
| `lifeGoal` (kind + pressure + narration) | `NPC_LIFE_GOAL_SET` | ✅ |
| `household`, `children` | `NPC_HOUSEHOLD_FORMED`, `NPC_CHILD_BORN` | ✅ (existence + linkage; no shared economy yet) |
| `civic.gold` | productive action rewards | ✅ |
| `civic.skillXp` | productive actions × 5 per accepted delta | ✅ 4 domains: `construction` / `knowledge` / `commerce` / `civic` |
| `memory` rows | `npc_memory` projection (event-decay) | ✅ |
| `relationships` rows | `npc_relationships` projection (trust scalar) | ✅ |
| `travelRoute` | `NPC_MOVE` routed traveller (4-tick visibility hold) | ✅ |
| `dialogHold` | `NPC_DIALOG_HOLD` (bounded tick window) | ✅ |

❌ Missing:
- **Knowledge boundary** — NPC's known-person graph, alias memory, faction knowledge (ARCHITECTURE.md §11.9)
- **Household shared economy** — no joint income / decisions
- **Long-term life-stage memory weights** — linear decay only
- **Skill transfer / mentorship** — XP only from doing
- **Culture / tradition** — no festival, no rite, no inherited belief
- **Ecological awareness** — NPCs cannot reference animals, species, migrations, extinctions

---

## 20. NPC Autonomous Behavior (per tick)

What NPCs do **without any player action** (`npcEngine.ts`, `cityLife.ts`, `worldAgenda.ts`):

- ✅ **Routine-following**, **ambient cross-district errands**, **productive actions** (build/learn/trade/service), **autonomous construction initiation**, **construction progress**, **household formation**, **children**, **interactions**, **life goal updates**, **world agenda interpretation**.

❌ Missing autonomous behaviors:
- Hunting / fishing as actual ecology-affecting actions (no animals exist)
- Trade between NPCs (no NPC sells to another NPC)
- Settlement formation / decline (no settlement-as-entity)
- Faction war / territorial takeover
- Knowledge / culture transmission
- Cross-tile resource transport
- Migration (NPC or animal)

---

## 21. Construction / Buildings

- ✅ **Static catalog** (`buildings/catalog.ts`): ~17 named buildings across 8 tiles + dynamic seed.
- ✅ **Player work/rest at buildings**: `POST /api/buildings/:id/apply|quit|work|rest` (NOT event-sourced — ARCHITECTURE.md §11.3).
- ✅ **Dynamic NPC-completed buildings** (v0.15.47e).
- ✅ **Monotonic state invariant** (v0.15.47e).
- ✅ **Per-tile visibility cap**: 3 autonomous completed/open buildings per tile.

❌ Buildings are **not upgradeable, damageable, abandonable, repairable, capturable**.
❌ No **ecosystem-aware building types** — no ranch, no warehouse-of-meat, no smokehouse, no fishery dock.

---

## 22. Combat (Phase B single-shot — v0.15.0 shipped)

- ✅ Player initiates → same-tile NPC → fixed `COMBAT_INITIAL_HP = 100`.
- ✅ Player actions: attack / defend / flee / use-card.
- ✅ Deterministic damage formula, crit @ 12% via `hashSeed`.
- ✅ NPC AI: `hashSeed % 3` → attack / defend / idle-glare.
- ✅ Flee always succeeds.
- ✅ Player loss: `energy → 0`. NPC loss: incapacitated for 1 world tick (5 s).
- ✅ Combat events: `COMBAT_DAMAGE`, `COMBAT_DEFEND`, `COMBAT_FLEE`, `COMBAT_RESOLVE`.

❌ **Phase C real-time sub-tick** — not yet applied.
❌ **ARCHITECTURE.md §11.4** — combat session/log store partially bypasses canonical EventLog.
❌ Combat outcomes do **not** persist into faction / territory / economy / history / **species population**.
❌ No **wildlife combat** — players cannot fight animals because animals don't exist.

---

## 23. Card System (Architecture §0.12)

- ✅ **Catalog**: 100 cards.
- ✅ **World card drops**: deterministic spawn (v0.15.5 hardened, ARCHITECTURE.md §11.1 closed).
- ✅ **Player operations**: pickup, store, release, codex materialize, trade.
- ✅ **Codex**: per-player card library.
- ✅ **Techniques shop**.

❌ **ARCHITECTURE.md §11.2** — card events live in `card_action_log` separate from canonical `event_log`.
❌ Cards today are **effects/items**, not **World Rule Operators** as Part I §8 demands.

---

## 24. Player Capabilities

What a logged-in player can do (HTTP endpoints, verified in `packages/server/src/http/`):

**Identity / account**, **World view**, **Identity-bound world view**, **Wallet / jobs / buildings**, **Cards**, **NPC dialog & intervention**, **Combat** (Phase B), **Social**, **Techniques**, **Admin / GM** including new **`/admin/npc-stats`** GM dashboard (v0.15.48).

❌ Player **cannot**: hire NPC, sponsor / donate to NPC construction, join / lead a faction, claim or transfer land, carry goods between tiles, found a settlement, place a building, affect world economy beyond own wallet, hunt animals, fish, domesticate creatures, witness or trigger migrations, or leave a permanent ecological mark NPCs remember. `player-intervene-and-combat` OpenSpec drafted but **not fully applied**.

---

## 25. AI / Narration Layer (Architecture §9, §0.13)

- ✅ **Gemini integration** for NPC dialog.
- ✅ **Ambient narrator** per-tile.
- ✅ **Chronicle renderer**.
- ✅ **Anti-hallucination guardrail** (v0.15.3+).
- ✅ **AI output never re-enters EventLog as a world Event**.
- ✅ **AI failure / latency cannot block tick**.
- ✅ **Server-authored motivation payloads** (v0.15.34).

❌ **ARCHITECTURE.md §11.9** — NPC personal dialog not fully grounded in memory.
❌ No **rumor propagation** between NPCs.
❌ No **ecological perception** — AI cannot reference animals or migrations (no source data).

---

## 26. Observability Surfaces

| Page | What it shows |
|---|---|
| `HubPage.tsx` | Parent overview map, district sprites, routed travellers, construction activity markers, since-last-visit panel |
| `AreaPage.tsx` | 15×10 cell canvas of one tile, server-authoritative NPC sprites, building markers, ambient narration |
| `BuildingPage.tsx` | Building interior, occupants, hiring slots, work/rest UI |
| `CodexPage.tsx` | Player's collected cards |
| `TimelinePage.tsx` | Event chronicle |
| `AdminNpcsPage.tsx` | **NEW v0.15.48** — GM/admin NPC origin, births, households, deaths placeholder |
| Other pages | Account / Profile / Settings / Admin / Social / Auth |

**APIs as data product**, **SSE stream** at `/api/events/stream`.

❌ No **ecosystem dashboard** — no animal counts, no migration tracker, no extinction-risk panel.

---

## 27. Ecosystem Runtime Baseline (Layer 2.5)

**Status: completely empty (0% implemented).**

- ❌ No species catalog file.
- ❌ No animal entity runtime (`Animal {...}` not defined anywhere).
- ❌ No BioNode runtime (`BioNode {...}` not defined).
- ❌ No EcosystemRegion projection.
- ❌ No Wildlife / Predation / Fishery / Forest Regrowth / Migration engines.
- ❌ Zero of the ~22 ecosystem Commands listed in §6.5 exist in `livingWorldCommands.ts`.
- ❌ No goods chain — meat/fish/fungus/livestock are concepts not entities.
- ❌ No biome-derived spawn or scarcity logic.
- ❌ No domestication path.

This is the largest gap in the codebase relative to the constitutional target. Phase E0 (§37) is the first concrete slice.

---

## 28. Persistence

- ✅ **`event_log`** — canonical SQLite table; single source of world truth.
- ✅ **`rejected_command_log`** — audit log.
- ✅ **Projection tables**: `npc_memory`, `npc_relationships`, `construction_projects` (rebuild-from-events + canonical-hash tests).
- ✅ **FACT_SET snapshots** (transitional ARCHITECTURE.md §11.5).
- ✅ **Hydration on boot**.
- ✅ **Restart-safe expansion** (v0.15.36).
- ✅ **Orthogonal stores**: accounts, password resets, friend graph, messages, alliances, player codex, card trades, player jobs, wallet, settings.

❌ **ARCHITECTURE.md §11.7** — projection rebuild contract incomplete.
❌ No ecosystem projections (`animal_population`, `ecosystem_region`, `migration_routes`, `livestock_registry`, `carcass_registry`) — they do not exist yet.

---

═══════════════════════════════════════════════════════════════
## Part III — Operational Crosswalk

Mapping Part I principles to specific Commands / projections /
runtime hooks the implementation needs. Input for OpenSpec changes.
═══════════════════════════════════════════════════════════════

## 29. Layer-by-Layer Status

| Layer | Status | Already shipped | Major missing pieces |
|---|---|---|---|
| **1. Simulation Kernel** | ✅ Strongest (Part I §4) | Command/Event/State separation, EventLog, deterministic replay, 10-step tick, hashSeed randomness, tick atomicity | ARCHITECTURE.md §11.5 / §11.6 / §11.7 |
| **2. Living World Runtime** | 🟡 Partial (Part I §4) | Weather, season, rare windows, world events, NPC routine / interaction / memory / relationships / life-goals / household / children, ambient errands, world agenda directives, productive actions, skill XP, autonomous construction (slice 1) | Rumor propagation, NPC migration, NPC trade, mentorship, cross-tile schedule |
| **2.5. Ecosystem Runtime** | 🔴 **0% implemented** (Part I §4) | nothing | Everything: species catalog, animal entities, BioNodes, EcosystemRegions, all 5 engines, all 22 commands, all 5 projections |
| **3. Civilization Runtime** | 🔴 Weakest (Part I §4) | Construction initiate→progress→complete pipeline; faction dominance scalar; area resource scalars (food/safety/economy); single map expansion proof | Everything else: settlement, goods, logistics, production chains, market, faction territory/war, settlement decline, map evolution |
| **4. Combat Runtime** | 🟡 Partial | Phase B single-shot, deterministic formulas, replay-safe hashSeed | ARCHITECTURE.md §11.4, Phase C real-time sub-tick, persistent consequences, wildlife combat, cards as combat rule operators |
| **5. Perception Runtime** | 🟡 Partial | Gemini dialog, ambient narrator, chronicle renderer, anti-hallucination guard, server-authored motivation payloads, AI fire-and-forget | ARCHITECTURE.md §11.9 dialog grounding, rumor propagation, history projection as interpreted arcs, ecological perception, regional perception |

Most Phase 1–6 work lands on Layer 3; all of Phase E0–E4 lands on Layer 2.5. The vision (Part I §4) is explicit: "看起來像 civilization 的 placeholder" + "完全不存在於 codebase".

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

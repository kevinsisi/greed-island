# 🌍 Greed Island — World Redefinition v2

> The project is no longer merely a multiplayer game runtime.
>
> The project is now defined as:
>
> A deterministic living civilization simulation system.
>
> 玩家不是進入一張地圖。
>
> 玩家是進入一個持續演化中的人工文明。

---

# 🧠 核心世界定義（Core World Definition）

Greed Island 必須是：

- 決定論世界（Deterministic World）
- 持續存在世界（Persistent World）
- 自主演化世界（Autonomous World）
- 文明模擬世界（Civilization Simulation）
- Event-defined Reality
- Tick-based Simulation
- AI-assisted Perception Layer

世界存在不依賴玩家。

玩家只是世界中的其中一個 Actor。

---

# ⚖️ 世界真相原則（Reality Principle）

世界唯一真相：

```text id="rwv201"
Committed Events

只有：

Command
→ Rule Engine
→ Event

才能改變世界。

任何 Runtime Component：

不可直接修改 State
不可直接新增 Event
不可繞過 Rule Engine
⏱ 世界時間原則（Simulation Time Principle）

世界時間必須使用：

Simulation Tick

而不是：

Date.now()
wall-clock
latency
rendering frame

世界只能依賴：

Tick
EventLog
RulesetVersion
WorldConfig
🌍 世界存在原則（World Existence Principle）

世界必須：

即使沒有玩家仍持續運作
即使沒有 Client 仍持續演化
即使 AI 關閉仍持續存在
即使 Rendering 崩潰仍持續 Simulation

世界不等待玩家。

世界也不等待 AI。

🧠 世界核心層級（World Runtime Layers）

系統正式定義為五層：

1. Simulation Kernel

負責：

Tick Runtime
Rule Engine
Event Ordering
Reducer
Deterministic Resolution
Replay Determinism
Advance Determinism

這是世界物理法則。

2. Living World Runtime

負責：

NPC 行為
World Rules
Weather
Seasons
World Events
Movement
Autonomous Commands

這是世界活動層。

3. Civilization Runtime

負責：

Settlement
Economy
Resource Flow
Logistics
Construction
Production Chains
Territory
Faction Expansion
Population Pressure

這是文明演化層。

4. Combat Runtime

負責：

Deterministic Combat
Rule-based Interactions
Card Resolution
Combat Tick Pipeline
Persistent Combat Consequences

這是衝突演化層。

5. Perception Runtime

負責：

AI Narration
NPC Dialog
Rumors
Historical Interpretation
Atmospheric Rendering
Social Perception

這是認知層。

AI 只能存在於這層。

🤖 AI 原則（AI Principle）

AI 不是世界 Authority。

AI 是：

Perception Layer

AI 可以：

描述世界
解釋事件
生成對話
製造氛圍
形成觀點
傳播謠言

AI 不可以：

修改 State
新增 Event
影響 Rule Engine
改變世界事實
影響 Determinism
👥 NPC 原則（NPC Principle）

NPC 必須是：

Autonomous Deterministic Agents

NPC 必須：

有需求
有壓力
有記憶
有目標
有社會關係
有生產能力
有學習能力
有文明參與能力

NPC 不只是對話物件。

NPC 是世界居民。

🌆 Settlement 原則（Settlement Principle）

文明真正的核心單位不是 NPC。

而是：

Settlement

Settlement 必須具備：

population
storage
economy
territory
faction alignment
production
defense
expansion pressure
stability
trade routes

Settlement 必須能：

成長
衰退
分裂
遷移
被摧毀
被接管
🌾 文明代謝原則（Civilization Metabolism Principle）

世界必須具備：

resource extraction
→ transport
→ refinement
→ production
→ consumption
→ scarcity
→ conflict

世界不能只有 scalar economy。

世界必須存在：

資源
貨物流動
生產鏈
市場
供需
稀缺性
🚚 Logistics 原則（Logistics Principle）

資源必須真實流動。

系統必須存在：

trade routes
carriers
transport
warehouses
ports
roads
shipping

世界經濟不能瞬間傳送。

🏗 建造原則（Construction Principle）

世界地圖不是固定內容。

世界地圖應由：

NPC 建造
faction 擴張
資源壓力
歷史事件
文明需求

自然形成。

🗺 地圖演化原則（World Evolution Principle）

新的：

建築
聚落
道路
港口
橋樑
城牆
農地

應由世界自行演化產生。

地圖是：

Civilization Projection
📚 學習原則（Learning Principle）

NPC 必須能：

學習技能
觀察他人
接受指導
傳承知識
建立文化

技能不是固定數值。

技能應是：

Historical Accumulation
🧠 文化原則（Culture Principle）

世界必須最終具備：

traditions
beliefs
festivals
rituals
faction ideologies
regional culture
social norms

文明不只是經濟。

文明也包含集體認知。

⚔️ 戰鬥原則（Combat Principle）

戰鬥不是副本。

戰鬥是：

Persistent World Conflict

戰鬥結果必須影響：

faction
territory
economy
history
social relationships
world perception
🃏 卡牌原則（Card Principle）

卡牌是：

World Rule Operators

卡牌不是技能特效。

卡牌是：

規則操作
條件改變
世界干涉
因果操縱
🌪 世界壓力原則（World Pressure Principle）

世界必須持續產生：

scarcity
instability
expansion pressure
conflict
migration
survival pressure

即使玩家不介入：

世界也必須改變。

🧠 歷史原則（History Principle）

歷史不應由 Script 編寫。

歷史應由：

NPC 行為
faction 演化
玩家介入
世界事件
資源流動
文明衝突

自然形成。

🌍 玩家定位原則（Player Position Principle）

玩家不是世界中心。

玩家是：

One Actor Inside Civilization

玩家應能：

影響世界
改變歷史
建立勢力
干涉文明
操縱規則

但：

世界不會因玩家停止。

💣 最終目標（Final Objective）

Greed Island 的最終目標不是：

做大型 MMORPG
做 AI NPC Showcase
做 Open World Sandbox

真正目標是：

建立一個具備決定論規則、自主演化文明、持續歷史、真實資源循環、社會結構與認知層的人工世界。
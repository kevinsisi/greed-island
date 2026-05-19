# living-world Specification

## Purpose
TBD - created by archiving change living-world-runtime. Update Purpose after archive.
## Requirements
### Requirement: NPC 必須擁有持續性運行狀態
系統 SHALL 為每個 NPC 持續維護以下欄位：`current_tile`、`mood (0-100)`、
`health (0-100)`、`current_activity`、`faction`、`target_tile`、
`last_acted_tick`，並在重啟後可從 EventLog (FACT_SET) 還原。

#### Scenario: 重啟還原
- **GIVEN** NPC X 在 tick 1000 處於 t_central, activity=work, mood=70
- **WHEN** 服務重啟並 hydrate
- **THEN** NPC X 必須仍處於 t_central / activity=work / mood=70

### Requirement: NPC 行程以 tick-of-day 三段式定義
每個 NPC profile SHALL 提供 schedule（或可從既有 routine 推導），至少涵蓋
morning / afternoon / night 三個時段。每個 slot 必須含 `fromTickOfDay`、
`toTickOfDay`、`location`、`activity` 四個欄位（缺 activity 時系統 SHALL
從 label 或 role 推斷）。系統 SHALL 在 tick 中找出當前 slot 並用其
location 作為 target_tile，用 activity 作為目標活動。

#### Scenario: 缺 schedule 時退回 routine
- **GIVEN** profile 沒有 schedule 欄位但有 routine
- **WHEN** NpcEngine 初始化
- **THEN** 系統必須以 routine 自動推導三段式 schedule，避免破壞既有資料

#### Scenario: 完全沒有 routine
- **GIVEN** profile 既無 schedule 也無 routine
- **WHEN** NpcEngine 初始化
- **THEN** 系統必須給一個全天 idle 的預設 slot，NPC 留在 defaultLocation

### Requirement: NPC tile-by-tile 移動 SHALL 為唯一移動方式
NPC 從 current_tile 走到 target_tile 之間，每個 tick SHALL 最多前進一格
(4-連通)。系統 SHALL 使用 BFS 或等價演算法決定下一步 tile。NPC MUST NOT
在單一 tick 中跨越非相鄰 tile。

#### Scenario: NPC 跨越多 tile
- **GIVEN** NPC 在 t_dock，target = t_mountain
- **WHEN** 進行 5 個 tick
- **THEN** 每 tick 最多更換一次 current_tile，且每一格必須與前一格 4-相鄰

#### Scenario: 已抵達 target
- **GIVEN** NPC current_tile === target_tile
- **WHEN** 跑 1 個 tick
- **THEN** NPC 不移動，activity 改為 slot 指定值（work / eat / sleep …）

### Requirement: 同 tile NPC 之間可以互動
若兩個 NPC 同 tick 同 tile，系統 SHALL 以 deterministic 機率 (seeded by
tick + npcA + npcB) 決定是否觸發 NPC_INTERACT 事件。事件必須包含參與者
ids、互動類型 (chat / argue)、與 deterministic 短描述。同一對 NPC 在
INTERACT_COOLDOWN_TICKS 內不再次觸發。

#### Scenario: 兩個 NPC 同 tile 經過冷卻後可互動
- **GIVEN** NPC A 與 NPC B 在 tick 100 同處 t_central，且 pair 在過去 6 tick 內未互動
- **WHEN** tick 100 跑
- **THEN** 系統 MAY 視 pairRoll 結果 emit 一個 NPC_INTERACT 事件

### Requirement: NPC mood/health SHALL 隨活動緩慢漂移
系統 SHALL 在每 tick 依當前 activity 漂移 mood / health：
- 睡眠 (sleep)：mood / health 緩慢上升
- 工作 (work)：mood / health 緩慢下降
- 用餐 (eat)：mood 與 health 上升
- 爭執 (argue)：mood 大幅下降
所有改動 SHALL clamp 到 0..100 並寫回 FACT_SET。

#### Scenario: 工作 N tick 後 mood 下降
- **GIVEN** NPC mood = 50 且持續 work 50 tick
- **WHEN** 50 tick 後讀 mood
- **THEN** mood 必須 < 50 但仍 ≥ 0

### Requirement: NPC 行為改變 SHALL 產生 narrative event
系統 SHALL 為下列每種變更 emit 對應 narrative event：
- tile 變更 → NPC_MOVE
- activity 變更但 tile 不變 → NPC_ACTIVITY
- 與其他 NPC 互動 → NPC_INTERACT
所有事件 SHALL 透過既有 SSE 通道推送，玩家前端 SHALL 在不重整頁面下看到。

#### Scenario: tile 變更觸發 NPC_MOVE
- **GIVEN** NPC 從 t_dock 走一格到 t_central
- **WHEN** 該 tick 完成
- **THEN** EventLog 必須含一個 NPC_MOVE 事件，payload 含 from / to / activity

### Requirement: NPC API 必須暴露完整狀態
GET /api/npcs SHALL 回傳每個 NPC 的 activity、mood、health、faction、
targetTile 欄位（可選，缺則前端用預設）。

#### Scenario: API 回傳含 living-world 欄位
- **WHEN** 客戶端呼叫 GET /api/npcs
- **THEN** 每個 NPC 物件必須含 activity 字串與 mood / health 整數

### Requirement: 前端 sprite 必須呈現移動感與狀態

Frontend character rendering SHALL present NPCs and players as humanoid avatars where supported, but all NPC position and activity MUST derive from server-authoritative state. Renderer-only idle/pose animation MAY add breathing, limb motion, and posture changes, but MUST NOT create local wandering, change authoritative position, or invent activity.

#### Scenario: NPC avatar action derives from server activity

- **GIVEN** `/api/npcs` reports NPC `n1` with `activity = 'work'` and authoritative sub-position
- **WHEN** an Area or Building scene renders `n1`
- **THEN** the avatar MAY play a work pose/animation
- **AND** its position MUST derive from the server-provided presence tuple
- **AND** the frontend MUST NOT substitute another activity such as trade, patrol, or sleep

#### Scenario: Missing NPC activity falls back safely

- **GIVEN** a legacy NPC payload has no `activity`
- **WHEN** the avatar visual state is derived
- **THEN** the visual action MUST fall back to `idle`
- **AND** no random or AI-generated action is introduced

#### Scenario: Renderer animation does not create local wander

- **GIVEN** an NPC has not received a new authoritative position
- **WHEN** the avatar idle animation plays
- **THEN** the animation MAY move limbs or scale the body for breathing
- **AND** it MUST NOT drift the actor to a new map coordinate

#### Scenario: Player avatar walk is local presentation only

- **GIVEN** a logged-in player moves their local avatar with keyboard or pointer input
- **WHEN** the frontend renders a walking pose
- **THEN** that pose is a renderer-only presentation of local input
- **AND** it MUST NOT be treated as world simulation authority

### Requirement: World Pressure System contract
（Priority 2，本 change 僅立 contract）系統 SHALL 預留 faction-expansion
/ resource-decay / environment-pressure / monster-pressure 四種壓力源
slot。實作必須以 SystemCommand 通過 Rule Engine，MUST NOT 直接 append
Event。

#### Scenario: 壓力源不可繞過 Rule Engine
- **WHEN** 壓力源邏輯產生世界變更意圖
- **THEN** 必須以 SystemCommand 形式提交，由 Rule Engine 評估後才寫 Event

### Requirement: Persistent World Traces contract
（Priority 3）系統 SHALL 為下列重大事件在世界留下可觀察痕跡：戰鬥 →
damage_marker fact、NPC 受傷 → npc.state 持續顯示、大量交易 →
tile.price_drift fact、派系勝負 → faction_flag fact。所有 trace fact
SHALL 帶 decay_function 與 started_at_tick；世界 runtime SHALL 在每 tick
評估並在到期時 emit cleanup 事件。

#### Scenario: 痕跡可觀察與淡出
- **GIVEN** tile T 留下 damage_marker(decay=200)
- **WHEN** 200 tick 後
- **THEN** runtime 必須 emit 對應 cleanup event 並把 fact 從 WorldState 移除

### Requirement: Ambient Narration AI 為 read-only
（Priority 4）AI（Gemini 等）SHALL 只能讀 frozen WorldState(t-1) 與已
commit Event。AI 回應 MUST NOT 寫入 EventLog、MUST NOT 改 NPC trust /
mood / state、MUST NOT 觸發新事件。任何「AI 想做的事」必須轉為
SystemCommand 由 Rule Engine 評估。

#### Scenario: AI 建議的 trustDelta 由 server 決定
- **WHEN** AI 回傳一個對話 trustDelta=+3
- **THEN** server 必須在套用前 clamp 到上界（例如 +2）並在 cooldown 內歸 0

### Requirement: Continuous World Events contract
（Priority 5）系統 SHALL 透過 world rule 在每 tick 評估三類事件：system
events（節慶 / 潮汐節 / 季節更替）、npc-driven events（派系衝突 / 結盟 /
走私）、emergent events（機率化怪物入侵 / 稀有紋卡浮現）。所有事件 MUST
走 Rule Engine，不依賴玩家觸發。

#### Scenario: 玩家不在線世界仍演化
- **GIVEN** 沒有任何玩家連線
- **WHEN** 跑 100 tick
- **THEN** EventLog 必須含至少一個 system / npc / emergent 事件，證明世界自我演化

### Requirement: NPC 對話框輸入 MUST 不被 SSE 重渲染清空
NpcDialog 元件的 reset useEffect SHALL 只在 npc.id 變化時觸發。父層傳入的
onClose callback 必須以 ref 取得，不可進入依賴陣列。

#### Scenario: SSE tick 中保留輸入
- **GIVEN** 玩家打開 NpcDialog 並輸入「我想問你最近的脈動」
- **WHEN** SSE 在背景送來新的 narrative event 觸發父層重渲染
- **THEN** 輸入框 MUST 保留「我想問你最近的脈動」

### Requirement: 好感度 SHALL 不可被連點 quick intent 灌滿
- greet 在 fallback 路徑 SHALL 套用 cooldown：每 NPC 每 TICKS_PER_HOUR
  最多獲得 +1，cooldown 內 delta 必須為 0
- ask 與 trade fallback 路徑 SHALL 永遠回傳 0（trade 在 prev<30 時可 -1）
- AI 路徑回傳的 trustDelta 上界 SHALL 被 clamp 到 +2 以下，並在 prompt
  明確要求 default 0
- 短訊息（< 4 字）的 AI 正分 SHALL 被歸 0

#### Scenario: 連點 greet 不會無限加好感
- **GIVEN** 玩家 trust = 50，剛剛在 tick 100 greet 過
- **WHEN** 玩家在 tick 101 再次 greet
- **THEN** trust delta 必須為 0（因為仍在 cooldown 內）

### Requirement: 行動裝置 EventTickerStrip MUST 不被 MobileTabBar 遮住
EventTickerStrip 在行動裝置 (lg:hidden) 上 SHALL 以 fixed 定位浮在
MobileTabBar 之上（bottom 偏移約 60px）。main 內容區 padding 必須足以
讓正常捲動內容可完整顯示，不被 strip 或 nav 遮住。

#### Scenario: 玩家在 AreaPage 看到事件條
- **GIVEN** 玩家在行動裝置打開區域頁面
- **WHEN** 世界發生天氣變化事件
- **THEN** 事件條必須顯示在 mobile nav 上方且可見，不需要拉動就能看到

### Requirement: BuildingDef supports optional tags field

`BuildingDef` SHALL include an optional field `tags?: readonly string[]`. Existing buildings without this field compile unchanged. Temple and monastery buildings in the catalog SHALL be tagged with `['ritual_site']`.

#### Scenario: ritual_site tag present on temple buildings

- **WHEN** the building catalog is loaded
- **THEN** buildings `b_temple_shrine` and `b_mountain_monastery` (or equivalent temple-type buildings) have `tags` containing `'ritual_site'`

#### Scenario: buildings without tags compile cleanly

- **WHEN** `BuildingDef` objects are created without a `tags` field
- **THEN** TypeScript compiles without error (field is optional)

### Requirement: CULTURAL_FESTIVAL_FORMED and CULTURAL_NORM_ESTABLISHED surface in the chronicle

Cultural event commands SHALL include a non-empty `narration` string field. `readNarrativeFromAnyEvent` SHALL treat these events as chronicle-eligible (narration non-null), so they appear in `TimelinePage`.

#### Scenario: festival narration reaches the chronicle

- **WHEN** `CULTURAL_FESTIVAL_FORMED` is accepted and its event is committed
- **THEN** the event's `narration` field is non-null and non-empty
- **AND** the event appears in the `TimelinePage` event stream

### Requirement: Constants CULTURAL_FESTIVAL_THRESHOLD and CULTURAL_NORM_NPC_THRESHOLD are in world config

Both SHALL be exported from `config/world.ts` as named constants. No magic numbers in seeder or projection logic.

#### Scenario: constants used in festival seeder

- **WHEN** the festival seeder compares the counter to the threshold
- **THEN** it uses `CULTURAL_FESTIVAL_THRESHOLD` (not a hardcoded literal)

### Requirement: NPC state SHALL be persisted as typed living-world events

The runtime SHALL persist authoritative NPC state snapshots as typed
`NPC_STATE_RECORDED` events rather than only as generic `FACT_SET` rows.

#### Scenario: Changed NPC state emits typed state event
- **WHEN** `NpcEngine.tick` produces a changed state for `npcId = X`
- **THEN** the runtime MUST commit an `NPC_STATE_RECORDED` event carrying `X` and
  the authoritative state snapshot for that tick

#### Scenario: Internal NPC state events do not appear as public narrative
- **WHEN** a `NPC_STATE_RECORDED` event is committed
- **THEN** it MUST remain available for typed projection rebuild
- **AND** it MUST NOT surface as a public recent-event / chronicle narrative item

### Requirement: NPC state projection SHALL rebuild engine state from typed events

The server SHALL provide a replayable `NpcStateProjection` rebuilt from
`NPC_STATE_RECORDED` events. Boot hydration SHALL prefer that projection over the
legacy `npc.state.<id>` FACT_SET path.

#### Scenario: Boot hydrate prefers typed projection
- **GIVEN** an EventLog containing `NPC_STATE_RECORDED` events for an NPC
- **WHEN** the runtime boots
- **THEN** `NpcEngine.hydrate(...)` MUST receive the latest typed state snapshot
- **AND** legacy `npc.state.<id>` FACT_SET values MUST be ignored for that NPC

#### Scenario: Legacy FACT_SET remains backward-compatible fallback
- **GIVEN** an older EventLog with no `NPC_STATE_RECORDED` events for an NPC
- **WHEN** the runtime boots
- **THEN** boot hydration MAY fall back to `npc.state.<id>` FACT_SET for that NPC


### Requirement: Productive-action fan-out emits GOODS_EXTRACTED for yield-producing actions

When the runtime commits a `NPC_PRODUCTIVE_ACTION_ACCEPTED` event whose `actionType` is `hunt`, `mine`, or `fish`, the runtime fan-out loop MUST enqueue a `GOODS_EXTRACTED` Command for the appropriate goods species. This fan-out MUST occur within the same world tick as the accepted productive action. The Command MUST pass through the standard `submitLivingWorldCommand → Rule Engine → Event → Projection` pipeline.

#### Scenario: Hunt action fan-out produces meat

- **WHEN** the runtime commits `NPC_PRODUCTIVE_ACTION_ACCEPTED { npcId, actionType: "hunt" }` at tick T
- **THEN** the runtime MUST call `submitLivingWorldCommand({ type: "GOODS_EXTRACTED", actorId: npcId, payload: { goodsSpeciesId: "meat", quantity: 1, ownerId: npcId, ownerType: "npc" } })` within tick T

#### Scenario: Mine action fan-out produces ore

- **WHEN** the runtime commits `NPC_PRODUCTIVE_ACTION_ACCEPTED { npcId, actionType: "mine" }` at tick T
- **THEN** the runtime MUST enqueue `GOODS_EXTRACTED { goodsSpeciesId: "ore", quantity: 1, ownerId: npcId, ownerType: "npc" }` within tick T

#### Scenario: Fish action fan-out produces fish

- **WHEN** the runtime commits `NPC_PRODUCTIVE_ACTION_ACCEPTED { npcId, actionType: "fish" }` at tick T
- **THEN** the runtime MUST enqueue `GOODS_EXTRACTED { goodsSpeciesId: "fish", quantity: 1, ownerId: npcId, ownerType: "npc" }` within tick T

#### Scenario: Other action types do not produce goods

- **WHEN** the runtime commits `NPC_PRODUCTIVE_ACTION_ACCEPTED { npcId, actionType: "craft" }` at tick T
- **THEN** the runtime MUST NOT enqueue any `GOODS_EXTRACTED` command for that event

### Requirement: ANIMAL_DOMESTICATED command SHALL be accepted with valid payload
The Rule Engine MUST accept `ANIMAL_DOMESTICATED` commands. The payload MUST include `animalId` (string), `settlementId` (string), `speciesId` (string), and `tick` (number). The Rule Engine MUST reject the command if `animalId` does not exist in the animal population or `ownerSettlementId` is already set.

#### Scenario: Valid domestication command accepted
- **WHEN** an `ANIMAL_DOMESTICATED` command is submitted with a valid wild animal id and a settlement with ranch capacity
- **THEN** the Rule Engine MUST emit an `ANIMAL_DOMESTICATED` event appended to the EventLog

#### Scenario: Domestication rejected for already-owned animal
- **WHEN** an `ANIMAL_DOMESTICATED` command references an animal with `ownerSettlementId` already set
- **THEN** the Rule Engine MUST reject the command without emitting any event

---

### Requirement: LIVESTOCK_BRED command SHALL be accepted with valid payload
The Rule Engine MUST accept `LIVESTOCK_BRED` commands. The payload MUST include `settlementId` (string), `speciesId` (string), `newAnimalId` (string), and `tick` (number).

#### Scenario: Valid breed command creates new animal
- **WHEN** a `LIVESTOCK_BRED` command is submitted for a settlement with ≥ 2 same-species livestock and capacity available
- **THEN** the Rule Engine MUST emit a `LIVESTOCK_BRED` event, and `AnimalPopulationProjection` MUST include the new animal with `ownerSettlementId` set

---

### Requirement: LIVESTOCK_SLAUGHTERED command SHALL be accepted with valid payload
The Rule Engine MUST accept `LIVESTOCK_SLAUGHTERED` commands. The payload MUST include `animalId` (string), `settlementId` (string), `speciesId` (string), `goods` (array of `{ goodsId: string, amount: number }`), and `tick` (number).

#### Scenario: Valid slaughter command removes animal and emits goods
- **WHEN** a `LIVESTOCK_SLAUGHTERED` command is submitted
- **THEN** the Rule Engine MUST emit `LIVESTOCK_SLAUGHTERED` and `GOODS_EXTRACTED` events
- **AND** the animal MUST be removed from `LivestockRegistryProjection`

---

### Requirement: MOUNT_ASSIGNED command SHALL be accepted with valid payload
The Rule Engine MUST accept `MOUNT_ASSIGNED` commands. The payload MUST include `animalId` (string), `npcId` (string), `settlementId` (string), and `tick` (number). The Rule Engine MUST reject if the animal is already mounted or not owned by the settlement.

#### Scenario: Valid mount assignment accepted
- **WHEN** a `MOUNT_ASSIGNED` command is submitted for an unassigned mount-eligible animal
- **THEN** the Rule Engine MUST emit a `MOUNT_ASSIGNED` event
- **AND** `LivestockRegistryProjection` MUST show `role: 'mount'` and `mountedBy` set for that animal

#### Scenario: Mount assignment rejected for already-mounted animal
- **WHEN** a `MOUNT_ASSIGNED` command references an animal already in `role: 'mount'`
- **THEN** the Rule Engine MUST reject the command

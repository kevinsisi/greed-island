# Greed Island — World Capabilities, Vision, and Path

> **What this document is:** a single source of truth that records (a)
> what the world actually does today, (b) the declared target world
> shape, and (c) the phased plan that bridges the two.
>
> **Structure:**
> - **Part I — Current Baseline** (§0–§14): verified against
>   `packages/server/src/` and `packages/web/src/` at v0.15.47.
>   ❌ marks are real gaps, not aspirations.
> - **Part II — Target Vision** (§15–§16): formalization of
>   `docs/2026-05-13_TARGET_WORLD_CAPABILITIES.md` into five named runtime
>   layers.
> - **Part III — Crosswalk** (§17–§18): per-layer status + concrete list
>   of Commands, projections, and runtime hooks the vision requires.
> - **Part IV — Six-Phase Plan** (§19–§26): release-sized phases with
>   dependencies and honest sizing.
> - **Part V — Meta** (§27).
>
> **Honest sizing up front:** Part IV adds up to roughly **14–22
> releases** of work. At the v0.15.34→47 cadence (~13 slices in 1 week)
> that is a **6–12 month program** once slices stop being micro. Do not
> treat this as a sprint backlog.
>
> **What this is not:** not a roadmap (see `ROADMAP.md`), not an
> architectural law book (see `ARCHITECTURE.md`), not a release journal
> (see `PROGRESS.md`), not the project's vision (see
> `docs/2026-05-13_TARGET_WORLD_CAPABILITIES.md`).

---

# Part I — Current Baseline (v0.15.47, 2026-05-13)

## 0. Headline Numbers

| Surface | Count |
|---|---|
| Named map tiles | **9** (`t_central`, `t_forest`, `t_mountain`, `t_temple`, `t_dock`, `t_desert`, `t_ruin`, `t_dimai`, `t_salt_marsh`) |
| NPC profiles configured | **50** unique IDs across 17 profile files |
| Factions | **4** (`tide_hunters` 潮獵會, `free_runners` 自由潮感者, `guild` 公會, `civilian` 平民) |
| Static building catalog entries | **~17** across 8 tiles + 1 dynamic salt-marsh seed |
| Living-world Command types | **26** (see §2) |
| Card catalog | **100** cards (`greed-island-card-catalog@0.2.0`) |
| Frontend page views | **13** (Hub / Area / Building / Codex / Timeline / Account / Profile / Settings / Admin / Social / 3 auth pages) |
| Tick cadence | One simulation tick every **5 seconds** (one in-world hour ≈ 5s × 720 = 1 h) |

---

## 1. Kernel Guarantees (Architecture §0–§6)

The simulation is **deterministic, event-sourced, append-only**. These guarantees hold today, verified by `eventStore`, `ruleEngine`, `pipeline`, `kernel.test.ts`, `livingWorld.test.ts`.

- ✅ **Command → Rule Engine → Event → Projection** is the only path that mutates world state.
- ✅ **EventLog is the single source of truth** (`event_log` SQLite table). Replay reproduces the same WorldState.
- ✅ **Tick atomicity**: one tick = one SQLite transaction; no observable partial state.
- ✅ **Causality**: actors in tick N see only WorldState(N-1).
- ✅ **AI is read-only**: Gemini calls are off-tick; AI cannot append Events, cannot influence Rule Engine, cannot mutate State.
- ✅ **10-step tick runtime** in `SimulationRuntime.runTick` (reduce → SystemCommands → NPCCommands → PlayerCommands → ordered batch → rule eval → append → reject log → reduce(N) → AI snapshot).
- ✅ **Deterministic random** via `hashSeed(commandId, actorId, tick, ...)`. No `Math.random()` in deterministic paths.

❌ **Simulation budget (Architecture §7)** is specified but **not enforced** — no command cap, no NPC partitioning, no regional activation throttle. Current ~50 NPCs runs fine; scaling will hit walls. (§11.6)

❌ **§11.5 FACT_SET transitional path** still used for NPC state, area state, building occupants, weather, season, rare windows, active events. Should migrate to typed events + pure reducers.

---

## 2. Living-World Command Catalog (`livingWorldCommands.ts`)

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

❌ Conspicuously **missing** Command types (need new design): production-chain, trade/market, settlement-formation, faction-war/territory-takeover, culture/tradition, mentorship/skill-transfer, player-hire-NPC, player-sponsor-construction, road/bridge-build, goods-extracted/transported/stored/consumed.

---

## 3. World Physics

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

---

## 4. Map & Districts

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
- ✅ **Map expansion** mechanism proven by `t_salt_marsh` (locked → construction → unlocked → enterable). Currently driven by legacy fixed project; NPC-initiated expansion not yet shipped.

❌ No **roads / bridges / defenses** as buildable map features.
❌ No **new tile creation** beyond the predefined catalog.

---

## 5. NPC Population & Configuration

50 NPCs across 17 profile files. Each profile has:

- ✅ **Bilingual identity** (`name.zh` / `name.en`, `role.zh` / `role.en`)
- ✅ **Daily routine** — time-of-day windows mapping to locations + activity labels (e.g. "morning stock check", "running edition to the docks")
- ✅ **Personality** — `{ archetype, patience, greed, trustBase, talkativeness, factionLean, calmness? }`
- ✅ **Triggers** — conditional command emissions (e.g. `relationshipAbove:any:55` → `NPC_GREET`)
- ✅ **Memory profile** — `consultsEventTypes`, `decayFn`, `decayParam`

Sample roles: 雜貨店老闆娘 / 報童 / 公會行政員 / 通勤上班族 / 漁場仲介 / 沙漠守墓人 / 寺院住持 / 港口接待 / 自由商人 / 神殿牧師 / 衝浪手 / 公會會長 / 山林獵人.

---

## 6. NPC Inner State (per NPC, projection of EventLog)

What an NPC "is" at any tick:

| Field | Source | Status |
|---|---|---|
| `tile`, `buildingId`, `subCol`, `subRow`, `subZ` | `npc.state.<id>` FACT_SET (transitional) | ✅ |
| `activity` | `NPC_ACTIVITY_CHANGE` events | ✅ 11 kinds: `idle`, `work`, `eat`, `sleep`, `trade`, `patrol`, `move`, `build`, `learn`, `service`, `rest` |
| `mood`, `health` | derived from interactions, productive actions, events | ✅ |
| `factionLean` | profile config + emergent shift | ✅ |
| `lifeGoal` (kind + pressure + narration) | `NPC_LIFE_GOAL_SET` | ✅ (kinds: low_food / low_rest / low_money / low_housing / low_safety / wealth / connection / legacy / knowledge) |
| `household`, `children` | `NPC_HOUSEHOLD_FORMED`, `NPC_CHILD_BORN` | ✅ (existence + linkage; no shared economy yet) |
| `civic.gold` | productive action rewards | ✅ (build=×1, trade=×3, service=×2, learn=×0) |
| `civic.skillXp` | productive actions × 5 per accepted delta | ✅ 4 domains: `construction` / `knowledge` / `commerce` / `civic` |
| `lastInteractedAt`, `lastProductiveTick` | event-derived | ✅ |
| `memory` rows | `npc_memory` projection (event-decay) | ✅ (per-NPC, decays over ticks) |
| `relationships` rows | `npc_relationships` projection (trust scalar) | ✅ |
| `travelRoute` | `NPC_MOVE` routed traveller (4-tick visibility hold) | ✅ |
| `dialogHold` | `NPC_DIALOG_HOLD` (bounded tick window) | ✅ — player dialog freezes NPC schedule |

❌ Missing:
- **Knowledge boundary** — NPC's known-person graph, alias memory, faction knowledge — not surfaced in dialog grounding (§11.9)
- **Household shared economy** — household exists as relationship, not as joint income/decision unit
- **Long-term life-stage memory weights** — decay is linear, no episodic salience or generational memory
- **Skill transfer / mentorship** — XP gains from doing only, not from learning-from-others
- **Culture / tradition** — no festival, no rite, no inherited belief

---

## 7. NPC Autonomous Behavior (per tick)

What NPCs do **without any player action** (`npcEngine.ts`, `cityLife.ts`, `worldAgenda.ts`):

- ✅ **Routine-following**: time-of-day window picks `defaultLocation`, label-pattern-matched activity (eat / sleep / work / trade / patrol).
- ✅ **Ambient cross-district errands**: deterministic policy generates `NPC_MOVE` to neighboring district every few ticks; surfaces as Hub traveller sprite for ~20s.
- ✅ **Productive actions**: per accepted `NPC_PRODUCTIVE_ACTION`, NPC gains gold + skill XP. High skill grants up to +3 productive delta (every 25 XP = +1, capped).
- ✅ **Autonomous construction initiation** (civ-evo slice 1): non-`t_salt_marsh` tile with `economy < 80` AND personal demand AND personal gold ≥ `CIV_EVO_CONSTRUCTION_GOLD_COST` → emit `CONSTRUCTION_INITIATE`. Capped at 3 completed/open facilities per tile.
- ✅ **Construction progress**: productive `build` actions on a tile advance the relevant project, deterministic completion event.
- ✅ **Household formation**: relationship-driven, emits `NPC_HOUSEHOLD_FORMED`.
- ✅ **Children**: `NPC_CHILD_BORN` from formed households.
- ✅ **Interactions**: co-located NPCs (same tile, 3D proximity) trigger `NPC_INTERACT` events; cooldown via deterministic `(tick, npcA, npcB)` hash; updates trust + memory.
- ✅ **Life goal updates**: derived from current needs (`food / rest / money / housing / safety`); emits `NPC_LIFE_GOAL_SET` when pressure crosses.
- ✅ **World agenda interpretation** (v0.15.47): per area, resource shortfalls + faction dominance + active world events compose a `WorldAgendaDirective` (sponsor: city_council / hidden_overseer / faction_bloc). NPC's role text is interpreted into the directive (guards patrol, merchants stabilize prices, etc.). Active world events outrank local civilian dominance.

❌ Missing autonomous behaviors (recurring world-shape):
- **Trade between NPCs** (no NPC sells to another NPC; gold accumulates only)
- **Settlement formation / decline** (NPCs cluster informally; no settlement-as-entity)
- **Faction war / territorial takeover** (factions shift dominance scalar; no claimed territory event)
- **Knowledge / culture transmission** (XP grows from work, never from teaching)
- **Cross-tile resource transport** (NPC may move; goods don't follow)
- **Migration** (NPC may errand cross-tile; never permanently relocates)

---

## 8. Construction / Buildings

- ✅ **Static catalog** (`buildings/catalog.ts`): ~17 named buildings across 8 tiles + dynamic seed. Each carries `tileId`, owner, hiring slots, indoor interior props.
- ✅ **Player work/rest at buildings**: `POST /api/buildings/:id/apply|quit|work|rest` (NOT event-sourced — §11.3 gap, mutates `PlayerJobsStore`/wallet directly).
- ✅ **Dynamic NPC-completed buildings** (v0.15.47e): completed NPC-initiated projects project into permanent `BuildingRuntimeView` rows with project-specific IDs (`b_civ_evo_<tile>.<8char>`). Visible via `/api/buildings?tileId=…` and `/api/buildings/:id`. Owner NPC becomes occupant.
- ✅ **Monotonic state invariant** (v0.15.47e): construction progress never regresses; completed buildings never look partially built again.
- ✅ **Per-tile visibility cap**: 3 autonomous completed/open buildings per tile (earliest `startedAtTick` window).
- ✅ **Construction site rendering**: progress overlays (`建造中 current/target` + remaining points) on Hub map.

❌ Buildings are **not upgradeable, damageable, abandonable, repairable, capturable** — Architecture §0.17 names these as required; only "buildable" exists.

---

## 9. Combat (Phase B single-shot — v0.15.0 shipped)

`combat/ruleEngine.ts` + `combat/commands.ts` + `combatRouter.ts`:

- ✅ Player initiates → same-tile NPC → fixed `COMBAT_INITIAL_HP = 100`.
- ✅ Player actions: attack / defend / flee / use-card (card use is Phase B placeholder, generates warning event).
- ✅ Deterministic damage formula: `base + greedBoost - patienceMitigation`, crit @ 12% via `hashSeed(combatId, actorId, round) % 100`.
- ✅ NPC AI: `hashSeed(combatId, npcId, round) % 3` → attack / defend / idle-glare. NPCs never flee.
- ✅ Flee always succeeds (design decision).
- ✅ Player loss: `energy → 0`. NPC loss: incapacitated for 1 world tick (5 s).
- ✅ All randomness `hashSeed`-based, replay-safe.
- ✅ Combat events: `COMBAT_DAMAGE`, `COMBAT_DEFEND`, `COMBAT_FLEE`, `COMBAT_RESOLVE`.

❌ **Phase C real-time sub-tick** (`combat-phase-c-realtime-subtick` OpenSpec exists) — not yet applied. 10Hz sub-tick + 5-phase rule engine + 紋卡 priority table not implemented.
❌ **§11.4** — combat session/log store and defeat side-effects partially bypass canonical EventLog.
❌ Combat outcomes do **not** persist into faction / territory / economy / history.

---

## 10. Card System (Architecture §0.12)

- ✅ **Catalog**: 100 cards (`cards/catalog.json` v0.2.0).
- ✅ **World card drops**: deterministic spawn via `hashSeed(tick, tileId, rollPurpose, …)` (v0.15.5 hardened, §11.1 closed).
- ✅ **Player operations**: pickup, store, release, codex materialize, trade propose/accept/reject/cancel.
- ✅ **Codex**: per-player card library with materialize-from-collected.
- ✅ **Techniques shop**: `/api/shop/techniques` + `/api/me/techniques` + buy (`techniques.ts`).

❌ **§11.2** — card events live in `card_action_log` separate from canonical `event_log`. Not unified, so card state is not fully covered by `WorldState = Reduce(EventLog)`.
❌ Cards today are **effects/items**, not **World Rule Operators** as the vision demands.

---

## 11. Player Capabilities

What a logged-in player can do (HTTP endpoints, verified in `packages/server/src/http/`):

**Identity / account**
`POST /register`, `POST /login`, `POST /forgot-password`, `POST /reset-password`, `GET /me`, profile router (`/profile`).

**World view (no auth needed)**
`GET /api/world`, `/api/npcs`, `/api/events`, `/api/map`, `/api/dashboard`, `/api/world-events`, `/api/world/catch-up`, `/api/world/chronicle`, `/api/cards`, `/api/buildings`, `/api/areas`, `/api/buildings-catalog`, `/api/version`, `/healthz`, SSE `/api/events/stream`.

**Identity-bound world view**
`GET /api/world/since-last-visit`, `/api/cards/since-last-visit`, `/api/npc/:id/memory`, `/api/npc/:id/relationships`, `/api/npc/:id/emotion`.

**Wallet / jobs / buildings**
`GET /api/wallet`, `POST /api/buildings/:id/apply|quit|work|rest` (❌ NOT event-sourced — §11.3).

**Cards**
pickup / store / release / codex / codex-materialize / trade propose|accept|reject|cancel.

**NPC dialog & intervention**
`POST /api/npc/:npcId/dialog-hold`, `POST /api/npc/:npcId/interact` (Gemini-rendered dialog grounded in memory/relationships), `POST /api/npc/intervene` (basic), `GET /api/npc/:npcId/greet|history`.

**Combat**
`GET /api/combat/active`, `GET /api/combat/:id`, `POST /api/combat/initiate`, `POST /api/combat/:id/action` (Phase B).

**Social (orthogonal store, not part of simulation EventLog)**
Friends, friend-requests, messages, conversations, presence, nearby, alliance create/invite/leave, SSE stream.

**Techniques**
`GET /api/shop/techniques`, `/api/me/techniques`, `POST /api/shop/techniques/:id/buy`.

**Admin / GM**
`/admin/users`, `/admin/users/:userId/role`, `/admin/...`, `/settings/health|keys|...`.

❌ Player **cannot**: hire NPC, sponsor / donate to NPC construction, join / lead a faction, claim or transfer land, carry goods between tiles, found a settlement, place a building, affect world economy beyond own wallet, or leave a permanent mark NPCs remember across long timespans. `player-intervene-and-combat` OpenSpec is drafted but **not fully applied**.

---

## 12. AI / Narration Layer (Architecture §9, §0.13)

- ✅ **Gemini integration** for NPC dialog (`npcs/aiDialog.ts`, `npcs/geminiClient.ts`).
- ✅ **Ambient narrator** per-tile (`ambientNarrator.ts`) — generates short atmospheric prose.
- ✅ **Chronicle renderer** (`chronicleRenderer.ts`) — surfaces event motivations + narration in Timeline view.
- ✅ **Anti-hallucination guardrail** (v0.15.3+): AI prompts must declare named-NPC list + named-building list for the area; out-of-list invention is rejected. Empty list → AI explicitly told no names allowed.
- ✅ **AI output never re-enters EventLog as a world Event** — only as separate `WORLD_EVENT_AI_NARRATION` view artifact ignored by reducer.
- ✅ **AI failure / latency cannot block tick** (`aiSnapshot.ts` fire-and-forget).
- ✅ **Server-authored motivation payloads** (v0.15.34): events carry deterministic `payload.data.motivation`; Timeline falls back to old text only when motivation absent.

❌ **§11.9** — NPC personal dialog not fully grounded in memory: no full known-person graph, alias memory, household state, or long-term social history queries before answering. Anti-hallucination guards prevent invention but cannot replace actual grounding.
❌ No **rumor propagation** between NPCs. Each NPC's perception of an event is whatever they directly saw; no second-hand transmission.

---

## 13. Observability Surfaces

| Page | What it shows |
|---|---|
| `HubPage.tsx` | Parent overview map, district sprites, routed travellers, construction activity markers, "不在時的潮鳴市" since-last-visit panel |
| `AreaPage.tsx` | 15×10 cell canvas of one tile, server-authoritative NPC sprites, building markers, ambient narration |
| `BuildingPage.tsx` | Building interior, occupants, hiring slots, work/rest UI |
| `CodexPage.tsx` | Player's collected cards |
| `TimelinePage.tsx` | Event chronicle (server motivations + AI narration) |
| `AccountPage.tsx`, `ProfilePage.tsx`, `SettingsPage.tsx` | Player identity |
| `AdminPage.tsx`, `SettingsPage.tsx` | GM controls (Gemini key pool, user roles) |
| `SocialPage.tsx` | Friends, messages, alliance |
| Auth pages | Login / Register / ForgotPassword / ResetPassword |

**APIs as data product** — every world surface above is replayable from `/api/world`, `/api/npcs`, `/api/events`, `/api/map`, `/api/buildings`, `/api/world/chronicle`.

**SSE stream** — `/api/events/stream` pushes new events to the client.

---

## 14. Persistence

- ✅ **`event_log`** — canonical SQLite table; single source of world truth; append-only with global sequence + tick + deterministic key + ruleset version.
- ✅ **`rejected_command_log`** — audit log; explicitly excluded from WorldState reduction.
- ✅ **Projection tables**: `npc_memory`, `npc_relationships`, `construction_projects` (rebuild-from-events + canonical-hash tests).
- ✅ **FACT_SET snapshots** (transitional §11.5): NPC state, area state, building occupants, weather, season, rare windows, active events.
- ✅ **Hydration on boot**: `hydrateFromEventLog` reduces full EventLog → in-memory caches reproducible across restarts.
- ✅ **Restart-safe expansion** (v0.15.36): `t_salt_marsh` + `b_salt_marsh_field_station` survive restart via latest-fact hydration.
- ✅ **Orthogonal stores** (not part of simulation): accounts, password resets, friend graph, messages, alliances, player codex, card trades, player jobs, wallet, settings.

❌ **§11.7** — projection rebuild contract incomplete: not every projection has a `rebuildFromEvents` method + canonical-hash replay test.

---

# Part II — Target World Vision

> Source: `docs/2026-05-13_TARGET_WORLD_CAPABILITIES.md` v2 ("Runtime
> Constitution & Civilization Program"). Eleven sections: Core Identity /
> Non-Negotiable Runtime Laws (Event Reality / Determinism / Tick /
> AI Read-Only) / Runtime Layer Model / Current Reality Assessment /
> Civilization Runtime Vision (Settlement / Metabolism / Logistics /
> Culture) / Combat Reframing / Cards Reframing / Player Philosophy /
> Engineering Priorities (P1 Budget / P2 Typed Event Migration / P3
> Civilization Runtime) / Recommended Development Order (Phases 0–6) /
> Final Objective.

## 15. Vision Summary

Greed Island is **a deterministic living civilization simulation system**. Not a multiplayer game runtime. Not an MMORPG. Not an AI NPC showcase. Not an open-world sandbox.

The world is:
- **Deterministic** (same EventLog + same ruleset → same WorldState)
- **Persistent** (committed Events survive)
- **Autonomous** (continues without players, clients, AI, rendering)
- **Civilization-shaped** (NPCs build civilization; map is a projection of that civilization)
- **Event-defined Reality** (only committed Events are real)
- **Tick-based** (no wall-clock dependency anywhere in deterministic logic)
- **AI-assisted Perception** (AI is the perception layer only)

The player is **one Actor inside the civilization**. The world does not pause for the player. Player intervention is a kind of Command, like any NPC's. Player absence does not slow the world.

## 16. The Five Runtime Layers (Formalization)

The vision splits the runtime into five named layers. Today's
`ARCHITECTURE.md` does not name layers; sections §0–§11 describe
guarantees and gaps but do not draw boundaries. Phase 0 (§20)
formalizes this into ARCHITECTURE.md §12.

```text
┌─────────────────────────────────────────────────┐
│  Layer 5 — Perception Runtime                   │
│  AI narration, NPC dialog, rumors, history       │
│  interpretation, atmospheric rendering, social   │
│  perception. AI lives ONLY here. Read-only.      │
├─────────────────────────────────────────────────┤
│  Layer 4 — Combat Runtime                       │
│  Deterministic combat, rule-based interactions,  │
│  card resolution, combat tick pipeline,          │
│  persistent combat consequences into world.      │
├─────────────────────────────────────────────────┤
│  Layer 3 — Civilization Runtime                 │
│  Settlement, economy, resource flow, logistics,  │
│  construction, production chains, territory,     │
│  faction expansion, population pressure.         │
├─────────────────────────────────────────────────┤
│  Layer 2 — Living World Runtime                 │
│  NPC behavior, world rules, weather, seasons,    │
│  world events, movement, autonomous commands.    │
├─────────────────────────────────────────────────┤
│  Layer 1 — Simulation Kernel                    │
│  Tick runtime, Rule Engine, Event ordering,      │
│  Reducer, deterministic resolution, replay,      │
│  advance determinism.                           │
└─────────────────────────────────────────────────┘
```

**Inter-layer rule** (load-bearing): higher layers may *submit Commands* and *read projections*. They may **not** mutate state directly or bypass Layer 1. Layer 5 (AI/Perception) is observation-only.

---

# Part III — Baseline → Target Crosswalk

## 17. Layer-by-Layer Status

| Layer | Status | Already shipped | Major missing pieces |
|---|---|---|---|
| **1. Simulation Kernel** | ✅ solid | Command/Event/State separation, EventLog, deterministic replay, 10-step tick, hashSeed randomness, tick atomicity | §11.6 budget enforcement, §11.5 FACT_SET → typed events, §11.7 rebuild contracts on every projection |
| **2. Living World Runtime** | 🟡 substantial | Weather, season, rare windows, world events, NPC routine, NPC interaction, NPC memory/relationships/life-goals/household/children, ambient errands, world agenda directives, productive actions, skill XP, autonomous construction (slice 1) | Rumor propagation, NPC migration, NPC trade, mentorship, cross-tile schedule |
| **3. Civilization Runtime** | 🔴 **mostly empty** | Construction initiate→progress→complete pipeline; faction dominance scalar; area resource scalars (food/safety/economy); single map expansion proof | **Everything else**: settlement as entity, goods (not scalars), logistics (carriers/routes/warehouses/ports), production chains, market formation, faction territory, faction war, settlement decline, map evolution beyond catalog |
| **4. Combat Runtime** | 🟡 partial | Phase B single-shot, deterministic formulas, replay-safe hashSeed | §11.4 full event-sourcing, Phase C real-time sub-tick, persistent consequences into Civilization (territory/economy/faction/history/relationships), cards as combat rule operators |
| **5. Perception Runtime** | 🟡 partial | Gemini dialog, ambient narrator, chronicle renderer, anti-hallucination guard, server-authored motivation payloads, AI fire-and-forget | §11.9 dialog grounded in memory/relationships/household/faction/known-person graph, rumor propagation between NPCs, history projection as interpreted-not-listed, regional perception (each region "knows" different things) |

**Aligned with vision §4 Current Reality Assessment:** Layer 1 is **"Strongest Layer"** (production-grade kernel). Layer 2 is **"Partially Complete"** (routine / memory / relationships / weather / world agenda / productive actions / autonomous construction present; migration / trade / rumor / mentorship / culture / long-term identity missing — today's NPCs are "有 schedule 的 simulation actor"). Layer 3 is **"Weakest Layer"** — vision calls today's state "看起來像 civilization 的 placeholder。" Most Phase 1–6 work lands on Layer 3.

## 18. Vision Principles → Required New Capabilities

Concrete: what each principle demands as new Commands, projections, and runtime hooks. This is the input list for the OpenSpec changes in Part IV.

### 18.1 Settlement Is a Real Entity (vision §5.1)

**New domain object:** `Settlement` — `{ id, tileId, sourceTilesOccupied[], population[], storage, economyState, territory, factionAlignment, stability, productionCapacity[], defense, expansionPressure, tradeRoutes[] }`.

**New Commands:**
- `SETTLEMENT_FORMED` — when ≥ N NPCs share a tile + recurring co-presence + shared economic activity for K ticks
- `SETTLEMENT_POPULATION_CHANGE` — birth / death / migration in/out
- `SETTLEMENT_GROW` — population × economy threshold crossed
- `SETTLEMENT_DECLINE` — resource starvation / safety collapse / faction defeat
- `SETTLEMENT_SPLIT` — population overflow + territory pressure
- `SETTLEMENT_MIGRATE` — settlement-level move (rare)
- `SETTLEMENT_DESTROYED` — defeat / resource exhaustion
- `SETTLEMENT_TAKEN_OVER` — faction shift / conquest

**New projection:** `settlements` table — rebuild-from-events.

**Runtime hook:** Layer 3 `SettlementEngine` consults living-world NPC presence + economy + faction state every K ticks; emits Commands accordingly.

### 18.2 Economy Must Become Metabolism (vision §5.2)

**New domain object:** `Goods` — `{ kind: 'raw'|'intermediate'|'finished', species, quantity, location }`. Species examples: `salt_marsh_brine`, `mountain_ore`, `forest_lumber`, `refined_salt`, `iron_ingot`, `bread`.

**New Commands:**
- `GOODS_EXTRACTED` (raw goods produced by NPC at extraction site)
- `GOODS_STORED` (deposited into warehouse / settlement storage)
- `GOODS_PROCESSED` (intermediate → finished at production building)
- `GOODS_CONSUMED` (consumed by NPC / settlement / faction)
- `GOODS_DESTROYED` (decay, attack, accident)

**New projection:** `goods_inventory` per (settlement, building, NPC). Rebuild-from-events.

**Runtime hook:** Layer 3 `EconomyEngine` runs every tick (or every K ticks for inactive regions) — extraction at resource buildings, consumption at NPCs/buildings, decay.

### 18.3 Logistics Is Civilization (vision §5.3)

**New domain object:** `TradeRoute` — `{ id, fromSettlementId, toSettlementId, carriersAssigned, goodsSpecies, capacity, hazards }`.
**New NPC archetype:** `carrier` (already exists in lore; needs runtime behavior).
**New building types:** `warehouse`, `port`, `road_segment`, `bridge`.

**New Commands:**
- `GOODS_TRANSPORT_STARTED` (carrier picks up cargo)
- `GOODS_TRANSPORT_ARRIVED` (carrier deposits)
- `GOODS_TRANSPORT_LOST` (hazard, attack, decay)
- `TRADE_ROUTE_OPENED` / `TRADE_ROUTE_CLOSED`

**No instant teleport** — goods location updates per carrier NPC tick.

### 18.4 Construction & Map Evolution (derives from vision §5.1 + §5.3; no standalone vision section)

**Existing:** `CONSTRUCTION_INITIATE` / `_PROGRESS` / `BUILDING_CONSTRUCTED` / `MAP_TILE_UNLOCKED`.

**New Commands:**
- `BUILDING_UPGRADED` (tier-up)
- `BUILDING_DAMAGED` (combat, accident, decay)
- `BUILDING_ABANDONED` (owner left, no operators)
- `BUILDING_REPAIRED`
- `BUILDING_CAPTURED` (faction takeover)
- `ROAD_BUILT` / `BRIDGE_BUILT` / `WALL_BUILT` (new map features)
- `MAP_FEATURE_DECAYED`

**Map becomes a projection of civilization Events** — frontend reads `/api/map` and gets whatever civilization has built, not a static catalog.

### 18.5 Learning As Historical Accumulation (vision §10 Phase 3 mentorship; absorbed into §5.4 culture)

**New Commands:**
- `NPC_OBSERVED_SKILL` (NPC watched another NPC do a productive action; partial XP gain)
- `NPC_MENTORSHIP_STARTED` / `_COMPLETED` (formal teaching; large XP gain)
- `NPC_KNOWLEDGE_INHERITED` (parent → child via household)

**Skill XP semantics shift:** from "amount of work done" to "amount of work done + observed + taught". XP record may also carry `lineage` = who taught whom.

### 18.6 Culture Must Emerge (vision §5.4)

**New domain object:** `CulturalElement` — `{ id, kind: 'tradition'|'belief'|'festival'|'ritual'|'ideology'|'norm', scope: 'region'|'faction'|'household', participants[], originatingEvent }`.

**New Commands:**
- `CULTURAL_ELEMENT_FORMED` (e.g. annual festival emerges from rare-window pattern)
- `CULTURAL_ELEMENT_OBSERVED` (NPC participates → strengthen)
- `CULTURAL_ELEMENT_FORGOTTEN` (no participants for K ticks)

**Faction ideology** = aggregate of factional cultural elements; influences NPC behavior weights.

### 18.7 Combat As Civilization Pressure Resolution (vision §6)

**Existing:** `COMBAT_INITIATE` / `_PLAYER_ACTION` / `_RESOLVE` + Phase B events.

**New Commands (to land on top of Phase C):**
- `FACTION_DOMINANCE_SHIFTED` (after combat resolves in faction-relevant context)
- `TERRITORY_CLAIM_CHANGED` (after combat over contested tile/settlement)
- `NPC_INCAPACITATED_LONG` (severe defeat; longer than 1 tick)
- `NPC_DECEASED` (permanent removal, rare — design carefully)
- `COMBAT_WITNESS_RECORDED` (other NPCs present update memory/relationships)

**Combat events feed history projection** (§18.9).

### 18.8 Cards As World Rule Operators (vision §7)

**Reframe:** cards stop being effects/items. A card is a *named Command that the player or NPC submits which modifies the rule layer for a bounded scope*.

**Examples:**
- `CARD_PLAYED: "潮汐倒退"` = submit a Command that lowers `food` resource cost for fishing NPCs in `t_dock` for 60 ticks
- `CARD_PLAYED: "石脈共鳴"` = submit a Command that doubles `GOODS_EXTRACTED` rate for `mountain_ore` in `t_mountain` for 30 ticks

**Implementation:**
- Card catalog gains `ruleOperatorScope`, `ruleOperatorEffect`, `durationTicks`, `permittedInvokers` (player / specific NPC archetypes / faction)
- Rule Engine evaluates active card-operator effects when validating subsequent Commands
- Unify card events into canonical `event_log` (closes §11.2)

### 18.9 Emergent History Projection (vision §11 final-objective success criteria)

**New projection:** `history_chronicle` — derives narrative arcs from event sequences:
- Settlement formation arc (commands from `SETTLEMENT_FORMED` → first `BUILDING_CONSTRUCTED` → first `GOODS_PROCESSED`)
- Faction war arc (territory contest events + combat events + dominance shifts)
- Founder / hero arc (NPC's significant productive actions + inheritance + memory by others)
- Decline arc (resource starvation + population loss + settlement decline)

**Distinguished from Timeline:** Timeline is event list. Chronicle is interpreted arcs. Built by Layer 5 Perception (AI may help phrase, never invents).

### 18.10 Player As Civilization Actor (vision §8)

**New Commands:**
- `PLAYER_HIRED_NPC` / `_DISMISSED_NPC`
- `PLAYER_SPONSORED_CONSTRUCTION`
- `PLAYER_FOUNDED_SETTLEMENT`
- `PLAYER_CLAIMED_TERRITORY`
- `PLAYER_JOINED_FACTION` / `_LEFT_FACTION` / `_LED_FACTION`
- `PLAYER_TRADED_GOODS`
- `PLAYER_PLAYED_CARD` (rule-operator semantics from §18.8)

**Closes:** §11.3 (player wallet/jobs event-sourced), `player-intervene-and-combat` OpenSpec applied.

**Constraint:** every player Command produces an Event NPCs can observe and remember. Player intervention shows up in history projection.

### 18.11 Engineering Priorities — Architectural Cross-Cutting (vision §9)

Vision §9 names three Engineering Priorities that absorb the §11 backlog:

- **P1 Budget Enforcement** = §11.6. Command cap, active/background partition, regional throttling, replay-safe projection rebuild. Must complete before civilization runtime expands; otherwise the temptation chain "先暫時 cache 一下啦 / 先 shortcut 一下啦 / 這邊直接 mutate 比較快" destroys architecture integrity.
- **P2 Typed Event Migration** = §11.5. `FACT_SET` must disappear; long-term it causes replay ambiguity, projection inconsistency, hidden truth, rebuild impossibility.
- **P3 Civilization Runtime** = §11.8 expanded. Settlement / goods / logistics / market / production chains. Vision: "civilization simulation 的難度遠高於 NPC AI。AI 對話只是 perception illusion。文明代謝才是真正的世界。"

Each phase **must** close at least one §11 item. P1 + P2 land entirely in Phase 1; P3 begins in Phase 1 (Settlement) and continues through Phase 2 (metabolism). Detailed mapping in Phases below.

---

# Part IV — Six-Phase Plan

## 19. Phase Overview & Honest Sizing

| Phase | Theme (vision §10 wording) | Vision §9 priority | Releases | Closes §11 |
|---|---|---|---|---|
| **0** | Architecture Formalization (doc only) | — | 1 | none |
| **1** | Budget Gate + Settlement Runtime | **P1 + P2 + P3 start** | 4–6 | 11.5, 11.6, 11.7 (NPC + areas), 11.8 starts |
| **2** | Goods + Logistics + Market | P3 continues | 3–5 | 11.8 expands |
| **3** | Culture + Humanity + Rumor + Mentorship | Layer 2 / 5 humanity | 3–4 | 11.9 |
| **4** | Cards as Rule Operators | — | 1–2 | 11.2 |
| **5** | Persistent Combat Consequences | — | 2–3 | 11.4 |
| **6** | Player Civilization Integration | — | 2–4 | 11.3, `player-intervene-and-combat` applied |
| **Total** | | | **16–25 releases** | All §11 items closed |

**Dependency rule:** Phase 1's budget gate (§11.6) must complete before Phases 2+ add per-tick load. Phases 2/3 can partially parallel after Phase 1 lands; Phases 4/5/6 may also parallel once their dependencies are done.

**At v0.15.34→47 cadence** (13 slices/week in May 2026) this is ~3 months optimistic, ~6–12 months realistic once slices get heavier and live verification + OpenSpec validation per slice slow throughput.

---

## 20. Phase 0 — Architecture Formalization

**Goal:** Lock the five-layer vocabulary into the documentation system so every subsequent OpenSpec change can reference layer + principle without re-arguing them.

**Concrete deliverables:**
- Add `ARCHITECTURE.md` §12 "Five Runtime Layers" — definitions, inter-layer rule, mapping of existing §0–§11 to layers.
- Update `DEVELOPMENT_CONSTITUTION.md`:
  - Add "Civilization Evolution Constitution" reference to the five layers
  - Add a "Vision document" pointer to `docs/2026-05-13_TARGET_WORLD_CAPABILITIES.md`
- Update `ROADMAP.md` — v0.16.0 entry naming Phase 0.
- No code change. (Vision doc markdown formatting fix already landed in commit `dbacdbc`.)

**Definition of done:**
- All five docs cross-reference each other consistently.
- ARCHITECTURE.md §12 names which layer each existing module belongs to (`kernel/`, `sim/`, `combat/`, `npcs/aiDialog.ts`, etc.).
- One commit, one CI pass, one Deploy Dev no-op pass.

**Release:** v0.16.0.

---

## 21. Phase 1 — Budget Gate + Settlement Runtime

**Goal:** Make Layer 3 (Civilization Runtime) a real layer with a first domain (Settlement) and prepay the budget/typed-event/rebuild-contract debt that everything afterwards depends on.

**1.1 Budget gate (closes §11.6)** — 1–2 releases.
- Implement per-tick command cap with overflow deferral
- NPC partitioning: active set (player-relevant + recent activity) vs background set (cheaper policy)
- Regional activation: tiles with no player presence and no flagged world rule run low-frequency drift
- Observable metric: `/api/dashboard` exposes tick cost histogram + active/background counts
- Tests: load test 200 NPCs at 5s tick

**1.2 NPC FACT_SET → typed events (closes §11.5 for NPC state)** — 1 release.
- Drop `npc.state.<id>` FACT_SET path; replace with typed-event projection from `NPC_MOVE` / `NPC_ACTIVITY_CHANGE` / etc.
- Add `npc_state` projection table with `rebuildFromEvents` + canonical-hash test
- Migration path: replay existing FACT_SET history into typed events on boot once, then never write FACT_SET for NPC state again

**1.3 Projection rebuild contract sweep (closes §11.7)** — 1 release.
- Audit all current projection-like stores
- Add `rebuildFromEvents` + canonical-hash replay test for: area state, building occupants, world weather/season, active world events, rare windows, household/children

**1.4 Settlement domain object (opens §18.1)** — 1–2 releases.
- New OpenSpec change: `settlement-domain`
- Commands: `SETTLEMENT_FORMED`, `SETTLEMENT_POPULATION_CHANGE`, `SETTLEMENT_GROW`, `SETTLEMENT_DECLINE`, `SETTLEMENT_DESTROYED`, `SETTLEMENT_TAKEN_OVER`, `SETTLEMENT_SPLIT`
- Projection: `settlements` table
- First visible behavior: when ≥ 3 NPCs spend ≥ N ticks co-located at a tile sharing productive actions, emit `SETTLEMENT_FORMED`; visible in Hub map as new district label "聚落: <name>"
- Frontend: `/api/settlements` + Hub overlay
- Salt-marsh becomes the first NPC-formed settlement (rather than legacy hard-coded expansion)

**Definition of done for Phase 1:**
- Tick cost stays bounded at 200 NPCs
- All NPC state replayable from typed events
- Salt-marsh visible as a real settlement entity, not a legacy fixed project
- All new projections have rebuild + canonical-hash tests

**Releases:** v0.16.1 → v0.16.6 (approximately).

---

## 22. Phase 2 — Goods + Logistics + Market

**Goal:** Layer 3 starts metabolizing goods. `economy` stops being a scalar.

**2.1 Goods primitives (§18.2)** — 1 release.
- Catalog goods species (initial ~10: brine, lumber, ore, fish, grain, refined salt, iron ingot, bread, cloth, tools)
- Commands: `GOODS_EXTRACTED`, `GOODS_STORED`, `GOODS_PROCESSED`, `GOODS_CONSUMED`, `GOODS_DESTROYED`
- Projection: `goods_inventory` per (settlement, building, NPC)
- First behavior: NPCs at extraction-eligible buildings (forest hunters, mountain miners, salt-marsh fishers) emit `GOODS_EXTRACTED` on productive `build`/`work` actions

**2.2 Logistics (§18.3)** — 1–2 releases.
- New NPC archetype: `carrier`. Some existing NPCs (port concierge, paperboy) gain carrier runtime behavior.
- New building types: `warehouse`, `port`, `road_segment` (Phase 2 keeps roads abstract; Phase 1 settlement infra adds real geometry later).
- Commands: `GOODS_TRANSPORT_STARTED`, `_ARRIVED`, `_LOST`, `TRADE_ROUTE_OPENED`, `_CLOSED`
- Goods location changes only with carrier ticks; no teleport

**2.3 Production chains (§18.4)** — 1 release.
- Buildings of type `production` consume input goods → emit `GOODS_PROCESSED` with output species
- Example chain: `salt_marsh_brine` → `refined_salt` (at salt works building) → consumed at central market

**2.4 Market formation (§18.2 finishing)** — 1–2 releases.
- Settlements track local supply/demand per goods species
- `MARKET_PRICE_DISCOVERED` Command/Event emitted on transaction
- NPCs prefer goods from settlements with surplus + lower price (deterministic preference function)

**Definition of done for Phase 2:**
- Salt-marsh can supply refined salt to central market via real carrier NPCs
- Disrupting a carrier's route causes downstream goods shortage
- Settlement market prices respond to local supply

**Releases:** v0.17.0 → v0.17.4 (approximately).

---

## 23. Phase 3 — Culture + Humanity + Rumor + Mentorship

**Goal:** Layer 2 + Layer 5 close the humanity gap. NPCs become people, not predictable role-actors.

**3.1 Dialog grounding (closes §11.9)** — 1–2 releases.
- AI prompts gain query interface to: known-person graph, alias memory, household state, faction knowledge, recent participated events
- Anti-hallucination rejects out-of-graph names with explicit "我沒聽過這個人" / "你說的是哪一位？"
- Rumor propagation (Phase 5 of original vision): when NPCs interact, partial memory transfers with attenuation

**3.2 Learning from history (§18.5)** — 1 release.
- `NPC_OBSERVED_SKILL` emitted when NPC is co-located with another performing the same skill domain
- Observed XP gain is partial (e.g. 25% of doing it directly)
- `NPC_MENTORSHIP_STARTED` for explicit teaching events

**3.3 Culture (§18.6)** — 1–2 releases.
- `CulturalElement` domain
- First emergent culture: festival around recurring rare-window event; faction-specific ritual; regional norm (e.g. salt-marsh fishing prayer)
- Faction ideology aggregates active cultural elements; influences `factionLean` shift weights

**3.4 Household shared economy** — 1 release.
- Household members pool gold; joint decision for major purchases (Sponsor child education / large meal / shelter upgrade)
- `HOUSEHOLD_DECISION_MADE` Command
- Inheritance: on `NPC_DECEASED` (rare; designed in Phase 5), household assets transfer

**Definition of done for Phase 3:**
- NPCs refuse to "know" people they have never met
- Skill XP shows lineage (taught by whom, observed where)
- At least one regional festival visible in chronicle
- Household decisions visible in chronicle

**Releases:** v0.18.0 → v0.18.4 (approximately).

---

## 24. Phase 4 — Cards as Rule Operators

**Goal:** Layer 4 (and player) treats cards as rule-operators, not effects. Closes §11.2.

**4.1 Unify card events into canonical EventLog** — 1 release.
- Merge `card_action_log` into `event_log` with new event types `CARD_PICKED_UP`, `CARD_STORED`, `CARD_PLAYED`, `CARD_MATERIALIZED`, `CARD_TRADED`
- Projection-only reads from `world_card_drops` table; truth lives in `event_log`

**4.2 Cards as rule operators** — 1 release.
- Catalog gains `ruleOperatorScope` (which Commands the card modifies), `ruleOperatorEffect` (multiplier / threshold shift / forbid / allow), `durationTicks`, `permittedInvokers`
- Rule Engine consults active card-operator effects when validating subsequent Commands
- Example: "潮汐倒退" reduces `GOODS_EXTRACTED` cost at `t_dock` fishing buildings for 60 ticks
- NPCs may also play certain cards (faction-aligned cards)

**Definition of done for Phase 4:**
- Playing a card changes how subsequent NPC commands are validated, not just who has what item
- Every card play is in `event_log` and replayable

**Releases:** v0.19.0 → v0.19.1 (approximately).

---

## 25. Phase 5 — Persistent Combat Consequences

**Goal:** Layer 4 ships Phase C; combat outcomes ripple into Layer 3 + Layer 2 + Layer 5.

**5.1 Combat Phase C (existing OpenSpec `combat-phase-c-realtime-subtick`)** — 1–2 releases.
- 10Hz sub-tick + 5-phase rule engine + 紋卡 priority table + SSE `CombatProjection` + reconcile-on-reject
- CombatStore becomes EventLog read-only projection (closes §11.4)

**5.2 Persistent consequences (§18.7)** — 1 release.
- `FACTION_DOMINANCE_SHIFTED` emitted on combat resolution in faction-relevant context
- `TERRITORY_CLAIM_CHANGED` on combat over contested settlement
- `NPC_INCAPACITATED_LONG` / `NPC_DECEASED` (designed with care — permanent removal must be rare and consequential)
- `COMBAT_WITNESS_RECORDED` updates witness NPCs' memory + relationships

**5.3 History projection (§18.9)** — 1 release.
- `history_chronicle` projection identifies narrative arcs from event sequences (Settlement formation, faction war, founder, decline)
- Layer 5 (AI) phrases the arcs; never invents events

**Definition of done for Phase 5:**
- Losing combat over a contested settlement actually changes faction control of that tile
- Witnesses remember combats in their `npc_memory`
- Chronicle page shows interpreted arcs alongside raw timeline

**Releases:** v0.20.0 → v0.20.3 (approximately).

---

## 26. Phase 6 — Player Civilization Integration

**Goal:** Architecture §0.1 / vision Player Position Principle. Closes §11.3.

**6.1 Player wallet + jobs event-sourced (§11.3)** — 1 release.
- `POST /api/buildings/:id/apply|quit|work|rest` route to Commands (`PLAYER_HIRED_AT`, `PLAYER_QUIT_JOB`, `PLAYER_WORKED`, `PLAYER_RESTED`)
- Wallet derived from event log

**6.2 Player intervention (`player-intervene-and-combat` applied)** — 1 release.
- The existing OpenSpec change lands; player can intervene in NPC combat, NPC interaction, faction event

**6.3 Player as civilization actor** — 1–2 releases.
- `PLAYER_HIRED_NPC` (player employs an NPC for a task; NPC's productive output flows to player)
- `PLAYER_SPONSORED_CONSTRUCTION` (donate gold/goods to NPC construction; affects priority and ownership)
- `PLAYER_FOUNDED_SETTLEMENT` (player can initiate settlement formation directly, with full Civilization Runtime validation)
- `PLAYER_CLAIMED_TERRITORY` (over contested tile + faction backing)
- `PLAYER_JOINED_FACTION` / `_LEFT_FACTION` / `_LED_FACTION`
- `PLAYER_TRADED_GOODS` (real goods, not just gold)

**6.4 Player marks history** — 1 release.
- Every player Command produces an Event visible to nearby NPCs
- History projection includes player arcs alongside NPC arcs
- Player long-absence does not erase player's mark; NPCs remember (subject to memory decay)

**Definition of done for Phase 6:**
- Player can hire an NPC, sponsor construction, found a settlement, lead a faction, trade goods, all via Commands → Events
- Long-absent player's name still appears in NPC dialog and history projection
- World runs identically whether player is online or not (verifies §0.1)

**Releases:** v0.21.0 → v0.21.3 (approximately).

---

# Part V — Meta

## 27. What This Document Is / Is Not

**Is:**
- The integrated current-state + target-vision + path picture for Greed Island.
- The reference any new OpenSpec change consults to know which layer it belongs to, which principle it serves, and which phase it ships in.
- The honest gap inventory: every ❌ is a real missing capability, not a future flag.

**Is not:**
- Not a substitute for `ARCHITECTURE.md` (world laws).
- Not a substitute for `ROADMAP.md` (release history).
- Not a substitute for `PROGRESS.md` (latest handoff state).
- Not a substitute for the user's vision document `docs/2026-05-13_TARGET_WORLD_CAPABILITIES.md`.
- Not a sprint backlog — Part IV is **6–12 months of work** at realistic pace.

**Update protocol:**
- Part I (baseline) updates whenever a capability ships or breaks. Tag each entry with the release that introduced/removed it.
- Part II (vision) updates only when the user updates `docs/2026-05-13_TARGET_WORLD_CAPABILITIES.md`.
- Part III (crosswalk) updates whenever Part I or Part II changes.
- Part IV (plan) updates whenever a phase boundary is crossed or a dependency is invalidated.

---

## 28. Program Success Criteria (Vision §11)

The program is **not done** when phases 0–6 ship. It is done when these four
emergent behaviours can be observed in a live deployment. They are the
acceptance test for "Greed Island 才真正成立。"

| Criterion (vision §11) | Verifiable by |
|---|---|
| 「當某個 NPC 死亡。後代會記得他。」 | `NPC_DECEASED` event produces inheritance + memory transfer to descendants; descendant dialog can reference the deceased ancestor without AI invention. (Closes the §11.9 grounding loop with Phase 5 NPC_DECEASED.) |
| 「當某 settlement 飢荒。周邊價格會上升。」 | Disrupting a `salt_marsh_brine` supply route via `GOODS_TRANSPORT_LOST` causes neighbouring settlements' `MARKET_PRICE_DISCOVERED` events to shift upward within K ticks. End-to-end verifies Phase 1 Settlement + Phase 2 Goods/Logistics/Market. |
| 「當 faction 戰敗。道路與物流會崩潰。」 | A losing-faction settlement's roads and trade routes show `TRADE_ROUTE_CLOSED` + `BUILDING_DAMAGED`/`_ABANDONED` after `FACTION_DOMINANCE_SHIFTED` + `TERRITORY_CLAIM_CHANGED`. End-to-end verifies Phase 5 Persistent Combat Consequences plumbing back into Phase 2 logistics. |
| 「當玩家離開數個月。世界仍然繼續。甚至已經變成另一個文明時代。」 | After K weeks of no player activity, EventLog continues to accumulate civilization-level events (`SETTLEMENT_GROW`, `SETTLEMENT_DECLINE`, `BUILDING_CONSTRUCTED`, `CULTURAL_ELEMENT_FORMED`, `FACTION_DOMINANCE_SHIFTED`), and the world's `history_chronicle` projection shows distinct arc deltas from before-absence to after-absence. Verifies Architecture §0.10 Offline Continuity. |

If any of the four criteria still cannot be demonstrated after phase 6 ships, the program is **not complete** — return to whichever phase failed to land the missing piece.

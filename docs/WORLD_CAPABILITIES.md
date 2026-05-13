# Greed Island — Current World Capabilities

> What the world actually does **right now** (v0.15.47, 2026-05-13).
>
> Verified against `packages/server/src/` and `packages/web/src/`, not
> against ROADMAP rhetoric. Capabilities marked ❌ are explicit gaps,
> not aspirations.
>
> This is a **baseline reference** for planning the next direction. For
> world laws read `ARCHITECTURE.md`. For release-by-release history read
> `ROADMAP.md`. For latest handoff state read `PROGRESS.md`.

---

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

❌ Conspicuously **missing** Command types (need new design): production-chain commands, trade/market commands, settlement-formation, faction-war/territory-takeover, culture/tradition, mentorship/skill-transfer, player-hire-NPC, player-sponsor-construction, road/bridge-build.

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

---

## 10. Card System (Architecture §0.12)

- ✅ **Catalog**: 100 cards (`cards/catalog.json` v0.2.0).
- ✅ **World card drops**: deterministic spawn via `hashSeed(tick, tileId, rollPurpose, …)` (v0.15.5 hardened, §11.1 closed).
- ✅ **Player operations**: pickup, store, release, codex materialize, trade propose/accept/reject/cancel.
- ✅ **Codex**: per-player card library with materialize-from-collected.
- ✅ **Techniques shop**: `/api/shop/techniques` + `/api/me/techniques` + buy (`techniques.ts`).

❌ **§11.2** — card events live in `card_action_log` separate from canonical `event_log`. Not unified, so card state is not fully covered by `WorldState = Reduce(EventLog)`.

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
`POST /api/npc/:npcId/dialog-hold` (freeze NPC during conversation), `POST /api/npc/:npcId/interact` (Gemini-rendered dialog grounded in memory/relationships), `POST /api/npc/intervene` (player-as-actor — basic version), `GET /api/npc/:npcId/greet|history`.

**Combat**
`GET /api/combat/active`, `GET /api/combat/:id`, `POST /api/combat/initiate`, `POST /api/combat/:id/action` (Phase B).

**Social (orthogonal store, not part of simulation EventLog)**
Friends, friend-requests, messages, conversations, presence, nearby, alliance create/invite/leave, SSE stream.

**Techniques**
`GET /api/shop/techniques`, `/api/me/techniques`, `POST /api/shop/techniques/:id/buy`.

**Admin / GM**
`/admin/users`, `/admin/users/:userId/role`, `/admin/...`, `/settings/health|keys|...`.

❌ Player **cannot**:
- Hire NPC for personal task
- Sponsor / donate to NPC construction project
- Join / leave / lead a faction
- Claim or transfer land / tile ownership
- Carry goods between tiles
- Found a settlement
- Place a building (only NPCs initiate construction)
- Affect world economy beyond own wallet
- Leave a permanent mark NPCs remember across long timespans (memory decays linearly)

The OpenSpec change `player-intervene-and-combat` is drafted but **not fully applied**.

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

---

## 13. Observability Surfaces

**Frontend pages** (`packages/web/src/pages/`):

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

❌ **§11.7** — projection rebuild contract incomplete: not every projection has a `rebuildFromEvents` method + canonical-hash replay test. `construction_projects` does; others still pending.

---

## 15. Honest Gap Inventory (what the world **cannot** do today)

### 15.1 Architecture-level (§11 backlog)

| ID | Gap | Impact |
|---|---|---|
| §11.2 | Card state has separate event log | Card world is durable but not unified with canonical EventLog |
| §11.3 | Jobs/wallet mutate projection directly | Player work/wage not replayable from EventLog |
| §11.4 | Combat store side-effects partial | Phase C OpenSpec drafted, not applied |
| §11.5 | FACT_SET still load-bearing | NPC state migration to typed events pending |
| §11.6 | Simulation budget not enforced | No NPC partitioning / regional activation / command cap — will hit wall at scale |
| §11.7 | Projection rebuild contract incomplete | Not every projection has rebuild + canonical-hash test |
| §11.8 | Civ-evo only construction slice 1 | Production chains / settlements / factions / culture all absent |
| §11.9 | NPC dialog not fully grounded | No known-person graph / alias memory / household / faction knowledge query |

### 15.2 Civilization-evolution scope (`DEVELOPMENT_CONSTITUTION.md` §"Civilization Evolution Constitution")

Required by the Prime Directive, **not yet implemented**:

- ❌ Production chains (raw → intermediate → finished goods)
- ❌ Resource transport (carriers, routes, congestion)
- ❌ Market formation, price discovery, supply chains
- ❌ Settlement formation, growth, decline, abandonment
- ❌ Faction war, territorial takeover, regime change
- ❌ Skill learning from observation / mentorship / scarcity
- ❌ Culture, household-as-economic-unit, festivals, rites
- ❌ Emergent history written by NPC behavior at multi-year scale

### 15.3 Player-as-actor scope (Architecture §0.1: "the player is one actor inside the world")

Player is structurally a **viewer plus narrow interactor** today:

- ❌ Cannot hire / dismiss NPCs as employer
- ❌ Cannot sponsor or donate to construction
- ❌ Cannot found / join / leave / lead factions
- ❌ Cannot claim land or transfer ownership
- ❌ Cannot affect economy beyond own wallet
- ❌ Cannot leave persistent mark NPCs remember across seasons
- ❌ Cannot fight at scale (Phase B is single duel)

### 15.4 NPC-humanity depth beyond §11.9

- ❌ No knowledge boundary enforcement (NPC doesn't refuse questions about people they haven't met)
- ❌ No alias / nickname memory
- ❌ No household shared income / decisions
- ❌ No long-term life-stage memory weighting (linear decay only)
- ❌ No remembered player history across long absences (memory decays linearly)

---

## 16. What This Document Is **Not**

- Not a roadmap — see `ROADMAP.md`.
- Not architectural law — see `ARCHITECTURE.md`.
- Not a release journal — see `PROGRESS.md`.
- Not a vision — that's what the conversation after this document is for.

This is a **baseline snapshot**. The next planning step is for the user to declare their world vision; this document is the floor that vision builds on.

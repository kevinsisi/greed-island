# Greed Island Progress Handoff

This file records current development state for the next AI or human
developer. Keep latest status at the top.

## 2026-05-12 — v0.15.39 Cross-District Traveller Cadence

### Completed Locally

- Root cause: after restoring the one-NPC-one-map rule in `v0.15.37`, legal Hub
  travellers were still too rare. `v0.15.38` route visibility alone was not
  enough in live sampling because the server produced too few cross-district
  decisions.
- Added a server-side route visibility hold: cross-tile `travelRoute` state now
  remains visible for 4 ticks (about 20 seconds) before the NPC resumes local
  area presence or continues the next route segment.
- Added deterministic ambient errand decisions so non-low-state NPCs periodically
  choose a neighboring district through NPC policy, producing real Hub travellers
  instead of parent-map child NPC duplicates.
- Preserved the parent/child layer rule: Hub still only renders routed
  cross-district travellers, never child area outdoor NPCs.
- Added `NPC_CROSS_TILE_ROUTE_VISIBLE_TICKS` coverage so the route visibility
  window cannot silently shrink back to a single tick.
- Added ambient errand coverage proving a group of routine NPCs produces multiple
  legal routed travellers.
- Bumped app version from `0.15.38` to `0.15.39`.

### Local Verification

- `npm run test -w @greed-island/server -- npcEngine` passed: 30 tests.
- `npm test` passed: server 22 files / 166 tests, web 10 files / 28 tests.
- `npm run build:server` passed.
- `npm run build:web` passed, with the existing Vite chunk-size warning.

### Still Open

- Gemini review, commit, push, CI/CD, and live evidence are in progress.

## 2026-05-12 — v0.15.37 Hub Parent/Child NPC Layer Fix

### Completed Locally

- Root cause: `v0.15.36` changed Hub projection to show every outdoor district
  NPC, so the parent Hub map rendered NPCs that already belonged to child area
  maps.
- Restored the one-NPC-one-map rule for Hub projection: parent Hub only renders
  NPCs that are actively crossing districts with a valid `travelRoute`.
- Local outdoor NPCs and arrived expansion NPCs now stay on their child area map
  only; building occupants remain owned by building maps.
- Added regression coverage proving local/arrived child-map NPCs are excluded
  from Hub, while routed travellers remain visible on Hub.
- Bumped app version from `0.15.36` to `0.15.37`.

### Local Verification

- `npm run test -w @greed-island/web -- npcProjection` passed: 6 tests.
- `npm test` passed: server 22 files / 163 tests, web 10 files / 28 tests.
- `npm run build:server` passed.
- `npm run build:web` passed, with the existing Vite chunk-size warning.
- `git diff --check` passed.
- Gemini staged review reported no findings.

### CI/CD + Live Verification

- Code commit `456640b` pushed to `main`.
- GitHub Actions CI run `25711915895` passed.
- GitHub Actions Deploy Dev run `25711915891` passed.
- Live `v0.15.37` verification after deploy:
  - `/healthz`: `200`, `version=0.15.37`, `tick=93028`.
  - `/api/map`: includes unlocked `t_salt_marsh`; tile count is `9`.
  - `/api/npcs`: 50 NPCs returned; 47 current child-map outdoor NPCs are now
    excluded from Hub projection, and current routed Hub travellers are `0`.

### Still Open

- If the parent Hub feels too empty with zero travellers, add aggregate district
  activity badges or construction summaries, not child NPC sprites.

## 2026-05-12 — v0.15.36 Restart-Safe Expansion Hydration

### Completed Locally

- Root cause: availability-first boot used an empty latest fact snapshot, so
  deploy/restart could temporarily lose persisted expansion state until runtime
  progressed enough to reconstruct it from new facts.
- Added targeted boot hydration for selected latest `FACT_SET` values instead of
  replaying the full production EventLog, preserving restart availability while
  restoring expansion, weather, active-event, building-occupant, NPC, and area
  state facts.
- Added `SqliteEventStore.readLatestFactValues(keys)` plus schema support for
  efficient latest fact lookup by fact key.
- Covered restart persistence for `world.lifeExpansion`, including unlocked
  `t_salt_marsh` and `b_salt_marsh_field_station`.
- Updated Hub NPC projection so the world overview shows outdoor district life,
  not only cross-district travellers.
- Bumped app version from `0.15.35` to `0.15.36`.

### Local Verification

- `npm test` passed.
- `npm run build:server` passed.
- `npm run build:web` passed, with the existing Vite chunk-size warning.
- `git diff --check` passed.
- Gemini staged review raised only non-blocking audit concerns after targeted
  comments and restart tests were added.

### CI/CD + Live Verification

- Code commit `299b574` pushed to `main`.
- GitHub Actions CI run `25711337994` passed.
- GitHub Actions Deploy Dev run `25711337993` passed.
- Public endpoint briefly returned `502 Bad Gateway` immediately after deploy,
  then recovered without a hotfix; direct Tailscale host and Docker checks showed
  healthy `greed-island-web` and `greed-island-server` containers.
- Live `v0.15.36` verification after recovery:
  - `/healthz`: `200`, `version=0.15.36`, `tick=92836`.
  - `/api/map`: includes unlocked `t_salt_marsh`; tile count is `9`.
  - `/api/world`: `facts.lifeExpansion.unlockedTileIds` includes
    `t_salt_marsh`, `unlockedBuildingIds` includes
    `b_salt_marsh_field_station`, and `project.salt_marsh_settlement` remains
    `12/12` complete after deploy/restart.
  - `/api/npcs`: 50 NPCs returned; 47 are map-visible outdoor district NPCs for
    the Hub overview feed.
  - `/api/events?limit=3`: latest sampled events carry server-authored
    `payload.motivation` data.

### Still Open

- Next NPC depth slice should move beyond surface motion into persistent inner
  life: memory, expectations, routines, fatigue, relationships, goals, and dream
  or subconscious state, while preserving NPC policy -> command -> Rule Engine ->
  Event authority.

## 2026-05-12 — v0.15.35 Construction Crews + Hub Life Projection

### Completed Locally

- Root cause: locked expansion districts could be hidden or look inert, making
  salt-marsh construction feel like magic rather than NPC labor.
- Kept construction-zone visuals visible for locked expansion sites and added
  deterministic construction crew/progress overlays on the Hub map.
- Added `constructionActivitiesFor()` to project build progress, worker count,
  and crew marker positions from server facts into map-renderable activity.
- Fixed Hub NPC projection so salt-marsh travellers and arrived outdoor NPCs are
  not hidden by transit-only filtering.
- Added pure Hub walkability/spawn helpers so locked expansion districts remain
  non-enterable while construction visuals can still be displayed.
- Bumped app version from `0.15.34` to `0.15.35`.

### Local Verification

- `npm test` passed.
- `npm run build:server` passed.
- `npm run build:web` passed, with the existing Vite chunk-size warning.
- `git diff --check` passed.
- Gemini staged review produced no blocking findings after fixes.

### CI/CD + Live Verification

- Code commit `b697fb4` pushed to `main`.
- GitHub Actions CI run `25710687572` passed.
- GitHub Actions Deploy Dev run `25710687605` passed.
- Live `/healthz` returned `version=0.15.35`, `tick=92574`.

### Still Open

- `v0.15.35` exposed that restart hydration could still make expansion state
  flicker after deploy; fixed in `v0.15.36`.

## 2026-05-12 — v0.15.34 Server Event Motivation Payloads

### Completed Locally

- Added OpenSpec change `server-event-motivation-payloads` requiring deterministic
  server-authored motivation payloads for living-world events when runtime context
  is available.
- Added a generic `EventMotivation` shape and Rule Engine validation so malformed
  optional `motivation` payloads are rejected before events are appended.
- Attached authoritative motivation payloads to common runtime event families:
  NPC movement/activity, productive actions, interactions, area pressure, weather
  and season changes, rare windows, world-event spawn/end, building enter/leave,
  life goals, households, and children.
- Kept the `v0.15.33` client fallback path for older events and edge cases, while
  allowing new events to carry committed reasons in `payload.data.motivation`.
- Bumped app version from `0.15.33` to `0.15.34`.

### Local Verification

- `npm test` passed: server 22 files / 162 tests, web 8 files / 21 tests.
- `npm run build:server` passed.
- `npm run build:web` passed, with the existing Vite chunk-size warning.
- `npx openspec validate server-event-motivation-payloads --strict` passed.
- `git diff --check` passed.
- Gemini staged review initially hit Windows UTF-8 pipe rendering for Chinese text;
  rerunning with UTF-8 pipe settings found one test-coverage gap, which was fixed
  with runtime assertions for representative activity, interaction, building,
  area-pressure, weather, and world-event motivations. Final Gemini review:
  `No findings`.

### CI/CD + Live Verification

- Code commit `1bd24ec` pushed to `main`.
- GitHub Actions CI run `25709754151` passed.
- GitHub Actions Deploy Dev run `25709754147` passed.
- Live `v0.15.34` verification after deploy:
  - `https://hunter.sisihome.org/healthz`: `200`, `version=0.15.34`, `tick=92232`.
  - `https://hunter.sisihome.org/api/events?limit=100`: 86 of 100 sampled recent
    rows carried committed motivation payloads.
  - Sample motivated rows included `WORLD_EVENT_SPAWN`, `WEATHER_CHANGE`,
    `NPC_INTERACT`, and `NPC_PRODUCTIVE_ACTION`; productive action payloads include
    both `explanation` and `projectPurpose`.

### Still Open

- Continue enriching individual motivations as future NPC planners expose more
  domain-specific intent, but new common runtime events now prefer committed
  server reasons over client inference.

## 2026-05-12 — v0.15.33 Event Motivation Chronicle

### Completed Locally

- Responded to the issue that the chronicle showed what happened but not why it
  happened; broadened the solution from construction-only to all public events.
- Added OpenSpec change `event-motivation-chronicle` requiring public Timeline
  rows to expose deterministic motivation, pressure, purpose, or trigger context.
- Added explicit construction motivation payloads for new construction progress,
  map unlock, and building unlock events, derived from NPC life goals/needs and
  project purpose rather than AI text.
- Added deterministic Timeline motivation fallbacks for public event families:
  productive actions, NPC interactions, area pressure, life goals, households,
  children, movement/activity, building enter/leave, weather/season cycles, world
  events, rare windows, player interventions, and card events.
- Kept raw payload disclosure available while surfacing `事件動機` as first-class
  context on Timeline cards.
- Bumped app version from `0.15.32` to `0.15.33`.

### Local Verification

- `npm test` passed: server 22 files / 160 tests, web 8 files / 21 tests.
- `npm run build:server` passed.
- `npm run build:web` passed, with the existing Vite chunk-size warning.
- `npx openspec validate event-motivation-chronicle --strict` passed.
- `git diff --check` passed with only Windows LF→CRLF working-copy warnings.
- Gemini staged review repeatedly reported a template-literal issue caused by
  Chinese diff encoding; source and tests confirm interpolation works and
  motivation explanations contain actual tile names with no `{` / `}` placeholders.

### CI/CD + Live Verification

- Code commit `21113bf` pushed to `main`.
- GitHub Actions CI run `25707720719` passed.
- GitHub Actions Deploy Dev run `25707720708` passed.
- Live `v0.15.33` verification after deploy:
  - `/healthz`: `200`, `version=0.15.33`, `tick=91499`.
  - `/api/events?limit=80`: current window included `AREA_PRESSURE`,
    `NPC_INTERACT`, and `NPC_PRODUCTIVE_ACTION` rows that now receive deterministic
    Timeline motivation fallback text.
  - Deployed web asset `/assets/index-CswV12I_.js` contains `事件動機`, the salt-marsh
    fallback explanation, and productive-action motivation fallback text.

### Still Open

- Future depth: move more non-construction motivations into authoritative server
  payloads as each domain gets richer planning state. Current release guarantees
  visible deterministic motivation for public Timeline rows without AI invention.

## 2026-05-12 — v0.15.32 NPC Life Goals + Expansion Foundation

### Completed Locally

- Added deterministic NPC life pressure and life-goal projection on `/api/npcs`,
  derived from needs, role/personality signals, local area resources, and household
  state without AI mutating world state.
- Added authoritative life/household/child/construction command types and Rule
  Engine events: `NPC_LIFE_GOAL_SET`, `NPC_HOUSEHOLD_FORMED`, `NPC_CHILD_BORN`,
  `CONSTRUCTION_PROJECT_PROGRESS`, `MAP_TILE_UNLOCKED`, and `BUILDING_CONSTRUCTED`.
- Connected committed productive actions in build/service/trade/learn domains to
  the `project.salt_marsh_settlement` construction project, completing at `12/12`
  progress and unlocking `t_salt_marsh` plus `b_salt_marsh_field_station`.
- Threaded life goals, households, construction progress, map unlocks, and building
  unlocks through replay/projection, catch-up summaries, API types, Hub navigation,
  Area/Hub map rendering, and Since Last Visit UI.
- Kept expansion authority server-side: Hub only treats districts returned by
  `/api/map` as enterable, and expansion building detail lookup relies on runtime
  unlocked building projection even before any NPC occupies the building.
- Bumped app version from `0.15.31` to `0.15.32` and completed OpenSpec change
  `npc-life-goals-and-expansion` verification/release tasks.

### Local Verification

- `npm test` passed: server 22 files / 160 tests, web 7 files / 18 tests.
- `npm run build:server` passed.
- `npm run build:web` passed, with the existing Vite chunk-size warning.
- `npx openspec validate npc-life-goals-and-expansion --strict` passed.
- `git diff --check` passed.
- Focused regression coverage added for deterministic city-life projection,
  runtime end-to-end life/household/construction/unlock facts, unlocked map graph
  routing, living-world command validation, and constructed expansion building API
  detail lookup with zero occupants.
- Gemini staged review found two actionable issues: household formation was gated
  to only the first household, and direct building detail lookup needed to rely on
  runtime-unlocked buildings. Both were fixed and covered by tests. Remaining
  `????` review notes were confirmed as Gemini CLI encoding artifacts against
  source files containing valid localized Chinese text.

### CI/CD + Live Verification

- Code commit `bd8a3ae` pushed to `main`.
- GitHub Actions CI run `25706302025` passed.
- GitHub Actions Deploy Dev run `25706302028` passed.
- Live `v0.15.32` verification after deploy:
  - `/healthz`: `200`, `version=0.15.32`, `tick=91002` during the first probe.
  - `/api/npcs`: `200`, NPC rows include `life.needs`, `life.goal`, and
    `life.householdId` projections.
  - `/api/events?limit=5000`: included `11` `CONSTRUCTION_PROJECT_PROGRESS`, `1`
    `MAP_TILE_UNLOCKED`, and `1` `BUILDING_CONSTRUCTED` event for the salt-marsh
    project; the next 30-tick gate emitted `8` `NPC_LIFE_GOAL_SET` and `1`
    `NPC_HOUSEHOLD_FORMED` event at tick `91021`.
  - `/api/map`: `200`, includes unlocked `t_salt_marsh` / `鹽沼外環`.
  - `/api/buildings?tileId=t_salt_marsh`: `200`, includes
    `b_salt_marsh_field_station` with localized Chinese building/prop labels.
  - `/api/buildings/b_salt_marsh_field_station`: `200`, returns the constructed
    building even with `occupants=[]`.

### Still Open

- `NPC_CHILD_BORN` is intentionally delayed until 90 ticks after household
  formation; local integration tests cover it, but live evidence was not delayed
  another 7.5 minutes just to wait for the first production child event.
- Optional follow-up: add Phaser-level E2E/scene tests for locked district visuals
  if future map-rendering changes become frequent.

## 2026-05-11 — v0.15.31 Productive City Actions

### Completed Locally

- Added deterministic `NPC_PRODUCTIVE_ACTION` events so NPC runtime policy can
  emit construction/repair, learning/research, trade/supply, and public-service
  progress as authoritative world events.
- Threaded productive actions through the Command → Rule Engine → Event pipeline,
  simulation runtime, catch-up summaries, NPC memory projection, API types, and the
  Since Last Visit panel's `城市進展` section.
- Balanced the public event stream by lowering spontaneous social interaction
  probability, increasing social cooldown, and capping social/productive events per
  tick so chronicles no longer collapse into mostly NPC arguments.
- Added tests for productive event variety, deterministic tile ordering under the
  per-tick cap, narration template substitution, Chinese role-keyword shaping,
  catch-up summary output, and NPC memory projection.
- Bumped app version from `0.15.30` to `0.15.31` and marked OpenSpec task `3.9`.

### Local Verification

- `npm test` passed: server 20 files / 155 tests, web 7 files / 18 tests.
- `npm run build:server` passed.
- `npm run build:web` passed, with the existing Vite chunk-size warning.
- `npx openspec validate npc-humanity-ai-memory --strict` passed.
- `git diff --check` passed.
- Gemini staged review initially found deterministic ordering and memory-test gaps;
  both were fixed. Final remaining review notes were accepted as intentional or
  expected: reduced social frequency is the balance goal, broader exhaustive
  narration matrices are optional follow-up, and Chinese narration strings are
  current localized game text.

### CI/CD + Live Verification

- Code commit `589ca77` pushed to `main`.
- GitHub Actions CI run `25679493406` passed.
- GitHub Actions Deploy Dev run `25679493433` passed.
- Live `v0.15.31` verification after deploy:
  - `/healthz`: `200`, `version=0.15.31`, `tick=84224`, `121ms`.
  - `/api/version`: `200`, `version=0.15.31`, `25ms`.
  - `/api/world`: `200`, `13ms`, `eventCount=1490350`, `npcCount=50`.
  - `/api/events?limit=80`: `200`, `127ms`, included 12
    `NPC_PRODUCTIVE_ACTION` events versus 3 `NPC_INTERACT` events in the sample.
  - `/api/events?limit=1000` returned the capped 100-event window with 23
    productive actions across `build`, `learn`, `trade`, and `service` domains.
  - `/api/world/catch-up?sinceTick=84197`: `200`, `25ms`, `untilTick=84227`, and
    `summary.productiveActions` contained concrete city-progress rows.

### Still Open

- Optional follow-up: add a full narration matrix test if we want exhaustive
  snapshot coverage for every archetype/role/fallback sentence branch.

## 2026-05-11 — v0.15.30 Bounded Catch-Up Availability Fix

### Completed Locally

- Investigated the post-`v0.15.29` mobile fallback report and confirmed the
  frontend was serving static HTML quickly while `/healthz` and `/api/*` could
  hang past a 5-second client timeout.
- Identified the root cause: returning-player living-world catch-up endpoints
  synchronously hydrated or sorted across the production EventLog, so one large
  catch-up request could block the Node event loop and make unrelated API calls
  appear offline.
- Changed `/api/world/catch-up` and `/api/world/since-last-visit` to use a
  bounded EventLog tick-window read instead of `readEvents()`.
- Added an index-aware `(event_type, tick, sequence)` EventLog path and kept a
  single-query fallback for unusually large event-type sets, avoiding the
  production `idx_event_log_type` + temp-sort plan that measured about `27.8s`.
- Updated latest boot snapshot lookup to avoid `MAX(tick)` scans on large logs.
- Added regression coverage for latest tick lookup, bounded tick-window reads,
  and chronological ordering across interleaved event types.
- Bumped app version from `0.15.29` to `0.15.30`.

### Local Verification

- `npm run build:server` passed.
- `npm run build:web` passed, with the existing Vite chunk-size warning.
- `npm test` passed after the final query fix: server 20 files / 151 tests, web 7
  files / 18 tests.
- `npx openspec validate npc-humanity-ai-memory --strict` passed.
- `git diff --check` passed with only Windows LF→CRLF working-copy warnings.
- Gemini staged review initially flagged the per-type query memory/order edge;
  after adding a bounded fallback and interleaved ordering coverage, final review
  returned `No findings`.

### CI/CD + Live Verification

- Code commits `a18c9cf` and `7c4a542` pushed to `main`.
- Latest GitHub Actions CI run `25674841411` passed.
- Latest GitHub Actions Deploy Dev run `25674841366` passed.
- First `v0.15.30` deploy created the new composite EventLog index before HTTP
  listen; that one-time migration caused short `502` restart-window responses but
  did not expose a slow listening API.
- Live `v0.15.30` verification after boot:
  - `/healthz`: `200`, `version=0.15.30`, `123ms`.
  - `/api/version`: `200`, `23ms`, `Cache-Control: no-store`.
  - `/api/world`: `200`, `12ms`, `Cache-Control: no-store`, `eventCount=1457931`.
  - `/api/npcs`: `200`, `24ms`, `Cache-Control: no-store`.
  - `/api/cards`: `200`, `27ms`, `Cache-Control: no-store`.
  - `/api/map`: `200`, `9ms`, `Cache-Control: no-store`.
  - `/api/events?limit=5`: `200`, `13ms`, `Cache-Control: no-store`.
  - `/api/world/catch-up?sinceTick=0`: `200`, `2403ms`, `Cache-Control: no-store`,
    `totalEvents=5000` partial bounded summary.
  - Parallel stress probe while catch-up was running: catch-up `2393ms`, delayed
    `/healthz` `2365ms`, both under the 5-second client timeout.

### Still Open

- If returning-player summary latency needs to be even lower, reduce
  `CATCH_UP_EVENT_LIMIT` from `5000` or move catch-up reduction to a background
  projection; current live behavior is under the mobile timeout and no longer
  forces fixture fallback.

## 2026-05-11 — v0.15.29 NPC Layer Uniqueness + Chronicle Cleanup

### Completed Locally

- Fixed a regression from the Hub visibility recovery: Hub no longer renders every
  area-local outdoor NPC as an individual sprite.
- Restored the one-NPC-one-map-layer rule: Area-local NPCs render in AreaPage,
  building occupants render in BuildingPage, and Hub only renders NPCs that are
  actually crossing districts via `travelRoute`.
- Added projection regression coverage proving local outdoor NPCs stay off Hub.
- Changed Timeline chronicle summary requests to allow AI rendering instead of
  forcing deterministic fallback with `ai=0`.
- Hid internal `WORLD_TICK` / `FACT_SET` rows and no-narration rows from public
  Timeline and mobile/desktop event ticker surfaces, so the UI no longer shows
  `WORLD_TICK` or `尚未生成敘事` as public story content.
- Bumped app version from `0.15.28` to `0.15.29`.

### Local Verification

- `npm run test -w @greed-island/web -- npcProjection eventVisibility` passed: 2
  files / 5 tests.
- `npm run build:web` passed, with the existing Vite chunk-size warning.
- `npm run build:server` passed.
- Final `npm test` passed: server 20 files / 148 tests, web 7 files / 18 tests.
- `npx openspec validate npc-humanity-ai-memory --strict` passed.
- `git diff --check` passed with only Windows LF→CRLF working-copy warnings.
- Gemini staged review returned `No findings`.

### CI/CD + Live Verification

- Commit `2559b24` pushed to `main`.
- GitHub Actions CI run `25672281805` passed.
- GitHub Actions Deploy Dev run `25672281818` passed.
- Live `v0.15.29` verification after deploy:
  - `/healthz`: `version=0.15.29`, `tick=82730`.
  - `/api/npcs`: `50` rows.
  - Hub traveller markers expected from live data: `0`, because no NPC currently
    has `activity='move'` plus `travelRoute`; local district NPCs now stay off Hub.
  - Nighttide local outdoor NPCs: `14`, rendered only by the area layer.
  - `/api/events?limit=30` public filtered head is `AREA_PRESSURE`, not
    `WORLD_TICK`, with narration present.
  - `/api/world/chronicle?limit=40&ai=1`: `source=ai`, `requested=true`,
    `activeKeys=40`, `fallbackReason=null`.

### Still Open

- No active blocker. If Hub feels too empty with no travellers, add district-level
  aggregate activity badges instead of rendering individual area NPCs on Hub.

## 2026-05-11 — v0.15.28 NPC Intent Text + Local Motion Cadence

### Completed Locally

- Continued the NPC daily-life slice after `v0.15.27` by exposing each NPC's
  deterministic runtime-agent task as a public `intentLine` projection.
- Added server-side localized intent summaries for travel, social interaction,
  player dialog holds, personality nudges, and daily-life activities.
- Threaded `intentLine` through `/api/npcs`, web API/state types, Hub projection,
  Area NPC lists, Building NPC lists, and `NpcDialog` headers.
- Made Hub projection locale-aware so English clients use the English intent text.
- Increased local area waypoint refresh cadence from 12 ticks to 6 ticks, making
  outdoor NPC sub-tile motion refresh about every 30 seconds instead of about
  every minute without changing the authoritative presence tuple.
- Bumped app version from `0.15.27` to `0.15.28`.

### Local Verification

- `npm run build:server` passed.
- `npm run build:web` passed, with the existing Vite chunk-size warning.
- `npm run test -w @greed-island/server -- npcIntent npcEngine` passed: 2 files /
  28 tests.
- `npm run test -w @greed-island/web -- npcProjection` passed: 1 file / 2 tests.
- Final `npm test` passed: server 20 files / 148 tests, web 6 files / 15 tests.
- `npx openspec validate npc-humanity-ai-memory --strict` passed.
- `git diff --check` passed.
- Gemini staged review found and the code addressed Hub locale selection and
  English district-name issues; final review returned `No findings`.

### CI/CD + Live Verification

- Commit `6e73281` pushed to `main`.
- GitHub Actions CI run `25668501760` passed.
- GitHub Actions Deploy Dev run `25668501814` passed.
- Live `v0.15.28` verification after runtime ticks settled:
  - `/healthz`: `version=0.15.28`, tick advanced from `81851` to `81858` during
    the probe window.
  - `/api/npcs`: `50` rows, all `50` with `internalState.agent` and `intentLine`.
  - Agent bootstrap tasks: `0`.
  - English intent district text CJK leakage: `0`.
  - 35-second movement probe: `49` NPCs changed location/sub-tile/activity keys.
  - Activity distribution remained daily-life shaped: `work=30`, `trade=10`,
    `patrol=5`, `idle=5`.

### Still Open

- No active blocker. Next slice can make social/interaction bubbles more visible
  on the map, or add a compact intent overlay to selected NPC sprites.

## 2026-05-11 — v0.15.27 NPC Daily-Life Activity Pass

### Completed Locally

- Started the first `NPC Daily Life Pass` to make deterministic runtime agents
  look less like idle props.
- Confirmed live `v0.15.26` had all `50` NPCs with agent state, but activity
  distribution was still idle-heavy: `idle=40`, `patrol=4`, `trade=3`, `work=2`,
  `move=1`.
- Identified the immediate root cause: many profile routine labels (`office
  tower`, `night-market stall`, `running edition`, `late-night noodle stop`,
  etc.) fell through the label interpreter and became `idle`.
- Expanded deterministic routine-label interpretation into visible daily-life
  activities: `work`, `trade`, `patrol`, and `eat`.
- Changed injected off-duty errand slots to use role/archetype-shaped activity
  instead of always becoming `idle`.
- Added focused `NpcEngine` tests for daily-life label interpretation and
  injected errand activity shaping across common archetypes.
- Bumped app version from `0.15.26` to `0.15.27`.

### Local Verification

- `npm run build:web` passed, with the existing Vite chunk-size warning.
- `npm run build:server` passed.
- `npm test` passed after the review follow-up: server 19 files / 144 tests, web
  6 files / 15 tests.
- `npm run test -w @greed-island/server -- npcEngine` passed after the review
  follow-up: 1 file / 24 tests.
- `npx openspec validate npc-humanity-ai-memory --strict` passed.
- `git diff --check` passed with only Windows LF→CRLF working-copy warnings.
- Gemini staged review found test coverage/maintainability issues on first pass;
  after adding archetype coverage and named label patterns, final review returned
  `No findings`.
- Commit `d0c8fe7` pushed to `main`.
- GitHub Actions CI run `25667528150` passed.
- GitHub Actions Deploy Dev run `25667528128` passed.

### Live Verification

- Initial deploy probe at 23 seconds caught bootstrap/default state (`idle=50`),
  which is expected during availability-first startup before runtime ticks settle.
- After runtime ticks advanced, live `v0.15.27` returned:
  - `/healthz`: `version=0.15.27`, `tick=81612`.
  - `/api/world`: `tick=81612`, `npcCount=50`.
  - `/api/npcs`: `50` rows, all `50` with `internalState.agent`.
  - Agent bootstrap tasks: `0`.
  - Activity distribution: `work=30`, `trade=10`, `patrol=5`, `idle=5`.
- Server logs show availability-first boot from defaults due the large event log,
  then runtime start at `tick=81602`; the new activity projection appears after
  ticks settle.

### Still Open

- Next daily-life slice should improve visible movement frequency and expose
  short task/intent text in the UI; this slice focused on activity diversity.

## 2026-05-11 — v0.15.26 Hub NPC Overview Recovery

### Completed Locally

- Investigated the post-`v0.15.25` report that the fixture badge disappeared but
  many NPCs also disappeared.
- Confirmed live `/api/npcs` still returns all `50` NPCs and `world.npcCount=50`;
  `49` NPCs are outdoors, but none currently have `activity='move'`.
- Identified the frontend projection issue: Hub main-map rendering only included
  `activity === 'move'` NPCs, so a valid world with no travelling NPCs made the
  Hub appear empty even though NPCs were present in districts.
- Changed Hub projection to show all outdoor district NPCs on the world overview,
  while keeping `travelRoute` rendering for NPCs that are actually moving and
  keeping building occupants out of the Hub map.
- Updated focused projection tests and bumped app version from `0.15.25` to
  `0.15.26`.

### Local Verification

- `npm run build:web` passed, with the existing Vite chunk-size warning.
- `npm run build:server` passed.
- `npm test` passed: server 19 files / 141 tests, web 6 files / 15 tests.
- `git diff --check` passed with only Windows LF→CRLF working-copy warnings.
- Gemini staged review returned `No findings`.
- Commit `4f2d007` pushed to `main`.
- GitHub Actions CI run `25666839843` passed.
- GitHub Actions Deploy Dev run `25666843244` passed.

### Live Verification

- During deploy restart, one immediate probe hit the expected transient API
  restart gap; retry after containers settled succeeded.
- `/healthz` and `/api/version` report `0.15.26`.
- `/api/world` reports `npcCount=50`; `/api/npcs` returns `50` rows.
- Hub overview projection now has `49` outdoor district NPC markers and `1`
  moving marker from live data; one remaining NPC is inside a building and stays
  excluded from the Hub map.

### Still Open

- Await user-side iPhone confirmation that Hub NPC density now looks reasonable.

## 2026-05-11 — v0.15.25 Mobile Fixture Recovery

### Completed Locally

- Investigated the recurring iPhone fixture-state report on `v0.15.24`.
- Confirmed live server/API was healthy from desktop probes, and the iPhone loaded
  fresh HTML plus hashed JS/CSS and successfully called `/api/version`, but the
  same iPhone access-log window showed no `/api/world` request before the UI
  remained on fixture data.
- Exposed `refreshWorld()` through `WorldStateContext`, so world loading is no
  longer only reachable from the provider mount/poll effect.
- Added a fixture-state recovery effect in `AtmosphereBar`: while the visible UI
  source is still `fixture`, it immediately calls `refreshWorld()` and retries
  every two seconds until a server world lands.
- Added `visibleFixtureRecovery` unit tests for source-gated startup, immediate
  retry, interval retry, cancellation, and retry-after-failure behavior.
- Bumped app version from `0.15.24` to `0.15.25`.

### Local Verification

- `npm run build:web` passed, with the existing Vite chunk-size warning.
- `npm run build:server` passed.
- `npm test` passed: server 19 files / 141 tests, web 6 files / 15 tests.
- `git diff --check` passed with only Windows LF→CRLF working-copy warnings.
- Gemini staged review found only the initial missing-test gap; the retry helper
  tests were added afterward.
- Final Gemini staged review returned `No findings`.
- Commit `d2d17b3` pushed to `main`.
- GitHub Actions CI run `25666346557` passed.
- GitHub Actions Deploy Dev run `25666346537` passed.

### Live Verification

- During the deploy restart window, `/api/*` briefly returned `502` while the web
  container already served the new HTML. This matches the prior mobile failure
  mode and is now covered by visible fixture-state retry.
- After containers settled, live probes returned:
  - `/healthz`: `version=0.15.25`, `tick=81348`.
  - `/api/version`: `0.15.25`.
  - `/api/world`: `tick=81348`, `eventCount=1397963`, `npcCount=50`.
- `/api/world` response headers returned `200`, `Cache-Control: no-store`,
  `Content-Length`, and no `Content-Encoding`.
- `docker ps` showed `greed-island-web` healthy and `greed-island-server` up.

### Still Open

- Await user-side iPhone reload confirmation that the fixture badge disappears;
  server/proxy/API evidence is healthy at `v0.15.25`.

## 2026-05-11 — v0.15.24 Docker Local Recovery

### Completed Locally

- Bumped app version from `0.15.23` to `0.15.24` after the Hub HUD/dialog-hold
  fixes, so the running UI/API no longer reports the same version as the prior
  batch.
- Recovered the intended Docker local path instead of the temporary Node/Vite
  shell path. `docker compose -f deploy/docker-compose.yml up -d --build` now
  builds and starts `greed-island-server` and `greed-island-web`.
- Worked around workstation Docker TLS/build issues:
  - BuildKit path still fails on Docker Hub frontend pull with `x509: certificate
    signed by unknown authority` for `docker/dockerfile:1.7`.
  - Legacy builder path works with `DOCKER_BUILDKIT=0` /
    `COMPOSE_DOCKER_CLI_BUILD=0`.
  - Node 22's bundled npm failed in legacy Docker builder with `Exit handler
    never called`; both Dockerfiles now pin npm to `10.9.2` inside the builder.
  - npm registry TLS in the builder hit `SELF_SIGNED_CERT_IN_CHAIN`; Dockerfiles
    set npm `strict-ssl=false` before installing npm so this workstation can
    build behind the current TLS interception.

### Local Verification

- Docker compose status: `greed-island-server` up and `greed-island-web` up /
  healthy.
- Docker web endpoint: `http://127.0.0.1:8100/api/version` returned
  `{"version":"0.15.24"}`.

### Still Open

- The Docker TLS trust problem should be fixed at Docker/host trust-store level
  later; the current Dockerfile npm `strict-ssl=false` is a local build recovery
  workaround, not a security-hardening endpoint.
- Browser/Phaser E2E coverage is still missing for two-player Hub presence and
  active-dialog visual hold.

## 2026-05-11 — v0.15.23 In Progress

### Completed Locally

- Investigated the reported map symptom where other online players appeared to
  teleport between positions.
- Confirmed `AreaScene.refreshPeerSprites()` directly called `setPosition()` for
  existing peer player containers on every nearby-player refresh, while NPCs
  already used visual-only tweening from their current rendered position to the
  next server-authoritative target.
- Changed existing Area peer player containers to tween to the latest server
  presence target instead of snapping. New peers still spawn at their
  authoritative target, and vanished peers are destroyed with any active tween
  cleaned up.
- Kept presence coordinates as rendering input only; this change does not make
  the renderer simulation authority.
- Investigated the reported guest-control issue. Server mutation endpoints were
  already behind auth, but Phaser scenes still spawned a controllable local
  player and accepted movement/interaction input for guests, which made the game
  appear playable while logged out.
- Added guest read-only mode to Hub, Area, and Building Phaser scenes. Guests can
  still view public world/read-only pages, but movement, NPC interaction, card
  pickup, building enter/exit scene controls, and indoor controls are disabled
  until login.
- Added visible guest read-only notices on hub, area, and building pages.
- Improved deterministic chronicle fallback output by filtering out internal
  `WORLD_TICK` noise and rendering a paragraph-style summary instead of raw
  `第 X tick` bullets.
- Added the `/timeline` chronicle summary card backed by `/api/world/chronicle`.
- Fixed Hub/main-map local player labeling and peer visibility: `HubPage` now
  posts Hub social presence with the local map coordinates, polls nearby Hub
  players, and passes player names/peer positions into `MapScene`.
- Kept Hub presence separate from area-bound gameplay location by storing main-map
  UI presence in `player_hub_locations` instead of overwriting
  `player_locations`, which combat/shop code still reads for area checks.
- Extended social presence coordinate clamping for `tileId='hub'` to the full
  800x600 main-map canvas while keeping area maps on the existing 600x400
  coordinate contract.
- Fixed a Hub login-state edge case where logging in while already standing in a
  district did not emit the current district CTA until the player moved out and
  back in.
- Reviewed `D:\Projects\ai-agents` and homelab `agent-design` guidance after the
  NPC-agent question. Captured the durable rule in `ARCHITECTURE.md`: every NPC
  is a deterministic runtime agent with identity, memory, goals, permissions,
  task state, and command budget, not a free-form LLM agent.
- Added the first deterministic NPC-agent runtime slice. `NpcEngine` now stores
  per-NPC `agent` state with `profileId`, permission labels, bounded active task,
  and last-decision metadata derived from schedule, deterministic nudge,
  movement, and NPC social interaction state.
- Tightened the NPC-agent slice after review: `social-interaction` active tasks
  are now committed only after the corresponding `NPC_INTERACT` command passes
  Rule Engine validation, remain active until their deterministic expiry tick,
  and legacy hydrated states without `agent` use the hydrated tile as fallback.
- Exposed NPC agent state through `/api/npcs` via `internalState.agent`, so the
  UI/debug surfaces can inspect the agent projection without giving rendering any
  simulation authority.
- Smoothed Hub/main-map peer players and travel NPC rendering. Existing Hub peer
  player containers now tween to the latest social presence target instead of
  snapping, and Hub peer/NPC spawn/despawn paths fade instead of hard flashing.
- Moved the Hub city title/description HUD out of the Phaser map and into a
  compact header above the map, so it no longer covers the left side of the main
  map.
- Added deterministic player-dialog hold for active NPC conversations. Opening an
  authenticated NPC dialog now posts `/api/npc/:npcId/dialog-hold` and refreshes
  it while the dialog is open; the runtime validates `NPC_DIALOG_HOLD` through
  the living-world Rule Engine before persisting a bounded `player-dialog` agent
  task through FACT_SET state, so schedule movement cannot make that NPC walk
  away mid-dialog.
- Updated OpenSpec `npc-humanity-ai-memory` with the new deterministic NPC agent
  state and player-dialog hold requirements, and marked tasks `3.5` and `3.6`
  complete.
- Bumped app version to `0.15.23`.

### Local Verification

- `npm run test -w @greed-island/server -- social` passed: 1 file / 2 tests,
  including Hub presence separation from area `player_locations`.
- `npm run build:web` passed, with the existing Vite chunk-size warning.
- `npm run build:server` passed.
- `npm run test -w @greed-island/server -- npcEngine buildingRuntime` passed: 2
  files / 22 tests.
- `npm run build` passed: server build and web build completed; web build still
  shows the existing Vite chunk-size warning.
- `npm test` passed: server 19 files / 141 tests; web 5 files / 12 tests.
- `npm run test -w @greed-island/server -- npcEngine` passed: 1 file / 21 tests.
- `npm run test -w @greed-island/server -- npc` passed: 6 files / 50 tests.
- `npx openspec validate npc-humanity-ai-memory --strict` passed.
- `git diff --check` passed; output only contained Windows LF→CRLF working-copy
  warnings.
- Local Node runtime restarted from the latest build with
  `JWT_SECRET=local-development-secret-0-15-23` and
  `GREED_ISLAND_DATA_DIR=D:\Projects\_HomeProject\greed-island\deploy\data`.
- Local runtime health passed: `/api/version` and `/healthz` both returned
  `0.15.23`.
- Local `/api/npcs` confirmed `internalState.agent.activeTask` is present.
- Local dialog-hold verification passed: registering a local test account and
  posting `/api/npc/central.broker.gui/dialog-hold` returned `held=true`,
  `expiresAtTick=3848`, and `/api/npcs` then showed
  `activeTask.kind = player-dialog` with `lastDecision.source = player`.
- Local Vite web root `http://127.0.0.1:5173/` returned HTTP `200`.

### Still Open

- Continue the reported social notification investigation: social realtime
  notifications should refresh from canonical social state; SSE/polling is only a
  hint, not source of truth.
- Browser/Phaser E2E coverage is still missing for two-player Hub presence and
  Area/Hub peer tween behavior; current coverage is build/typecheck plus server
  social presence and dialog-hold tests.
- Browser/Phaser E2E coverage is still missing for active-dialog visual hold;
  local API verification confirms the authoritative `player-dialog` task, but no
  automated visual test opens the dialog in a real browser yet.
- Docker compose local deploy remains blocked by Docker Hub TLS certificate
  verification on this workstation.

## 2026-05-11 — v0.15.22 Shipped

### Completed Locally

- Confirmed after v0.15.21 that iPhone `/api/world` completed successfully with
  `200`, `Content-Length`, no `Content-Encoding`, and `Cache-Control: no-store`,
  but the UI still showed fixture data.
- Identified the remaining likely frontend state bug: overlapping mobile refresh
  generations can discard an earlier successful `/api/world` response, leaving
  fixture as the displayed world.
- Changed `WorldStateContext` so any successful authoritative `/api/world`
  response always replaces fixture state. Generation guarding remains useful for
  secondary data, but cannot block the first real world snapshot.
- Bumped app version to `0.15.22`.

### Local Verification

- `npm run build:web` passed, with existing Vite chunk-size warning.
- `npm run build:server` passed.
- `npm test` passed: server 19 files / 132 tests; web 5 files / 12 tests.
- `docker run --rm -v ... caddy:2.8-alpine caddy validate --config /etc/caddy/Caddyfile`
  passed for `packages/web/Caddyfile.internal`.
- `git diff --check` passed.

### CI/CD And Runtime Verification

- Gemini staged review found a test-gap note for the overlapping refresh race;
  accepted for this production hotfix because the repo lacks a mounted React
  provider integration harness.
- Commit `20f08b5` pushed to `main`.
- GitHub Actions CI run `25645997945` passed.
- GitHub Actions Deploy Dev run `25645997952` passed.
- Runtime health verified: `/healthz` returned `version: 0.15.22`.
- Runtime API version verified: `/api/version` returned `0.15.22`.
- Runtime API verified: `/api/world` returned live data with tick `74789`,
  `eventCount=1275697`, and `npcCount=50`.
- User iPhone verification passed after reload: fixture/demo label disappeared
  and authoritative live world data rendered.

## 2026-05-11 — v0.15.21 Shipped

### Completed Locally

- Investigated continued iPhone fixture state after v0.15.20 using live web
  proxy logs from the iPhone client.
- Confirmed the iPhone loaded fresh `v0.15.20` HTML/JS and successfully fetched
  `/api/version`, but did not complete a visible `/api/world` request in the
  same load window.
- Identified a likely transport-layer root cause: internal Caddy globally applied
  `encode zstd gzip`, so proxied `/api/*` JSON could be served as zstd. iPhone
  Safari advertised zstd support, but world-state fetch completion appeared to
  stall while tiny uncompressed `/api/version` still worked.
- Moved `encode zstd gzip` into static HTML/assets handlers only; proxied
  `/api/*` JSON is now no-store and uncompressed.
- Bumped app version to `0.15.21`.

### Local Verification

- `npm run build:web` passed, with existing Vite chunk-size warning.
- `npm run build:server` passed.
- `npm test` passed: server 19 files / 132 tests; web 5 files / 12 tests.
- Caddyfile validate passed.
- `git diff --check` passed.

### CI/CD And Runtime Verification

- Gemini staged review: `No findings`.
- Commit `2558880` pushed to `main`.
- GitHub Actions CI run `25645742538` passed.
- GitHub Actions Deploy Dev run `25645742547` passed.
- Runtime verified: `/api/world` returned `200`, `Cache-Control: no-store`,
  `Content-Length`, and no `Content-Encoding` after deploy.
- iPhone still showed fixture after `/api/world` became successful, which led to
  the follow-up v0.15.22 frontend state fix.

## 2026-05-11 — v0.15.20 Shipped

### Completed Locally

- Investigated why an iPhone could show the v0.15.19 bundle while still seeing
  fixture/demo world data.
- Confirmed latest proxy evidence showed `/api/world` and `/api/cards` returning
  transient `502` during a server restart window, not stale HTML/JS caching.
- Added a fixture-only recovery retry scheduler so the web app retries quickly
  while no authoritative server world has landed yet; successful `/api/world` or
  SSE snapshots cancel the retry.
- Added focused tests for the recovery scheduler: retry while fixture-only, no
  retry once server data arrives, and cancellation/deduplication.
- Bumped app version to `0.15.20`.

### Local Verification

- `npm --workspace @greed-island/web test -- fixtureRecoveryRetry resilientLoad mobileRefreshTriggers refreshGeneration` passed: 4 files / 10 tests.
- `npm --workspace @greed-island/web run build` passed, with existing Vite chunk-size warning.
- `npm run build:web` passed, with existing Vite chunk-size warning.
- `npm run build:server` passed.
- `npm test` passed: server 19 files / 132 tests; web 5 files / 12 tests.
- `git diff --check` passed.

### CI/CD And Runtime Verification

- Gemini staged review found one non-blocking test gap: the extracted recovery
  scheduler is covered, but there is no mounted React provider integration test
  harness for `WorldStateContext` orchestration yet. Accepted for this hotfix.
- Commit `9bae7a2` pushed to `main`.
- GitHub Actions CI run `25645138546` passed.
- GitHub Actions Deploy Dev run `25645138560` passed.
- Runtime health verified: `/healthz` returned `version: 0.15.20`.
- Runtime API version verified: `/api/version` returned `0.15.20`.
- Runtime tick progression verified: tick advanced from `74479` to `74481` over
  10 seconds.
- Runtime API verified: `/api/world` returned live server data with tick `74481`,
  `eventCount=1269017`, and `npcCount=50`.
- Runtime cache headers verified: `/api/world` returned `Cache-Control: no-store`.
- Server logs verified clean boot at tick `74479`, HTTP listening on port 3000,
  and ambient narrator attached with 41 active keys.
- Web proxy logs confirmed the deploy restart window still produces short `502`
  responses; the v0.15.20 client now retries quickly while still fixture-only.

## 2026-05-11 — v0.15.19 Shipped

### Completed Locally

- Investigated continued mobile fixture state after v0.15.18 by checking live web
  proxy logs for the iPhone client.
- Found Safari/iOS requests sending `If-None-Match` for dynamic JSON endpoints;
  several `/api/cards`, `/api/map`, and `/api/npcs` responses returned `304`,
  which the frontend `jsonFetch` treats as a failed JSON response.
- Added `cache: 'no-store'` and `Cache-Control: no-store` to the frontend API
  fetch wrapper so Safari does not conditional-cache dynamic `/api/*` JSON.
- Added `Cache-Control: no-store` to the internal Caddy `/api/*` route.
- Bumped app version to `0.15.19`.

### Local Verification

- `npm run build:web` passed, with existing Vite chunk-size warning.
- `npm run build:server` passed.
- `npm test` passed: server 19 files / 132 tests; web 4 files / 9 tests.
- `docker run --rm -v ... caddy:2.8-alpine caddy validate --config /etc/caddy/Caddyfile`
  passed for `packages/web/Caddyfile.internal`.
- `git diff --check` passed.

### CI/CD And Runtime Verification

- Commit `194385f` pushed to `main`.
- GitHub Actions CI run `25644893980` passed.
- GitHub Actions Deploy Dev run `25644893975` passed.
- Runtime health verified: `/healthz` returned `version: 0.15.19`.
- Runtime tick progression verified: tick advanced from `74372` to `74374`.
- Runtime API verified: `/api/world` returned live server data with tick `74372`,
  `eventCount=1266257`, and `npcCount=50`.
- Runtime cache headers verified: `/api/world` returned `Cache-Control: no-store`.

## 2026-05-11 — v0.15.18 Shipped

### Completed Locally

- Fixed a mobile stale-client/offline-looking failure mode where the bundled web
  `APP_VERSION` still reported `0.15.6` when `/api/version` was temporarily
  unreachable.
- Added internal Caddy cache headers so `/` and `/index.html` are `no-store`,
  while hashed `/assets/*` remain long-lived immutable assets.
- Hardened initial world-state loading for mobile/weak networks with per-request
  timeout, retry/backoff, and refresh on `online`, `pageshow`, and return-to-
  foreground visibility events.
- Bumped app version to `0.15.18`.

### Local Verification

- `npm run build:web` passed, with existing Vite chunk-size warning.
- `npm run build:server` passed.
- `npm run test -w @greed-island/web` passed: 4 files / 9 tests.
- `npm test` passed: server 19 files / 132 tests; web 4 files / 9 tests.
- `docker run --rm -v ... caddy:2.8-alpine caddy validate --config /etc/caddy/Caddyfile`
  passed for `packages/web/Caddyfile.internal`.
- `git diff --check` passed.

### CI/CD And Runtime Verification

- Commit `017f563 fix(web): harden mobile world refresh` pushed to `main`.
- GitHub Actions CI run `25643825872` passed.
- GitHub Actions Deploy Dev run `25643825850` passed.
- Runtime health verified:
  `https://hunter.sisihome.org/healthz` returns `version: 0.15.18`.
- Runtime tick progression verified: health tick advanced from `73900` to
  `73902` over 10 seconds.
- Runtime API verified: `/api/version` returns `0.15.18`; `/api/world` returns
  tick `73900`, `eventCount=1256975`, and `npcCount=50`.
- Runtime cache headers verified: `/` returns `Cache-Control: no-store`, and the
  current hashed JS asset returns `Cache-Control: public, max-age=31536000,
  immutable`.
- Runtime logs verified: server booted from latest tick `73898`, opened HTTP,
  attached ambient narrator with 41 active keys, and did not show crash or tick
  collision errors.

### Still Open

- If Safari still shows stale UI immediately after this deploy, manually
  closing/reopening the tab once may be required to evict the already-loaded old
  JS runtime; subsequent loads should receive fresh HTML due to `no-store`.

## 2026-05-11 — v0.15.17 Shipped

### Completed Locally

- Added bounded chronicle AI rendering attempts with a per-render timeout,
  transient retry/backoff, explicit JSON MIME, and `thinkingBudget=0` structured
  output settings.
- Exposed `chronicle.aiMeta` so success and fallback responses include active key
  count, timeout, max attempts, response MIME, per-attempt status, and fallback
  reason when degraded.
- Kept AI read-only and non-authoritative: timeout, retry exhaustion, and
  ungrounded cited names still return deterministic fallback text without
  changing committed events or world projection.
- Marked OpenSpec task `3.3` complete for key-pool robustness metadata.
- Bumped app version to `0.15.17`.

### Local Verification

- `npm run build:server` passed.
- `npm run build:web` passed, with existing Vite chunk-size warning.
- `npm run test -w @greed-island/server` passed: 19 files / 132 tests.
- `npm test` passed: server 19 files / 132 tests; web 1 file / 2 tests.
- `git diff --check` passed.
- `openspec validate npc-humanity-ai-memory --strict` passed.
- Gemini staged diff reviewer returned `No findings` after adding retry
  exhaustion and non-transient failure regression tests.

### CI/CD And Runtime Verification

- Commit `3f62645 feat(world): add chronicle AI retry metadata` pushed to
  `main`.
- GitHub Actions CI run `25635003178` passed.
- GitHub Actions Deploy Dev run `25635003187` passed.
- Runtime health verified:
  `https://hunter.sisihome.org/healthz` returns `version: 0.15.17`.
- Runtime tick progression verified: health tick advanced from `68948` to
  `68949` over 10 seconds.
- Runtime fallback chronicle verified: `/api/world/chronicle?limit=5` returns
  `source=fallback`, `aiMeta.requested=false`, `activeKeys=41`, and no fallback
  error.
- Runtime AI chronicle verified: `/api/world/chronicle?limit=5&ai=1` returns
  `source=ai`, `aiMeta.requested=true`, `activeKeys=41`, one successful attempt,
  and `fallbackReason=null`.
- Runtime logs verified: server booted from latest tick `68946`, opened HTTP,
  attached ambient narrator with 41 active keys, and did not show crash or tick
  collision errors.

### Still Open

- Follow-up remains: stronger anti-hallucination checks beyond cited-name
  validation.
- Future boot work should add an indexed/latest-fact projection so large logs can
  hydrate richer runtime state without blocking HTTP.

## 2026-05-11 — v0.15.16 Shipped

### Completed Locally

- Added grounded chronicle rendering over recent committed EventLog rows and
  `npc_memory` snippets.
- Added read-only `/api/world/chronicle` endpoint with deterministic fallback by
  default and optional `?ai=1` Gemini JSON rendering.
- Guarded AI chronicle output with an allowed-name list derived from actor ids,
  NPC display names, and memory references; AI output that cites names outside
  the grounded context falls back deterministically.
- Filtered internal `FACT_SET` projection events out of chronicle context so the
  endpoint renders world-facing events rather than state-write noise.
- Marked OpenSpec task `3.2` complete for AI chronicle rendering from committed
  events and memory snippets without granting AI world authority.
- Bumped app version to `0.15.16`.

### Local Verification

- `npm run build:server` passed.
- `npm run build:web` passed, with existing Vite chunk-size warning.
- `npm test` passed: server 19 files / 127 tests; web 1 file / 2 tests.
- `git diff --check` passed.
- `openspec validate npc-humanity-ai-memory --strict` passed.
- Gemini staged diff reviewer returned `No findings` after adding AI-path,
  ungrounded-citation, display-name, and event-filter regression tests.

### CI/CD And Runtime Verification

- Commit `56b0dcf feat(world): render grounded chronicles` pushed to `main`.
- Follow-up commit `138bd27 fix(world): keep chronicle context grounded` pushed
  to `main`.
- GitHub Actions CI runs `25633472890` and `25633662802` passed.
- GitHub Actions Deploy Dev runs `25633472898` and `25633662804` passed.
- Runtime health verified:
  `https://hunter.sisihome.org/healthz` returns `version: 0.15.16`.
- Runtime tick progression verified: health tick advanced from `68184` to
  `68186` over 10 seconds.
- Runtime chronicle verified:
  `/api/world/chronicle?limit=10` returns fallback chronicle text, grounded
  context, NPC display names in `allowedNames`, and no internal `FACT_SET` noise.
- Runtime logs verified: server booted from latest tick `68181`, opened HTTP,
  and did not show crash or tick collision errors.

### Still Open

- Follow-up remains: key-pool robustness metadata for chronicle AI calls and
  stronger anti-hallucination checks beyond cited-name validation.
- Future boot work should add an indexed/latest-fact projection so large logs can
  hydrate richer runtime state without blocking HTTP.

## 2026-05-10 — v0.15.15 Shipped

### Completed Locally

- Extended NPC memory projection so `PLAYER_INTERVENE` events create one
  memory row for each affected NPC.
- Added private player dialog memory persistence: `/api/npc/:npcId/interact`
  now mirrors each saved `personal_events` turn into `npc_memory` when the
  runtime memory projection is attached.
- Kept player dialog memory idempotent through canonical content hashing and
  preserved distinct identical-content memories across different ticks.
- Marked OpenSpec task `3.1` complete for persisted player↔NPC and NPC↔NPC
  interaction facts required by future memory-grounded behavior.
- Bumped app version to `0.15.15`.

### Local Verification

- `npm run build:server` passed.
- `npm run build:web` passed, with existing Vite chunk-size warning.
- `npm test` passed: server 18 files / 120 tests; web 1 file / 2 tests.
- `git diff --check` passed.
- `openspec validate npc-humanity-ai-memory --strict` passed.
- Gemini staged diff reviewer returned `No findings` after adding the
  identical-content/different-tick memory regression test.

### CI/CD And Runtime Verification

- Commit `295f884 feat(npcs): persist player interaction memories` pushed to
  `main`.
- GitHub Actions CI run `25632968113` passed.
- GitHub Actions Deploy Dev run `25632968110` passed.
- Runtime health verified:
  `https://hunter.sisihome.org/healthz` returns `version: 0.15.15`.
- Runtime tick progression verified: health tick advanced from `67832` to
  `67834` over 10 seconds.
- Runtime logs verified: server booted from latest tick `67826`, opened HTTP,
  and did not show crash or tick collision errors.

### Still Open

- Follow-up remains: AI chronicle rendering from committed events and memory
  snippets, with key-pool robustness and anti-hallucination grounding.
- Future boot work should add an indexed/latest-fact projection so large logs can
  hydrate richer runtime state without blocking HTTP.

## 2026-05-10 — v0.15.14 Shipped

### Completed Locally

- Replaced the old permanent role-lock behavior with duty-weighted movement.
- Duty-anchored NPCs such as merchants, guards, priests, craftsmen, and civic
  roles now keep duty windows as the strong movement weight instead of a hard
  identity lock.
- Explicit cross-district routine slots for duty-anchored NPCs are now honored
  instead of being rewritten back to `defaultLocation`.
- NPCs with all-same duty routines receive a short deterministic off-duty errand
  window, while wanderer archetypes keep a longer travel window.
- Added regression coverage for shopkeepers leaving during short off-duty
  errands, priests honoring explicit cross-district routine slots, and guards
  with existing cross-district routines not receiving extra injected errands.
- Bumped app version to `0.15.14`.

### Local Verification

- `npm run build:server` passed.
- `npm run build:web` passed, with existing Vite chunk-size warning.
- `npm test` passed: server 18 files / 116 tests; web 1 file / 2 tests.
- `git diff --check` passed.
- `openspec validate npc-humanity-ai-memory --strict` passed.
- Gemini staged diff reviewer returned `No findings` after the helper rename and
  existing-cross-district-routine regression test were added.

### CI/CD And Runtime Verification

- Commit `5f60ffd fix(npcs): replace role locks with duty-weighted travel`
  pushed to `main`.
- GitHub Actions CI run `25632524896` passed.
- GitHub Actions Deploy Dev run `25632524892` passed.
- Runtime health verified:
  `https://hunter.sisihome.org/healthz` returns `version: 0.15.14`.
- Runtime tick progression verified: health tick advanced from `67605` to
  `67607` over 10 seconds.
- Runtime logs verified: server booted from latest tick `67603`, opened HTTP,
  and did not show continuing tick collision or crash errors.

### Still Open

- Follow-up remains: richer NPC intent selection beyond deterministic schedule
  errands, and memory-backed AI chronicle rendering.
- Future boot work should add an indexed/latest-fact projection so large logs can
  hydrate richer runtime state without blocking HTTP.

## 2026-05-10 — v0.15.13 Shipped

### Completed Locally

- Fixed production tick recovery after availability-first boot skips full runtime
  hydration on very large event logs.
- Added latest committed event-log tick metadata to `readLatestFactSnapshot()` so
  runtime boot resumes from the latest persisted tick even when no `FACT_TICK`
  fact is available.
- Prevented deterministic tick event id collisions that previously caused
  repeated `SQLITE_CONSTRAINT_UNIQUE` failures after booting from defaults.
- Added regression coverage for latest tick discovery, empty event logs, and
  event logs with only null tick values.
- Bumped app version to `0.15.13`.

### Local Verification

- `npm run build:server` passed.
- `npm run build:web` passed, with existing Vite chunk-size warning.
- `npm test` passed.
- `git diff --check` passed.
- Gemini staged diff reviewer returned `No findings` after the null/empty tick
  regression tests were added.

### CI/CD And Runtime Verification

- Commit `d6b67f1 fix(server): resume ticks from latest event log tick` pushed
  to `main`.
- GitHub Actions CI run `25631972227` passed.
- GitHub Actions Deploy Dev run `25631972239` passed.
- Runtime health verified:
  `https://hunter.sisihome.org/healthz` returns `version: 0.15.13`.
- Runtime tick progression verified: health tick advanced from `67308` to
  `67310` over 10 seconds.
- Runtime logs verified: `docker logs --tail 120 greed-island-server` shows boot
  at tick `67294` and no continuing `SQLITE_CONSTRAINT_UNIQUE` tick failures.

### Still Open

- Follow-up remains: real duty-weighted free exploration and richer intent
  selection beyond schedule/personality nudge.
- Future boot work should add an indexed/latest-fact projection so large logs can
  hydrate richer runtime state without blocking HTTP.

## 2026-05-10 — v0.15.12 Shipped

### Completed Locally

- Added server-authoritative `travelRoute` to NPC runtime state for cross-tile
  movement: `fromTile`, `toTile`, `targetTile`, and `startedAtTick`.
- Exposed `travelRoute` through `/api/npcs` and frontend `NpcSummary`.
- Updated Hub map rendering so moving NPCs are drawn on their route segment
  instead of being treated as local Area occupants.
- Updated Area/outdoor projections to exclude `activity = move`, preventing Hub
  and sub-scene duplicate rendering of the same NPC while in transit.
- Added regression coverage for moving NPC route creation, route clearing after
  arrival, and travelling NPCs not appearing in outdoor area occupants.
- Added frontend projection tests so travel NPCs are mapped to Hub route sprites
  and excluded from Area outdoor occupants.
- Bumped app version to `0.15.12`.

### Local Verification

- `npm run build:server` passed.
- `npm run build:web` passed, with existing Vite chunk-size warning.
- `npm test` passed: server 18 files / 112 tests; web 1 file / 2 tests.

### CI/CD And Runtime Verification

- Commit `ba9ca97 fix(npcs): render travel as worldline routes` pushed to `main`.
- GitHub Actions CI run `25631740981` passed.
- GitHub Actions Deploy Dev run `25631740983` passed: Docker images built,
  pushed, desktop containers restarted, and smoke check passed.
- Runtime health verified:
  `https://hunter.sisihome.org/healthz` returns `version: 0.15.12`.
- Runtime NPC projection verified: `/api/npcs` exposes `travelRoute` for every
  NPC, currently `null` for NPCs not in transit.

### Still Open

- Follow-up remains: real duty-weighted free exploration and richer intent
  selection beyond schedule/personality nudge.

## 2026-05-10 — v0.15.11 Shipped

### Completed Locally

- Started OpenSpec change `npc-humanity-ai-memory` for NPC unique presence,
  duty-weighted free exploration, memory-backed behavior, and AI-rendered
  grounded chronicle text.
- Replaced the old durable rule that role NPCs cannot cross districts with the
  new NPC humanity rule: duty is a movement weight, not a permanent hard lock.
- Made building occupant views derive from current NPC presence state instead
  of relying only on the independently hydrated `npcInside` map.
- Updated BuildingPage to use the server NPC projection as the primary source
  for interior NPCs, preventing stale building detail from rendering a duplicate
  when `/api/npcs` says that NPC is elsewhere.
- Added `buildingRuntime` regression coverage for an NPC inside a building not
  appearing in the outdoor NPC list.
- Updated HubPage so the main map shows all surface NPCs, not only NPCs whose
  current activity is `move`; indoor NPCs remain hidden from the hub map to
  prevent duplicates.
- Bumped app version to `0.15.11`.

### Verification

- `npm run build:server` passed.
- `npm run build:web` passed, with existing Vite chunk-size warning.
- `npm run test -w @greed-island/server` passed: 18 files / 110 tests.
- `git diff --check` passed, with Windows LF-to-CRLF warnings only.
- Gemini staged diff reviewer returned `No findings`.

### CI/CD And Runtime Verification

- Commits `b16117f fix(npcs): enforce unique building presence` and
  `0038ee8 fix(web): show outdoor NPCs on hub map` pushed to `main`.
- GitHub Actions CI run `25631221366` passed.
- GitHub Actions Deploy Dev run `25631221360` passed: Docker images built,
  pushed, desktop containers restarted, and smoke check passed.
- Runtime health verified:
  `https://hunter.sisihome.org/healthz` returns `version: 0.15.11`.
- Runtime NPC projection verified: `/api/npcs` returns surface NPCs with
  `buildingId: null` across districts, while indoor NPCs retain a concrete
  `buildingId`.

### Still Open

- Follow-up slices remain: duty-weighted cross-district exploration and
  memory-backed AI chronicle rendering.

## 2026-05-10 — v0.15.10 Shipped

### Completed Locally

- Fixed NPC projection freshness so `/events/stream` now sends an authoritative
  `snapshot` after every simulation tick, not only after narrative events.
- Updated `WorldStateContext` to refresh the authenticated `/npcs` projection
  whenever an SSE snapshot arrives, so `subCol/subRow/buildingId` changes reach
  AreaScene on the backend tick cadence.
- Changed the old 3s full-world polling loop to a 15s fallback for browsers or
  proxies that cannot keep EventSource open.
- Fixed the living-world projection bootstrap check so server boot does not
  rebuild NPC memory/relationship projections on every restart by checking a
  synthetic NPC id that can never exist.
- Changed production boot to skip full runtime hydration for large event logs,
  preserving HTTP availability while new ticks continue from current metadata.
- Bumped app version to `0.15.10` for deployment/runtime verification.

### Local Verification

- `npm run build:server` passed.
- `npm run build:web` passed, with existing Vite chunk-size warning.
- `npm run test -w @greed-island/server` passed: 16 files / 108 tests.
- `git diff --check` passed, with Windows LF-to-CRLF warnings only.

### CI/CD And Runtime Verification

- Commit `6b4dcc3 fix(server): keep boot available on large logs` pushed to
  `main`.
- GitHub Actions CI run `25630222017` passed.
- GitHub Actions Deploy Dev run `25630222015` passed: Docker images built,
  pushed, and desktop containers restarted.
- Runtime health verified:
  `https://hunter.sisihome.org/healthz` returns `version: 0.15.10`.

### Still Open

- v0.15.7 deploy run `25629908799` completed, but public health stayed 502
  because the server container was still rebuilding projections before opening
  port 3000.
- v0.15.8 deploy run `25630060283` completed, but public health stayed 502
  because production event-log hydration was still synchronous and blocked
  before `runtime.start()`.
- v0.15.9 deploy run `25630144174` completed, but public health stayed 502
  because the SQLite latest-fact window query was still too expensive on the
  production event log.
- v0.15.10 restores availability by booting large event logs from defaults;
  future work should add an indexed/latest-fact projection so tick/weather/NPC
  state can hydrate without blocking HTTP.
- Full NPC humanity remains incomplete: private dialog is not yet fully
  grounded in long-term memory, aliases, known-person graph, households,
  faction knowledge, workplace ties, or settlement history.

## 2026-05-10 — v0.15.6 Shipped + CI/CD Restored

### Completed

- Shipped v0.15.6 to `https://hunter.sisihome.org`.
- Restored deployment by moving Greed Island deploy to the kevinhome
  Windows self-hosted runner `DESK-KEVINHOME-greed-island-2`.
- Updated desktop compose to pull Docker Hub images:
  `kevin950805/greed-island-server:dev` and
  `kevin950805/greed-island-web:dev`.
- Moved desktop host port from `7100` to `8100` because Windows excluded
  TCP port range `7032-7131` can reserve `7100` after reboot.
- Updated the active RPi Caddy route for `hunter.sisihome.org` to
  reverse-proxy `100.83.112.20:8100`.

### Verification

- Commit `eeaebf5 fix(deploy): use desktop runner for dev deploy` pushed to
  `main`.
- GitHub Actions Deploy Dev run `25629326859` passed:
  build/push Docker images succeeded and desktop deploy succeeded on the
  self-hosted runner.
- Runtime health verified: `https://hunter.sisihome.org/healthz` returns
  `version: 0.15.6`.

### Still Open

- `homelab-docs` must finish recording the updated Greed Island port and
  self-hosted runner deployment facts.
- NPC movement in AreaScene is still driven by server projection updates
  reaching React/Phaser; SSE currently pushes world snapshots/events but NPC
  lists still rely primarily on polling. Future fix should push or refresh NPC
  projection on each authoritative tick.
- Full NPC humanity remains incomplete: private dialog is not yet fully
  grounded in long-term memory, aliases, known-person graph, households,
  faction knowledge, workplace ties, or settlement history.

## 2026-05-08 — v0.15.6 Ready For Commit

### Completed Locally

- Fixed AreaPage layout jitter near enterable buildings by reserving a
  stable action slot instead of conditionally inserting/removing the
  enter button.
- Exposed current world time in the atmosphere bar using simulation tick
  conversion.
- Exposed player resources in the top bar for signed-in players:
  tide coins, energy, and owned technique-card count.
- Added backend job guard: one player can hold only one active job at a
  time; applying elsewhere returns `ALREADY_HIRED` until they quit.
- Updated BuildingPage to show `已有工作` instead of allowing repeated
  applications when the player already has a job.
- Added NPC dialog anti-hallucination grounding guard for unknown names:
  AI replies that invent facts like “which X / several X” are replaced
  with a deterministic clarification line.
- Added AI dialog prompt grounding: known NPC names are passed to the
  prompt; unknown names/aliases must not be treated as world facts.
- Fixed two-player area presence rendering: presence now carries `x/y/z`,
  peer sprites render from server-returned XYZ, local positions are
  account-scoped, tile switches cannot save old-scene coordinates under
  the new tile, and stale/out-of-order presence requests are ignored
  without publishing false enter/leave events.
- Added canonical world timezone config: `GMT+8` / offset `480`, exposed
  through `/world.worldConfig` and applied by the atmosphere bar clock.
- Hardened transitional `/world.worldConfig` normalization so older server
  payloads do not white-screen the UI while deployments roll forward.
- Added `DEVELOPMENT_CONSTITUTION.md` and architecture rules for
  Autonomous Civilization Evolution.
- Bumped app version to `0.15.6`.

### Local Verification

- `npm run build:server` passed.
- `npm run build:web` passed, with existing Vite chunk-size warning.
- `npm run test -w @greed-island/server` passed: 16 files / 108 tests.
- `git diff --check` passed, with Windows LF-to-CRLF warnings only.
- Reviewer pass after final GMT+8 and XYZ presence fixes: No findings.

### Superseded By 2026-05-10 Handoff

- Commit/push, CI tracking, and deployment verification are complete.
- Remaining product backlog moved to the latest section above.

## 2026-05-08 — v0.15.5 Shipped

### Completed

- Deterministic card drops: `CardDropEngine` no longer uses
  `Math.random()` for spawn checks, card selection, or coordinates.
- Added replay tests for normal tick drops and boot-time seed drops.
- Added `openspec/changes/deterministic-card-drops/` proposal, design,
  specs, and tasks.
- Updated `ARCHITECTURE.md` to mark card-drop randomness addressed while
  keeping `card_action_log` migration as an open non-conformance.
- Added renderer-only map/environment/NPC idle animation improvements.
- Bumped app version to `0.15.5`.

### Verification And CI/CD

- Local `npm run build:web`, `npm run build:server`, full server tests,
  and `git diff --check` passed.
- Commit: `eea3414 fix(world): harden deterministic continuity`.
- CI run `25538968116` passed.
- Deploy Dev run `25538968139` built and pushed Docker images, then
  failed at desktop SSH reachability.

### Known Deployment Blocker

- Deploy Dev still fails at `Verify desktop SSH reachability` because the
  desktop target refuses SSH on the configured host/port.

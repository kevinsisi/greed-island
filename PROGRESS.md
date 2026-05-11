# Greed Island Progress Handoff

This file records current development state for the next AI or human
developer. Keep latest status at the top.

## 2026-05-11 — v0.15.18 In Progress

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

- Pending commit, push, CI, Deploy Dev, and live runtime/cache-header checks.

### Still Open

- If Safari still shows stale UI after this deploy, manually closing/reopening the
  tab once may be required to evict the already-loaded old JS runtime; subsequent
  loads should receive fresh HTML due to `no-store`.

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

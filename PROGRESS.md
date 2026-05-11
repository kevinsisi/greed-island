# Greed Island Progress Handoff

This file records current development state for the next AI or human
developer. Keep latest status at the top.

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
- Pending: Gemini review.

### Still Open

- Pending deploy and live verification.

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

# Tasks — Ecosystem Fishery Density (Phase E0.4)

## 1. Commands

- [x] 1.1 Add `FISHERY_HARVESTED` and `FISHERY_COLLAPSED` to the living-world command catalog.
- [x] 1.2 Add typed payloads and validators.
- [x] 1.3 Add command catalog tests.

## 2. Projection + Policy

- [x] 2.1 Add `FisheryDensityProjection` keyed by coastal tile id.
- [x] 2.2 Add deterministic fisher-role harvest policy.
- [x] 2.3 Emit collapse warning when density crosses threshold.
- [x] 2.4 Add replay/canonical-hash tests.

## 3. Runtime

- [x] 3.1 Runtime plans fishery harvest from fisher productive actions.
- [x] 3.2 Runtime fans accepted fishery events into projection.
- [x] 3.3 `WorldSnapshot.facts.fisheryDensity` exposes current rows.

## 4. GM visibility

- [x] 4.1 Add `/admin/world` GM/admin world observer route.
- [x] 4.2 Add visible GM world entry points from desktop navigation, profile staff shortcuts, and admin page.
- [x] 4.3 Render `facts.fisheryDensity` with tile, density, harvested total, status, and updated tick.

## 5. Verification

- [x] 5.1 Focused server tests pass: `npm run test -w @greed-island/server -- ecosystem/fishery projections/fisheryDensity kernel/livingWorld` (45 tests).
- [x] 5.2 Full suite passes before backend deploy: `npm test` (296 server + 34 web tests).
- [x] 5.3 `npm run build:server` and `npm run build:web` pass (web only known Vite chunk-size warning).
- [x] 5.4 `npx openspec validate ecosystem-fishery-density --strict` passes.
- [x] 5.5 `npx openspec validate --all --strict` passes (23 passed, 0 failed).
- [x] 5.6 Backend commit/deploy verified: commit `d7fef26`, CI `25798295594`, Deploy Dev `25798295660`.
- [x] 5.7 GM visibility follow-up local web checks pass: `npm run build:web`; `npm run test -w @greed-island/web` (34 tests).
- [ ] 5.8 GM visibility follow-up commit, push, verify CI + Deploy Dev, and update handoff docs.

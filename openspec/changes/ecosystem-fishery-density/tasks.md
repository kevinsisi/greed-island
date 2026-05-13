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

## 4. Verification

- [x] 4.1 Focused tests pass: `npm run test -w @greed-island/server -- ecosystem/fishery projections/fisheryDensity kernel/livingWorld` (45 tests).
- [x] 4.2 `npm test` passes (296 server + 34 web tests).
- [x] 4.3 `npm run build:server` and `npm run build:web` pass (web only known Vite chunk-size warning).
- [x] 4.4 `npx openspec validate ecosystem-fishery-density --strict` passes.
- [x] 4.5 `npx openspec validate --all --strict` passes (23 passed, 0 failed).
- [ ] 4.6 Commit, push, verify CI + Deploy Dev, and update handoff docs.

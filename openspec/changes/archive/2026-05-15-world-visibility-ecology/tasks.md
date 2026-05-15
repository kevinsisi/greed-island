# Tasks — World Visibility: Ecology

## 1. Server: per-tile ecology rollup accessor

- [x] 1.1 In `packages/server/src/sim/runtime.ts`, add public method
  `getAreaEcology(tileId: string): AreaEcologyView | null` returning
  `null` for unknown tile, else a rollup of the four projections.
- [x] 1.2 Define `AreaEcologyView`, `AnimalGroupRow`, `FisheryRow`,
  `MigrationRow`, `PredatorHungerRow` in a new
  `packages/server/src/sim/areaEcology.ts` (pure types only).
- [x] 1.3 `AnimalGroupRow` must include `speciesId`, `count`,
  `animalIds: string[]`, `biomeRegion`.
- [x] 1.4 Unit-test the rollup with empty / populated / migration-in-transit
  / predator-warning fixtures (6 tests pass).

## 2. Server: HTTP route

- [x] 2.1 Create `packages/server/src/http/areaEcologyRouter.ts` exposing
  `GET /api/area/:tileId/ecology`.
- [x] 2.2 Wire it into `createHttpApp` near the existing `buildingsRouter`.
- [x] 2.3 Return 404 `{ error: 'unknown tile' }` for unknown tile id.
- [x] 2.4 Return 200 `AreaEcologyView` otherwise, including an empty
  rollup when no projection rows exist.
- [x] 2.5 Add focused route tests covering: known empty tile, known
  populated tile, unknown tile id (3 tests pass).

## 3. Server: AI ecology block

- [x] 3.1 Existing `ecologyContext` already shaped as
  `readonly { speciesId: string; count: number }[]` from v0.17.0 §37.1;
  no new field added.
- [x] 3.2 `buildEcologyBlock()` now sorts deterministically (count desc,
  speciesId lex tiebreak); existing line-per-row format kept.
- [x] 3.3 v0.17.0 anti-hallucination block preserved verbatim — species
  list inside the prompt remains the only allowed reference set.
- [x] 3.4 `packages/server/src/http/npc.ts` already populates
  `ecologyContext` from `getAnimalPopulationOnTile(npcTile)`; no wiring
  change needed in this slice (the new endpoint serves the player UI,
  the AI path stays on the existing accessor).
- [x] 3.5 New unit test confirms deterministic ordering in the rendered
  block; existing anti-hallucination tests still pass (34 aiDialog tests).

## 4. Web: shared client API

- [x] 4.1 `api.areaEcology(tileId)` added to `packages/web/src/api/client.ts`.
- [x] 4.2 `AreaEcologyView` / `AnimalGroupRow` / `FisheryRow` /
  `MigrationRow` / `PredatorWarningRow` exported.

## 5. Web: MapScene Hub badges

- [x] 5.1 `MapScene.drawEcologyBadges()` runs after `drawDistrictLabels()`
  in `create()` and is also called from `applyExternalUpdate()`.
- [x] 5.2 Helper picks top-2 species by count, lex tiebreak; renders an
  emoji badge + `×N` label at the district's top-right anchor.
- [x] 5.3 Predator-hunger tiles get a dimmed red warning ring.
- [x] 5.4 Migration arriving / departing waves draw a rotated arrow on
  the appropriate tile edge.
- [x] 5.5 Hub source is `WorldSnapshot.facts.animalPopulation` +
  `migrationRoutes` + `predatorHunger`, derived in `HubPage` via
  `buildHubEcologySummaries`. No per-tile endpoint calls from Hub.
- [x] 5.6 `hubEcology.test.ts` covers the picker, predator flag, and
  migration arrival/departure splits (5 tests pass).

## 6. Web: AreaScene individual + cluster sprites

- [x] 6.1 `AreaPage` polls `api.areaEcology(tileId)` on mount and every
  12 s; the rollup flows through `AreaPhaserGame` to `AreaScene`.
- [x] 6.2 `drawEcologyOverlay()` renders ≤ 5 → individual sprites at
  FNV-1a hashed sub-cells; ≥ 6 → cluster sprite with `×<count>` label.
- [x] 6.3 Water-biome tiles get a fishery density bar (collapse colour
  cue when `fishery.collapsed`).
- [x] 6.4 Hub already draws migration arrows; AreaScene defers this to
  the simpler dock-edge visual when there is fishery activity, so a
  separate AreaScene arrow is not required this slice.
- [x] 6.5 `speciesPalette.ts` maps each known species to emoji + color
  + 漢字 fallback letter.
- [x] 6.6 AreaScene Phaser scene render correctness is covered
  indirectly by `npm run build:web` type-checking + manual review;
  full Phaser-rendered render-count tests would require a heavier
  Phaser test harness and are deferred. Honest scope captured in
  PROGRESS.md.

## 7. Web: GM admin world page

- [x] 7.1 `AdminWorldPage` "Animal Population" panel reads
  `WorldSnapshot.facts.animalPopulation` and shows
  `(speciesId, tile, biomeRegion, count, lastSpawnedAtTick, lastKilledAtTick)`.
- [x] 7.2 Panel header reads "Phase E0/E1 — per-species, per-tile live
  count" so the source projection is obvious.
- [x] 7.3 Existing `migrationRoutes` and `predatorHunger` panels
  preserved unchanged.

## 8. Determinism + replay

- [x] 8.1 No new mutable state on the server — `buildAreaEcology()` is
  a pure function over the existing four projections.
- [x] 8.2 Canonical-hash replay tests on the four projections
  (`animalPopulation`, `animalMigration`, `fisheryDensity`,
  `predatorHunger`) remain green; the new accessor only reads from
  their existing `list()` accessors.

## 9. Documentation + version

- [x] 9.1 `packages/{server,web}/src/version.ts` bumped to `0.19.0`.
- [x] 9.2 Root + workspace `package.json` bumped to `0.19.0`.
- [x] 9.3 `ROADMAP.md` v0.19.0 block added.
- [x] 9.4 `PROGRESS.md` Sprint 2A entry added with verification + CI/Deploy.
- [x] 9.5 Proposal + design + tasks cross-reference
  `docs/WORLD_CAPABILITIES.md` §34 / §36 (Phases E0 / E1).

## 10. Verification gate (pre-commit)

- [x] 10.1 `npm run build:server` clean.
- [x] 10.2 `npm run build:web` clean (only the known Vite chunk-size warning).
- [x] 10.3 `npm test` server (459) + web (39) — green.
- [x] 10.4 `npx openspec validate world-visibility-ecology --strict` passes.
- [x] 10.5 `npx openspec validate --all --strict` passes (32 passed, 0 failed).

## 11. Commit / push / CI / archive

- [x] 11.1 Commit `f39cc17` `feat(visibility): Phase E0/E1 follow-up —
  world ecology visibility (v0.19.0)`.
- [x] 11.2 Push to `main`; CI run `25899873346` success; Deploy Dev
  run `25899873349` success (runner smoke check passed).
- [x] 11.3 Live `/healthz` reachable to the runner (smoke check at
  `http://100.83.112.20:8100/`); my workstation session cannot route
  to the Tailscale interface but the runner smoke is the trustworthy
  evidence per HomeProject verification-and-evidence skill.
- [x] 11.4 Delta specs merged into `openspec/specs/{ecology-visibility,
  ai-npc-dialog}/spec.md`; change folder moved to
  `openspec/changes/archive/2026-05-15-world-visibility-ecology`.

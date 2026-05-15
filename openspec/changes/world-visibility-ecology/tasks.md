# Tasks — World Visibility: Ecology

## 1. Server: per-tile ecology rollup accessor

- [ ] 1.1 In `packages/server/src/sim/runtime.ts`, add public method
  `getAreaEcology(tileId: string): AreaEcologyView | null` returning
  `null` for unknown tile, else a rollup of the four projections.
- [ ] 1.2 Define `AreaEcologyView`, `AnimalGroupRow`, `FisheryRow`,
  `MigrationRow`, `PredatorHungerRow` in a new
  `packages/server/src/sim/areaEcology.ts` (pure types only).
- [ ] 1.3 `AnimalGroupRow` must include `speciesId`, `count`,
  `animalIds: string[]`, `biomeRegion`.
- [ ] 1.4 Unit-test the rollup with empty / populated / migration-in-transit
  / predator-warning fixtures.

## 2. Server: HTTP route

- [ ] 2.1 Create `packages/server/src/http/areaEcologyRouter.ts` exposing
  `GET /api/area/:tileId/ecology`.
- [ ] 2.2 Wire it into `createHttpApp` near the existing `buildingsRouter`.
- [ ] 2.3 Return 404 `{ error: 'unknown tile' }` for unknown tile id.
- [ ] 2.4 Return 200 `AreaEcologyView` otherwise, including an empty
  rollup when no projection rows exist.
- [ ] 2.5 Add focused route tests covering: known empty tile, known
  populated tile, unknown tile id, migration arriving/departing rows
  appear in the correct field.

## 3. Server: AI ecology block

- [ ] 3.1 Extend `EcologyContext` in `packages/server/src/npcs/aiDialog.ts`
  with `animals?: ReadonlyArray<{ speciesId: string; count: number }>`.
- [ ] 3.2 Update `buildEcologyBlock()` to render animals as
  `"<species> ×<count>"` joined by `、`, sorted by count desc, lex tiebreak.
- [ ] 3.3 Keep the v0.17.0 anti-hallucination block intact — the species
  list inside the prompt is the only allowed reference set.
- [ ] 3.4 In `packages/server/src/npcs/npc.ts`, populate
  `ecologyContext.animals` from
  `runtime.getAreaEcology(currentTileId).animals`.
- [ ] 3.5 Unit-test that animals appear in the prompt only when
  `getAreaEcology` returns rows, and that unknown species are excluded
  by the existing guard.

## 4. Web: shared client API

- [ ] 4.1 In `packages/web/src/api/client.ts`, add
  `api.areaEcology(tileId)` returning the `AreaEcologyView` typed shape.
- [ ] 4.2 Export the row types so scenes can import them.

## 5. Web: MapScene Hub badges

- [ ] 5.1 In `packages/web/src/game/MapScene.ts`, after district base
  rendering, call a new `drawEcologyBadges(tileId, ecology)` helper.
- [ ] 5.2 Helper picks top-2 species by count, lex tiebreak, and renders
  badges at the district's top-right anchor (12 px square, species
  emoji or single-letter fallback + count label).
- [ ] 5.3 If `predatorWarnings.length > 0`, also render a dimmed warning
  ring around the tile.
- [ ] 5.4 If `migrationsArriving.length > 0` OR
  `migrationsDeparting.length > 0`, render a small arrow on the
  relevant tile edge (one arrow per direction).
- [ ] 5.5 Hub map data source: `WorldSnapshot.facts.animalPopulation` is
  already broadcast — derive per-tile badges client-side; do NOT call
  the per-tile endpoint from Hub (too many requests).
- [ ] 5.6 Vitest on the badge picker: returns top-2, deterministic order.

## 6. Web: AreaScene individual + cluster sprites

- [ ] 6.1 In `packages/web/src/game/AreaScene.ts`, on enter, call
  `api.areaEcology(tileId)` and cache the rollup.
- [ ] 6.2 For each `AnimalGroupRow`:
  - If `animalIds.length <= 5`: render one small sprite per id at
    sub-cell `(subCol, subRow)` derived from
    `hashSeed(animalId, tileId, 'ecology-placement') % subCells`.
  - Else: render one cluster sprite at the district's anchor sub-cell,
    with `×<count>` label.
- [ ] 6.3 For water-biome tiles, if `fishery` row present, render a thin
  density bar at the bottom edge (length proportional to density / 100).
- [ ] 6.4 For each migration arriving/departing, render an edge arrow
  pointing toward the from / to neighbor tile direction.
- [ ] 6.5 Sprite colors per species derived from a small constant table
  (`packages/web/src/game/speciesPalette.ts`) keyed by speciesId.
- [ ] 6.6 Vitest on the render decision: ≤5 → N individual sprites; ≥6 →
  1 cluster sprite + count.

## 7. Web: GM admin world page

- [ ] 7.1 In `packages/web/src/pages/AdminWorldPage.tsx`, add an
  `Animal Population` panel that reads
  `WorldSnapshot.facts.animalPopulation` and renders rows of
  `(speciesId, tileId, count, biomeRegion, lastSpawnedAtTick,
  lastKilledAtTick)`.
- [ ] 7.2 Label the panel "Phase E0/E1 — Animal Population" so the GM
  knows which projection it comes from.
- [ ] 7.3 Existing `migrationRoutes` and `predatorHunger` panels stay.

## 8. Determinism + replay

- [ ] 8.1 Confirm no new mutable state was added on the server.
- [ ] 8.2 Run focused canonical-hash replay test on the existing four
  projections to confirm the new rollup accessor is read-only and
  does not invalidate replay.

## 9. Documentation + version

- [ ] 9.1 Bump `packages/{server,web}/src/version.ts` to `0.19.0`.
- [ ] 9.2 Bump root + workspace `package.json` versions to `0.19.0`.
- [ ] 9.3 Update `ROADMAP.md` with a v0.19.0 in-progress block citing
  this change.
- [ ] 9.4 Update `PROGRESS.md` with the implementation entry + verification
  + CI/Deploy evidence.
- [ ] 9.5 Cross-reference: this change closes the implicit visibility gap
  for Phase E0/E1 noted in `docs/WORLD_CAPABILITIES.md` §34 / §36.

## 10. Verification gate (pre-commit)

- [ ] 10.1 `npm run build:server` clean.
- [ ] 10.2 `npm run build:web` clean (Vite chunk-size warning allowed).
- [ ] 10.3 `npm test` (server + web) passes.
- [ ] 10.4 `npx openspec validate world-visibility-ecology --strict` passes.
- [ ] 10.5 `npx openspec validate --all --strict` passes.

## 11. Commit / push / CI / archive

- [ ] 11.1 Single commit titled
  `feat(visibility): Phase E0/E1 follow-up — world ecology visibility`.
- [ ] 11.2 Push to `main`; watch CI + Deploy Dev to success.
- [ ] 11.3 Verify live `/healthz` reports `0.19.0` and
  `/api/area/t_forest/ecology` returns expected shape.
- [ ] 11.4 Sync delta specs into main capability specs, then archive
  the change folder to `openspec/changes/archive/YYYY-MM-DD-world-visibility-ecology`.

## 1. Command Catalog

- [x] 1.1 Add `CONSTRUCTION_INITIATE` to `LIVING_WORLD_COMMAND_TYPES` in `packages/server/src/kernel/livingWorldCommands.ts`.
- [x] 1.2 Define `ConstructionInitiateCmd` payload type `{ npcId, tileId, buildingId, duration, motivation?, narration }`.
- [x] 1.3 Add `VALIDATORS` entry: non-empty `npcId/tileId/buildingId`, `duration` integer in `[1, 1000]`, optional `motivation` shape, required `narration` string; no `WorldState` access.
- [x] 1.4 Unit-test the validator with valid + each invalid payload variant (Vitest).

## 2. Event Reducer

- [x] 2.1 Extend `ConstructionProjectRecord` with `initiatedByNpcId: string` in `packages/server/src/sim/cityLife.ts`; legacy salt-marsh entries default `''`.
- [x] 2.2 Implement `withConstructionInitiated(state, input)` modeled on `withConstructionProgress(...)`.
- [x] 2.3 Implement deterministic `projectId = 'project.civ-evo.' + hashCanonicalJson({ scheme, npcId, tileId, buildingId, startedAtTick, rulesetVersion }).slice(0, 24)`.
- [x] 2.4 Add reducer dispatch for `CONSTRUCTION_INITIATE` in `packages/server/src/sim/runtime.ts` (the command name is reused as the event type per the kernel's convention).
- [x] 2.5 Replay/idempotency tests: same `CONSTRUCTION_INITIATE` reducer call returns the same state ref; round-trip through `hydrateLifeExpansionState` preserves `initiatedByNpcId` and `targetProgress`.

## 3. NPC Policy + Build Task

- [x] 3.1 Extend `NpcAgentTaskKind` union in `packages/server/src/sim/npcEngine.ts` with `'build'` (reserved for future projection; no per-kind extra fields needed because `targetTile`, `startedAtTick`, `expiresAtTick` already exist on the universal task shape).
- [x] 3.2 Add `decideCivEvoConstructionInitiate(...)` pure policy in `cityLife.ts` and call it from `runtime.ts` after the salt-marsh productive-build block. Gates: tile ≠ salt-marsh, `areaState.resources.economy < CIV_EVO_CONSTRUCTION_DEMO_ECONOMY_THRESHOLD` (currently 80 for demo visibility; Slice-3 proxy for the §11.8 infrastructure resource — not yet modelled), no open civ-evo project on this tile, no open civ-evo project by this NPC.
- [x] 3.3 Suppression of re-emission is achieved by the reducer's idempotent `projectId` hash + the open-project check, so the NPC's agent task does not need to be mutated authoritatively. `'build'` agent kind is reserved for the projection layer (Slice 6 / 7).
- [x] 3.4 Behavioral tests in `cityLife.test.ts` cover: emission on low economy + empty tile, suppression on rich economy, suppression on salt-marsh tile, same-tile-race rejection, per-NPC single-project rejection, salt-marsh's own settlement not blocking civ-evo, re-emission allowed after the previous project completes.

## 4. construction_projects Projection

- [x] 4.1 Create `packages/server/src/projections/constructionProjects.ts`.
- [x] 4.2 Implement `rebuildFromEvents(events)` over `CONSTRUCTION_INITIATED` + `CONSTRUCTION_PROJECT_PROGRESS` + `BUILDING_CONSTRUCTED` in tick order.
- [x] 4.3 Expose `getInProgressByTile(tileId)` and `getByProjectId(id)`.
- [x] 4.4 Canonical-hash test: projection rebuilt twice from the same EventLog MUST produce identical canonical hash.
- [x] 4.5 Cross-projection consistency test: `construction_projects` rows agree with `lifeExpansion.constructionProjects` on `progress`, `targetProgress`, `initiatedByNpcId`, `startedAtTick`.

## 5. API Surface

- [x] 5.1 Extend `GET /api/buildings?tileId=X` in `packages/server/src/http/buildingsRouter.ts` to include `inProgress: [{ projectId, buildingId, progress, targetProgress, initiatedByNpcId, startedAtTick }]`.
- [x] 5.2 Source `inProgress` from `construction_projects.getInProgressByTile(tileId)`.
- [x] 5.3 Integration test: open project → response includes it; after `BUILDING_CONSTRUCTED` → response moves it out of `inProgress` and into completed buildings.

## 6. Frontend

- [x] 6.1 Extend `constructionActivitiesFor()` in `packages/web/src/pages/constructionActivity.ts` to return NPC-initiated in-progress projects as `MapConstructionActivity` entries.
- [x] 6.2 Confirm `MapScene.drawConstructionSites()` consumes the new entries with no code change.
- [x] 6.3 UI smoke test: Hub display shows NPC-initiated project progress alongside expansion progress.
  - Follow-up fix: `MapScene.drawConstructionSites()` no longer skips active districts, so NPC-initiated construction on active tiles such as `t_dimai` / `t_mountain` is visible instead of hidden until/unless the tile is locked.
  - Live evidence: commits `212dd78` `feat(construction): surface npc-initiated sites` + `0f4fbce` `fix(construction): show npc build crews on active districts`; web smoke covered by `constructionActivity.test.ts`; live E2E verified in §8.5 (mountain project 0→24/24, BUILDING_CONSTRUCTED emitted, 5 autonomous projects observed in world history).

## 7. End-to-End Determinism

- [x] 7.1 E2E lifecycle test: `withConstructionInitiated` → `withConstructionProgress` (reducer level) verifies progress advances and project completes.
- [x] 7.2 `constructionProjects.test.ts` already verifies projection `rebuildFromEvents` canonical-hash determinism and cross-projection consistency.

## 8. Docs + Release

- [x] 8.1 Update PROGRESS.md with this slice.
- [x] 8.2 Update ARCHITECTURE.md §11.8 status (construction sub-item: autonomous initiation done).
- [x] 8.3 Add ROADMAP.md entry pointing to remaining §11.8 sub-items (production, settlement, faction, skill).
- [x] 8.4 Run completion-checklist: tests, build, OpenSpec validate, diff review, version bump, commit, push.
- [x] 8.5 Live E2E verification: NPC-initiated project completes end-to-end with correct projection state.
  - Tests: 195 server + 29 web passed.
  - Build: `npm run build:server` + `npm run build:web` passed.
  - OpenSpec validate: passed on previous CI run.
  - Version: `0.15.47` already set.
  - Projection payload-fix: `buildRowsFromEvents` now reads from `payload.data` (rule-engine wrapper) with fallback to direct `payload` (test-fixture format). Deployed and live-verified.
  - E2E live verification: NPC-initiated mountain project progressed 0→24/24, emitted `BUILDING_CONSTRUCTED`, set `completedAtTick`. Multiple subsequent NPC projects started autonomously (5 total in world history).

## 9. Completed Project Persistence

- [x] 9.1 Add completed NPC construction projection to permanent `BuildingRuntimeView`.
- [x] 9.2 Completed NPC buildings use project-specific IDs to avoid collisions when the same tile gets repeated autonomous projects.
- [x] 9.3 Expose completed NPC buildings through `getBuildingsOnTile()`, `getAllBuildings()`, and `/api/buildings` detail routes.
- [x] 9.4 Tests cover completed dynamic construction views and buildings API exposure.
- [x] 9.5 Completed NPC buildings participate in `BuildingRuntime` owner occupancy so owner NPCs can enter/use them and are not simultaneously rendered outdoors.
- [x] 9.6 Autonomous NPC construction has a per-tile cap to prevent infinite same-tile building spam; existing event history is preserved while runtime/API building projection only exposes the capped set.
- [x] 9.7 Autonomous construction requires real NPC demand and personal gold; accepted paid initiates deduct gold once and healthy-economy tiles can still build under severe demand.

## 10. Construction/Building Monotonic Invariant

- [x] 10.1 `withConstructionProgress` in `cityLife.ts` ignores progress attempts after `completedAtTick !== null` — completed projects cannot regress.
- [x] 10.2 `construction_projects` projection keeps the maximum observed `progress`, the maximum `targetProgress`, and the first non-null `completedAtTick` — stale or out-of-order events cannot lower values.
- [x] 10.3 `rowFromRecord` hydrate normalization: completed records hydrate with `progress = targetProgress` so completed buildings never appear partially built.
- [x] 10.4 Tests in `cityLife.test.ts` and `constructionProjects.test.ts` cover monotonic progress, monotonic completion tick, and hydrate normalization.

## 11. Shared Visibility Cap for Completed + Open Autonomous Projects

- [x] 11.1 New `visibleAutonomousConstructionProjects(...)` helper in `constructionProjects.ts` combines completed and open autonomous projects into a single deterministic per-tile `startedAtTick` window.
- [x] 11.2 `runtime.ts` uses this helper for both `getInProgressConstructionProjects()` (in-progress API response) and `cappedCompletedConstructionProjects()` (completed building defs) — no more independent caps that could disagree.
- [x] 11.3 The visible window is the earliest `startedAtTick` projects with `projectId` as the deterministic tie-breaker. Later projects cannot displace already-visible buildings or resurrect extra construction markers.
- [x] 11.4 Focused tests: per-tile cap, completed + open mixing, later projects suppressed while earlier ones are visible.

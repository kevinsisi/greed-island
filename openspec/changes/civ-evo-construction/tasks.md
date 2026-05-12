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
- [ ] 6.3 UI smoke test: Hub display shows NPC-initiated project progress alongside expansion progress.

## 7. End-to-End Determinism

- [x] 7.1 E2E lifecycle test: `withConstructionInitiated` → `withConstructionProgress` (reducer level) verifies progress advances and project completes.
- [x] 7.2 `constructionProjects.test.ts` already verifies projection `rebuildFromEvents` canonical-hash determinism and cross-projection consistency.

## 8. Docs + Release

- [x] 8.1 Update PROGRESS.md with this slice.
- [x] 8.2 Update ARCHITECTURE.md §11.8 status (construction sub-item: autonomous initiation done).
- [x] 8.3 Add ROADMAP.md entry pointing to remaining §11.8 sub-items (production, settlement, faction, skill).
- [x] 8.4 Run completion-checklist: tests, build, OpenSpec validate, diff review, version bump, commit, push.
  - Tests: 195 server + 29 web passed.
  - Build: `npm run build:server` + `npm run build:web` passed.
  - OpenSpec validate: passed on previous CI run.
  - Version: `0.15.47` already set.

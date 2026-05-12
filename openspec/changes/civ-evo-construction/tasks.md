## 1. Command Catalog

- [x] 1.1 Add `CONSTRUCTION_INITIATE` to `LIVING_WORLD_COMMAND_TYPES` in `packages/server/src/kernel/livingWorldCommands.ts`.
- [x] 1.2 Define `ConstructionInitiateCmd` payload type `{ npcId, tileId, buildingId, duration, motivation?, narration }`.
- [x] 1.3 Add `VALIDATORS` entry: non-empty `npcId/tileId/buildingId`, `duration` integer in `[1, 1000]`, optional `motivation` shape, required `narration` string; no `WorldState` access.
- [x] 1.4 Unit-test the validator with valid + each invalid payload variant (Vitest).

## 2. Event Reducer

- [ ] 2.1 Extend `ConstructionProjectRecord` with `initiatedByNpcId: string` in `packages/server/src/sim/cityLife.ts` (or its types file).
- [ ] 2.2 Implement `withConstructionInitiated(state, cmd)` modeled on `withConstructionProgress(...)`.
- [ ] 2.3 Implement deterministic `projectId = hash(npcId + tileId + buildingId + startedAtTick + rulesetVersion)`.
- [ ] 2.4 Add reducer dispatch for `CONSTRUCTION_INITIATED`.
- [ ] 2.5 Replay test: same EventLog twice MUST produce byte-identical `lifeExpansion.constructionProjects[]`.

## 3. NPC Policy + Build Task

- [ ] 3.1 Extend `NpcAgentTask` union with `{ kind: 'build', buildingId, onTile, expiresAtTick? }` in `packages/server/src/sim/npcEngine.ts`.
- [ ] 3.2 Add policy hook in `cityLife.ts` (or `decideNpcCommand`): emit `CONSTRUCTION_INITIATE` when `goal.kind === 'build_city'` AND `areaState.resources.infrastructure < 45` AND no active `build` task AND no other NPC has open project on same `tileId`.
- [ ] 3.3 Mark the NPC's agent state with the `build` task once the command is emitted to suppress re-emission.
- [ ] 3.4 Behavioral test: seed a city with low infrastructure + an NPC with `goal.kind='build_city'` and assert `CONSTRUCTION_INITIATE` is emitted exactly once.

## 4. construction_projects Projection

- [ ] 4.1 Create `packages/server/src/projections/constructionProjects.ts`.
- [ ] 4.2 Implement `rebuildFromEvents(events)` over `CONSTRUCTION_INITIATED` + `CONSTRUCTION_PROJECT_PROGRESS` + `BUILDING_CONSTRUCTED` in tick order.
- [ ] 4.3 Expose `getInProgressByTile(tileId)` and `getByProjectId(id)`.
- [ ] 4.4 Canonical-hash test: projection rebuilt twice from the same EventLog MUST produce identical canonical hash.
- [ ] 4.5 Cross-projection consistency test: `construction_projects` rows agree with `lifeExpansion.constructionProjects` on `progress`, `targetProgress`, `initiatedByNpcId`, `startedAtTick`.

## 5. API Surface

- [ ] 5.1 Extend `GET /api/buildings?tileId=X` in `packages/server/src/http/buildingsRouter.ts` to include `inProgress: [{ projectId, buildingId, progress, targetProgress, initiatedByNpcId, startedAtTick }]`.
- [ ] 5.2 Source `inProgress` from `construction_projects.getInProgressByTile(tileId)`.
- [ ] 5.3 Integration test: open project → response includes it; after `BUILDING_CONSTRUCTED` → response moves it out of `inProgress` and into completed buildings.

## 6. Frontend

- [ ] 6.1 Extend `constructionActivitiesFor()` in `packages/web/src/pages/constructionActivity.ts` to return NPC-initiated in-progress projects as `MapConstructionActivity` entries.
- [ ] 6.2 Confirm `MapScene.drawConstructionSites()` consumes the new entries with no code change.
- [ ] 6.3 UI smoke test: Hub display shows NPC-initiated project progress alongside expansion progress.

## 7. End-to-End Determinism

- [ ] 7.1 E2E replay test: seed → policy emits `CONSTRUCTION_INITIATE` → Rule Engine commits `CONSTRUCTION_INITIATED` → `CONSTRUCTION_PROJECT_PROGRESS` ticks → `BUILDING_CONSTRUCTED`.
- [ ] 7.2 Run the same EventLog twice and assert identical canonical hash on `lifeExpansion.constructionProjects[]` and on the `construction_projects` projection.

## 8. Docs + Release

- [ ] 8.1 Update PROGRESS.md with this slice.
- [ ] 8.2 Update ARCHITECTURE.md §11.8 status (construction sub-item: autonomous initiation done).
- [ ] 8.3 Add ROADMAP.md entry pointing to remaining §11.8 sub-items (production, settlement, faction, skill).
- [ ] 8.4 Run completion-checklist: tests, build, OpenSpec validate, diff review, version bump, commit, push.

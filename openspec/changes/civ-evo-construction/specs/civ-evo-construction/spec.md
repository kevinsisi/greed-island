## ADDED Requirements

### Requirement: NPCs autonomously initiate construction through Commands

The system SHALL allow an NPC, under deterministic policy, to emit a `CONSTRUCTION_INITIATE` command that the Rule Engine compiles into a `CONSTRUCTION_INITIATED` event. Developer hand-placement and AI authoring MUST NOT be used to create construction projects.

#### Scenario: NPC with build goal and low infrastructure emits CONSTRUCTION_INITIATE
- **GIVEN** an NPC whose `goal.kind` is `build_city`
- **AND** `areaState.resources.infrastructure < 45` on the target tile
- **AND** the NPC has no active `build` task and no other NPC has an open project on the same `tileId`
- **WHEN** the deterministic NPC policy runs in `cityLife.ts`
- **THEN** the NPC SHALL emit `CONSTRUCTION_INITIATE { npcId, tileId, buildingId, duration, motivation? }`

#### Scenario: Rule Engine validates payload shape only
- **WHEN** the Rule Engine evaluates a `CONSTRUCTION_INITIATE` command
- **THEN** validation MUST require non-empty `npcId`, `tileId`, `buildingId`
- **AND** `duration` MUST be an integer in `[1, 1000]`
- **AND** `motivation` (if present) MUST match the existing motivation payload shape
- **AND** the validator MUST NOT read `WorldState` in this slice

#### Scenario: Accepted command appends CONSTRUCTION_INITIATED
- **GIVEN** a payload-valid `CONSTRUCTION_INITIATE` command
- **WHEN** the Rule Engine accepts it
- **THEN** a `CONSTRUCTION_INITIATED` event MUST be appended to the EventLog
- **AND** the event payload MUST carry `initiatedByNpcId`, `tileId`, `buildingId`, `duration`, `startedAtTick`

### Requirement: ConstructionProjectRecord records the initiating NPC

The system SHALL extend `ConstructionProjectRecord` with `initiatedByNpcId: string` and populate it from the `CONSTRUCTION_INITIATED` event. `projectId` MUST be a deterministic hash so replay is reproducible.

#### Scenario: Reducer appends a new record from CONSTRUCTION_INITIATED
- **WHEN** `withConstructionInitiated(state, cmd)` runs
- **THEN** a new `ConstructionProjectRecord` MUST be appended to `lifeExpansion.constructionProjects` with `kind: 'building'`, `targetTileId`, `buildingId`, `initiatedByNpcId`, `progress: 0`, `targetProgress: duration`, `startedAtTick`, `completedAtTick: null`

#### Scenario: projectId is a deterministic hash
- **WHEN** a record is created
- **THEN** `projectId` MUST equal `hash(npcId + tileId + buildingId + startedAtTick + rulesetVersion)`
- **AND** replaying the same EventLog twice MUST produce identical `projectId` values

#### Scenario: Replay determinism
- **GIVEN** an EventLog containing `CONSTRUCTION_INITIATED`, `CONSTRUCTION_PROJECT_PROGRESS`, `BUILDING_CONSTRUCTED` events
- **WHEN** the EventLog is replayed twice
- **THEN** `lifeExpansion.constructionProjects[]` MUST be byte-identical between runs

### Requirement: NPC agent state includes a deterministic build task

The system SHALL extend the `NpcAgentTask` union with `{ kind: 'build', buildingId, onTile, expiresAtTick? }` so the NPC's local intent to build is observable in agent state.

#### Scenario: Build task is the policy precondition
- **WHEN** the NPC policy decides to emit `CONSTRUCTION_INITIATE`
- **THEN** the NPC's agent state MUST hold a `build` task referencing the same `buildingId` and `onTile`
- **AND** the policy MUST NOT re-emit `CONSTRUCTION_INITIATE` while a `build` task for the same tile is active

#### Scenario: Build task is NPC-local, not a world fact
- **WHEN** the EventLog is replayed
- **THEN** the `build` task MUST be reconstructable from agent-state projection
- **AND** the `build` task MUST NOT appear as a row in `construction_projects` (the world fact is `ConstructionProjectRecord` only)

### Requirement: construction_projects projection is rebuildable from events

The system SHALL provide a `construction_projects` projection populated by `rebuildFromEvents(events)` over `CONSTRUCTION_INITIATED`, `CONSTRUCTION_PROJECT_PROGRESS`, and `BUILDING_CONSTRUCTED` in tick order. The projection MUST expose `getInProgressByTile(tileId)` and `getByProjectId(id)`.

#### Scenario: rebuildFromEvents is idempotent
- **GIVEN** the same input EventLog
- **WHEN** `rebuildFromEvents(events)` is invoked twice
- **THEN** the resulting projection rows MUST be identical
- **AND** the canonical hash of the projection MUST match between runs

#### Scenario: Projection agrees with WorldState
- **WHEN** both `construction_projects` and `lifeExpansion.constructionProjects` are rebuilt from the same EventLog
- **THEN** every in-progress project in one MUST appear in the other with the same `progress`, `targetProgress`, `initiatedByNpcId`, `startedAtTick`

### Requirement: /api/buildings exposes in-progress NPC-initiated projects

The system SHALL extend `GET /api/buildings?tileId=X` so the response includes `inProgress: [{ projectId, buildingId, progress, targetProgress, initiatedByNpcId, startedAtTick }]` sourced from the `construction_projects` projection.

#### Scenario: In-progress array reflects open projects
- **GIVEN** an NPC-initiated project exists on `tileId=X` with `completedAtTick === null`
- **WHEN** the client calls `GET /api/buildings?tileId=X`
- **THEN** the response `inProgress` array MUST include an entry for that project with the documented fields

#### Scenario: Completed projects leave the in-progress list
- **WHEN** a `BUILDING_CONSTRUCTED` event has been committed for a project
- **THEN** subsequent `GET /api/buildings?tileId=X` responses MUST NOT list the project in `inProgress`
- **AND** the constructed building MUST appear in the existing completed-buildings portion of the response

### Requirement: Frontend renders NPC-initiated construction without a new scene

The system SHALL extend `constructionActivitiesFor()` so NPC-initiated in-progress projects are returned as `MapConstructionActivity` values consumed by the existing `MapScene.drawConstructionSites()` path. No new scene-level rendering code MAY be required.

#### Scenario: NPC-initiated projects appear in Hub display
- **GIVEN** the projection holds at least one NPC-initiated in-progress project
- **WHEN** the frontend computes `constructionActivitiesFor(tile)`
- **THEN** the result MUST include a `MapConstructionActivity` carrying the project's `progress`, `targetProgress`, `buildingId`, and `initiatedByNpcId`

#### Scenario: drawConstructionSites is unchanged
- **WHEN** `MapScene.drawConstructionSites()` consumes the activity list
- **THEN** existing behavior MUST continue to render expansion progress identically
- **AND** NPC-initiated activities MUST render through the same path with no new branches required

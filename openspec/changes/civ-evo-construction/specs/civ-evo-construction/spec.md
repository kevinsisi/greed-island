## ADDED Requirements

### Requirement: NPCs autonomously initiate construction through Commands

The system SHALL allow an NPC, under deterministic policy, to emit a `CONSTRUCTION_INITIATE` command that the Rule Engine compiles into a `CONSTRUCTION_INITIATED` event. Developer hand-placement and AI authoring MUST NOT be used to create construction projects.

#### Scenario: NPC with build goal and low infrastructure emits CONSTRUCTION_INITIATE
- **GIVEN** an NPC whose `goal.kind` is `build_city`
- **AND** the NPC's construction demand meets the target tile's demand threshold
- **AND** the NPC has at least `CIV_EVO_CONSTRUCTION_GOLD_COST` personal gold
- **AND** the NPC has no active `build` task and no other NPC has an open project on the same `tileId`
- **WHEN** the deterministic NPC policy runs in `cityLife.ts`
- **THEN** the NPC SHALL emit `CONSTRUCTION_INITIATE { npcId, tileId, buildingId, duration, goldCost, motivation? }`

#### Scenario: Healthy-economy tiles require stronger demand instead of being excluded
- **GIVEN** `areaState.resources.economy >= CIV_EVO_CONSTRUCTION_DEMO_ECONOMY_THRESHOLD`
- **WHEN** an NPC has severe construction demand and enough gold
- **THEN** the policy MAY emit `CONSTRUCTION_INITIATE`
- **AND** healthy-economy tiles MUST NOT be permanently excluded from autonomous construction

#### Scenario: Construction without demand or funds is rejected by policy
- **WHEN** an NPC lacks construction demand or has less than `CIV_EVO_CONSTRUCTION_GOLD_COST` gold
- **THEN** the deterministic NPC policy MUST NOT emit `CONSTRUCTION_INITIATE`

#### Scenario: Rule Engine validates payload shape only
- **WHEN** the Rule Engine evaluates a `CONSTRUCTION_INITIATE` command
- **THEN** validation MUST require non-empty `npcId`, `tileId`, `buildingId`
- **AND** `duration` MUST be an integer in `[1, 1000]`
- **AND** `goldCost` (if present) MUST be a non-negative number
- **AND** `motivation` (if present) MUST match the existing motivation payload shape
- **AND** the validator MUST NOT read `WorldState` in this slice

#### Scenario: Accepted command appends CONSTRUCTION_INITIATED
- **GIVEN** a payload-valid `CONSTRUCTION_INITIATE` command
- **WHEN** the Rule Engine accepts it
- **THEN** a `CONSTRUCTION_INITIATED` event MUST be appended to the EventLog
- **AND** the event payload MUST carry `initiatedByNpcId`, `tileId`, `buildingId`, `duration`, `goldCost`, `startedAtTick`

### Requirement: ConstructionProjectRecord records the initiating NPC

The system SHALL extend `ConstructionProjectRecord` with `initiatedByNpcId: string` and populate it from the `CONSTRUCTION_INITIATED` event. `projectId` MUST be a deterministic hash so replay is reproducible.

#### Scenario: Reducer appends a new record from CONSTRUCTION_INITIATED
- **WHEN** `withConstructionInitiated(state, cmd)` runs
- **THEN** a new `ConstructionProjectRecord` MUST be appended to `lifeExpansion.constructionProjects` with `kind: 'building'`, `targetTileId`, `buildingId`, `initiatedByNpcId`, `progress: 0`, `targetProgress: duration`, `startedAtTick`, `completedAtTick: null`

#### Scenario: Reducer charges the initiating NPC once
- **GIVEN** `cmd.goldCost > 0`
- **WHEN** `withConstructionInitiated(state, cmd)` creates a new project
- **THEN** the initiating NPC's `npcCivicRecords[npcId].gold` MUST decrease by `goldCost`
- **AND** replaying the same initiate MUST NOT double-charge gold
- **AND** the reducer MUST NOT create a paid project if the NPC cannot afford `goldCost`

#### Scenario: projectId is a deterministic hash
- **WHEN** a record is created
- **THEN** `projectId` MUST equal `hash(npcId + tileId + buildingId + startedAtTick + rulesetVersion)`
- **AND** replaying the same EventLog twice MUST produce identical `projectId` values

#### Scenario: Replay determinism
- **GIVEN** an EventLog containing `CONSTRUCTION_INITIATED`, `CONSTRUCTION_PROJECT_PROGRESS`, `BUILDING_CONSTRUCTED` events
- **WHEN** the EventLog is replayed twice
- **THEN** `lifeExpansion.constructionProjects[]` MUST be byte-identical between runs

#### Scenario: Construction state is monotonic after completion
- **GIVEN** a construction project has reached `completedAtTick !== null`
- **WHEN** later reducer calls or projection replay encounter additional or stale `CONSTRUCTION_PROJECT_PROGRESS` rows for that project
- **THEN** `progress` MUST NOT decrease
- **AND** `completedAtTick` MUST NOT change to a later tick or return to `null`
- **AND** the project MUST NOT reappear as in-progress in API or frontend projections

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

#### Scenario: Projection rows never regress
- **GIVEN** the projection has observed a higher `progress` or non-null `completedAtTick` for a project
- **WHEN** a later event carries a lower `progressAfter` or another completion marker
- **THEN** the projection MUST keep the maximum progress already observed
- **AND** the first non-null `completedAtTick` MUST remain authoritative

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

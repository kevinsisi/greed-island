## Context

`npc-life-goals-and-expansion` shipped the deterministic `lifeExpansion.constructionProjects` projection, plus events `CONSTRUCTION_PROJECT_PROGRESS`, `BUILDING_CONSTRUCTED`, `MAP_TILE_UNLOCKED`. Today only the hardcoded `salt_marsh_settlement` project is advanced — no NPC ever *opens* a new construction project. ARCHITECTURE.md §11.8 requires civilization to evolve through NPC intent compiled by the Rule Engine; this change is the smallest concrete slice that closes that gap.

This change depends on the `simulation-kernel` capability (Command/Event/Rule Engine law) and the already-archived expansion projection. It must preserve every kernel law: Command is intent, Event is fact, Rule Engine is the only compiler, and AI is non-authoritative.

## Goals / Non-Goals

**Goals:**
- Allow an NPC, under deterministic policy, to emit `CONSTRUCTION_INITIATE` and have the Rule Engine commit a `CONSTRUCTION_INITIATED` event.
- Record `initiatedByNpcId` on `ConstructionProjectRecord` so authorship of each project is a world fact.
- Provide a replayable `construction_projects` projection with `rebuildFromEvents()`.
- Make NPC-initiated in-progress projects visible through `/api/buildings?tileId=X` and the existing `drawConstructionSites()` UI path.

**Non-Goals:**
- No production chains, resource transport, or supply requirements.
- No settlement formation grouping or faction/territorial conflict.
- No AI-authored construction facts.
- No destruction, ruin, or rebuild events.
- No multi-building projects.
- No child NPCs / generational mechanics.
- No new `FACT_SET` (§11.5/§11.6 deferred).

## Decisions

### Decision: `CONSTRUCTION_INITIATE` is payload-validated only, no WorldState check in this slice

The Rule Engine validator inspects only payload shape (non-empty `npcId/tileId/buildingId`, `duration` in `1..1000`, optional `motivation`). Tile-buildable / NPC-owns-task / no-duplicate-project checks live in the NPC policy layer.

Alternative considered: do a strict tile-buildable + occupancy check inside `evaluate()`. Rejected for this slice because the NPC policy already gates emission deterministically, and giving the validator WorldState access expands the kernel surface beyond the minimum needed to ship.

### Decision: `projectId` is a deterministic hash, not a sequence

`projectId = hash(npcId + tileId + buildingId + startedAtTick + rulesetVersion)`. Replay over the same EventLog reproduces the same ids; no global counter, no `Date.now()`, no `Math.random()`.

Alternative considered: use the EventLog event sequence number. Rejected because cross-domain reducers prefer stable, payload-derived identifiers so projections can be rebuilt independently of EventLog ordering details.

### Decision: NPC task variant `build` is the policy precondition, not a world fact

`NpcAgentTask` gains `{ kind: 'build', buildingId, onTile, expiresAtTick? }`. The task lives in NPC agent state (derived projection), not on `ConstructionProjectRecord`. The world fact is the `CONSTRUCTION_INITIATED` event; the task is the NPC's local intent state that triggers emission.

Alternative considered: store the build task as a world-level fact. Rejected because the task is an NPC-local plan, while the project record is the shared world commitment — keeping them separated avoids double-bookkeeping.

### Decision: Policy hook lives in `cityLife.ts` next to existing reducers

When `goal.kind === 'build_city'` and `areaState.resources.infrastructure < 45` and the NPC has no active `build` task and no other NPC has an open project on the same `tileId`, emit `CONSTRUCTION_INITIATE`. The `45` threshold and `build_city` goal name already exist in `cityLife.ts`; this is a hook addition, not a new subsystem.

Alternative considered: a standalone construction policy module. Rejected for the first slice because city/infrastructure pressure is already computed in `cityLife.ts` and a separate file would duplicate inputs.

### Decision: `construction_projects` is a new dedicated projection table

`packages/server/src/projections/constructionProjects.ts` reads `CONSTRUCTION_INITIATED` + `CONSTRUCTION_PROJECT_PROGRESS` + `BUILDING_CONSTRUCTED` in tick order. Exposes `getInProgressByTile(tileId)` and `getByProjectId(id)`. `rebuildFromEvents(events)` is idempotent.

Alternative considered: query `lifeExpansion.constructionProjects` from `WorldState` directly in the API layer. Rejected because §11.7 calls for explicit projections with `rebuildFromEvents()` per domain so they can be rehydrated and canonical-hashed independently.

### Decision: API extension uses `inProgress: []` on existing `/api/buildings?tileId=X`

The endpoint already returns completed buildings for a tile; adding a sibling `inProgress` array avoids a new route and keeps frontend wiring local to `constructionActivitiesFor()`. Existing `MapScene.drawConstructionSites()` consumes `MapConstructionActivity` and needs no changes if the projection slots into that shape.

Alternative considered: a separate `/api/construction-projects` endpoint. Rejected as premature — the per-tile query is the only consumer this slice needs.

## Runtime Flow

```text
NPC tick (city pressure low + goal=build_city)
│
├─ decideNpcCommand() emits CONSTRUCTION_INITIATE { npcId, tileId, buildingId, duration }
├─ Rule Engine validator: payload shape only
├─ Rule Engine accepts → appends CONSTRUCTION_INITIATED event
├─ Reducer withConstructionInitiated() pushes ConstructionProjectRecord{
│     projectId = hash(npcId+tileId+buildingId+startedAtTick+rulesetVersion),
│     kind: 'building', targetTileId, buildingId, initiatedByNpcId,
│     progress: 0, targetProgress: duration,
│     startedAtTick, completedAtTick: null
│  }
├─ Subsequent ticks: CONSTRUCTION_PROJECT_PROGRESS advances progress
└─ At progress >= targetProgress: BUILDING_CONSTRUCTED, projection marks done
```

## Determinism

- Payload contains no `Date.now()`, no `Math.random()`, no network timing.
- `projectId` is a pure hash of payload + `startedAtTick` + `rulesetVersion`.
- Replay test: run the seed EventLog twice; `lifeExpansion.constructionProjects[]` and `construction_projects` projection rows must be byte-identical.

## Risks / Trade-offs

- **Policy-side validation can drift from Rule Engine validation** → keep the validator payload-only this slice; the duplicate gate is intentional and lives entirely on the NPC side until §11.8 strict mode lands.
- **Multiple NPCs racing the same tile** → in this slice the policy gates on "no other NPC has open project on same tileId"; if two NPCs still race within one tick, the deterministic command batch ordering picks the lower-keyed NPC and the second emission is dropped at policy time the next tick (no Rule Engine collision needed).
- **Hash collisions on `projectId`** → astronomically unlikely with `tick + npcId + tileId + buildingId + rulesetVersion`, but tests cover the canonical hash to catch regressions.
- **`construction_projects` projection diverges from `lifeExpansion.constructionProjects`** → the projection consumes the same three events; canonical-hash test compares both paths to guard.

## Migration Plan

No data migration. New event type is additive; existing EventLogs replay unchanged because no NPC has emitted `CONSTRUCTION_INITIATE` historically.

## Open Questions

- **Building catalog scope**: whitelist (e.g. only `well`, `granary`, `workshop`) or full catalog for first slice?
- **Duration**: fixed per `buildingId`, hash-bounded range, or skill-derived from initiating NPC?
- **Same-tile race policy**: collide-reject (only first wins) or collaborate (multiple NPCs accelerate the same project)?
- **Tile buildability**: keep on the NPC-policy side (conservative) or move into Rule Engine (strict, requires WorldState access in validator)?
- **Chronicle / Timeline**: opt-in narration of NPC-initiated construction in this slice, or defer to a follow-up?

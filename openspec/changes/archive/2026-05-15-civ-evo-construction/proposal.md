## Why

Living-world v0.15.35–0.15.36 has `CONSTRUCTION_PROJECT_PROGRESS`, `BUILDING_CONSTRUCTED`, and `MAP_TILE_UNLOCKED` events flowing through the Rule Engine, but NPCs do not autonomously *decide* to start new buildings — only the hardcoded `salt_marsh_settlement` is driven forward. This is the first concrete slice of ARCHITECTURE.md §11.8 (Civilization Evolution): an NPC must be able to emit a Command that initiates construction of a new building, and the Rule Engine commits the fact — no developer hand-placement, no AI-authored world state.

## What Changes

- Add Command `CONSTRUCTION_INITIATE` with payload `{ npcId, tileId, buildingId, duration, motivation? }`.
- Add Event `CONSTRUCTION_INITIATED` and corresponding reducer that appends a new `ConstructionProjectRecord` (with new field `initiatedByNpcId: string`) to `lifeExpansion.constructionProjects`.
- Add NPC agent task variant `{ kind: 'build', buildingId, onTile, expiresAtTick? }`.
- Add deterministic NPC policy in `cityLife.ts`: when `goal.kind === 'build_city'` and infrastructure pressure is low, emit `CONSTRUCTION_INITIATE`.
- Add new projection `construction_projects` with `rebuildFromEvents()` over `CONSTRUCTION_INITIATED` + `CONSTRUCTION_PROJECT_PROGRESS` + `BUILDING_CONSTRUCTED`.
- Extend `/api/buildings?tileId=X` to expose `inProgress: []`.
- Extend frontend `constructionActivitiesFor()` so NPC-initiated in-progress projects render through the existing `drawConstructionSites()` path.

## Capabilities

### New Capabilities

- `civ-evo-construction`: deterministic NPC-initiated building construction — Command catalog, Rule Engine acceptance, reducer/projection, NPC policy hook, and API/UI surface for in-progress projects driven by NPC intent.

### Modified Capabilities

_(none — this slice does not change requirements of an existing archived spec; `npc-life-goals-and-expansion` already shipped its expansion contract.)_

## Impact

- Backend: `packages/server/src/kernel/livingWorldCommands.ts`, `packages/server/src/sim/cityLife.ts`, `packages/server/src/sim/npcEngine.ts`, new `packages/server/src/projections/constructionProjects.ts`, `packages/server/src/http/buildingsRouter.ts`.
- Frontend: `packages/web/src/pages/constructionActivity.ts` (extension only; `MapScene.drawConstructionSites()` consumes the same `MapConstructionActivity` shape unchanged).
- Tests: command validator, replay determinism, projection canonical hash, /api/buildings integration, full E2E (seed → policy emits → event committed → progress → BUILDING_CONSTRUCTED → identical replay hash).
- Architecture status: resolves §11.8 construction sub-item (autonomous initiation only); partial progress on §0.17 and §11.7 (projection with rebuildFromEvents for this domain).
- Out of scope: production chains, resource transport, settlement formation, faction/war, AI authoring of construction facts, destruction/ruin, multi-building projects, child NPCs, new FACT_SET (§11.5/§11.6 untouched).
